import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

// GET /api/messages/[id] - detalhes de uma mensagem
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const message = await prisma.followupMessage.findUnique({ where: { id } })
    if (!message) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ data: message })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar mensagem", details: String(error) },
      { status: 500 },
    )
  }
}

// PATCH /api/messages/[id] - atualiza uma mensagem
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const body = await request.json()

    // Estado anterior para detectar mudança no agendamento.
    const previous = await prisma.followupMessage.findUnique({ where: { id } })

    const message = await prisma.followupMessage.update({
      where: { id },
      data: {
        ...(body.order !== undefined && { order: body.order }),
        ...(body.dayOffset !== undefined && { dayOffset: body.dayOffset }),
        ...(body.time !== undefined && { time: body.time }),
        ...(body.message !== undefined && { message: body.message }),
        ...(body.active !== undefined && { active: body.active }),
      },
    })

    // Se o horário ou o dia mudou, a mensagem deve poder disparar novamente no
    // novo agendamento. Os FollowupLogs antigos (idempotência) impediriam isso,
    // então os removemos para "rearmar" o envio desta mensagem.
    const timeChanged = body.time !== undefined && previous && body.time !== previous.time
    const dayChanged = body.dayOffset !== undefined && previous && body.dayOffset !== previous.dayOffset
    if (timeChanged || dayChanged) {
      await prisma.followupLog.deleteMany({ where: { messageId: id } })
    }

    return NextResponse.json({ data: message })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar mensagem", details: String(error) },
      { status: 500 },
    )
  }
}

// DELETE /api/messages/[id] - remove uma mensagem
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    await prisma.followupMessage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao remover mensagem", details: String(error) },
      { status: 500 },
    )
  }
}
