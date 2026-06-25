"use client"

import { useEffect, useRef, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/monitor-stages"

// ---- Tipos do payload JSON (datas chegam como string ISO) ----
type ScheduleMessage = {
  id: string
  order: number
  dayOffset: number
  time: string
  content: string
  active: boolean
}
type Row = {
  leadId: string
  leadName: string
  stage: string
  categoryName: string
  createdAt: string
  cycleStartedAt: string
  at: string
  message: ScheduleMessage
  targetDay: number
  targetDate: string
}
type WaitingRow = {
  leadId: string
  leadName: string
  categoryName: string
  since: string
  restartDate: string
}
type IdleRow = {
  leadId: string
  leadName: string
  stage: string
  categoryName: string
  reason: string
}
type LogRow = {
  leadName: string
  categoryName: string
  scheduled: string
  targetDate: string
  status: string
  sentAt: string
}
type MonitorPayload = {
  generatedAt: string
  settings: { webhookEnabled: boolean; webhookUrl: string; sendWeekends: boolean }
  counts: Record<string, number>
  totalLeads: number
  rows: Row[]
  waiting: WaitingRow[]
  disqualified: IdleRow[]
  idle: IdleRow[]
  logs: LogRow[]
  isWeekend: boolean
}

const REFRESH_MS = 3_000

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
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

function StatusDot({ color }: { color: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
}

export function MonitorView() {
  const [data, setData] = useState<MonitorPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // `tick` força o re-render a cada segundo para a contagem regressiva ao vivo.
  const [, setTick] = useState(0)
  const lastUpdated = useRef<Date | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await apiFetch("/api/monitor", { cache: "no-store" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Erro ${res.status}`)
        }
        const json: MonitorPayload = await res.json()
        if (!active) return
        setData(json)
        setError(null)
        lastUpdated.current = new Date()
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const poll = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      active = false
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Carregando estado do motor de follow-up...
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        <p className="font-semibold">Falha ao carregar o monitor.</p>
        <p className="mt-1 text-destructive/80">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const now = Date.now()
  const webhookActive = data.settings.webhookEnabled && Boolean(data.settings.webhookUrl)
  const paused = data.isWeekend && !data.settings.sendWeekends

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho de status */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-foreground">Monitor interno</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <StatusDot color="bg-chart-1 animate-pulse" />
            ao vivo
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Atualizado em {formatTimestamp(data.generatedAt)} (Brasília) · relê o banco a cada 3s
        </p>
      </header>

      {/* Configuração + resumo por etapa */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">Configuração</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Webhook</dt>
              <dd className="flex items-center gap-1.5 font-medium text-card-foreground">
                <StatusDot color={webhookActive ? "bg-chart-1" : "bg-destructive"} />
                {webhookActive ? "Ativo" : "Desabilitado"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Envia fins de semana</dt>
              <dd className="font-medium text-card-foreground">
                {data.settings.sendWeekends ? "Sim" : "Não"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Status agora</dt>
              <dd className="flex items-center gap-1.5 font-medium text-card-foreground">
                <StatusDot color={paused ? "bg-chart-4" : "bg-chart-1"} />
                {paused ? "Pausado (fim de semana)" : "Operando"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-card-foreground">Leads por etapa</h2>
            <span className="text-sm text-muted-foreground">Total: {data.totalLeads}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STAGE_ORDER.map((s) => (
              <div key={s} className="rounded-md bg-muted px-3 py-2">
                <div className="text-xs text-muted-foreground">{STAGE_LABEL[s]}</div>
                <div className="font-mono text-lg font-semibold text-card-foreground">
                  {data.counts[s] ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Próximos envios */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Próximos envios <span className="text-muted-foreground">({data.rows.length})</span>
        </h2>
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead com envio agendado no momento.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.rows.map((row) => {
              const ms = new Date(row.at).getTime() - now
              const due = ms <= 0
              return (
                <li
                  key={row.leadId}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusDot color={due ? "bg-chart-1 animate-pulse" : "bg-chart-2"} />
                      <span className="font-medium text-foreground">{row.leadName}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {`Dia ${row.targetDay}`}
                      </span>
                      <span className="text-xs text-muted-foreground">→ {row.categoryName}</span>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold ${due ? "text-chart-1" : "text-foreground"}`}
                    >
                      {formatCountdown(ms)}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="flex justify-between gap-2">
                      <dt>Criado em</dt>
                      <dd className="text-foreground">{formatTimestamp(row.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Ciclo desde</dt>
                      <dd className="text-foreground">{formatTimestamp(row.cycleStartedAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Data-alvo</dt>
                      <dd className="text-foreground">
                        {row.targetDate} às {row.message.time}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Próximo envio</dt>
                      <dd className="text-foreground">{formatTimestamp(row.at)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 truncate text-xs italic text-muted-foreground">
                    &ldquo;{row.message.content}&rdquo;
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Aguardando 7 dias */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Aguardando reinício <span className="text-muted-foreground">({data.waiting.length})</span>
        </h2>
        {data.waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead nesta etapa.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.waiting.map((row) => (
              <li
                key={row.leadId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusDot color="bg-chart-4" />
                  <span className="font-medium text-foreground">{row.leadName}</span>
                  <span className="text-xs text-muted-foreground">→ {row.categoryName}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  em espera há {formatElapsed(now - new Date(row.since).getTime())} · reinicia em{" "}
                  <span className="text-foreground">{row.restartDate}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Desqualificados */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Desqualificados (sem ação automática){" "}
          <span className="text-muted-foreground">({data.disqualified.length})</span>
        </h2>
        {data.disqualified.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead desqualificado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.disqualified.map((row) => (
              <li
                key={row.leadId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusDot color="bg-destructive" />
                  <span className="font-medium text-foreground">{row.leadName}</span>
                  <span className="text-xs text-muted-foreground">→ {row.categoryName}</span>
                </div>
                <span className="text-xs text-muted-foreground">{row.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sem agendamento */}
      {data.idle.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">
            Sem agendamento (não disparam agora){" "}
            <span className="text-muted-foreground">({data.idle.length})</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {data.idle.map((row) => (
              <li
                key={row.leadId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusDot color="bg-chart-4" />
                  <span className="font-medium text-foreground">{row.leadName}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {STAGE_LABEL[row.stage] ?? row.stage}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{row.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Últimos envios */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Últimos envios registrados{" "}
          <span className="text-muted-foreground">({data.logs.length})</span>
        </h2>
        {data.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.logs.map((log, i) => {
              const color =
                log.status === "delivered"
                  ? "bg-chart-1"
                  : log.status === "pending"
                    ? "bg-chart-4"
                    : "bg-destructive"
              return (
                <li
                  key={`${log.sentAt}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <StatusDot color={color} />
                    <span className="font-medium text-foreground">{log.leadName}</span>
                    <span className="text-xs text-muted-foreground">→ {log.categoryName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(log.sentAt)} · alvo {log.targetDate} às {log.scheduled} ·{" "}
                    <span className="text-foreground">{log.status}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
