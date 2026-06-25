import { test } from "node:test"
import assert from "node:assert/strict"
import {
  dueFollowups,
  nextDispatchForLead,
  restartDateAfterWait,
  shouldRestartCycle,
  currentDayFor,
  categoryDays,
  lastDayOf,
  targetDateFor,
  normalizeStage,
  isActiveStage,
  type ScheduleMessage,
} from "@/lib/followup-schedule"

/**
 * Helper: cria uma data correspondente a um horário de Brasília (UTC-3, sem DST atualmente).
 * Brasília = UTC - 3h, então 08:00 em Brasília == 11:00 UTC.
 */
function brazil(dateTime: string): Date {
  return new Date(`${dateTime}:00-03:00`)
}

const msg = (over: Partial<ScheduleMessage> = {}): ScheduleMessage => ({
  id: "m1",
  order: 1,
  dayOffset: 1,
  time: "08:00",
  content: "Olá!",
  active: true,
  ...over,
})

// 2026-06-08 é uma segunda-feira; 2026-06-13 é sábado; 2026-06-14 é domingo.

// --- normalização de status legados ---

test("normalizeStage converte valores legados", () => {
  assert.equal(normalizeStage("dia1"), "ativo")
  assert.equal(normalizeStage("dia2"), "ativo")
  assert.equal(normalizeStage("dia3"), "ativo")
  assert.equal(normalizeStage("ativo"), "ativo")
  assert.equal(normalizeStage("aguarda_7_dias"), "aguardando")
  assert.equal(normalizeStage("aguardando"), "aguardando")
  assert.equal(normalizeStage("desqualificado"), "desqualificado")
})

test("isActiveStage reconhece status ativos (inclui legados)", () => {
  assert.equal(isActiveStage("ativo"), true)
  assert.equal(isActiveStage("dia2"), true)
  assert.equal(isActiveStage("aguardando"), false)
  assert.equal(isActiveStage("desqualificado"), false)
})

// --- dias da categoria definidos implicitamente pelas mensagens ---

test("categoryDays retorna os dias distintos (ativos) ordenados", () => {
  const days = categoryDays([
    msg({ id: "a", dayOffset: 1 }),
    msg({ id: "b", dayOffset: 1, time: "18:00" }),
    msg({ id: "c", dayOffset: 5 }),
    msg({ id: "d", dayOffset: 3 }),
    msg({ id: "e", dayOffset: 2, active: false }), // inativa: ignorada
    msg({ id: "f", dayOffset: 0 }), // imediato (não conta como dia)
  ])
  assert.deepEqual(days, [1, 3, 5])
})

test("lastDayOf retorna o maior dia da sequência (0 sem dias)", () => {
  assert.equal(lastDayOf([msg({ dayOffset: 1 }), msg({ dayOffset: 4 })]), 4)
  assert.equal(lastDayOf([msg({ dayOffset: 0 })]), 0)
})

// --- targetDateFor: dias úteis vs corridos ---

test("targetDateFor conta dias úteis pulando fim de semana", () => {
  // Criado quarta 2026-06-10. dia3 cairia no sábado13 -> adia para segunda15.
  const createdAt = brazil("2026-06-10T08:00")
  assert.equal(targetDateFor(createdAt, 3, false), "2026-06-15")
})

test("targetDateFor conta dias corridos quando sendWeekends é true", () => {
  const createdAt = brazil("2026-06-10T08:00")
  assert.equal(targetDateFor(createdAt, 3, true), "2026-06-13") // sábado
})

// --- dueFollowups: agora percorre TODOS os dias da categoria ---

test("dueFollowups retorna as mensagens do dia-alvo cujo horário já passou", () => {
  const cycleStartedAt = brazil("2026-06-08T08:00") // segunda
  const now = brazil("2026-06-09T12:00") // terça 12:00 (dia 1)
  const due = dueFollowups({
    now,
    cycleStartedAt,
    sendWeekends: false,
    messages: [
      msg({ id: "a", dayOffset: 1, time: "08:00" }), // já passou
      msg({ id: "b", dayOffset: 1, time: "11:00" }), // já passou
      msg({ id: "c", dayOffset: 1, time: "18:00" }), // ainda não
      msg({ id: "d", dayOffset: 2, time: "08:00" }), // outro dia
    ],
  })
  const ids = due.map((d) => d.message.id).sort()
  assert.deepEqual(ids, ["a", "b"])
  assert.ok(due.every((d) => d.targetDate === "2026-06-09" && d.day === 1))
  assert.ok(due.every((d) => d.total === 3))
})

test("dueFollowups vazio antes da hora-alvo", () => {
  const due = dueFollowups({
    now: brazil("2026-06-09T07:00"),
    cycleStartedAt: brazil("2026-06-08T08:00"),
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.length, 0)
})

test("dueFollowups dispara o dia 2 dois dias úteis depois", () => {
  const cycleStartedAt = brazil("2026-06-08T08:00") // segunda
  const now = brazil("2026-06-10T09:00") // quarta (dia 2 útil)
  const due = dueFollowups({
    now,
    cycleStartedAt,
    sendWeekends: false,
    messages: [
      msg({ id: "d1", dayOffset: 1, time: "08:00" }),
      msg({ id: "d2", dayOffset: 2, time: "08:00" }),
    ],
  })
  assert.deepEqual(due.map((d) => d.message.id), ["d2"])
})

test("dueFollowups respeita finais de semana desabilitados", () => {
  const due = dueFollowups({
    now: brazil("2026-06-13T12:00"), // sábado
    cycleStartedAt: brazil("2026-06-12T08:00"), // sexta
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.length, 0)
})

test("dueFollowups com sendWeekends true dispara no sábado (dias corridos)", () => {
  const due = dueFollowups({
    now: brazil("2026-06-13T09:00"), // sábado +24h
    cycleStartedAt: brazil("2026-06-12T08:00"), // sexta
    sendWeekends: true,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.deepEqual(due.map((d) => d.targetDate), ["2026-06-13"])
})

test("dueFollowups ignora mensagens inativas", () => {
  const due = dueFollowups({
    now: brazil("2026-06-09T08:00"),
    cycleStartedAt: brazil("2026-06-08T08:00"),
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00", active: false })],
  })
  assert.equal(due.length, 0)
})

// --- currentDayFor: "dia atual" do lead ativo ---

test("currentDayFor é 0 antes do primeiro dia chegar", () => {
  const cur = currentDayFor({
    now: brazil("2026-06-08T20:00"), // mesma segunda
    cycleStartedAt: brazil("2026-06-08T08:00"),
    sendWeekends: false,
    messages: [msg({ dayOffset: 1 }), msg({ id: "b", dayOffset: 3 })],
  })
  assert.equal(cur, 0)
})

test("currentDayFor reflete o maior dia cuja data-alvo já chegou", () => {
  const cycleStartedAt = brazil("2026-06-08T08:00") // segunda
  const messages = [msg({ id: "a", dayOffset: 1 }), msg({ id: "b", dayOffset: 2 }), msg({ id: "c", dayOffset: 5 })]
  // Quarta = 2 dias úteis depois → dia atual 2.
  assert.equal(
    currentDayFor({ now: brazil("2026-06-10T12:00"), cycleStartedAt, sendWeekends: false, messages }),
    2,
  )
})

// --- nextDispatchForLead (monitor) ---

test("nextDispatchForLead aponta o instante exato e a contagem regressiva", () => {
  const cycleStartedAt = brazil("2026-06-08T08:00") // segunda 08:00
  const now = brazil("2026-06-08T20:00") // faltam 12h para terça 08:00
  const next = nextDispatchForLead({
    now,
    cycleStartedAt,
    sendWeekends: true,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.ok(next)
  if (next) {
    assert.equal(next.at.toISOString(), "2026-06-09T11:00:00.000Z")
    assert.equal(next.msUntil, 12 * 60 * 60 * 1000)
    assert.equal(next.targetDay, 1)
  }
})

test("nextDispatchForLead escolhe o próximo dia futuro mais próximo", () => {
  const cycleStartedAt = brazil("2026-06-08T08:00")
  // Já passamos do dia 1 (terça). O próximo é o dia 2 (quarta).
  const now = brazil("2026-06-09T12:00")
  const next = nextDispatchForLead({
    now,
    cycleStartedAt,
    sendWeekends: true,
    messages: [msg({ id: "d1", dayOffset: 1, time: "08:00" }), msg({ id: "d2", dayOffset: 2, time: "08:00" })],
  })
  assert.ok(next)
  if (next) assert.equal(next.targetDay, 2)
})

test("nextDispatchForLead retorna null sem mensagens diárias ativas", () => {
  const next = nextDispatchForLead({
    now: brazil("2026-06-08T08:00"),
    cycleStartedAt: brazil("2026-06-08T08:00"),
    messages: [msg({ dayOffset: 1, active: false })],
  })
  assert.equal(next, null)
})

// --- reinício do ciclo: espera por categoria (waitDays) ---

test("restartDateAfterWait usa 7 dias úteis por padrão", () => {
  // Espera iniciada na segunda 2026-06-08. 7 dias úteis → quarta 2026-06-17.
  const waitingSince = brazil("2026-06-08T10:00")
  assert.equal(restartDateAfterWait(waitingSince), "2026-06-17")
})

test("restartDateAfterWait respeita waitDays customizado da categoria", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  // 3 dias úteis: ter09, qua10, qui11.
  assert.equal(restartDateAfterWait(waitingSince, 3, false), "2026-06-11")
})

test("restartDateAfterWait com dias corridos (sendWeekends true)", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  assert.equal(restartDateAfterWait(waitingSince, 7, true), "2026-06-15")
})

test("NÃO reinicia antes de cumprir a espera da categoria", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  assert.equal(shouldRestartCycle({ now: brazil("2026-06-10T12:00"), waitingSince, waitDays: 3 }), false)
})

test("reinicia ao alcançar o prazo de espera da categoria", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  assert.equal(shouldRestartCycle({ now: brazil("2026-06-11T08:00"), waitingSince, waitDays: 3 }), true)
})

test("após reiniciar, o dia 1 é contado a partir da nova âncora", () => {
  // Ciclo reiniciado na quarta 2026-06-17 (nova âncora). dia1 = quinta 06-18.
  const cycleStartedAt = brazil("2026-06-17T08:00")
  const due = dueFollowups({
    now: brazil("2026-06-18T09:00"),
    cycleStartedAt,
    sendWeekends: false,
    messages: [msg({ id: "r1", dayOffset: 1, time: "08:00" })],
  })
  assert.deepEqual(due.map((d) => d.message.id), ["r1"])
  assert.ok(due.every((d) => d.targetDate === "2026-06-18"))
})
