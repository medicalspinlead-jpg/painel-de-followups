// Store de dados em memória para MVP (sem banco de dados)

export type Category = {
  id: string
  name: string
  color: string
  active: boolean
  // Dias de espera até reiniciar o ciclo (padrão 7). Definido por categoria.
  waitDays: number
}

export type FollowupMessage = {
  id: string
  categoryId: string
  order: number // posicao de exibicao
  dayOffset: number // define os "dias" da categoria (0 = imediato)
  time: string
  message: string
  active: boolean
}

// Status do lead. Valores legados (dia1/dia2/dia3/aguarda_7_dias) ainda podem
// chegar de bancos antigos e são normalizados para os três status atuais.
export type LeadStatus = 'ativo' | 'aguardando' | 'parado'
export type LeadStage = LeadStatus | 'desqualificado' | 'dia1' | 'dia2' | 'dia3' | 'aguarda_7_dias'

export type Lead = {
  id: string
  name: string
  email: string
  phone: string
  pipedriveId?: string | null
  categoryId: string
  stage: LeadStage
  createdAt: Date
  // Âncora do ciclo atual (usada para calcular o dia atual do lead).
  cycleStartedAt?: Date
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
  { id: '1', name: 'Ressonância Magnética', color: 'bg-blue-500', active: true, waitDays: 7 },
  { id: '2', name: 'Bobinas de Exames', color: 'bg-green-500', active: true, waitDays: 7 },
  { id: '3', name: 'Manutenção', color: 'bg-yellow-500', active: true, waitDays: 7 },
  { id: '4', name: 'Ultrassom', color: 'bg-purple-500', active: true, waitDays: 7 },
  { id: '5', name: 'Aluguel/Locação', color: 'bg-orange-500', active: true, waitDays: 7 },
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

// Funções auxiliares
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/** Normaliza um status legado para um dos três status atuais. */
export function normalizeStatus(stage: LeadStage): LeadStatus {
  if (stage === 'parado' || stage === 'desqualificado') return 'parado'
  if (stage === 'aguarda_7_dias' || stage === 'aguardando') return 'aguardando'
  return 'ativo'
}

export function getStatusLabel(stage: LeadStage): string {
  const labels: Record<LeadStatus, string> = {
    ativo: 'Ativo',
    aguardando: 'Aguardando',
    parado: 'Parado',
  }
  return labels[normalizeStatus(stage)]
}

export function getStatusColor(stage: LeadStage): string {
  const colors: Record<LeadStatus, string> = {
    ativo: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    aguardando: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    parado: 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  return colors[normalizeStatus(stage)]
}

export function getMessageCountByCategory(messages: FollowupMessage[], categoryId: string): number {
  return messages.filter(m => m.categoryId === categoryId).length
}

export function getNextOrderForCategory(messages: FollowupMessage[], categoryId: string): number {
  const categoryMessages = messages.filter(m => m.categoryId === categoryId)
  if (categoryMessages.length === 0) return 1
  return Math.max(...categoryMessages.map(m => m.order)) + 1
}
