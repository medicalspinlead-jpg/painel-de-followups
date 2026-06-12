import { NextRequest, NextResponse } from "next/server"
import { getServerApiKey } from "@/lib/api-key"

/**
 * Verifica a autenticação por API key (Bearer token) de uma requisição.
 *
 * As rotas /api esperam o header:
 *   Authorization: Bearer <API_KEY>
 *
 * Retorna `null` quando a requisição está autorizada, ou uma `NextResponse`
 * com status 401 quando não está. Uso:
 *
 *   const unauthorized = requireApiKey(request)
 *   if (unauthorized) return unauthorized
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const expected = getServerApiKey()
  const header = request.headers.get("authorization") || ""

  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : ""

  if (!token) {
    return NextResponse.json(
      {
        error: "Não autenticado",
        details: "Envie o header 'Authorization: Bearer <API_KEY>'.",
      },
      { status: 401 },
    )
  }

  if (token !== expected) {
    return NextResponse.json(
      { error: "API key inválida" },
      { status: 401 },
    )
  }

  return null
}
