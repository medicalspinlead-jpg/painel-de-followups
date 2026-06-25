import { prisma } from "@/lib/prisma"
import { getBrazilTimeParts } from "@/lib/timezone"
import { renderTemplate } from "@/lib/template"

const SETTINGS_ID = "default"

export type FollowupScheduledEvent = {
  event: "followup.scheduled"
  timestamp: string
  lead: { id: string; pipedriveId: string | null; name: string; email: string; phone: string; stage: string }
  category: { id: string; name: string }
  message: { id: string; order: number; dayOffset: number; time: string; content: string }
  /**
   * Posição do follow-up DENTRO do dia (dayOffset). Um mesmo dia pode ter
   * várias mensagens; este objeto informa qual delas está sendo enviada.
   * - index: 1 = primeira mensagem do dia, 2 = segunda... (por ordem de horário).
   * - total: quantas mensagens ativas aquele dia possui.
   * - isLast: true se for a última mensagem do dia (quando só existe 1, a
   *   primeira já é a última).
   */
  followup: { index: number; total: number; isLast: boolean }
}

/**
 * Disparado quando um lead ENTRA na espera ("aguardando"). Ocorre logo após a
 * última mensagem do último dia da sequência ser entregue: o lead passa de
 * "ativo" para "aguardando" e começa a contar os dias de espera (waitDays da
 * categoria) até reiniciar o ciclo.
 */
export type CycleCompletedEvent = {
  event: "lead.cycle_completed"
  timestamp: string
  lead: { id: string; pipedriveId: string | null; name: string; email: string; phone: string; stage: string }
  category: { id: string; name: string }
  /** Transição de status: de "ativo" para "aguardando". */
  transition: { from: "ativo"; to: "aguardando" }
  /** Dias de espera configurados na categoria até reiniciar o ciclo. */
  waitDays: number
}

/**
 * Disparado quando um lead SAI da espera ("aguardando"). Após cumprir os dias
 * de espera da sua categoria, o lead reinicia o ciclo voltando para "ativo".
 * Permite que o webhook saiba que o lead deixou a espera e recomeçou a sequência.
 */
export type CycleRestartedEvent = {
  event: "lead.cycle_restarted"
  timestamp: string
  lead: { id: string; pipedriveId: string | null; name: string; email: string; phone: string; stage: string }
  category: { id: string; name: string }
  /** Transição de status: de onde o lead saiu e para onde voltou. */
  transition: { from: "aguardando"; to: "ativo" }
}

export type WebhookEvent = FollowupScheduledEvent | CycleCompletedEvent | CycleRestartedEvent

/**
 * Envia um único evento ao webhook configurado.
 * Retorna true em caso de sucesso (HTTP 2xx) e false em caso de falha.
 */
export async function sendWebhookEvent(
  webhookUrl: string,
  webhookSecret: string,
  event: WebhookEvent,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "X-Webhook-Secret": webhookSecret } : {}),
      },
      body: JSON.stringify(event),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Dispara imediatamente as mensagens de follow-up com dayOffset = 0 (envio
 * imediato) configuradas para a categoria do lead recém-criado.
 *
 * Diferente do dispatch agendado por cron, este envio ocorre na hora da criação
 * do lead e ignora horário e regra de finais de semana, pois o objetivo é
 * notificar o webhook imediatamente.
 */
export async function dispatchImmediateFollowups(leadId: string): Promise<number> {
  const settings = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } })
  if (!settings || !settings.webhookEnabled || !settings.webhookUrl) {
    return 0
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { category: { include: { messages: { where: { active: true, dayOffset: 0 } } } } },
  })

  if (!lead || !lead.category || !lead.category.active) {
    return 0
  }

  const brazil = getBrazilTimeParts()
  let delivered = 0

  // Follow-ups imediatos (dayOffset 0) ordenados por horário, para informar a
  // posição (1º ou 2º) de cada um dentro da etapa de envio imediato.
  const ordered = [...lead.category.messages].sort((a, b) => a.time.localeCompare(b.time))
  const total = ordered.length

  for (let i = 0; i < ordered.length; i++) {
    const message = ordered[i]
    const index = i + 1
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
        content: renderTemplate(message.message, lead),
      },
      followup: { index, total, isLast: index === total },
    }
    const ok = await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, event)
    if (ok) delivered++
  }

  return delivered
}
