// Constantes de status do funil, isoladas e seguras para o cliente (sem
// nenhuma dependência de servidor/Prisma). Usadas tanto pela coleta de dados
// no servidor (lib/monitor-data) quanto pela view no cliente.
//
// Não há mais etapas fixas dia1/dia2/dia3: o lead tem apenas três status. O
// "dia" atual de um lead ativo é calculado pela configuração da sua categoria.

export const STAGE_ORDER = ["ativo", "aguardando", "desqualificado"] as const

export const STAGE_LABEL: Record<string, string> = {
  ativo: "Ativo",
  aguardando: "Aguardando",
  desqualificado: "Desqualificado",
  // Rótulos legados (caso algum lead ainda não tenha sido migrado).
  dia1: "Ativo",
  dia2: "Ativo",
  dia3: "Ativo",
  aguarda_7_dias: "Aguardando",
}
