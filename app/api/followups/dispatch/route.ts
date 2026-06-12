import { NextRequest, NextResponse } from "next/server"
import { runDispatch } from "@/lib/dispatch"
import { getServerApiKey } from "@/lib/api-key"

/**
 * POST/GET /api/followups/dispatch
 *
 * Verifica quais follow-ups já são devidos (modelo de janela, idempotente) e
 * envia os eventos ao webhook configurado. Pode ser acionado por:
 *  - cron externo / Vercel Cron;
 *  - o agendador interno do servidor (instrumentation.ts) — em self-host;
 *  - acionamento manual.
 *
 * Autenticação por Bearer token: aceita tanto a `API_KEY` da aplicação quanto,
 * se configurado, o `CRON_SECRET` (para crons externos).
 * Envie o header `Authorization: Bearer <token>`.
 */
async function dispatchFollowups(request: NextRequest) {
  try {
    const header = request.headers.get("authorization") || ""
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""

    const validTokens = [getServerApiKey()]
    if (process.env.CRON_SECRET) validTokens.push(process.env.CRON_SECRET)

    if (!token || !validTokens.includes(token)) {
      return NextResponse.json(
        {
          error: "Não autorizado",
          details: "Envie o header 'Authorization: Bearer <API_KEY>' (ou CRON_SECRET).",
        },
        { status: 401 },
      )
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
