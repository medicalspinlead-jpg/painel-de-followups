import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

// GET /api/categories/[id] - detalhes de uma categoria com suas mensagens
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const category = await prisma.category.findUnique({
      where: { id },
      include: { messages: { orderBy: { order: "asc" } } },
    })
    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ data: category })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar categoria", details: String(error) },
      { status: 500 },
    )
  }
}

// PATCH /api/categories/[id] - atualiza uma categoria
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const body = await request.json()
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.active !== undefined && { active: body.active }),
      },
    })
    return NextResponse.json({ data: category })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar categoria", details: String(error) },
      { status: 500 },
    )
  }
}

// DELETE /api/categories/[id] - remove uma categoria (e suas mensagens em cascata)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao remover categoria", details: String(error) },
      { status: 500 },
    )
  }
}
