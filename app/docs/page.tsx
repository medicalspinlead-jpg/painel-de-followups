import { AuthProvider } from "@/lib/auth-context"
import { ApiDocs } from "@/components/docs/api-docs"
import { isApiKeyConfigured } from "@/lib/api-key"

export const metadata = {
  title: "Documentação da API · Follow-ups",
  description: "Referência completa das rotas da API, com exemplos de uso e console de testes interativo.",
}

export default function DocsPage() {
  const apiKeyConfigured = isApiKeyConfigured()
  return (
    <AuthProvider>
      <ApiDocs apiKeyConfigured={apiKeyConfigured} />
    </AuthProvider>
  )
}
