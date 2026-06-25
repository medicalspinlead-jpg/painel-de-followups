import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"
import { isActiveStage } from "@/lib/followup-schedule"

const VALID_STAGES = ["parado", "ativo", "aguardando", "desqualificado", "dia1", "dia2", "dia3", "aguarda_7_dias"]

// GET /api/leads/[id] - detalhes de um lead
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { category: true },
    })
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ data: lead })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar lead", details: String(error) },
      { status: 500 },
    )
  }
}

// PATCH /api/leads/[id] - atualiza um lead (incluindo mudança de etapa)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const body = await request.json()
    if (body.stage && !VALID_STAGES.includes(body.stage)) {
      return NextResponse.json(
        { error: `Etapa inválida. Use uma de: ${VALID_STAGES.join(", ")}` },
        { status: 400 },
      )
    }

    // Reativação manual: ao mover um lead para "ativo" vindo de "parado"
    // ou "aguardando", reinicia o ciclo a partir de agora. Sem isso, a âncora
    // antiga (cycleStartedAt/createdAt) deixaria as datas-alvo no passado e
    // nenhuma mensagem seria enviada. Também limpa waitingSince.
    let cycleReset: { cycleStartedAt: Date; waitingSince: null } | undefined
    if (body.stage !== undefined && isActiveStage(body.stage)) {
      const current = await prisma.lead.findUnique({
        where: { id },
        select: { stage: true },
      })
      if (current && !isActiveStage(current.stage)) {
        cycleReset = { cycleStartedAt: new Date(), waitingSince: null }
      }
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.stage !== undefined && { stage: body.stage }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(cycleReset ?? {}),
      },
    })
    return NextResponse.json({ data: lead })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar lead", details: String(error) },
      { status: 500 },
    )
  }
}

// DELETE /api/leads/[id] - remove um lead
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    await prisma.lead.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao remover lead", details: String(error) },
      { status: 500 },
    )
  }
}
