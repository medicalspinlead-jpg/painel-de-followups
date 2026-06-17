import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

// GET /api/leads/by-phone?phone=5511999999999
// Busca EXATA por telefone: retorna apenas 1 lead cujo telefone bate
// exatamente com o parâmetro informado. Sem normalização ou correspondência parcial.
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const phone = request.nextUrl.searchParams.get("phone")

    if (!phone) {
      return NextResponse.json(
        { error: "O parâmetro 'phone' é obrigatório" },
        { status: 400 },
      )
    }

    const lead = await prisma.lead.findFirst({
      // Correspondência exata: o telefone armazenado deve ser idêntico ao parâmetro.
      where: { phone },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    if (!lead) {
      return NextResponse.json(
        { error: "Nenhum lead encontrado com esse telefone" },
        { status: 404 },
      )
    }

    return NextResponse.json({ data: lead })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar lead por telefone", details: String(error) },
      { status: 500 },
    )
  }
}
