import { NextRequest, NextResponse } from "next/server"
import { runDispatch } from "@/lib/dispatch"

/**
 * POST/GET /api/followups/dispatch
 *
 * Verifica quais follow-ups já são devidos (modelo de janela, idempotente) e
 * envia os eventos ao webhook configurado. Pode ser acionado por:
 *  - cron externo / Vercel Cron;
 *  - o agendador interno do servidor (instrumentation.ts) — em self-host;
 *  - acionamento manual.
 *
 * Protegido por CRON_SECRET: envie o header `Authorization: Bearer <CRON_SECRET>`.
 */
async function dispatchFollowups(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = request.headers.get("authorization")
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
      }
    }

    const result = await runDispatch()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao processar follow-ups", details: String(error) },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return dispatchFollowups(request)
}

export async function POST(request: NextRequest) {
  return dispatchFollowups(request)
}
