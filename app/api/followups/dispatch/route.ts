import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getBrazilTimeParts } from "@/lib/timezone"

const SETTINGS_ID = "default"

// Mapeia cada etapa do lead ao número de dias (dayOffset) que a mensagem deve corresponder.
// Leads em "desqualificado" ou "aguarda_7_dias" não recebem mensagens de sequência diária.
const STAGE_TO_DAY: Record<string, number> = {
  dia1: 1,
  dia2: 2,
  dia3: 3,
}

type WebhookEvent = {
  event: "followup.scheduled"
  timestamp: string
  lead: { id: string; name: string; email: string; phone: string; stage: string }
  category: { id: string; name: string }
  message: { id: string; order: number; dayOffset: number; time: string; content: string }
}

/**
 * POST /api/followups/dispatch
 *
 * Verifica quais follow-ups estão na data/horário corretos e envia os eventos
 * ao webhook configurado. Projetado para ser acionado por um cron job (ex.: Vercel Cron).
 *
 * Protegido por CRON_SECRET: envie o header `Authorization: Bearer <CRON_SECRET>`.
 */
async function dispatchFollowups(request: NextRequest) {
  try {
    // Validação do segredo do cron (se configurado)
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = request.headers.get("authorization")
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
      }
    }

    const settings = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } })
    if (!settings || !settings.webhookEnabled || !settings.webhookUrl) {
      return NextResponse.json(
        { error: "Webhook não está habilitado ou configurado", dispatched: 0 },
        { status: 200 },
      )
    }

    const now = new Date()
    // Componentes de data/hora no horário de Brasília (independente do TZ do servidor)
    const brazil = getBrazilTimeParts(now)
    const day = brazil.weekday // 0 = domingo, 6 = sábado

    // Pula finais de semana se a configuração não permitir
    if (!settings.sendWeekends && (day === 0 || day === 6)) {
      return NextResponse.json({ message: "Finais de semana desabilitados", dispatched: 0 })
    }

    const currentTime = brazil.time // HH:mm no horário de Brasília
    const todayBrazil = brazil.date // YYYY-MM-DD no horário de Brasília

    // Busca leads que estão em uma etapa diária ativa, com sua categoria e mensagens
    const leads = await prisma.lead.findMany({
      where: { stage: { in: ["dia1", "dia2", "dia3"] }, categoryId: { not: null } },
      include: { category: { include: { messages: { where: { active: true } } } } },
    })

    const events: WebhookEvent[] = []
    for (const lead of leads) {
      if (!lead.category || !lead.category.active) continue
      const targetDay = STAGE_TO_DAY[lead.stage]

      // A data alvo é a data de cadastro do lead + dayOffset dias, no horário de Brasília.
      // Garante que cada mensagem seja enviada apenas no dia correto, e não todos os dias.
      const targetDate = getBrazilTimeParts(
        new Date(lead.createdAt.getTime() + targetDay * 24 * 60 * 60 * 1000),
      ).date

      if (targetDate !== todayBrazil) continue

      const message = lead.category.messages.find(
        (m) => m.dayOffset === targetDay && m.time === currentTime,
      )
      if (!message) continue
      events.push({
        event: "followup.scheduled",
        timestamp: brazil.iso,
        lead: { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, stage: lead.stage },
        category: { id: lead.category.id, name: lead.category.name },
        message: {
          id: message.id,
          order: message.order,
          dayOffset: message.dayOffset,
          time: message.time,
          content: message.message,
        },
      })
    }

    // Envia cada evento ao webhook
    let delivered = 0
    const failures: string[] = []
    for (const event of events) {
      try {
        const res = await fetch(settings.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(settings.webhookSecret ? { "X-Webhook-Secret": settings.webhookSecret } : {}),
          },
          body: JSON.stringify(event),
        })
        if (res.ok) delivered++
        else failures.push(`${event.lead.id}: HTTP ${res.status}`)
      } catch (err) {
        failures.push(`${event.lead.id}: ${String(err)}`)
      }
    }

    return NextResponse.json({
      checkedLeads: leads.length,
      matched: events.length,
      dispatched: delivered,
      failures,
      date: todayBrazil,
      time: currentTime,
      timezone: "America/Sao_Paulo",
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao processar follow-ups", details: String(error) },
      { status: 500 },
    )
  }
}

// GET é usado pelo Vercel Cron; POST permite acionamento manual.
export async function GET(request: NextRequest) {
  return dispatchFollowups(request)
}

export async function POST(request: NextRequest) {
  return dispatchFollowups(request)
}
