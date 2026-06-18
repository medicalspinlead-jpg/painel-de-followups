import { prisma } from "@/lib/prisma"
import type { LeadStage } from "@prisma/client"
import { getBrazilTimeParts } from "@/lib/timezone"
import { dueFollowups, DAILY_STAGES, nextStageAfter, shouldRestartCycle } from "@/lib/followup-schedule"
import { sendWebhookEvent, type WebhookEvent } from "@/lib/webhook"
import { renderTemplate } from "@/lib/template"

const SETTINGS_ID = "default"

/**
 * Garante (de forma idempotente) que a tabela followup_logs exista no banco.
 * Em self-host o Dockerfile não roda migrações, então criamos a tabela no boot.
 * Seguro chamar várias vezes — usa IF NOT EXISTS.
 */
let ensured = false
export async function ensureFollowupLogTable(): Promise<void> {
  if (ensured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "followup_logs" (
      "id" TEXT PRIMARY KEY,
      "leadId" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "targetDate" TEXT NOT NULL,
      "scheduled" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'delivered',
      "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "followup_logs_leadId_messageId_targetDate_key"
    ON "followup_logs" ("leadId", "messageId", "targetDate");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "followup_logs_leadId_idx"
    ON "followup_logs" ("leadId");
  `)

  // Colunas do ciclo de follow-up no lead (self-host não roda migrações).
  // cycleStartedAt: âncora da sequência diária; backfill = createdAt.
  // waitingSince: início da espera de 7 dias úteis (null fora de aguarda_7_dias).
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cycleStartedAt" TIMESTAMP(3);
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "waitingSince" TIMESTAMP(3);
  `)
  await prisma.$executeRawUnsafe(`
    UPDATE "leads" SET "cycleStartedAt" = "createdAt" WHERE "cycleStartedAt" IS NULL;
  `)

  ensured = true
}

export type DispatchResult = {
  checkedLeads: number
  matched: number
  dispatched: number
  advanced: number
  /** Leads que reiniciaram o ciclo (aguarda_7_dias → dia1). */
  restarted: number
  skipped: number
  failures: string[]
  date: string
  time: string
  timezone: string
  reason?: string
}

/**
 * Núcleo do envio de follow-ups agendados (etapas diárias dia1/dia2/dia3).
 *
 * Usado tanto pela rota HTTP (cron externo / acionamento manual) quanto pelo
 * agendador interno do servidor. É IDEMPOTENTE: cada (lead, mensagem, data-alvo)
 * só é enviado uma vez, registrado em FollowupLog. Combinado com o modelo de
 * "janela" do dueFollowups, isso garante que mensagens não sejam perdidas mesmo
 * que o agendador atrase, nem duplicadas mesmo que ele rode várias vezes.
 */
export async function runDispatch(): Promise<DispatchResult> {
  const now = new Date()
  const brazil = getBrazilTimeParts(now)

  await ensureFollowupLogTable()
  const base: Omit<DispatchResult, "reason"> = {
    checkedLeads: 0,
    matched: 0,
    dispatched: 0,
    advanced: 0,
    restarted: 0,
    skipped: 0,
    failures: [],
    date: brazil.date,
    time: brazil.time,
    timezone: "America/Sao_Paulo",
  }

  const settings = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } })
  if (!settings || !settings.webhookEnabled || !settings.webhookUrl) {
    return { ...base, reason: "Webhook não está habilitado ou configurado" }
  }

  if (!settings.sendWeekends && (brazil.weekday === 0 || brazil.weekday === 6)) {
    return { ...base, reason: "Finais de semana desabilitados" }
  }

  const leads = await prisma.lead.findMany({
    where: { stage: { in: DAILY_STAGES as LeadStage[] }, categoryId: { not: null } },
    include: { category: { include: { messages: { where: { active: true } } } } },
  })
  base.checkedLeads = leads.length

  for (const lead of leads) {
    if (!lead.category || !lead.category.active) continue

    const due = dueFollowups({
      now,
      // Âncora do ciclo atual (no 1º ciclo == createdAt; após reinício, o
      // instante do reinício). Garante que dia1/2/3 recomecem a cada ciclo.
      createdAt: lead.cycleStartedAt ?? lead.createdAt,
      stage: lead.stage,
      sendWeekends: settings.sendWeekends,
      messages: lead.category.messages.map((m) => ({
        id: m.id,
        order: m.order,
        dayOffset: m.dayOffset,
        time: m.time,
        content: m.message,
        active: m.active,
      })),
    })

    // Envia na ordem do horário (mais cedo primeiro): o horário mais próximo
    // tem prioridade do dia.
    const ordered = [...due.messages].sort((a, b) => a.time.localeCompare(b.time))

    // TODAS as mensagens ativas da etapa (dia atual), ordenadas por horário.
    // Define a posição do follow-up: cada etapa pode ter até 2 (1º e 2º). Usamos
    // o conjunto completo da etapa — não só as devidas agora — para que o índice
    // do 2º follow-up continue sendo 2 mesmo se o 1º já foi enviado antes.
    const stageOrdered = lead.category.messages
      .filter((m) => m.dayOffset === due.targetDay)
      .sort((a, b) => a.time.localeCompare(b.time))
    const followupTotal = stageOrdered.length

    for (const message of ordered) {
      base.matched++

      // Posição (1 ou 2) deste follow-up dentro da etapa, por ordem de horário.
      const followupIndex = stageOrdered.findIndex((m) => m.id === message.id) + 1

      // Idempotência. No fluxo normal, checamos antes para não gerar log de
      // erro do Prisma quando a mensagem já foi enviada hoje.
      const existing = await prisma.followupLog.findUnique({
        where: {
          leadId_messageId_targetDate: {
            leadId: lead.id,
            messageId: message.id,
            targetDate: due.targetDate,
          },
        },
      })
      if (existing) {
        base.skipped++
        continue
      }

      // Reserva o envio. O try/catch protege contra corrida (duas execuções
      // simultâneas do agendador): a 2ª viola a unique e simplesmente pula.
      try {
        await prisma.followupLog.create({
          data: {
            leadId: lead.id,
            messageId: message.id,
            targetDate: due.targetDate,
            scheduled: message.time,
            status: "pending",
          },
        })
      } catch {
        base.skipped++
        continue
      }

      const event: WebhookEvent = {
        event: "followup.scheduled",
        timestamp: brazil.iso,
        lead: {
          id: lead.id,
          pipedriveId: lead.pipedriveId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          stage: lead.stage,
        },
        category: { id: lead.category.id, name: lead.category.name },
        message: {
          id: message.id,
          order: message.order,
          dayOffset: message.dayOffset,
          time: message.time,
          content: renderTemplate(message.content, lead),
        },
        followup: {
          index: followupIndex,
          total: followupTotal,
          isLast: followupIndex === followupTotal,
        },
      }

      const ok = await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, event)

      if (ok) {
        base.dispatched++
        await prisma.followupLog.updateMany({
          where: { leadId: lead.id, messageId: message.id, targetDate: due.targetDate },
          data: { status: "delivered" },
        })
      } else {
        base.failures.push(`${lead.id}/${message.id}: falha no webhook`)
        // Remove o log para permitir nova tentativa na próxima execução.
        await prisma.followupLog.deleteMany({
          where: { leadId: lead.id, messageId: message.id, targetDate: due.targetDate },
        })
      }
    }

    // Avanço de etapa: só altera o status ao enviar o ÚLTIMO envio do dia (a
    // mensagem de horário mais tarde da etapa). Com 2 mensagens/dia, avança só
    // depois da 2ª; com 1 mensagem, ao enviar essa única já avança para o
    // próximo dia (dia1 → dia2 → dia3 → aguarda_7_dias).
    const stageMessages = lead.category.messages
      .filter((m) => m.dayOffset === due.targetDay)
      .sort((a, b) => a.time.localeCompare(b.time))

    if (due.targetDate && stageMessages.length > 0) {
      const lastMessage = stageMessages[stageMessages.length - 1]
      const lastDelivered = await prisma.followupLog.findFirst({
        where: {
          leadId: lead.id,
          messageId: lastMessage.id,
          targetDate: due.targetDate,
          status: "delivered",
        },
      })

      if (lastDelivered) {
        const next = nextStageAfter(lead.stage)
        if (next) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              stage: next as never,
              // Ao entrar em "aguarda_7_dias", marca o início da espera para
              // contar os 7 dias úteis até o reinício do ciclo.
              ...(next === "aguarda_7_dias" ? { waitingSince: now } : {}),
            },
          })
          base.advanced++
        }
      }
    }
  }

  // Reinício automático do ciclo: leads em "aguarda_7_dias" que já cumpriram os
  // 7 dias úteis de espera voltam para "dia1", reiniciando a sequência diária.
  // A âncora (cycleStartedAt) passa a ser o instante do reinício, então a
  // primeira mensagem (dia1) vai para o próximo dia útil — repetindo o fluxo
  // indefinidamente.
  const waitingLeads = await prisma.lead.findMany({
    where: { stage: "aguarda_7_dias" as LeadStage, categoryId: { not: null } },
    include: { category: true },
  })

  for (const lead of waitingLeads) {
    // Fallback para leads que entraram na espera antes desta coluna existir.
    const waitingSince = lead.waitingSince ?? lead.updatedAt
    if (!shouldRestartCycle({ now, waitingSince })) continue

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: "dia1" as never,
        cycleStartedAt: now,
        waitingSince: null,
      },
    })
    base.restarted++

    // Notifica o webhook de que o lead saiu de "aguarda_7_dias" e reiniciou o
    // ciclo voltando para "dia1".
    if (lead.category) {
      const restartEvent: WebhookEvent = {
        event: "lead.cycle_restarted",
        timestamp: brazil.iso,
        lead: {
          id: lead.id,
          pipedriveId: lead.pipedriveId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          stage: "dia1",
        },
        category: { id: lead.category.id, name: lead.category.name },
        transition: { from: "aguarda_7_dias", to: "dia1" },
      }
      await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, restartEvent)
    }
  }

  return base
}
