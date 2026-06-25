/**
 * Monitor de terminal: visão completa de TUDO que acontece internamente no
 * motor de follow-up. Atualiza a cada segundo (e relê o banco a cada 3s) para
 * você ter certeza visual de que o agendamento está funcionando.
 *
 * Mostra:
 *   - Status da configuração (webhook, fins de semana, horário de Brasília).
 *   - Resumo da quantidade de leads por etapa.
 *   - Próximos envios agendados (dia1 · dia2 · dia3) com datas e contagem regressiva.
 *   - Leads aguardando 7 dias úteis (com data de reinício do ciclo).
 *   - Leads parados (nenhuma ação automática).
 *   - Leads sem categoria / sem mensagens ativas (por que não disparam).
 *   - Últimos envios registrados (FollowupLog).
 *
 * Uso:
 *   npm run monitor
 *
 * Requer DATABASE_URL no ambiente (mesma do app).
 */
import { prisma } from "@/lib/prisma"
import { formatBrazilTimestamp, getBrazilTimeParts } from "@/lib/timezone"
import {
  loadMonitorData,
  STAGE_ORDER,
  STAGE_LABEL,
  type MonitorData,
} from "@/lib/monitor-data"

const REFRESH_DB_MS = 3_000
const TICK_MS = 1_000

async function loadRows(): Promise<MonitorData> {
  return loadMonitorData()
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ENVIANDO AGORA"
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`
  return d > 0 ? `${d}d ${hms}` : hms
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function render(data: MonitorData) {
  const { settings, counts, totalLeads, rows, waiting, disqualified, idle, logs } = data
  // Limpa a tela e move o cursor para o topo
  process.stdout.write("\x1b[2J\x1b[H")
  const now = new Date()
  const brazil = getBrazilTimeParts(now)
  const isWeekend = brazil.weekday === 0 || brazil.weekday === 6

  console.log("=".repeat(72))
  console.log(`  MONITOR DE FOLLOW-UP  ·  agora: ${formatBrazilTimestamp(now)} (Brasília)`)
  console.log("=".repeat(72))

  // ---- Status da configuração ----
  const webhookStatus = settings.webhookEnabled && settings.webhookUrl
    ? "ATIVO"
    : "DESABILITADO"
  const weekendStatus = settings.sendWeekends ? "sim" : "não"
  const pausedNow = isWeekend && !settings.sendWeekends ? "  (PAUSADO: fim de semana)" : ""
  console.log("\n  CONFIGURAÇÃO")
  console.log(`     webhook:            ${webhookStatus}`)
  console.log(`     envia fins de semana: ${weekendStatus}${pausedNow}`)
  console.log(`     dia da semana:      ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][brazil.weekday]}`)

  // ---- Resumo por etapa ----
  console.log("\n  RESUMO POR ETAPA")
  const summary = STAGE_ORDER.map((s) => `${STAGE_LABEL[s]}: ${counts[s] ?? 0}`).join("   ·   ")
  console.log(`     ${summary}`)
  console.log(`     TOTAL de leads: ${totalLeads}`)

  console.log("\n" + "-".repeat(72))

  // ---- Próximos envios ----
  console.log(`\n  PRÓXIMOS ENVIOS (dia1 · dia2 · dia3 · ${rows.length})`)
  if (rows.length === 0) {
    console.log("\n  Nenhum lead com envio agendado no momento.")
  } else {
    for (const row of rows) {
      const ms = row.at.getTime() - now.getTime()
      const countdown = formatCountdown(ms)
      const marker = ms <= 0 ? "►" : "·"
      const msg = row.message.content
      console.log(`\n  ${marker} ${row.leadName}  [${STAGE_LABEL[row.stage] ?? row.stage}]  → ${row.categoryName}`)
      console.log(`     criado em:     ${formatBrazilTimestamp(row.createdAt)}`)
      console.log(`     ciclo desde:   ${formatBrazilTimestamp(row.cycleStartedAt)}`)
      console.log(`     data-alvo:     ${row.targetDate}  às ${row.message.time}`)
      console.log(`     próximo envio: ${formatBrazilTimestamp(row.at)} (Brasília)`)
      console.log(`     faltam:        ${countdown}`)
      console.log(`     mensagem:      "${msg.slice(0, 50)}${msg.length > 50 ? "..." : ""}"`)
    }
  }

  console.log("\n" + "-".repeat(72))

  // ---- Aguardando 7 dias ----
  console.log(`\n  AGUARDANDO 7 DIAS  (sequência diária concluída · ${waiting.length})`)
  if (waiting.length === 0) {
    console.log("\n  Nenhum lead nesta etapa no momento.")
  } else {
    for (const row of waiting) {
      const elapsed = formatElapsed(now.getTime() - row.since.getTime())
      console.log(`\n  ⏳ ${row.leadName}  → ${row.categoryName}`)
      console.log(`     desde:         ${formatBrazilTimestamp(row.since)} (Brasília)`)
      console.log(`     em espera:     há ${elapsed}`)
      console.log(`     reinicia em:   ${row.restartDate} (volta para o dia 1)`)
    }
  }

  console.log("\n" + "-".repeat(72))

  // ---- Parados ----
  console.log(`\n  PARADOS  (sem ação automática · ${disqualified.length})`)
  if (disqualified.length === 0) {
    console.log("\n  Nenhum lead parado.")
  } else {
    for (const row of disqualified) {
      console.log(`\n  ✖ ${row.leadName}  → ${row.categoryName}`)
      console.log(`     ${row.reason}`)
    }
  }

  // ---- Sem agendamento (motivos) ----
  if (idle.length > 0) {
    console.log("\n" + "-".repeat(72))
    console.log(`\n  SEM AGENDAMENTO  (não disparam agora · ${idle.length})`)
    for (const row of idle) {
      console.log(`\n  ⚠ ${row.leadName}  [${STAGE_LABEL[row.stage] ?? row.stage}]  → ${row.categoryName}`)
      console.log(`     motivo: ${row.reason}`)
    }
  }

  console.log("\n" + "-".repeat(72))

  // ---- Últimos envios registrados ----
  console.log(`\n  ÚLTIMOS ENVIOS REGISTRADOS  (${logs.length})`)
  if (logs.length === 0) {
    console.log("\n  Nenhum envio registrado ainda.")
  } else {
    for (const log of logs) {
      const statusMark = log.status === "delivered" ? "✓" : log.status === "pending" ? "…" : "✗"
      console.log(
        `\n  ${statusMark} ${formatBrazilTimestamp(log.sentAt)}  ${log.leadName} → ${log.categoryName}`,
      )
      console.log(`     alvo: ${log.targetDate} às ${log.scheduled}  ·  status: ${log.status}`)
    }
  }

  console.log("\n" + "-".repeat(72))
  console.log("  Atualiza a cada 1s · relê o banco a cada 3s · Ctrl+C para sair")
}

async function main() {
  let data: MonitorData
  try {
    data = await loadRows()
  } catch (err) {
    console.error("\n[monitor] Não foi possível conectar ao banco de dados.")
    console.error("  Verifique se a variável DATABASE_URL está definida e o banco está acessível.")
    console.error("  Detalhe:", err instanceof Error ? err.message : String(err), "\n")
    await prisma.$disconnect()
    process.exit(1)
  }
  render(data)

  let lastDbLoad = Date.now()
  const tick = setInterval(async () => {
    if (Date.now() - lastDbLoad >= REFRESH_DB_MS) {
      try {
        data = await loadRows()
        lastDbLoad = Date.now()
      } catch (err) {
        console.error("[monitor] Falha ao reler o banco:", err instanceof Error ? err.message : String(err))
      }
    }
    render(data)
  }, TICK_MS)

  const shutdown = async () => {
    clearInterval(tick)
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch(async (err) => {
  console.error("[monitor] Erro fatal:", err instanceof Error ? err.message : String(err))
  await prisma.$disconnect()
  process.exit(1)
})
