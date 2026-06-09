import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/categories - lista todas as categorias
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { messages: true, leads: true } } },
    })
    return NextResponse.json({ data: categories })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar categorias", details: String(error) },
      { status: 500 },
    )
  }
}

// POST /api/categories - cria uma nova categoria
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "O campo 'name' é obrigatório" }, { status: 400 })
    }
    const category = await prisma.category.create({
      data: {
        name: body.name,
        color: body.color ?? "bg-blue-500",
        active: body.active ?? true,
      },
    })
    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao criar categoria", details: String(error) },
      { status: 500 },
    )
  }
}
