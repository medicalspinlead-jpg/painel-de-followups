import { test } from "node:test"
import assert from "node:assert/strict"
import { decideFollowup, type ScheduleMessage } from "@/lib/followup-schedule"

/**
 * Helper: cria uma data correspondente a um horário de Brasília (UTC-3, sem DST atualmente).
 * Brasília = UTC - 3h, então 08:00 em Brasília == 11:00 UTC.
 */
function brazil(dateTime: string): Date {
  // dateTime no formato "YYYY-MM-DDTHH:mm" interpretado como horário de Brasília
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

test("envia exatamente 24h depois (dia1) no horário configurado", () => {
  const createdAt = brazil("2026-06-08T08:00") // segunda 08:00
  const now = brazil("2026-06-09T08:00") // terça 08:00 (exatamente +24h)
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, true)
  if (decision.send) {
    assert.equal(decision.targetDay, 1)
    assert.equal(decision.message.id, "m1")
  }
})

test("NÃO envia antes de completar 24h (mesmo dia)", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-08T08:00") // criado agora, 0h depois
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, false)
})

test("NÃO envia no horário errado (mesma data alvo, hora diferente)", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T09:00") // +24h porém 09:00 != 08:00
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, false)
})

test("NÃO envia 48h depois quando o lead ainda está em dia1", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-10T08:00") // +48h, mas etapa dia1 espera +24h
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, false)
})

test("envia 48h depois quando o lead está em dia2", () => {
  const createdAt = brazil("2026-06-08T08:00") // segunda
  const now = brazil("2026-06-10T08:00") // quarta, +48h
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia2",
    sendWeekends: false,
    messages: [msg({ id: "m2", dayOffset: 2, time: "08:00" })],
  })
  assert.equal(decision.send, true)
  if (decision.send) assert.equal(decision.targetDay, 2)
})

test("envia 72h depois quando o lead está em dia3", () => {
  const createdAt = brazil("2026-06-08T08:00") // segunda
  const now = brazil("2026-06-11T08:00") // quinta, +72h
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia3",
    sendWeekends: false,
    messages: [msg({ id: "m3", dayOffset: 3, time: "08:00" })],
  })
  assert.equal(decision.send, true)
  if (decision.send) assert.equal(decision.targetDay, 3)
})

test("NÃO envia em fim de semana quando sendWeekends é false", () => {
  const createdAt = brazil("2026-06-12T08:00") // sexta
  const now = brazil("2026-06-13T08:00") // sábado, +24h
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, false)
  if (!decision.send) assert.match(decision.reason, /[Ff]inal de semana/)
})

test("envia em fim de semana quando sendWeekends é true", () => {
  const createdAt = brazil("2026-06-12T08:00") // sexta
  const now = brazil("2026-06-13T08:00") // sábado, +24h
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: true,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, true)
})

test("ignora mensagens inativas", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T08:00")
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00", active: false })],
  })
  assert.equal(decision.send, false)
})

test("NÃO envia para etapas não diárias (ex.: desqualificado)", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T08:00")
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "desqualificado",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, false)
})

test("respeita o fuso de Brasília na virada de dia (UTC vs BRT)", () => {
  // Criado segunda 23:00 Brasília (= terça 02:00 UTC).
  const createdAt = brazil("2026-06-08T23:00")
  // +24h => terça 23:00 Brasília. Mensagem às 23:00.
  const now = brazil("2026-06-09T23:00")
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: true,
    messages: [msg({ dayOffset: 1, time: "23:00" })],
  })
  assert.equal(decision.send, true)
})
