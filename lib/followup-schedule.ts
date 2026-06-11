import { getBrazilTimeParts, brazilWallTimeToUtc } from "@/lib/timezone"

// Mapeia cada etapa do lead ao número de dias (dayOffset) que a mensagem deve corresponder.
// Leads em "desqualificado" ou "aguarda_7_dias" não recebem mensagens de sequência diária.
export const STAGE_TO_DAY: Record<string, number> = {
  dia1: 1,
  dia2: 2,
  dia3: 3,
}

export const DAILY_STAGES = Object.keys(STAGE_TO_DAY)

// Para onde o lead avança depois que TODAS as mensagens da etapa atual são
// entregues. Após o dia3, o lead vai para "aguarda_7_dias" (fim da sequência diária).
export const STAGE_PROGRESSION: Record<string, string> = {
  dia1: "dia2",
  dia2: "dia3",
  dia3: "aguarda_7_dias",
}

/** Próxima etapa após a atual, ou null se não houver avanço automático. */
export function nextStageAfter(stage: string): string | null {
  return STAGE_PROGRESSION[stage] ?? null
}

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
 * Resultado da apuração de follow-ups devidos para um lead num dado instante.
 * Pode conter mais de uma mensagem (ex.: duas mensagens no mesmo dia cujos
 * horários já passaram).
 */
export type DueFollowups = {
  /** Etapa numérica (dia1=1...). undefined se a etapa não for diária. */
  targetDay: number
  /** Data-alvo no formato YYYY-MM-DD (Brasília). */
  targetDate: string
  /** Mensagens cujo horário já chegou hoje e que ainda devem ser enviadas. */
  messages: ScheduleMessage[]
}

/**
 * Apura, de forma pura e determinística, TODAS as mensagens de follow-up que já
 * são devidas para um lead no instante `now`. Toda a lógica de tempo do dispatch
 * vive aqui para que possa ser testada sem banco de dados nem esperar 24h reais.
 *
 * Regras (modelo de "janela", robusto a atrasos do cron/agendador):
 * - Respeita o horário de Brasília (America/Sao_Paulo).
 * - Pula finais de semana quando `sendWeekends` é falso.
 * - A data-alvo é `createdAt + N*24h`, onde N = dias da etapa (dia1=1, dia2=2, dia3=3).
 * - Envia quando a data-alvo == hoje (Brasília) E o horário-alvo já chegou
 *   (message.time <= horário atual). NÃO exige correspondência de minuto exato,
 *   então uma execução atrasada do agendador ainda envia a mensagem do dia.
 * - A deduplicação (não reenviar a mesma mensagem) é feita pela camada de
 *   dispatch via FollowupLog, não aqui.
 */
export function dueFollowups(input: ScheduleDecisionInput): DueFollowups {
  const { now, createdAt, stage, messages, sendWeekends } = input

  const targetDay = STAGE_TO_DAY[stage]
  if (targetDay === undefined) {
    return { targetDay: -1, targetDate: "", messages: [] }
  }

  const brazil = getBrazilTimeParts(now)

  if (!sendWeekends && (brazil.weekday === 0 || brazil.weekday === 6)) {
    return { targetDay, targetDate: "", messages: [] }
  }

  // Data-alvo = data de criação + N dias, convertida para o dia no fuso de Brasília.
  const targetDate = getBrazilTimeParts(new Date(createdAt.getTime() + targetDay * MS_PER_DAY)).date

  if (targetDate !== brazil.date) {
    return { targetDay, targetDate, messages: [] }
  }

  // Mensagens da etapa cujo horário-alvo já chegou hoje (<= horário atual).
  const due = messages.filter(
    (m) => m.active && m.dayOffset === targetDay && m.time <= brazil.time,
  )

  return { targetDay, targetDate, messages: due }
}

/**
 * Compatibilidade: decide se há (pelo menos) uma mensagem devida para o lead.
 * Mantida para os testes e para usos que esperam uma decisão única. Retorna a
 * primeira mensagem devida (ordenada por horário).
 */
export function decideFollowup(input: ScheduleDecisionInput): ScheduleDecision {
  const targetDay = STAGE_TO_DAY[input.stage]
  if (targetDay === undefined) {
    return { send: false, reason: `Etapa "${input.stage}" não é uma etapa diária` }
  }

  const brazil = getBrazilTimeParts(input.now)
  if (!input.sendWeekends && (brazil.weekday === 0 || brazil.weekday === 6)) {
    return { send: false, reason: "Final de semana desabilitado" }
  }

  const { targetDate, messages } = dueFollowups(input)
  if (messages.length === 0) {
    return { send: false, reason: `Nenhuma mensagem devida para dia ${targetDay} até ${brazil.time}` }
  }

  const message = [...messages].sort((a, b) => a.time.localeCompare(b.time))[0]
  return { send: true, message, targetDay, date: brazil.date, time: message.time }
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
