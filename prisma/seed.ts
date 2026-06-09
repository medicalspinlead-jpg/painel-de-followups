import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Categorias iniciais
  const categories = [
    { name: "Ressonância Magnética", color: "bg-blue-500" },
    { name: "Bobinas de Exames", color: "bg-green-500" },
    { name: "Manutenção", color: "bg-yellow-500" },
    { name: "Ultrassom", color: "bg-purple-500" },
    { name: "Aluguel/Locação", color: "bg-orange-500" },
  ]

  for (const category of categories) {
    await prisma.category.create({ data: category })
  }

  // Configuração padrão
  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: "Minha Empresa",
      defaultFollowupTime: "09:00",
      sendWeekends: false,
    },
  })

  console.log("Seed concluído com sucesso!")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
