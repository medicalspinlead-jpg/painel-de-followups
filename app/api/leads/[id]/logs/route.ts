import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"
import { ensureFollowupLogTable } from "@/lib/dispatch"

// GET /api/leads/[id]/logs - histórico de follow-ups enviados ao lead.
// Retorna cada envio registrado em FollowupLog, enriquecido com os dados da
// mensagem correspondente (dia/horário/conteúdo) quando ela ainda existir.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params

    await ensureFollowupLogTable()

    const logs = await prisma.followupLog.findMany({
      where: { leadId: id },
      orderBy: { sentAt: "desc" },
    })

    // Enriquece com os dados da mensagem (pode ter sido removida depois).
    const messageIds = [...new Set(logs.map((l) => l.messageId))]
    const messages = messageIds.length
      ? await prisma.followupMessage.findMany({ where: { id: { in: messageIds } } })
      : []
    const byId = new Map(messages.map((m) => [m.id, m]))

    const data = logs.map((log) => {
      const msg = byId.get(log.messageId)
      return {
        id: log.id,
        messageId: log.messageId,
        targetDate: log.targetDate,
        scheduled: log.scheduled,
        status: log.status,
        sentAt: log.sentAt,
        dayOffset: msg?.dayOffset ?? null,
        order: msg?.order ?? null,
        content: msg?.message ?? null,
      }
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar histórico de follow-ups", details: String(error) },
      { status: 500 },
    )
  }
}
