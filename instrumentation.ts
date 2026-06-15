/**
 * Hook de inicialização do servidor Next.js.
 *
 * Em self-host (Docker), o cron do vercel.json NÃO roda — então ninguém
 * acionaria o envio automático de follow-ups. Aqui registramos um agendador
 * interno que chama o núcleo de dispatch a cada minuto, dentro do próprio
 * processo do servidor.
 *
 * O dispatch é idempotente (FollowupLog), então rodar a cada minuto é seguro:
 * nunca duplica e nunca perde uma mensagem por atraso.
 *
 * Para DESLIGAR o agendador interno (ex.: quando se usa um cron externo),
 * defina a variável de ambiente DISABLE_INTERNAL_SCHEDULER=1.
 */
export async function register() {
  // Só roda no runtime Node.js do servidor (não no Edge nem durante o build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "1") {
    console.log("[scheduler] Agendador interno desabilitado por DISABLE_INTERNAL_SCHEDULER=1")
    return
  }

  const INTERVAL_MS = 60_000 // 1 minuto

  // Evita registrar duas vezes em hot-reload de desenvolvimento.
  const g = globalThis as unknown as { __followupSchedulerStarted?: boolean }
  if (g.__followupSchedulerStarted) return
  g.__followupSchedulerStarted = true

  // Importa de forma dinâmica para não carregar Prisma em runtimes incompatíveis.
  const { runDispatch } = await import("@/lib/dispatch")

  let running = false
  const tick = async () => {
    if (running) return // evita sobreposição se uma execução demorar
    running = true
    try {
      const result = await runDispatch()
      if (result.dispatched > 0 || result.restarted > 0 || result.failures.length > 0) {
        console.log(
          `[scheduler] ${result.date} ${result.time} · enviados=${result.dispatched} reiniciados=${result.restarted} pulados=${result.skipped} falhas=${result.failures.length}`,
        )
      }
    } catch (err) {
      console.log("[scheduler] Erro no dispatch:", err instanceof Error ? err.message : String(err))
    } finally {
      running = false
    }
  }

  // Primeira execução logo após o boot, depois a cada minuto.
  setTimeout(tick, 5_000)
  setInterval(tick, INTERVAL_MS)

  console.log("[scheduler] Agendador interno de follow-ups iniciado (intervalo de 60s)")
}
