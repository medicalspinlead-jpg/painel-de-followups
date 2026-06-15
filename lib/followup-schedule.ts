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

/**
 * Quantos DIAS ÚTEIS o lead aguarda na etapa "aguarda_7_dias" antes de o ciclo
 * reiniciar automaticamente em "dia1".
 */
export const WAIT_BUSINESS_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Dia da semana (0=domingo ... 6=sábado) de uma data YYYY-MM-DD no fuso de Brasília. */
function weekdayOfDate(dateStr: string): number {
  // Usa meio-dia para evitar bordas de meia-noite / horário de verão.
  return getBrazilTimeParts(brazilWallTimeToUtc(dateStr, "12:00")).weekday
}

/** Soma `days` dias corridos a uma data YYYY-MM-DD (fuso de Brasília). */
function addCalendarDays(dateStr: string, days: number): string {
  const noon = brazilWallTimeToUtc(dateStr, "12:00")
  return getBrazilTimeParts(new Date(noon.getTime() + days * MS_PER_DAY)).date
}

/**
 * Calcula a data-alvo (YYYY-MM-DD, Brasília) da etapa `targetDay` para um lead.
 *
 * - `sendWeekends = true`: dias CORRIDOS (createdAt + N*24h). Comportamento original.
 * - `sendWeekends = false`: N dias ÚTEIS a partir da criação, pulando sábados e
 *   domingos. Assim, uma etapa que cairia no fim de semana é ADIADA para a
 *   próxima segunda-feira, em vez de manter a data no sábado/domingo (que nunca
 *   bateria com "hoje" na segunda e faria a mensagem ser perdida).
 *
 * Ex.: lead criado na quarta, dia1=quinta, dia2=sexta, dia3 cairia no sábado →
 * é adiado para a segunda-feira seguinte.
 */
export function targetDateFor(createdAt: Date, targetDay: number, sendWeekends: boolean): string {
  if (sendWeekends) {
    return getBrazilTimeParts(new Date(createdAt.getTime() + targetDay * MS_PER_DAY)).date
  }

  let date = getBrazilTimeParts(createdAt).date
  let counted = 0
  while (counted < targetDay) {
    date = addCalendarDays(date, 1)
    const wd = weekdayOfDate(date)
    if (wd !== 0 && wd !== 6) counted++
  }
  return date
}

/**
 * Data (YYYY-MM-DD, Brasília) em que a espera de "aguarda_7_dias" termina e o
 * ciclo deve reiniciar em "dia1". Conta sempre em DIAS ÚTEIS a partir de
 * `waitingSince`, pulando sábados e domingos.
 */
export function restartDateAfterWait(waitingSince: Date): string {
  // Reaproveita a contagem de dias úteis de targetDateFor (sendWeekends=false).
  return targetDateFor(waitingSince, WAIT_BUSINESS_DAYS, false)
}

/**
 * Decide, de forma pura, se um lead em "aguarda_7_dias" já deve reiniciar o
 * ciclo no instante `now` (Brasília). Verdadeiro quando a data de hoje já
 * alcançou a data de reinício (7 dias úteis após o início da espera).
 */
export function shouldRestartCycle(input: { now: Date; waitingSince: Date }): boolean {
  const today = getBrazilTimeParts(input.now).date
  return today >= restartDateAfterWait(input.waitingSince)
}

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

  // Data-alvo da etapa. Quando o envio em fins de semana está desabilitado, é
  // contada em dias ÚTEIS, adiando etapas que cairiam no sábado/domingo para a
  // segunda-feira seguinte (em vez de perder a mensagem).
  const targetDate = targetDateFor(createdAt, targetDay, sendWeekends)

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
  /** Se o envio em fins de semana está habilitado. Default: true (dias corridos). */
  sendWeekends?: boolean
}): NextDispatch | null {
  const { now, createdAt, stage, messages, sendWeekends = true } = input

  const targetDay = STAGE_TO_DAY[stage]
  if (targetDay === undefined) return null

  const message = messages.find((m) => m.active && m.dayOffset === targetDay)
  if (!message) return null

  // Dia-alvo no fuso de Brasília. Quando fins de semana estão desabilitados,
  // conta em dias úteis (adia para a segunda-feira seguinte).
  const targetDate = targetDateFor(createdAt, targetDay, sendWeekends)

  // Instante UTC exato = hora-parede (targetDate + message.time) no fuso de Brasília.
  const at = brazilWallTimeToUtc(targetDate, message.time)
  const msUntil = at.getTime() - now.getTime()

  return { at, msUntil, message, targetDay }
}
