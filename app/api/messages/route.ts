import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

const MAX_MESSAGES_PER_CATEGORY = 6

// GET /api/messages?categoryId=xxx - lista mensagens (opcionalmente filtradas por categoria)
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const categoryId = request.nextUrl.searchParams.get("categoryId")
    const messages = await prisma.followupMessage.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ categoryId: "asc" }, { order: "asc" }],
    })
    return NextResponse.json({ data: messages })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar mensagens", details: String(error) },
      { status: 500 },
    )
  }
}

// POST /api/messages - cria uma mensagem de follow-up (máx. 6 por categoria)
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const body = await request.json()
    if (!body.categoryId || !body.message) {
      return NextResponse.json(
        { error: "Os campos 'categoryId' e 'message' são obrigatórios" },
        { status: 400 },
      )
    }

    const count = await prisma.followupMessage.count({
      where: { categoryId: body.categoryId },
    })
    if (count >= MAX_MESSAGES_PER_CATEGORY) {
      return NextResponse.json(
        { error: `Limite de ${MAX_MESSAGES_PER_CATEGORY} mensagens por categoria atingido` },
        { status: 409 },
      )
    }

    // Aceita dayOffset = 0 (envio imediato na criação do lead). Valores negativos são inválidos.
    const dayOffset = body.dayOffset ?? 1
    if (typeof dayOffset !== "number" || !Number.isInteger(dayOffset) || dayOffset < 0) {
      return NextResponse.json(
        { error: "O campo 'dayOffset' deve ser um inteiro maior ou igual a 0" },
        { status: 400 },
      )
    }

    const message = await prisma.followupMessage.create({
      data: {
        categoryId: body.categoryId,
        order: body.order ?? count + 1,
        dayOffset,
        time: body.time ?? "09:00",
        message: body.message,
        active: body.active ?? true,
      },
    })
    return NextResponse.json({ data: message }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao criar mensagem", details: String(error) },
      { status: 500 },
    )
  }
}
