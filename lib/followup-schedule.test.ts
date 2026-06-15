import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decideFollowup,
  dueFollowups,
  nextDispatchForLead,
  restartDateAfterWait,
  shouldRestartCycle,
  type ScheduleMessage,
} from "@/lib/followup-schedule"

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

test("ENVIA mesmo atrasado no mesmo dia-alvo (janela: hora-alvo já passou)", () => {
  // Modelo de janela: às 09:00 a mensagem das 08:00 ainda deve ser enviada
  // (atrasada). Isso corrige o bug em que o cron, ao atrasar 1 min, perdia o envio.
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T09:00") // +24h, 1h após o horário-alvo
  const decision = decideFollowup({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(decision.send, true)
})

test("NÃO envia antes da hora-alvo no dia-alvo (08:00 ainda não chegou)", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T07:00") // +24h porém 07:00 < 08:00
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

// --- nextDispatchForLead (usado pelo monitor de terminal) ---

test("nextDispatchForLead aponta o instante exato +24h e a contagem regressiva", () => {
  const createdAt = brazil("2026-06-08T08:00") // segunda 08:00
  const now = brazil("2026-06-08T20:00") // segunda 20:00 -> faltam 12h
  const next = nextDispatchForLead({
    now,
    createdAt,
    stage: "dia1",
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.ok(next)
  if (next) {
    // O envio deve ser terça 08:00 Brasília == 11:00 UTC
    assert.equal(next.at.toISOString(), "2026-06-09T11:00:00.000Z")
    // Faltam exatamente 12h
    assert.equal(next.msUntil, 12 * 60 * 60 * 1000)
    assert.equal(next.targetDay, 1)
  }
})

test("nextDispatchForLead calcula corretamente para dia2 (+48h)", () => {
  const createdAt = brazil("2026-06-08T09:30")
  const now = brazil("2026-06-09T09:30") // 1 dia depois; alvo do dia2 é +48h
  const next = nextDispatchForLead({
    now,
    createdAt,
    stage: "dia2",
    messages: [msg({ dayOffset: 2, time: "09:30" })],
  })
  assert.ok(next)
  if (next) {
    // 2026-06-10 09:30 Brasília == 12:30 UTC
    assert.equal(next.at.toISOString(), "2026-06-10T12:30:00.000Z")
    assert.equal(next.msUntil, 24 * 60 * 60 * 1000) // faltam 24h
  }
})

test("nextDispatchForLead retorna null para etapa não diária", () => {
  const next = nextDispatchForLead({
    now: brazil("2026-06-08T08:00"),
    createdAt: brazil("2026-06-08T08:00"),
    stage: "desqualificado",
    messages: [msg()],
  })
  assert.equal(next, null)
})

test("nextDispatchForLead retorna null sem mensagem ativa para a etapa", () => {
  const next = nextDispatchForLead({
    now: brazil("2026-06-08T08:00"),
    createdAt: brazil("2026-06-08T08:00"),
    stage: "dia1",
    messages: [msg({ dayOffset: 1, active: false })],
  })
  assert.equal(next, null)
})

test("msUntil fica negativo quando o horário já passou (lead atrasado)", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T10:00") // 2h depois do alvo (terça 08:00)
  const next = nextDispatchForLead({
    now,
    createdAt,
    stage: "dia1",
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.ok(next)
  if (next) assert.ok(next.msUntil < 0)
})

// --- dueFollowups (usado pelo dispatch idempotente) ---

test("dueFollowups retorna todas as mensagens cujo horário já passou no dia-alvo", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T12:00") // dia-alvo; 12:00
  const due = dueFollowups({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [
      msg({ id: "a", dayOffset: 1, time: "08:00" }), // já passou
      msg({ id: "b", dayOffset: 1, time: "11:00" }), // já passou
      msg({ id: "c", dayOffset: 1, time: "18:00" }), // ainda não
    ],
  })
  assert.equal(due.targetDate, "2026-06-09")
  const ids = due.messages.map((m) => m.id).sort()
  assert.deepEqual(ids, ["a", "b"])
})

test("dueFollowups vazio quando nenhuma hora-alvo chegou ainda", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-09T07:00")
  const due = dueFollowups({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.messages.length, 0)
})

test("dueFollowups vazio fora do dia-alvo", () => {
  const createdAt = brazil("2026-06-08T08:00")
  const now = brazil("2026-06-10T12:00") // +48h, etapa dia1 (alvo +24h)
  const due = dueFollowups({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.messages.length, 0)
})

test("adia para segunda quando a etapa cairia no sábado (sendWeekends false)", () => {
  // Lead criado na quarta 2026-06-10. dia1=quinta11, dia2=sexta12,
  // dia3 cairia no sábado13 -> deve ser adiado para segunda15.
  const createdAt = brazil("2026-06-10T08:00") // quarta
  const segunda = brazil("2026-06-15T09:00") // segunda 09:00 (>= horário-alvo)
  const due = dueFollowups({
    now: segunda,
    createdAt,
    stage: "dia3",
    sendWeekends: false,
    messages: [msg({ id: "m3", dayOffset: 3, time: "08:00" })],
  })
  assert.equal(due.targetDate, "2026-06-15")
  assert.deepEqual(due.messages.map((m) => m.id), ["m3"])
})

test("NÃO envia a etapa adiada no próprio sábado (sendWeekends false)", () => {
  const createdAt = brazil("2026-06-10T08:00") // quarta
  const sabado = brazil("2026-06-13T09:00") // sábado
  const due = dueFollowups({
    now: sabado,
    createdAt,
    stage: "dia3",
    sendWeekends: false,
    messages: [msg({ id: "m3", dayOffset: 3, time: "08:00" })],
  })
  assert.equal(due.messages.length, 0)
})

test("com sendWeekends true a etapa dia3 permanece no sábado (dias corridos)", () => {
  const createdAt = brazil("2026-06-10T08:00") // quarta
  const sabado = brazil("2026-06-13T09:00") // sábado +72h
  const due = dueFollowups({
    now: sabado,
    createdAt,
    stage: "dia3",
    sendWeekends: true,
    messages: [msg({ id: "m3", dayOffset: 3, time: "08:00" })],
  })
  assert.equal(due.targetDate, "2026-06-13")
  assert.deepEqual(due.messages.map((m) => m.id), ["m3"])
})

test("dueFollowups respeita finais de semana desabilitados", () => {
  const createdAt = brazil("2026-06-12T08:00") // sexta
  const now = brazil("2026-06-13T12:00") // sábado
  const due = dueFollowups({
    now,
    createdAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.messages.length, 0)
})

// ---- Reinício automático do ciclo após "aguarda_7_dias" (7 dias úteis) ----

test("restartDateAfterWait conta 7 dias úteis pulando fim de semana", () => {
  // Espera iniciada na segunda 2026-06-08. 7 dias úteis:
  // ter09, qua10, qui11, sex12, [sáb13/dom14 pulados], seg15, ter16, qua17.
  const waitingSince = brazil("2026-06-08T10:00")
  assert.equal(restartDateAfterWait(waitingSince), "2026-06-17")
})

test("NÃO reinicia antes de cumprir os 7 dias úteis", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  // Terça 06-16 ainda é o 6º dia útil → não reinicia.
  assert.equal(shouldRestartCycle({ now: brazil("2026-06-16T12:00"), waitingSince }), false)
})

test("reinicia o ciclo ao alcançar o 7º dia útil", () => {
  const waitingSince = brazil("2026-06-08T10:00")
  // Quarta 06-17 é o 7º dia útil → reinicia.
  assert.equal(shouldRestartCycle({ now: brazil("2026-06-17T08:00"), waitingSince }), true)
})

test("após reiniciar, dia1 é contado a partir da nova âncora (cycleStartedAt)", () => {
  // Ciclo reiniciado na quarta 2026-06-17 (nova âncora). dia1 = próximo dia
  // útil = quinta 06-18, no horário da mensagem.
  const cycleStartedAt = brazil("2026-06-17T08:00")
  const due = dueFollowups({
    now: brazil("2026-06-18T09:00"),
    createdAt: cycleStartedAt,
    stage: "dia1",
    sendWeekends: false,
    messages: [msg({ id: "r1", dayOffset: 1, time: "08:00" })],
  })
  assert.equal(due.targetDate, "2026-06-18")
  assert.deepEqual(due.messages.map((m) => m.id), ["r1"])
})
