// Store de dados em memória para MVP (sem banco de dados)

export type Category = {
  id: string
  name: string
  color: string
  active: boolean
}

export type FollowupMessage = {
  id: string
  categoryId: string
  order: number // 1-6
  dayOffset: number
  time: string
  message: string
  active: boolean
}

export type LeadStage = 'desqualificado' | 'dia1' | 'dia2' | 'dia3' | 'aguarda_7_dias'

export type Lead = {
  id: string
  name: string
  email: string
  phone: string
  pipedriveId?: string | null
  categoryId: string
  stage: LeadStage
  createdAt: Date
  notes: string
}

export type Settings = {
  companyName: string
  defaultFollowupTime: string
  sendWeekends: boolean
  webhookUrl: string
  webhookSecret: string
  webhookEnabled: boolean
}

// Estrutura do evento enviado ao webhook quando chega a data/horario de um follow-up
export type WebhookEvent = {
  event: 'followup.scheduled'
  timestamp: string
  lead: {
    id: string
    name: string
    email: string
    phone: string
    stage: LeadStage
  }
  category: {
    id: string
    name: string
  }
  message: {
    id: string
    order: number
    dayOffset: number
    time: string
    content: string
  }
}

// Dados iniciais vazios
export const defaultCategories: Category[] = [
  { id: '1', name: 'Ressonância Magnética', color: 'bg-blue-500', active: true },
  { id: '2', name: 'Bobinas de Exames', color: 'bg-green-500', active: true },
  { id: '3', name: 'Manutenção', color: 'bg-yellow-500', active: true },
  { id: '4', name: 'Ultrassom', color: 'bg-purple-500', active: true },
  { id: '5', name: 'Aluguel/Locação', color: 'bg-orange-500', active: true },
]

export const defaultFollowupMessages: FollowupMessage[] = []

export const defaultLeads: Lead[] = []

export const defaultSettings: Settings = {
  companyName: 'Minha Empresa',
  defaultFollowupTime: '09:00',
  sendWeekends: false,
  webhookUrl: '',
  webhookSecret: '',
  webhookEnabled: false,
}

// Constantes
export const MAX_MESSAGES_PER_CATEGORY = 6

// Funções auxiliares
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export function getStageLabel(stage: LeadStage): string {
  const labels: Record<LeadStage, string> = {
    desqualificado: 'Desqualificado',
    dia1: 'Dia 1',
    dia2: 'Dia 2',
    dia3: 'Dia 3',
    aguarda_7_dias: 'Aguarda 7 dias',
  }
  return labels[stage]
}

export function getStageColor(stage: LeadStage): string {
  const colors: Record<LeadStage, string> = {
    desqualificado: 'bg-red-500/20 text-red-400 border-red-500/30',
    dia1: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    dia2: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    dia3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    aguarda_7_dias: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  }
  return colors[stage]
}

export function getMessageCountByCategory(messages: FollowupMessage[], categoryId: string): number {
  return messages.filter(m => m.categoryId === categoryId).length
}

export function canAddMessageToCategory(messages: FollowupMessage[], categoryId: string): boolean {
  return getMessageCountByCategory(messages, categoryId) < MAX_MESSAGES_PER_CATEGORY
}

export function getNextOrderForCategory(messages: FollowupMessage[], categoryId: string): number {
  const categoryMessages = messages.filter(m => m.categoryId === categoryId)
  if (categoryMessages.length === 0) return 1
  return Math.max(...categoryMessages.map(m => m.order)) + 1
}
