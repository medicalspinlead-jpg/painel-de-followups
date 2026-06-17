import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

// GET /api/leads/phone/[phone]
// Variante RESTful da busca EXATA por telefone. Retorna apenas 1 lead
// cujo telefone é idêntico ao informado no caminho da URL.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const { phone: rawPhone } = await params
    const phone = decodeURIComponent(rawPhone)

    if (!phone) {
      return NextResponse.json(
        { error: "O telefone é obrigatório" },
        { status: 400 },
      )
    }

    const lead = await prisma.lead.findFirst({
      // Correspondência exata, sem normalização.
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
