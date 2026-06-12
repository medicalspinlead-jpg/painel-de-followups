"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignora falha de clipboard
    }
  }

  return (
    <div className="relative rounded-lg border border-border bg-muted/50">
      {language ? (
        <span className="absolute left-3 top-2 font-mono text-xs text-muted-foreground">{language}</span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        className="absolute right-2 top-1.5 h-7 px-2 text-xs"
      >
        {copied ? "Copiado" : "Copiar"}
      </Button>
      <pre className="overflow-x-auto px-4 pb-4 pt-9 text-sm leading-relaxed">
        <code className="font-mono text-foreground">{code}</code>
      </pre>
    </div>
  )
}
