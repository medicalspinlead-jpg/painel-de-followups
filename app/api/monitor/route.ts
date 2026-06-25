import { NextRequest, NextResponse } from "next/server"
import { requireApiKey } from "@/lib/api-auth"
import { loadMonitorData, isBrazilWeekend } from "@/lib/monitor-data"

// Sempre dinâmico: o monitor reflete o estado em tempo real do banco.
export const dynamic = "force-dynamic"

/**
 * GET /api/monitor
 *
 * Snapshot completo de TUDO que acontece internamente no motor de follow-up
 * (etapas, datas, próximos envios, esperas, parados, logs).
 *
 * Protegido por API key (Authorization: Bearer <API_KEY>). É o backend da
 * rota web oculta /painel-interno/monitor.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized

  try {
    const data = await loadMonitorData()
    return NextResponse.json({
      ...data,
      isWeekend: isBrazilWeekend(data.generatedAt),
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "Falha ao carregar o monitor",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
