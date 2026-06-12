/**
 * Substituição de tags dinâmicas nas mensagens de follow-up.
 *
 * Tags suportadas (case-insensitive):
 *   {nome}     -> nome do lead
 *   {telefone} -> telefone do lead
 *   {email}    -> email do lead
 *
 * As tags são substituídas no momento do envio, então a mesma mensagem
 * cadastrada na categoria é personalizada para cada lead.
 */
export type LeadTemplateData = {
  name?: string | null
  phone?: string | null
  email?: string | null
}

export const TEMPLATE_TAGS = [
  { tag: "{nome}", description: "Nome do lead" },
  { tag: "{telefone}", description: "Telefone do lead" },
  { tag: "{email}", description: "Email do lead" },
] as const

export function renderTemplate(content: string, lead: LeadTemplateData): string {
  if (!content) return content

  const values: Record<string, string> = {
    nome: lead.name?.trim() ?? "",
    telefone: lead.phone?.trim() ?? "",
    email: lead.email?.trim() ?? "",
  }

  return content.replace(/\{(nome|telefone|email)\}/gi, (_match, key: string) => {
    return values[key.toLowerCase()] ?? ""
  })
}
