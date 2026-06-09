import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const VALID_STAGES = ["desqualificado", "dia1", "dia2", "dia3", "aguarda_7_dias"]

// GET /api/leads?stage=dia1&categoryId=xxx - lista leads com filtros opcionais
export async function GET(request: NextRequest) {
  try {
    const stage = request.nextUrl.searchParams.get("stage")
    const categoryId = request.nextUrl.searchParams.get("categoryId")
    const leads = await prisma.lead.findMany({
      where: {
        ...(stage && { stage: stage as never }),
        ...(categoryId && { categoryId }),
      },
      orderBy: { createdAt: "desc" },
      include: { category: { select: { id: true, name: true, color: true } } },
    })
    return NextResponse.json({ data: leads })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar leads", details: String(error) },
      { status: 500 },
    )
  }
}

// POST /api/leads - cria um novo lead
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "O campo 'name' é obrigatório" }, { status: 400 })
    }
    if (body.stage && !VALID_STAGES.includes(body.stage)) {
      return NextResponse.json(
        { error: `Etapa inválida. Use uma de: ${VALID_STAGES.join(", ")}` },
        { status: 400 },
      )
    }
    const lead = await prisma.lead.create({
      data: {
        name: body.name,
        email: body.email ?? "",
        phone: body.phone ?? "",
        categoryId: body.categoryId ?? null,
        stage: body.stage ?? "dia1",
        notes: body.notes ?? "",
      },
    })
    return NextResponse.json({ data: lead }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao criar lead", details: String(error) },
      { status: 500 },
    )
  }
}
