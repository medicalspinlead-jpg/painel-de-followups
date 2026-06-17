import { prisma } from "@/lib/prisma"
import {
  nextDispatchForLead,
  targetDateFor,
  STAGE_TO_DAY,
  restartDateAfterWait,
  type ScheduleMessage,
} from "@/lib/followup-schedule"
import { getBrazilTimeParts } from "@/lib/timezone"
import { STAGE_ORDER, STAGE_LABEL } from "@/lib/monitor-stages"

// Reexporta as constantes de etapas (definidas em módulo isolado, seguro para
// o cliente) para quem já importava de monitor-data (ex.: scripts/monitor.ts).
export { STAGE_ORDER, STAGE_LABEL }

export type Row = {
  leadId: string
  leadName: string
  stage: string
  categoryName: string
  createdAt: Date
  cycleStartedAt: Date
  at: Date
  message: ScheduleMessage
  targetDay: number
  targetDate: string
}

export type WaitingRow = {
  leadId: string
  leadName: string
  categoryName: string
  since: Date
  restartDate: string
}

export type IdleRow = {
  leadId: string
  leadName: string
  stage: string
  categoryName: string
  reason: string
}

export type LogRow = {
  leadName: string
  categoryName: string
  messageOrder: number
  dayOffset: number
  scheduled: string
  targetDate: string
  status: string
  sentAt: Date
}

export type Settings = {
  webhookEnabled: boolean
  webhookUrl: string
  sendWeekends: boolean
}

export type MonitorData = {
  generatedAt: Date
  settings: Settings
  counts: Record<string, number>
  totalLeads: number
  rows: Row[]
  waiting: WaitingRow[]
  disqualified: IdleRow[]
  idle: IdleRow[]
  logs: LogRow[]
}

/**
 * Carrega o estado completo do motor de follow-up (a mesma visão usada pelo
 * monitor de terminal e pela rota web oculta). Retorna objetos `Date`; a
 * serialização para JSON (ISO) é feita pela camada que consome (API route).
 */
export async function loadMonitorData(): Promise<MonitorData> {
  const now = new Date()
  const settingsRow = await prisma.settings.findUnique({ where: { id: "default" } })
  const settings: Settings = {
    webhookEnabled: settingsRow?.webhookEnabled ?? false,
    webhookUrl: settingsRow?.webhookUrl ?? "",
    sendWeekends: settingsRow?.sendWeekends ?? false,
  }

  // Contagem por etapa (todas as etapas, inclusive desqualificado).
  const grouped = await prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } })
  const counts: Record<string, number> = {}
  for (const s of STAGE_ORDER) counts[s] = 0
  let totalLeads = 0
  for (const g of grouped) {
    counts[g.stage] = g._count._all
    totalLeads += g._count._all
  }

  // Todos os leads, com categoria + mensagens ativas, para detalhar cada etapa.
  const leads = await prisma.lead.findMany({
    include: { category: { include: { messages: { where: { active: true } } } } },
    orderBy: { createdAt: "asc" },
  })

  const rows: Row[] = []
  const waiting: WaitingRow[] = []
  const disqualified: IdleRow[] = []
  const idle: IdleRow[] = []

  for (const lead of leads) {
    const categoryName = lead.category?.name ?? "—"

    // Desqualificado: nenhuma ação automática até ser movido manualmente.
    if (lead.stage === "desqualificado") {
      disqualified.push({
        leadId: lead.id,
        leadName: lead.name,
        stage: lead.stage,
        categoryName,
        reason: "Parado — só volta ao fluxo se mudar de etapa manualmente",
      })
      continue
    }

    // Sem categoria → não há mensagens para agendar.
    if (!lead.categoryId || !lead.category) {
      idle.push({
        leadId: lead.id,
        leadName: lead.name,
        stage: lead.stage,
        categoryName: "—",
        reason: "Sem categoria atribuída",
      })
      continue
    }
    if (!lead.category.active) {
      idle.push({
        leadId: lead.id,
        leadName: lead.name,
        stage: lead.stage,
        categoryName,
        reason: "Categoria inativa",
      })
      continue
    }

    // Aguardando 7 dias úteis para reiniciar o ciclo.
    if (lead.stage === "aguarda_7_dias") {
      const since = lead.waitingSince ?? lead.updatedAt
      waiting.push({
        leadId: lead.id,
        leadName: lead.name,
        categoryName,
        since,
        restartDate: restartDateAfterWait(since),
      })
      continue
    }

    // Etapas diárias (dia1/2/3): calcula o próximo envio.
    const anchor = lead.cycleStartedAt ?? lead.createdAt
    const next = nextDispatchForLead({
      now,
      createdAt: anchor,
      stage: lead.stage,
      sendWeekends: settings.sendWeekends,
      messages: lead.category.messages.map((m: (typeof lead.category.messages)[number]) => ({
        id: m.id,
        order: m.order,
        dayOffset: m.dayOffset,
        time: m.time,
        content: m.message,
        active: m.active,
      })),
    })

    if (!next) {
      const hasStageMsg = lead.category.messages.some(
        (m: (typeof lead.category.messages)[number]) =>
          m.active && m.dayOffset === STAGE_TO_DAY[lead.stage],
      )
      idle.push({
        leadId: lead.id,
        leadName: lead.name,
        stage: lead.stage,
        categoryName,
        reason: hasStageMsg
          ? "Horário de hoje já passou (aguardando próxima execução do cron)"
          : `Sem mensagem ativa para ${STAGE_LABEL[lead.stage] ?? lead.stage}`,
      })
      continue
    }

    rows.push({
      leadId: lead.id,
      leadName: lead.name,
      stage: lead.stage,
      categoryName,
      createdAt: lead.createdAt,
      cycleStartedAt: anchor,
      at: next.at,
      message: next.message,
      targetDay: next.targetDay,
      targetDate: targetDateFor(anchor, next.targetDay, settings.sendWeekends),
    })
  }

  rows.sort((a, b) => a.at.getTime() - b.at.getTime())
  waiting.sort((a, b) => a.since.getTime() - b.since.getTime())

  // Últimos envios registrados (FollowupLog), para auditar o que já saiu.
  const recentLogs = await prisma.followupLog.findMany({
    orderBy: { sentAt: "desc" },
    take: 12,
    include: {
      lead: { include: { category: true } },
    },
  })
  const logs: LogRow[] = recentLogs.map((log: (typeof recentLogs)[number]) => ({
    leadName: log.lead?.name ?? log.leadId,
    categoryName: log.lead?.category?.name ?? "—",
    messageOrder: 0,
    dayOffset: 0,
    scheduled: log.scheduled,
    targetDate: log.targetDate,
    status: log.status,
    sentAt: log.sentAt,
  }))

  return { generatedAt: now, settings, counts, totalLeads, rows, waiting, disqualified, idle, logs }
}

/** Indica se "agora" (Brasília) cai num fim de semana. */
export function isBrazilWeekend(date: Date = new Date()): boolean {
  const wd = getBrazilTimeParts(date).weekday
  return wd === 0 || wd === 6
}
