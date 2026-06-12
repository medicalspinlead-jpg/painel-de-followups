"use client"

import { useMemo, useState } from "react"
import type { EndpointDoc } from "@/lib/api-docs"
import { getClientApiKey } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeBlock } from "@/components/docs/code-block"

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-chart-2 text-background",
  POST: "bg-chart-1 text-background",
  PATCH: "bg-chart-4 text-background",
  DELETE: "bg-destructive text-background",
}

function buildExampleBody(endpoint: EndpointDoc): string {
  if (!endpoint.exampleBody) return ""
  return JSON.stringify(endpoint.exampleBody, null, 2)
}

/** Substitui :param pelos valores informados. */
function resolvePath(path: string, params: Record<string, string>): string {
  return path.replace(/:([a-zA-Z]+)/g, (_, key) => params[key] || `:${key}`)
}

export function EndpointCard({ endpoint }: { endpoint: EndpointDoc }) {
  const hasBody = endpoint.method === "POST" || endpoint.method === "PATCH"
  const [pathValues, setPathValues] = useState<Record<string, string>>({})
  const [queryValues, setQueryValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState<string>(buildExampleBody(endpoint))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status: number; ok: boolean; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resolvedPath = useMemo(() => resolvePath(endpoint.path, pathValues), [endpoint.path, pathValues])

  const fullUrl = useMemo(() => {
    const qs = new URLSearchParams(
      Object.entries(queryValues).filter(([, v]) => v.trim() !== ""),
    ).toString()
    return qs ? `${resolvedPath}?${qs}` : resolvedPath
  }, [resolvedPath, queryValues])

  const curlExample = useMemo(() => {
    const lines = [`curl -X ${endpoint.method} "https://seu-dominio.com${fullUrl}" \\`]
    lines.push(`  -H "Authorization: Bearer SUA_API_KEY" \\`)
    if (hasBody) {
      lines.push(`  -H "Content-Type: application/json" \\`)
      lines.push(`  -d '${endpoint.exampleBody ? JSON.stringify(endpoint.exampleBody) : "{}"}'`)
    } else {
      // remove a barra de continuação da última linha
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "")
    }
    return lines.join("\n")
  }, [endpoint, fullUrl, hasBody])

  const fetchExample = useMemo(() => {
    const opts: string[] = [`  method: "${endpoint.method}",`]
    const headers = ['    Authorization: `Bearer ${API_KEY}`,']
    if (hasBody) headers.push('    "Content-Type": "application/json",')
    opts.push(`  headers: {\n${headers.join("\n")}\n  },`)
    if (hasBody) {
      opts.push(`  body: JSON.stringify(${endpoint.exampleBody ? JSON.stringify(endpoint.exampleBody, null, 2).replace(/\n/g, "\n  ") : "{}"}),`)
    }
    return `const API_KEY = "SUA_API_KEY"\n\nconst res = await fetch("https://seu-dominio.com${fullUrl}", {\n${opts.join("\n")}\n})\nconst data = await res.json()`
  }, [endpoint, fullUrl, hasBody])

  const sendRequest = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const init: RequestInit = {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${getClientApiKey()}`,
        },
      }
      if (hasBody && body.trim()) {
        try {
          JSON.parse(body)
        } catch {
          setError("O corpo da requisição não é um JSON válido.")
          setLoading(false)
          return
        }
        ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
        init.body = body
      }
      const res = await fetch(fullUrl, init)
      const text = await res.text()
      let pretty = text
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // mantém texto bruto
      }
      setResult({ status: res.status, ok: res.ok, body: pretty })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar a requisição.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id={endpoint.id} className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className={`${METHOD_STYLES[endpoint.method]} font-mono text-xs`}>{endpoint.method}</Badge>
        <code className="font-mono text-sm text-foreground">{endpoint.path}</code>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-foreground">{endpoint.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{endpoint.description}</p>

      {/* Parâmetros */}
      {(endpoint.pathParams?.length || endpoint.queryParams?.length || endpoint.bodyParams?.length) ? (
        <div className="mt-4 space-y-3">
          {endpoint.pathParams?.length ? (
            <ParamTable title="Parâmetros de caminho" params={endpoint.pathParams} />
          ) : null}
          {endpoint.queryParams?.length ? (
            <ParamTable title="Query string" params={endpoint.queryParams} />
          ) : null}
          {endpoint.bodyParams?.length ? (
            <ParamTable title="Corpo (JSON)" params={endpoint.bodyParams} />
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="exemplos" className="mt-5">
        <TabsList>
          <TabsTrigger value="exemplos">Exemplos</TabsTrigger>
          <TabsTrigger value="resposta">Resposta</TabsTrigger>
          <TabsTrigger value="testar">Testar</TabsTrigger>
        </TabsList>

        <TabsContent value="exemplos" className="mt-4 space-y-4">
          <CodeBlock language="cURL" code={curlExample} />
          <CodeBlock language="JavaScript (fetch)" code={fetchExample} />
        </TabsContent>

        <TabsContent value="resposta" className="mt-4">
          <CodeBlock language="JSON · 200" code={JSON.stringify(endpoint.exampleResponse, null, 2)} />
        </TabsContent>

        <TabsContent value="testar" className="mt-4 space-y-4">
          {endpoint.pathParams?.map((p) => (
            <div key={p.name} className="grid gap-1.5">
              <Label htmlFor={`${endpoint.id}-path-${p.name}`}>
                {p.name} <span className="text-muted-foreground">(caminho)</span>
              </Label>
              <Input
                id={`${endpoint.id}-path-${p.name}`}
                placeholder={p.description}
                value={pathValues[p.name] || ""}
                onChange={(e) => setPathValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
              />
            </div>
          ))}

          {endpoint.queryParams?.map((p) => (
            <div key={p.name} className="grid gap-1.5">
              <Label htmlFor={`${endpoint.id}-query-${p.name}`}>
                {p.name} <span className="text-muted-foreground">(query)</span>
              </Label>
              <Input
                id={`${endpoint.id}-query-${p.name}`}
                placeholder={p.description}
                value={queryValues[p.name] || ""}
                onChange={(e) => setQueryValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
              />
            </div>
          ))}

          {hasBody ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${endpoint.id}-body`}>Corpo (JSON)</Label>
              <Textarea
                id={`${endpoint.id}-body`}
                className="min-h-32 font-mono text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button onClick={sendRequest} disabled={loading}>
              {loading ? "Enviando..." : `Enviar ${endpoint.method}`}
            </Button>
            <code className="truncate font-mono text-xs text-muted-foreground">{fullUrl}</code>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={result.ok ? "bg-chart-2 text-background" : "bg-destructive text-background"}>
                  {result.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {result.ok ? "Sucesso" : "Erro"}
                </span>
              </div>
              <CodeBlock language="Resposta" code={result.body} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  )
}

function ParamTable({ title, params }: { title: string; params: EndpointDoc["bodyParams"] }) {
  if (!params?.length) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-foreground">
                  {p.name}
                  {p.required ? <span className="ml-1 text-destructive">*</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                  {p.type}
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
