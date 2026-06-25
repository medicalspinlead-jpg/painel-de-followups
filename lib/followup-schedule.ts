import { getBrazilTimeParts, brazilWallTimeToUtc } from "@/lib/timezone"

// ----------------------------------------------------------------------------
// Modelo dinâmico de follow-up
//
// Não há mais etapas fixas (dia1/dia2/dia3). Cada categoria define os SEUS
// próprios "dias" de forma implícita: os dias da categoria são os valores
// distintos de `dayOffset` (>= 1) das suas mensagens ativas. A espera até o
// reinício do ciclo também é por categoria (`waitDays`, padrão 7).
//
// O lead tem apenas três status: "ativo" (recebendo a sequência), "aguardando"
// (na janela de espera) e "parado" (sem ação automática).
// ----------------------------------------------------------------------------

/** Status que recebem a sequência diária de mensagens. */
export const ACTIVE_STAGE = "ativo"
export const WAITING_STAGE = "aguardando"
export const STOPPED_STAGE = "parado"

/** Espera padrão (em dias) quando a categoria não define um valor próprio. */
export const DEFAULT_WAIT_DAYS = 7

/**
 * Normaliza valores legados de etapa para o novo modelo de status.
 * Bancos existentes podem ter leads em dia1/dia2/dia3/aguarda_7_dias.
 */
export function normalizeStage(stage: string): "ativo" | "aguardando" | "parado" {
  if (stage === "parado" || stage === "desqualificado") return "parado"
  if (stage === "aguarda_7_dias" || stage === "aguardando") return "aguardando"
  // dia1/dia2/dia3/ativo e qualquer outro → ativo
  return "ativo"
}

/** Verdadeiro se o lead está num status que recebe a sequência de mensagens. */
export function isActiveStage(stage: string): boolean {
  return normalizeStage(stage) === "ativo"
}

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
 * Calcula a data-alvo (YYYY-MM-DD, Brasília) do "dia" `targetDay` de um lead,
 * contado a partir de `createdAt` (a âncora do ciclo).
 *
 * - `sendWeekends = true`: dias CORRIDOS (createdAt + N*24h).
 * - `sendWeekends = false`: N dias ÚTEIS, pulando sábados e domingos (uma data
 *   que cairia no fim de semana é adiada para a segunda-feira seguinte).
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
 * Data (YYYY-MM-DD, Brasília) em que a espera termina e o ciclo reinicia.
 * Conta `waitDays` dias (úteis quando `sendWeekends` é falso) a partir de
 * `waitingSince`.
 */
export function restartDateAfterWait(
  waitingSince: Date,
  waitDays: number = DEFAULT_WAIT_DAYS,
  sendWeekends = false,
): string {
  return targetDateFor(waitingSince, Math.max(1, waitDays), sendWeekends)
}

/**
 * Decide, de forma pura, se um lead em espera já deve reiniciar o ciclo no
 * instante `now` (Brasília).
 */
export function shouldRestartCycle(input: {
  now: Date
  waitingSince: Date
  waitDays?: number
  sendWeekends?: boolean
}): boolean {
  const today = getBrazilTimeParts(input.now).date
  return today >= restartDateAfterWait(input.waitingSince, input.waitDays ?? DEFAULT_WAIT_DAYS, input.sendWeekends ?? false)
}

export type ScheduleMessage = {
  id: string
  order: number
  dayOffset: number
  time: string
  content: string
  active: boolean
}

/** Dias distintos (>= 1) configurados na categoria, ordenados crescentemente. */
export function categoryDays(messages: ScheduleMessage[]): number[] {
  const days = new Set<number>()
  for (const m of messages) {
    if (m.active && m.dayOffset >= 1) days.add(m.dayOffset)
  }
  return [...days].sort((a, b) => a - b)
}

/** Maior dia da sequência da categoria (0 se não houver mensagens diárias). */
export function lastDayOf(messages: ScheduleMessage[]): number {
  const days = categoryDays(messages)
  return days.length > 0 ? days[days.length - 1] : 0
}

/**
 * "Dia atual" do lead ativo: o maior dia da categoria cuja data-alvo já chegou
 * (<= hoje). Retorna 0 quando nenhuma data-alvo chegou ainda (antes do 1º dia).
 */
export function currentDayFor(input: {
  now: Date
  cycleStartedAt: Date
  messages: ScheduleMessage[]
  sendWeekends: boolean
}): number {
  const today = getBrazilTimeParts(input.now).date
  let current = 0
  for (const day of categoryDays(input.messages)) {
    if (targetDateFor(input.cycleStartedAt, day, input.sendWeekends) <= today) {
      current = day
    }
  }
  return current
}

export type DueItem = {
  message: ScheduleMessage
  /** Dia da sequência ao qual a mensagem pertence (dayOffset). */
  day: number
  /** Data-alvo (YYYY-MM-DD, Brasília). */
  targetDate: string
  /** Posição da mensagem dentro do dia, por ordem de horário (1-based). */
  index: number
  /** Total de mensagens ativas naquele dia. */
  total: number
}

export type ScheduleDecisionInput = {
  /** Instante "agora" (UTC). Permite simular o tempo nos testes. */
  now: Date
  /** Âncora do ciclo atual (createdAt no 1º ciclo; instante do reinício depois). */
  cycleStartedAt: Date
  /** Mensagens ativas da categoria do lead. */
  messages: ScheduleMessage[]
  /** Se o envio em finais de semana está habilitado. */
  sendWeekends: boolean
}

/**
 * Apura, de forma pura e determinística, TODAS as mensagens de follow-up que já
 * são devidas para um lead ativo no instante `now`. Percorre todos os dias da
 * categoria e seleciona as mensagens cuja data-alvo é HOJE (Brasília) e cujo
 * horário já chegou.
 *
 * A deduplicação (não reenviar a mesma mensagem) é feita pela camada de
 * dispatch via FollowupLog, não aqui.
 */
export function dueFollowups(input: ScheduleDecisionInput): DueItem[] {
  const { now, cycleStartedAt, messages, sendWeekends } = input
  const brazil = getBrazilTimeParts(now)

  // Sem envio em fins de semana: nada cai num sábado/domingo (targetDateFor já
  // adia para dias úteis), mas mantemos a guarda por clareza.
  if (!sendWeekends && (brazil.weekday === 0 || brazil.weekday === 6)) {
    return []
  }

  const result: DueItem[] = []
  for (const day of categoryDays(messages)) {
    const targetDate = targetDateFor(cycleStartedAt, day, sendWeekends)
    if (targetDate !== brazil.date) continue

    const dayMessages = messages
      .filter((m) => m.active && m.dayOffset === day)
      .sort((a, b) => a.time.localeCompare(b.time))
    const total = dayMessages.length

    dayMessages.forEach((message, i) => {
      if (message.time <= brazil.time) {
        result.push({ message, day, targetDate, index: i + 1, total })
      }
    })
  }
  return result
}

export type NextDispatch = {
  /** Instante UTC exato em que a mensagem deve ser enviada. */
  at: Date
  /** Milissegundos a partir de `now` até o envio (>= 0 quando futuro). */
  msUntil: number
  message: ScheduleMessage
  /** Dia da sequência (dayOffset) ao qual a mensagem pertence. */
  targetDay: number
  /** Data-alvo (YYYY-MM-DD, Brasília). */
  targetDate: string
}

/**
 * Calcula o PRÓXIMO envio agendado para um lead ativo (a partir de `now`),
 * de forma pura. Usado pelo monitor para a contagem regressiva.
 *
 * Considera todos os dias da categoria e retorna o envio futuro mais próximo.
 * Se não houver envio futuro (sequência já concluída hoje), retorna null.
 */
export function nextDispatchForLead(input: {
  now: Date
  cycleStartedAt: Date
  messages: ScheduleMessage[]
  /** Se o envio em fins de semana está habilitado. Default: true (dias corridos). */
  sendWeekends?: boolean
}): NextDispatch | null {
  const { now, cycleStartedAt, messages, sendWeekends = true } = input

  let best: NextDispatch | null = null
  for (const day of categoryDays(messages)) {
    const targetDate = targetDateFor(cycleStartedAt, day, sendWeekends)
    const dayMessages = messages
      .filter((m) => m.active && m.dayOffset === day)
      .sort((a, b) => a.time.localeCompare(b.time))

    for (const message of dayMessages) {
      const at = brazilWallTimeToUtc(targetDate, message.time)
      const msUntil = at.getTime() - now.getTime()
      // Só interessa o próximo envio futuro (ou o que está vencendo agora).
      if (msUntil < 0) continue
      if (!best || at.getTime() < best.at.getTime()) {
        best = { at, msUntil, message, targetDay: day, targetDate }
      }
    }
  }
  return best
}
