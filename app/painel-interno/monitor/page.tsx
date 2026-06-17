"use client"

import { AuthProvider, useAuth } from "@/lib/auth-context"
import { LoginScreen } from "@/components/login-screen"
import { MonitorView } from "@/components/monitor/monitor-view"

function MonitorContent() {
  const { isAuthenticated, logout } = useAuth()

  if (!isAuthenticated) return <LoginScreen />

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={logout}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sair
          </button>
        </div>
        <MonitorView />
      </div>
    </main>
  )
}

export default function MonitorPage() {
  return (
    <AuthProvider>
      <MonitorContent />
    </AuthProvider>
  )
}
