import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/messages/[id] - detalhes de uma mensagem
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    const { id } = await params
    const body = await request.json()
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
    return NextResponse.json({ data: message })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar mensagem", details: String(error) },
      { status: 500 },
    )
  }
}

// DELETE /api/messages/[id] - remove uma mensagem
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
