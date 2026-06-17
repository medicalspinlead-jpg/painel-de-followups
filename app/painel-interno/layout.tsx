import type { Metadata } from "next"

// Rota oculta: não deve ser indexada nem listada por crawlers.
export const metadata: Metadata = {
  title: "Monitor interno",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
}

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return children
}
