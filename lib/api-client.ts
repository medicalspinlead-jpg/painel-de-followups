import { API_KEY } from "@/lib/api-key"

/**
 * API key usada pelo cliente (dashboard / console de testes) ao chamar as rotas /api.
 *
 * Vem de `NEXT_PUBLIC_API_KEY`. Caso não esteja configurada, usa a chave de
 * desenvolvimento padrão — que também é a aceita pelo servidor quando `API_KEY`
 * não está definida. Assim o preview funciona sem nenhuma configuração extra.
 */
export function getClientApiKey(): string {
  return process.env.NEXT_PUBLIC_API_KEY || API_KEY
}

/**
 * Wrapper do `fetch` que injeta automaticamente o header
 * `Authorization: Bearer <API_KEY>` em todas as requisições à API.
 */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${getClientApiKey()}`)
  return fetch(input, { ...init, headers })
}
