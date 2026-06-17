// Constantes de etapas do funil, isoladas e seguras para o cliente (sem
// nenhuma dependência de servidor/Prisma). Usadas tanto pela coleta de dados
// no servidor (lib/monitor-data) quanto pela view no cliente.

export const STAGE_ORDER = ["desqualificado", "dia1", "dia2", "dia3", "aguarda_7_dias"] as const

export const STAGE_LABEL: Record<string, string> = {
  desqualificado: "Desqualificado",
  dia1: "Dia 1",
  dia2: "Dia 2",
  dia3: "Dia 3",
  aguarda_7_dias: "Aguarda 7 dias",
}
