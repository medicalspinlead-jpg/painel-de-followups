"use client"

import Link from "next/link"
import { ArrowLeft, KeyRound } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { LoginScreen } from "@/components/login-screen"
import { ThemeToggle } from "@/components/theme-toggle"
import { API_GROUPS } from "@/lib/api-docs"
import { EndpointCard } from "@/components/docs/endpoint-card"
import { CodeBlock } from "@/components/docs/code-block"
import { buttonVariants } from "@/components/ui/button"

export function ApiDocs({ apiKeyConfigured }: { apiKeyConfigured: boolean }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <LoginScreen />

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}
            >
              <ArrowLeft className="size-4" />
              Painel
            </Link>
            <span className="hidden text-sm font-semibold text-foreground sm:inline">Documentação da API</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        {/* Sidebar */}
        <aside className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
          <nav className="space-y-4 text-sm">
            <a href="#introducao" className="block font-medium text-foreground hover:text-primary">
              Introdução
            </a>
            <a href="#autenticacao" className="block font-medium text-foreground hover:text-primary">
              Autenticação
            </a>
            {API_GROUPS.map((group) => (
              <div key={group.name}>
                <p className="mb-1 font-semibold text-foreground">{group.name}</p>
                <ul className="space-y-1 border-l border-border pl-3">
                  {group.endpoints.map((ep) => (
                    <li key={ep.id}>
                      <a
                        href={`#${ep.id}`}
                        className="block truncate text-muted-foreground hover:text-primary"
                      >
                        {ep.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="min-w-0 flex-1 space-y-12">
          <section id="introducao" className="scroll-mt-24">
            <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
              Documentação da API de Follow-ups
            </h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground text-pretty">
              Esta API permite gerenciar categorias, mensagens, leads e configurações de follow-up, além
              de disparar os envios. Todas as respostas são JSON no formato{" "}
              <code className="font-mono text-foreground">{`{ data: ... }`}</code> em caso de sucesso, ou{" "}
              <code className="font-mono text-foreground">{`{ error: string }`}</code> em caso de falha.
            </p>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
              URL base: <code className="font-mono text-foreground">https://seu-dominio.com</code>
            </p>
          </section>

          <section id="autenticacao" className="scroll-mt-24">
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Autenticação</h2>
            </div>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground text-pretty">
              Todas as rotas exigem uma API key enviada no header{" "}
              <code className="font-mono text-foreground">Authorization</code> como Bearer token.
              Requisições sem o header ou com chave inválida retornam{" "}
              <code className="font-mono text-foreground">401</code>.
            </p>
            <div className="mt-4">
              <CodeBlock language="Header" code={'Authorization: Bearer SUA_API_KEY'} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
              {apiKeyConfigured ? (
                <p>
                  Uma <code className="font-mono text-foreground">API_KEY</code> está configurada neste
                  ambiente. Use o mesmo valor definido em{" "}
                  <code className="font-mono text-foreground">API_KEY</code> nas suas requisições. O console
                  de testes abaixo já usa essa chave automaticamente.
                </p>
              ) : (
                <p>
                  Nenhuma <code className="font-mono text-foreground">API_KEY</code> foi configurada, então a
                  API aceita a chave de desenvolvimento{" "}
                  <code className="font-mono text-foreground">dev-api-key</code>. Para produção, defina as
                  variáveis <code className="font-mono text-foreground">API_KEY</code> (servidor) e{" "}
                  <code className="font-mono text-foreground">NEXT_PUBLIC_API_KEY</code> (dashboard/console)
                  com o mesmo valor.
                </p>
              )}
            </div>
          </section>

          {API_GROUPS.map((group) => (
            <section key={group.name} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{group.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{group.description}</p>
              </div>
              <div className="space-y-5">
                {group.endpoints.map((ep) => (
                  <EndpointCard key={ep.id} endpoint={ep} />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
