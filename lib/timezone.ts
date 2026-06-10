// Timezone fixo do Brasil (horário de Brasília)
export const BRAZIL_TZ = "America/Sao_Paulo"

// Mapeia o weekday abreviado em inglês para o índice JS (0 = domingo ... 6 = sábado)
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export type BrazilTimeParts = {
  /** Data no formato YYYY-MM-DD no horário de Brasília */
  date: string
  /** Horário no formato HH:mm (24h) no horário de Brasília */
  time: string
  /** Índice do dia da semana (0 = domingo ... 6 = sábado) no horário de Brasília */
  weekday: number
  /** Timestamp ISO original (UTC) */
  iso: string
}

/**
 * Converte um instante (default: agora) para os componentes de data/hora
 * no fuso horário do Brasil (America/Sao_Paulo), respeitando horário de verão
 * caso volte a existir. Usa Intl para não depender do timezone do servidor.
 */
export function getBrazilTimeParts(date: Date = new Date()): BrazilTimeParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  })

  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>

  // Em alguns ambientes a meia-noite vem como "24"; normaliza para "00"
  const hour = parts.hour === "24" ? "00" : parts.hour

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? new Date(date).getUTCDay(),
    iso: date.toISOString(),
  }
}

/**
 * Converte uma "hora-parede" do fuso de Brasília (data YYYY-MM-DD + hora HH:mm)
 * para o instante UTC correspondente. Robusto a horário de verão pois calcula
 * o offset real do fuso para aquela data específica.
 */
export function brazilWallTimeToUtc(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number)
  const [h, mi] = timeStr.split(":").map(Number)

  // 1ª tentativa: interpreta a hora-parede como se fosse UTC.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi)

  // Vê qual hora-parede esse instante produz no fuso de Brasília...
  const parts = getBrazilTimeParts(new Date(utcGuess))
  const [py, pmo, pd] = parts.date.split("-").map(Number)
  const [ph, pmi] = parts.time.split(":").map(Number)
  const tzWallAsUtc = Date.UTC(py, pmo - 1, pd, ph, pmi)

  // ...a diferença é o offset do fuso; subtrai para obter o UTC real.
  const offset = tzWallAsUtc - utcGuess
  return new Date(utcGuess - offset)
}

/** Retorna um timestamp legível no horário de Brasília (ex.: 08/06/2026 08:00) */
export function formatBrazilTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}
