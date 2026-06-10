import { getBrazilTimeParts, brazilWallTimeToUtc } from "@/lib/timezone"

// Mapeia cada etapa do lead ao número de dias (dayOffset) que a mensagem deve corresponder.
// Leads em "desqualificado" ou "aguarda_7_dias" não recebem mensagens de sequência diária.
export const STAGE_TO_DAY: Record<string, number> = {
  dia1: 1,
  dia2: 2,
  dia3: 3,
}

export const DAILY_STAGES = Object.keys(STAGE_TO_DAY)

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type ScheduleMessage = {
  id: string
  order: number
  dayOffset: number
  time: string
  content: string
  active: boolean
}

export type ScheduleDecisionInput = {
  /** Instante "agora" (UTC). Permite simular o tempo nos testes. */
  now: Date
  /** Data de criação do lead. */
  createdAt: Date
  /** Etapa atual do lead (ex.: "dia1"). */
  stage: string
  /** Mensagens ativas da categoria do lead. */
  messages: ScheduleMessage[]
  /** Se o envio em finais de semana está habilitado. */
  sendWeekends: boolean
}

export type ScheduleDecision =
  | { send: false; reason: string }
  | { send: true; message: ScheduleMessage; targetDay: number; date: string; time: string }

/**
 * Decide, de forma pura e determinística, se um lead deve receber uma mensagem
 * de follow-up no instante `now`. Toda a lógica de tempo do dispatch vive aqui
 * para que possa ser testada sem banco de dados nem esperar 24h reais.
 *
 * Regras:
 * - Respeita o horário de Brasília (America/Sao_Paulo).
 * - Pula finais de semana quando `sendWeekends` é falso.
 * - A data alvo é `createdAt + N*24h`, onde N = dias da etapa (dia1=1, dia2=2, dia3=3).
 * - Só envia quando a data alvo == hoje (Brasília) E o horário atual (HH:mm) == message.time.
 */
export function decideFollowup(input: ScheduleDecisionInput): ScheduleDecision {
  const { now, createdAt, stage, messages, sendWeekends } = input

  const targetDay = STAGE_TO_DAY[stage]
  if (targetDay === undefined) {
    return { send: false, reason: `Etapa "${stage}" não é uma etapa diária` }
  }

  const brazil = getBrazilTimeParts(now)

  if (!sendWeekends && (brazil.weekday === 0 || brazil.weekday === 6)) {
    return { send: false, reason: "Final de semana desabilitado" }
  }

  // Data alvo = data de criação + N dias, convertida para o dia no fuso de Brasília.
  const targetDate = getBrazilTimeParts(new Date(createdAt.getTime() + targetDay * MS_PER_DAY)).date

  if (targetDate !== brazil.date) {
    return { send: false, reason: `Hoje (${brazil.date}) não é a data alvo (${targetDate})` }
  }

  const message = messages.find(
    (m) => m.active && m.dayOffset === targetDay && m.time === brazil.time,
  )
  if (!message) {
    return { send: false, reason: `Nenhuma mensagem ativa para dia ${targetDay} às ${brazil.time}` }
  }

  return { send: true, message, targetDay, date: brazil.date, time: brazil.time }
}

export type NextDispatch = {
  /** Instante UTC exato em que a mensagem deve ser enviada. */
  at: Date
  /** Milissegundos a partir de `now` até o envio (>= 0). */
  msUntil: number
  message: ScheduleMessage
  targetDay: number
}

/**
 * Calcula o próximo envio agendado para um lead (a partir de `now`),
 * de forma pura. Usado pelo monitor de terminal para a contagem regressiva.
 *
 * Considera a mensagem ativa da etapa atual do lead (dia1=1, dia2=2, dia3=3).
 * Se a hora-alvo de hoje já passou, retorna null (o lead já deveria ter sido
 * processado pelo cron — não há próximo envio futuro nesta etapa).
 */
export function nextDispatchForLead(input: {
  now: Date
  createdAt: Date
  stage: string
  messages: ScheduleMessage[]
}): NextDispatch | null {
  const { now, createdAt, stage, messages } = input

  const targetDay = STAGE_TO_DAY[stage]
  if (targetDay === undefined) return null

  const message = messages.find((m) => m.active && m.dayOffset === targetDay)
  if (!message) return null

  // Dia-alvo no fuso de Brasília = data de criação + N dias.
  const targetDate = getBrazilTimeParts(new Date(createdAt.getTime() + targetDay * MS_PER_DAY)).date

  // Instante UTC exato = hora-parede (targetDate + message.time) no fuso de Brasília.
  const at = brazilWallTimeToUtc(targetDate, message.time)
  const msUntil = at.getTime() - now.getTime()

  return { at, msUntil, message, targetDay }
}
