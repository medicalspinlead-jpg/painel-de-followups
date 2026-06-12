import { prisma } from "@/lib/prisma"
import { getBrazilTimeParts } from "@/lib/timezone"
import { renderTemplate } from "@/lib/template"

const SETTINGS_ID = "default"

export type WebhookEvent = {
  event: "followup.scheduled"
  timestamp: string
  lead: { id: string; name: string; email: string; phone: string; stage: string }
  category: { id: string; name: string }
  message: { id: string; order: number; dayOffset: number; time: string; content: string }
}

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

  for (const message of lead.category.messages) {
    const event: WebhookEvent = {
      event: "followup.scheduled",
      timestamp: brazil.iso,
      lead: {
        id: lead.id,
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
    }
    const ok = await sendWebhookEvent(settings.webhookUrl, settings.webhookSecret, event)
    if (ok) delivered++
  }

  return delivered
}
