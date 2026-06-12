/**
 * Configuração central da API key usada para proteger as rotas /api.
 *
 * - No servidor, a chave válida vem de `process.env.API_KEY`.
 * - No cliente (dashboard), a chave enviada vem de `process.env.NEXT_PUBLIC_API_KEY`.
 *
 * Quando nenhuma variável está configurada, usamos uma chave de desenvolvimento
 * padrão para que o preview funcione imediatamente. Em produção, defina
 * `API_KEY` (e `NEXT_PUBLIC_API_KEY` com o mesmo valor, para o dashboard).
 */
export const API_KEY = "dev-api-key"

/** Chave válida no servidor. Nunca é exposta ao cliente. */
export function getServerApiKey(): string {
  return process.env.API_KEY || API_KEY
}

/** Indica se uma API_KEY real foi configurada no ambiente. */
export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.API_KEY)
}
