import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

const SETTINGS_ID = "default"

// GET /api/settings - retorna as configurações (cria com defaults se não existir)
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    })
    // não expõe o segredo do webhook em leitura
    const { webhookSecret, ...safe } = settings
    return NextResponse.json({ data: { ...safe, hasWebhookSecret: Boolean(webhookSecret) } })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar configurações", details: String(error) },
      { status: 500 },
    )
  }
}

// PATCH /api/settings - atualiza as configurações
export async function PATCH(request: NextRequest) {
  const unauthorized = requireApiKey(request)
  if (unauthorized) return unauthorized
  try {
    const body = await request.json()
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...(body.companyName !== undefined && { companyName: body.companyName }),
        ...(body.defaultFollowupTime !== undefined && { defaultFollowupTime: body.defaultFollowupTime }),
        ...(body.sendWeekends !== undefined && { sendWeekends: body.sendWeekends }),
        ...(body.webhookUrl !== undefined && { webhookUrl: body.webhookUrl }),
        ...(body.webhookSecret !== undefined && { webhookSecret: body.webhookSecret }),
        ...(body.webhookEnabled !== undefined && { webhookEnabled: body.webhookEnabled }),
      },
      create: { id: SETTINGS_ID, ...body },
    })
    const { webhookSecret, ...safe } = settings
    return NextResponse.json({ data: { ...safe, hasWebhookSecret: Boolean(webhookSecret) } })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar configurações", details: String(error) },
      { status: 500 },
    )
  }
}
