import { prisma } from "@/lib/prisma"
import type { LeadStage } from "@prisma/client"
import { getBrazilTimeParts } from "@/lib/timezone"
import { dueFollowups, lastDayOf, targetDateFor, shouldRestartCycle, DEFAULT_WAIT_DAYS } from "@/lib/followup-schedule"
import { sendWebhookEvent, type WebhookEvent } from "@/lib/webhook"
import { renderTemplate } from "@/lib/template"

const SETTINGS_ID = "default"

// Status que recebem a sequência de follow-up. Inclui valores legados
// (dia1/dia2/dia3) para bancos que ainda não passaram pela migração.
const ACTIVE_DB_STAGES = ["ativo", "dia1", "dia2", "dia3"] as const
// Status de espera (inclui o legado aguarda_7_dias).
const WAITING_DB_STAGES = ["aguardando", "aguarda_7_dias"] as const

/**
 * Garante (de forma idempotente) que o schema esteja atualizado no banco.
 * Em self-host o Dockerfile não roda migrações, então aplicamos as mudanças no
 * boot. Seguro chamar várias vezes — tudo usa IF NOT EXISTS / WHERE.
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
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cycleStartedAt" TIMESTAMP(3);
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "waitingSince" TIMESTAMP(3);
  `)
  await prisma.$executeRawUnsafe(`
    UPDATE "leads" SET "cycleStartedAt" = "createdAt" WHERE "cycleStartedAt" IS NULL;
  `)

  // Espera por categoria (padrão 7). Cada categoria define o seu valor.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "waitDays" INTEGER NOT NULL DEFAULT ${DEFAULT_WAIT_DAYS};
  `)

  // Novos status do lead. Em PostgreSQL, ADD VALUE é idempotente com IF NOT EXISTS.
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'ativo';`)
    await prisma.$executeRawUnsafe(`ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'aguardando';`)
  } catch {
    // Tipo pode não existir como enum em todos os ambientes; ignorável.
  }

  // Migra leads legados para o novo modelo de status.
  await prisma.$executeRawUnsafe(`
    UPDATE "leads" SET "stage" = 'ativo' WHERE "stage" IN ('dia1', 'dia2', 'dia3');
  `)
  await prisma.$executeRawUnsafe(`
    UPDATE "leads" SET "stage" = 'aguardando' WHERE "stage" = 'aguarda_7_dias';
  `)

  ensured = true
}

export type DispatchResult = {
  checkedLeads: number
  matched: number
  dispatched: number
  advanced: number
  /** Leads que reiniciaram o ciclo (aguardando → ativo). */
  restarted: number
  skipped: number
  failures: string[]
  date: string
  time: string
  timezone: string
  reason?: string
}

/**
 * Núcleo do envio de follow-ups agendados.
 *
 * Sem etapas fixas: cada categoria define os seus dias (via dayOffset das
 * mensagens) e a sua espera (waitDays). É IDEMPOTENTE — cada (lead, mensagem,
 * data-alvo) só é enviado uma vez (FollowupLog).
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
    where: { stage: { in: ACTIVE_DB_STAGES as unknown as LeadStage[] }, categoryId: { not: null } },
    include: { category: { include: { messages: { where: { active: true } } } } },
  })
  base.checkedLeads = leads.length

  for (const lead of leads) {
    if (!lead.category || !lead.category.active) continue

    const scheduleMessages = lead.category.messages.map((m) => ({
      id: m.id,
      order: m.order,
      dayOffset: m.dayOffset,
      time: m.time,
      content: m.message,
      active: m.active,
    }))

    const cycleStartedAt = lead.cycleStartedAt ?? lead.createdAt

    const due = dueFollowups({
      now,
      cycleStartedAt,
      sendWeekends: settings.sendWeekends,
      messages: scheduleMessages,
    })

    // Envia na ordem do horário (mais cedo primeiro).
    const ordered = [...due].sort((a, b) => a.message.time.localeCompare(b.message.time))

    for (const item of ordered) {
      const message = item.message
      base.matched++

      // Idempotência: pula se a mensagem já foi enviada hoje.
      const existing = await prisma.followupLog.findUnique({
        where: {
          leadId_messageId_targetDate: {
            leadId: lead.id,
            messageId: message.id,
            targetDate: item.targetDate,
          },
        },
      })
      if (existing) {
        base.skipped++
        continue
      }

      // Reserva o envio. Protege contra corrida entre execuções simultâneas.
      try {
        await prisma.followupLog.create({
          data: {
            leadId: lead.id,
            messageId: message.id,
            targetDate: item.targetDate,
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
          stage: "ativo",
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
          index: item.index,
          total: item.total,
          isLast: item.index === item.total,
        },
      }

      const ok = await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, event)

      if (ok) {
        base.dispatched++
        await prisma.followupLog.updateMany({
          where: { leadId: lead.id, messageId: message.id, targetDate: item.targetDate },
          data: { status: "delivered" },
        })
      } else {
        base.failures.push(`${lead.id}/${message.id}: falha no webhook`)
        await prisma.followupLog.deleteMany({
          where: { leadId: lead.id, messageId: message.id, targetDate: item.targetDate },
        })
      }
    }

    // Conclusão da sequência: quando TODAS as mensagens do ÚLTIMO dia da
    // categoria já foram entregues, o lead entra em "aguardando" e marca o
    // início da espera (waitDays da categoria) até reiniciar o ciclo.
    const lastDay = lastDayOf(scheduleMessages)
    if (lastDay > 0) {
      const lastDayDate = targetDateFor(cycleStartedAt, lastDay, settings.sendWeekends)
      if (brazil.date >= lastDayDate) {
        const lastDayMessages = scheduleMessages.filter((m) => m.dayOffset === lastDay)
        const deliveredCount = await prisma.followupLog.count({
          where: {
            leadId: lead.id,
            targetDate: lastDayDate,
            status: "delivered",
            messageId: { in: lastDayMessages.map((m) => m.id) },
          },
        })
        if (deliveredCount >= lastDayMessages.length) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { stage: "aguardando" as never, waitingSince: now },
          })
          base.advanced++
        }
      }
    }
  }

  // Reinício automático do ciclo: leads em espera que já cumpriram os dias de
  // espera da SUA categoria voltam para "ativo", reiniciando a sequência. A
  // âncora (cycleStartedAt) passa a ser o instante do reinício.
  const waitingLeads = await prisma.lead.findMany({
    where: { stage: { in: WAITING_DB_STAGES as unknown as LeadStage[] }, categoryId: { not: null } },
    include: { category: true },
  })

  for (const lead of waitingLeads) {
    const waitingSince = lead.waitingSince ?? lead.updatedAt
    const waitDays = lead.category?.waitDays ?? DEFAULT_WAIT_DAYS
    if (!shouldRestartCycle({ now, waitingSince, waitDays, sendWeekends: settings.sendWeekends })) continue

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: "ativo" as never,
        cycleStartedAt: now,
        waitingSince: null,
      },
    })
    base.restarted++

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
          stage: "ativo",
        },
        category: { id: lead.category.id, name: lead.category.name },
        transition: { from: "aguardando", to: "ativo" },
      }
      await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, restartEvent)
    }
  }

  return base
}
