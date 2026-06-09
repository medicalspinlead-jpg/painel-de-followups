"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Credenciais de admin FIXAS — sempre funcionam, mesmo que o usuario altere a senha
const ADMIN_USERNAME = "follows@medicalspinAdmin"
const ADMIN_PASSWORD = "follows2026Admin"

const AUTH_KEY = "followup_auth"
const CUSTOM_PASSWORD_KEY = "followup_custom_password"

type AuthContextType = {
  isAuthenticated: boolean
  login: (username: string, password: string) => boolean
  logout: () => void
  changePassword: (currentPassword: string, newPassword: string) => { success: boolean; error?: string }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setIsAuthenticated(sessionStorage.getItem(AUTH_KEY) === "true")
    setReady(true)
  }, [])

  // Valida a senha: a senha de admin fixa SEMPRE funciona; a senha customizada (se houver) tambem
  const isValidPassword = (password: string) => {
    if (password === ADMIN_PASSWORD) return true
    const custom = localStorage.getItem(CUSTOM_PASSWORD_KEY)
    return custom !== null && password === custom
  }

  const login = (username: string, password: string) => {
    if (username === ADMIN_USERNAME && isValidPassword(password)) {
      sessionStorage.setItem(AUTH_KEY, "true")
      setIsAuthenticated(true)
      return true
    }
    return false
  }

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setIsAuthenticated(false)
  }

  const changePassword = (currentPassword: string, newPassword: string) => {
    if (!isValidPassword(currentPassword)) {
      return { success: false, error: "Senha atual incorreta." }
    }
    if (newPassword.length < 6) {
      return { success: false, error: "A nova senha deve ter pelo menos 6 caracteres." }
    }
    // A senha de admin fixa nunca e sobrescrita; salvamos apenas uma senha alternativa
    localStorage.setItem(CUSTOM_PASSWORD_KEY, newPassword)
    return { success: true }
  }

  if (!ready) return null

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return context
}
