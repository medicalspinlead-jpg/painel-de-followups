/**
 * Monitor de terminal: mostra a contagem regressiva até o próximo envio de
 * webhook para cada lead ativo. Atualiza a cada segundo (e relê o banco a cada
 * 30s) para você ter certeza visual de que o agendamento está funcionando.
 *
 * Uso:
 *   npm run monitor
 *
 * Requer DATABASE_URL no ambiente (mesma do app).
 */
import { prisma } from "@/lib/prisma"
import type { LeadStage } from "@prisma/client"
import { nextDispatchForLead, DAILY_STAGES, type ScheduleMessage } from "@/lib/followup-schedule"
import { formatBrazilTimestamp } from "@/lib/timezone"

const REFRESH_DB_MS = 30_000
const TICK_MS = 1_000

type Row = {
  leadId: string
  leadName: string
  stage: string
  categoryName: string
  at: Date
  message: ScheduleMessage
  targetDay: number
}

type WaitingRow = {
  leadId: string
  leadName: string
  categoryName: string
  /** Quando o lead entrou na etapa de espera (proxy: updatedAt). */
  since: Date
}

type MonitorData = {
  rows: Row[]
  waiting: WaitingRow[]
}

async function loadRows(): Promise<MonitorData> {
  const now = new Date()
  const settings = await prisma.settings.findUnique({ where: { id: "default" } })
  const sendWeekends = settings?.sendWeekends ?? false
  const leads = await prisma.lead.findMany({
    where: {
      stage: { in: [...DAILY_STAGES, "aguarda_7_dias"] as LeadStage[] },
      categoryId: { not: null },
    },
    include: { category: { include: { messages: { where: { active: true } } } } },
  })

  const rows: Row[] = []
  const waiting: WaitingRow[] = []
  for (const lead of leads) {
    if (!lead.category || !lead.category.active) continue

    if (lead.stage === "aguarda_7_dias") {
      waiting.push({
        leadId: lead.id,
        leadName: lead.name,
        categoryName: lead.category.name,
        since: lead.updatedAt,
      })
      continue
    }

    const next = nextDispatchForLead({
      now,
      createdAt: lead.createdAt,
      stage: lead.stage,
      sendWeekends,
      messages: lead.category.messages.map((m) => ({
        id: m.id,
        order: m.order,
        dayOffset: m.dayOffset,
        time: m.time,
        content: m.message,
        active: m.active,
      })),
    })
    if (!next) continue
    rows.push({
      leadId: lead.id,
      leadName: lead.name,
      stage: lead.stage,
      categoryName: lead.category.name,
      at: next.at,
      message: next.message,
      targetDay: next.targetDay,
    })
  }
  rows.sort((a, b) => a.at.getTime() - b.at.getTime())
  waiting.sort((a, b) => a.since.getTime() - b.since.getTime())
  return { rows, waiting }
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

function render({ rows, waiting }: MonitorData) {
  // Limpa a tela e move o cursor para o topo
  process.stdout.write("\x1b[2J\x1b[H")
  const now = new Date()
  console.log("=".repeat(72))
  console.log(`  MONITOR DE FOLLOW-UP  ·  agora: ${formatBrazilTimestamp(now)} (Brasília)`)
  console.log("=".repeat(72))

  console.log("\n  PRÓXIMOS ENVIOS (dia1 · dia2 · dia3)")
  if (rows.length === 0) {
    console.log("\n  Nenhum lead com envio agendado no momento.")
    console.log("  (Crie um lead em uma categoria com mensagens ativas para ver a contagem.)")
  } else {
    for (const row of rows) {
      const ms = row.at.getTime() - now.getTime()
      const countdown = formatCountdown(ms)
      const marker = ms <= 0 ? "►" : "·"
      console.log(
        `\n  ${marker} ${row.leadName}  [${row.stage}]  → ${row.categoryName}`,
      )
      console.log(`     próximo envio: ${formatBrazilTimestamp(row.at)} (Brasília)`)
      console.log(`     faltam:        ${countdown}`)
      console.log(`     mensagem:      "${row.message.content.slice(0, 50)}${row.message.content.length > 50 ? "..." : ""}"`)
    }
  }

  console.log("\n" + "-".repeat(72))
  console.log(`\n  AGUARDANDO 7 DIAS  (sequência diária concluída · ${waiting.length})`)
  if (waiting.length === 0) {
    console.log("\n  Nenhum lead nesta etapa no momento.")
  } else {
    for (const row of waiting) {
      const elapsed = formatElapsed(now.getTime() - row.since.getTime())
      console.log(`\n  ⏳ ${row.leadName}  → ${row.categoryName}`)
      console.log(`     desde:    ${formatBrazilTimestamp(row.since)} (Brasília)`)
      console.log(`     em espera: há ${elapsed}`)
    }
  }

  console.log("\n" + "-".repeat(72))
  console.log("  Atualiza a cada 1s · relê o banco a cada 30s · Ctrl+C para sair")
}

async function main() {
  let data: MonitorData = { rows: [], waiting: [] }
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
