"use client"

import { AuthProvider, useAuth } from "@/lib/auth-context"
import { LoginScreen } from "@/components/login-screen"
import { FollowupDashboard } from "@/components/followup-dashboard"

function AppContent() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <FollowupDashboard /> : <LoginScreen />
}

export default function Page() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
