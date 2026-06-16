"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  Category,
  Lead,
  LeadStage,
  FollowupMessage,
  Settings,
  defaultSettings,
  getStageColor,
  getStageLabel,
  MAX_MESSAGES_PER_CATEGORY,
} from "@/lib/store"
import { apiFetch } from "@/lib/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/lib/auth-context"
import { LogOut, BookText } from "lucide-react"

// Helper para extrair JSON e lançar erro com a mensagem do backend
async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error || `Erro na requisição (${res.status})`)
  }
  return json.data as T
}

export function FollowupDashboard() {
  const { logout, changePassword } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [messages, setMessages] = useState<FollowupMessage[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  // Loading / erro globais
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Settings save state
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Dialog states
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isLeadDetailOpen, setIsLeadDetailOpen] = useState(false)
  const [editingMessage, setEditingMessage] = useState<FollowupMessage | null>(null)
  const [webhookTestStatus, setWebhookTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  // Número de telefone de teste (apenas em memória, não persistido no banco)
  const [testPhone, setTestPhone] = useState("")

  // Change password dialog state
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" })
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Form states
  const [newLead, setNewLead] = useState<Partial<Lead>>({
    name: "",
    email: "",
    phone: "",
    pipedriveId: "",
    categoryId: "",
    stage: "dia1",
    notes: "",
  })
  const [newCategory, setNewCategory] = useState({ name: "", color: "bg-blue-500" })
  const [newMessage, setNewMessage] = useState<Partial<FollowupMessage>>({
    dayOffset: 1,
    time: "09:00",
    message: "",
    active: true,
  })

  // Carrega todos os dados do banco ao montar
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [cats, lds, msgs, sts] = await Promise.all([
          apiFetch("/api/categories").then((r) => parseResponse<Category[]>(r)),
          apiFetch("/api/leads").then((r) => parseResponse<Lead[]>(r)),
          apiFetch("/api/messages").then((r) => parseResponse<FollowupMessage[]>(r)),
          apiFetch("/api/settings").then((r) => parseResponse<Settings>(r)),
        ])
        if (cancelled) return
        setCategories(cats)
        setLeads(lds)
        setMessages(msgs)
        setSettings({ ...defaultSettings, ...sts })
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erro ao carregar dados")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const handleChangePassword = () => {
    setPasswordFeedback(null)
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordFeedback({ type: "error", text: "A confirmacao nao corresponde a nova senha." })
      return
    }
    const result = changePassword(passwordForm.current, passwordForm.next)
    if (result.success) {
      setPasswordFeedback({ type: "success", text: "Senha alterada com sucesso." })
      setPasswordForm({ current: "", next: "", confirm: "" })
    } else {
      setPasswordFeedback({ type: "error", text: result.error || "Erro ao alterar senha." })
    }
  }

  // Lead functions
  const addLead = async () => {
    if (!newLead.name || !newLead.categoryId) return
    setActionError(null)
    try {
      const lead = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLead.name,
          email: newLead.email || "",
          phone: newLead.phone || "",
          pipedriveId: newLead.pipedriveId || null,
          categoryId: newLead.categoryId,
          stage: newLead.stage || "dia1",
          notes: newLead.notes || "",
        }),
      }).then((r) => parseResponse<Lead>(r))
      setLeads((prev) => [lead, ...prev])
      setNewLead({ name: "", email: "", phone: "", pipedriveId: "", categoryId: "", stage: "dia1", notes: "" })
      setIsLeadDialogOpen(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao adicionar lead")
    }
  }

  const deleteLead = async (id: string) => {
    setActionError(null)
    try {
      await apiFetch(`/api/leads/${id}`, { method: "DELETE" }).then((r) => parseResponse(r))
      setLeads((prev) => prev.filter((l) => l.id !== id))
      if (selectedLead?.id === id) {
        setSelectedLead(null)
        setIsLeadDetailOpen(false)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao remover lead")
    }
  }

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead)
    setIsLeadDetailOpen(true)
  }

  const updateLeadStage = async (id: string, stage: LeadStage) => {
    setActionError(null)
    // atualização otimista
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)))
    try {
      await apiFetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      }).then((r) => parseResponse<Lead>(r))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao atualizar etapa")
    }
  }

  // Category functions
  const addCategory = async () => {
    if (!newCategory.name) return
    setActionError(null)
    try {
      const category = await apiFetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategory.name, color: newCategory.color, active: true }),
      }).then((r) => parseResponse<Category>(r))
      setCategories((prev) => [...prev, category])
      setNewCategory({ name: "", color: "bg-blue-500" })
      setIsCategoryDialogOpen(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao criar categoria")
    }
  }

  const toggleCategory = async (id: string) => {
    const current = categories.find((c) => c.id === id)
    if (!current) return
    setActionError(null)
    const nextActive = !current.active
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active: nextActive } : c)))
    try {
      await apiFetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      }).then((r) => parseResponse<Category>(r))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao atualizar categoria")
      // reverte
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active: current.active } : c)))
    }
  }

  const deleteCategory = async (id: string) => {
    setActionError(null)
    try {
      await apiFetch(`/api/categories/${id}`, { method: "DELETE" }).then((r) => parseResponse(r))
      setCategories((prev) => prev.filter((c) => c.id !== id))
      setMessages((prev) => prev.filter((m) => m.categoryId !== id))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao remover categoria")
    }
  }

  // Message functions
  const openMessageDialog = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setEditingMessage(null)
    setNewMessage({ dayOffset: 1, time: settings.defaultFollowupTime || "09:00", message: "", active: true })
    setIsMessageDialogOpen(true)
  }

  const openEditMessageDialog = (msg: FollowupMessage) => {
    setSelectedCategoryId(msg.categoryId)
    setEditingMessage(msg)
    setNewMessage({ dayOffset: msg.dayOffset, time: msg.time, message: msg.message })
    setIsMessageDialogOpen(true)
  }

  const saveMessage = async () => {
    if (!selectedCategoryId || !newMessage.message?.trim()) return
    setActionError(null)
    try {
      if (editingMessage) {
        const updated = await apiFetch(`/api/messages/${editingMessage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dayOffset: newMessage.dayOffset ?? 1,
            time: newMessage.time ?? "09:00",
            message: newMessage.message,
          }),
        }).then((r) => parseResponse<FollowupMessage>(r))
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      } else {
        const created = await apiFetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: selectedCategoryId,
            dayOffset: newMessage.dayOffset ?? 1,
            time: newMessage.time ?? "09:00",
            message: newMessage.message,
            active: true,
          }),
        }).then((r) => parseResponse<FollowupMessage>(r))
        setMessages((prev) => [...prev, created])
      }
      setNewMessage({ dayOffset: 1, time: "09:00", message: "", active: true })
      setIsMessageDialogOpen(false)
      setEditingMessage(null)
      setSelectedCategoryId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao salvar mensagem")
    }
  }

  const toggleMessage = async (id: string) => {
    const current = messages.find((m) => m.id === id)
    if (!current) return
    setActionError(null)
    const nextActive = !current.active
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, active: nextActive } : m)))
    try {
      await apiFetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      }).then((r) => parseResponse<FollowupMessage>(r))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao atualizar mensagem")
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, active: current.active } : m)))
    }
  }

  const deleteMessage = async (id: string) => {
    setActionError(null)
    try {
      await apiFetch(`/api/messages/${id}`, { method: "DELETE" }).then((r) => parseResponse(r))
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao remover mensagem")
    }
  }

  // Settings
  const saveSettings = async () => {
    setActionError(null)
    setSettingsSaved(false)
    setIsSavingSettings(true)
    try {
      const updated = await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: settings.companyName,
          defaultFollowupTime: settings.defaultFollowupTime,
          sendWeekends: settings.sendWeekends,
          webhookUrl: settings.webhookUrl,
          webhookEnabled: settings.webhookEnabled,
          ...(settings.webhookSecret ? { webhookSecret: settings.webhookSecret } : {}),
        }),
      }).then((r) => parseResponse<Settings>(r))
      setSettings((prev) => ({ ...prev, ...updated }))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao salvar configurações")
    } finally {
      setIsSavingSettings(false)
    }
  }

  // Webhook test function
  const testWebhook = async () => {
    if (!settings.webhookUrl) return
    setWebhookTestStatus("testing")
    const payload = {
      event: "followup.scheduled",
      timestamp: new Date().toISOString(),
      test: true,
      lead: {
        id: "test",
        name: "Lead de Teste",
        email: "teste@exemplo.com",
        phone: testPhone.trim() || "(11) 99999-9999",
        stage: "dia1",
      },
      category: { id: "test", name: "Categoria de Teste" },
      message: { id: "test", order: 1, dayOffset: 1, time: settings.defaultFollowupTime, content: "Mensagem de teste do webhook" },
    }
    try {
      const res = await fetch(settings.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.webhookSecret ? { "X-Webhook-Secret": settings.webhookSecret } : {}),
        },
        body: JSON.stringify(payload),
      })
      setWebhookTestStatus(res.ok ? "success" : "error")
    } catch {
      setWebhookTestStatus("error")
    }
    setTimeout(() => setWebhookTestStatus("idle"), 4000)
  }

  const getCategoryName = (id: string) => {
    return categories.find((c) => c.id === id)?.name || "Sem categoria"
  }

  const getCategoryColor = (id: string) => {
    return categories.find((c) => c.id === id)?.color || "bg-gray-500"
  }

  const getMessagesForCategory = (categoryId: string) => {
    return messages
      .filter((m) => m.categoryId === categoryId)
      .sort((a, b) => a.order - b.order)
  }

  const colorOptions = [
    { value: "bg-blue-500", label: "Azul" },
    { value: "bg-green-500", label: "Verde" },
    { value: "bg-yellow-500", label: "Amarelo" },
    { value: "bg-purple-500", label: "Roxo" },
    { value: "bg-orange-500", label: "Laranja" },
    { value: "bg-red-500", label: "Vermelho" },
    { value: "bg-pink-500", label: "Rosa" },
    { value: "bg-cyan-500", label: "Ciano" },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">{settings.companyName}</h1>
              <p className="text-sm text-muted-foreground">Painel de Follow-ups</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/docs" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}>
                <BookText className="h-4 w-4" />
                API
              </Link>
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={logout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {loadError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Nao foi possivel carregar os dados do banco: {loadError}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">Carregando dados...</div>
        ) : (
        <Tabs defaultValue="leads" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="leads" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Leads
            </TabsTrigger>
            <TabsTrigger value="followups" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Follow-ups
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Configuracoes
            </TabsTrigger>
          </TabsList>

          {/* LEADS TAB */}
          <TabsContent value="leads" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Gerenciar Leads</h2>
                <p className="text-sm text-muted-foreground">
                  {leads.length} lead{leads.length !== 1 ? "s" : ""} cadastrado{leads.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Dialog open={isLeadDialogOpen} onOpenChange={setIsLeadDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Adicionar Lead</Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle>Novo Lead</DialogTitle>
                    <DialogDescription>
                      Adicione um novo lead ao sistema.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input
                        id="name"
                        value={newLead.name}
                        onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                        placeholder="Nome do lead"
                        className="bg-input border-border"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newLead.email}
                          onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                          placeholder="email@exemplo.com"
                          className="bg-input border-border"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                          id="phone"
                          value={newLead.phone}
                          onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                          placeholder="(00) 00000-0000"
                          className="bg-input border-border"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category">Categoria</Label>
                      <select
                        value={newLead.categoryId}
                        onChange={(e) => setNewLead({ ...newLead, categoryId: e.target.value })}
                        className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">Selecione uma categoria</option>
                        {categories.filter((c) => c.active).map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pipedriveId">
                        ID do lead no Pipedrive{" "}
                        <span className="text-muted-foreground font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="pipedriveId"
                        value={newLead.pipedriveId ?? ""}
                        onChange={(e) => setNewLead({ ...newLead, pipedriveId: e.target.value })}
                        placeholder="Ex.: 12345"
                        className="bg-input border-border"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Observacoes</Label>
                      <Input
                        id="notes"
                        value={newLead.notes}
                        onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                        placeholder="Observacoes adicionais"
                        className="bg-input border-border"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsLeadDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={addLead}>Adicionar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Nome</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Observacoes</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow 
                        key={lead.id} 
                        className="border-border cursor-pointer hover:bg-muted/50"
                        onClick={() => openLeadDetail(lead)}
                      >
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{lead.email}</p>
                            <p className="text-muted-foreground">{lead.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${getCategoryColor(lead.categoryId)}`} />
                            <span className="text-sm">{getCategoryName(lead.categoryId)}</span>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={lead.stage}
                            onValueChange={(value) => updateLeadStage(lead.id, value as LeadStage)}
                          >
                            <SelectTrigger className={`w-36 h-7 text-xs border ${getStageColor(lead.stage)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border">
                              <SelectItem value="desqualificado">Desqualificado</SelectItem>
                              <SelectItem value="dia1">Dia 1</SelectItem>
                              <SelectItem value="dia2">Dia 2</SelectItem>
                              <SelectItem value="dia3">Dia 3</SelectItem>
                              <SelectItem value="aguarda_7_dias">Aguarda 7 dias</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {lead.notes}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteLead(lead.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Remover
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leads.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum lead cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Lead Detail Dialog */}
            <Dialog open={isLeadDetailOpen} onOpenChange={setIsLeadDetailOpen}>
              <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                  <DialogTitle>Detalhes do Lead</DialogTitle>
                  <DialogDescription>
                    Informacoes completas do lead selecionado.
                  </DialogDescription>
                </DialogHeader>
                {selectedLead && (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${getCategoryColor(selectedLead.categoryId)}`}>
                        {selectedLead.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{selectedLead.name}</h3>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${getCategoryColor(selectedLead.categoryId)}`} />
                          <span className="text-sm text-muted-foreground">{getCategoryName(selectedLead.categoryId)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 pt-2">
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">ID interno (app)</span>
                        <span className="text-sm font-medium font-mono">{selectedLead.id}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Email</span>
                        <span className="text-sm font-medium">{selectedLead.email || "Nao informado"}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Telefone</span>
                        <span className="text-sm font-medium">{selectedLead.phone || "Nao informado"}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">ID no Pipedrive</span>
                        <span className="text-sm font-medium">{selectedLead.pipedriveId || "Nao informado"}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Etapa</span>
                        <Badge className={getStageColor(selectedLead.stage)}>
                          {getStageLabel(selectedLead.stage)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Cadastrado em</span>
                        <span className="text-sm font-medium">
                          {new Date(selectedLead.createdAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {selectedLead.notes && (
                        <div className="pt-2">
                          <span className="text-sm text-muted-foreground">Observacoes</span>
                          <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedLead.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <h4 className="text-sm font-medium mb-2">Mensagens de Follow-up</h4>
                      <div className="space-y-2">
                        {getMessagesForCategory(selectedLead.categoryId).filter(m => m.active).length > 0 ? (
                          getMessagesForCategory(selectedLead.categoryId)
                            .filter(m => m.active)
                            .map((msg, idx) => (
                              <div key={msg.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md text-sm">
                                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                                  {idx + 1}
                                </span>
                                <span className="text-muted-foreground">{msg.dayOffset === 0 ? `Imediato as ${msg.time}` : `Dia ${msg.dayOffset} as ${msg.time}`}</span>
                              </div>
                            ))
                        ) : (
                          <p className="text-sm text-muted-foreground">Nenhuma mensagem configurada para esta categoria.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsLeadDetailOpen(false)}>
                    Fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* FOLLOWUPS TAB */}
          <TabsContent value="followups" className="space-y-6">
            {/* Categories Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Categorias</h2>
                  <p className="text-sm text-muted-foreground">
                    Gerencie as categorias e suas mensagens de follow-up
                  </p>
                </div>
                <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Nova Categoria</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle>Nova Categoria</DialogTitle>
                      <DialogDescription>
                        Crie uma nova categoria para organizar seus follow-ups.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="categoryName">Nome</Label>
                        <Input
                          id="categoryName"
                          value={newCategory.name}
                          onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                          placeholder="Nome da categoria"
                          className="bg-input border-border"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Cor</Label>
                        <div className="flex flex-wrap gap-2">
                          {colorOptions.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => setNewCategory({ ...newCategory, color: color.value })}
                              className={`h-8 w-8 rounded-full ${color.value} transition-all ${
                                newCategory.color === color.value
                                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                  : "hover:scale-110"
                              }`}
                              title={color.label}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={addCategory}>Criar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Categories with their messages */}
              <div className="space-y-4">
                {categories.map((category) => {
                  const categoryMessages = getMessagesForCategory(category.id)
                  const messageCount = categoryMessages.length
                  const canAddMore = messageCount < MAX_MESSAGES_PER_CATEGORY

                  return (
                    <Card key={category.id} className={`bg-card border-border ${!category.active && "opacity-50"}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`h-4 w-4 rounded-full ${category.color}`} />
                            <CardTitle className="text-base">{category.name}</CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {messageCount}/{MAX_MESSAGES_PER_CATEGORY} mensagens
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={category.active}
                              onCheckedChange={() => toggleCategory(category.id)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCategory(category.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                            >
                              <span className="sr-only">Remover</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {categoryMessages.length > 0 ? (
                          <div className="space-y-2 mb-4">
                            {categoryMessages.map((msg, index) => (
                              <div
                                key={msg.id}
                                className={`flex items-start gap-3 p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors ${!msg.active && "opacity-50"}`}
                                onClick={() => openEditMessageDialog(msg)}
                              >
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <span>{msg.dayOffset === 0 ? "Imediato (ao criar lead)" : `${msg.dayOffset} dia${msg.dayOffset > 1 ? "s" : ""} apos contato`}</span>
                                    <span>-</span>
                                    <span>{msg.time}</span>
                                  </div>
                                  <p className="text-sm truncate">{msg.message}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <Switch
                                    checked={msg.active}
                                    onCheckedChange={() => toggleMessage(msg.id)}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteMessage(msg.id)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                                  >
                                    <span className="sr-only">Remover</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground mb-4">Nenhuma mensagem configurada</p>
                        )}
                        
                        {canAddMore && category.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMessageDialog(category.id)}
                            className="w-full border-dashed"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                            Adicionar Mensagem
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {categories.length === 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhuma categoria cadastrada
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Add/Edit Message Dialog */}
            <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>{editingMessage ? "Editar Mensagem" : "Nova Mensagem de Follow-up"}</DialogTitle>
                  <DialogDescription>
                    {editingMessage ? "Edite os detalhes da mensagem" : `Configure uma mensagem para ${selectedCategoryId && getCategoryName(selectedCategoryId)}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dayOffset">Dias apos contato</Label>
                      <Input
                        id="dayOffset"
                        type="number"
                        min="0"
                        value={newMessage.dayOffset}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10)
                          setNewMessage({
                            ...newMessage,
                            dayOffset: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                          })
                        }}
                        className="bg-input border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use 0 para disparar o webhook imediatamente ao criar o lead.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="time">Horario</Label>
                      <Input
                        id="time"
                        type="time"
                        value={newMessage.time}
                        onChange={(e) => setNewMessage({ ...newMessage, time: e.target.value })}
                        className="bg-input border-border"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="message">Mensagem</Label>
                    <textarea
                      id="message"
                      value={newMessage.message}
                      onChange={(e) => setNewMessage({ ...newMessage, message: e.target.value })}
                      placeholder="Mensagem do follow-up..."
                      className="min-h-24 w-full rounded-md border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Tags dinamicas (substituidas pelos dados do lead ao enviar):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { tag: "{nome}", desc: "nome do lead" },
                          { tag: "{telefone}", desc: "telefone do lead" },
                          { tag: "{email}", desc: "email do lead" },
                        ].map(({ tag, desc }) => (
                          <button
                            key={tag}
                            type="button"
                            title={`Inserir ${desc}`}
                            onClick={() =>
                              setNewMessage((prev) => ({
                                ...prev,
                                message: `${prev.message ?? ""}${tag}`,
                              }))
                            }
                            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground hover:bg-secondary/80"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsMessageDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={saveMessage}>
                    {editingMessage ? "Salvar Alteracoes" : "Adicionar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Configuracoes Gerais</h2>
                <p className="text-sm text-muted-foreground">
                  Personalize o comportamento do sistema
                </p>
              </div>
              <div className="flex items-center gap-3">
                {settingsSaved && <span className="text-sm text-emerald-400">Salvo</span>}
                <Button onClick={saveSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? "Salvando..." : "Salvar configuracoes"}
                </Button>
              </div>
            </div>

            <div className="grid gap-6 max-w-2xl">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Empresa</CardTitle>
                  <CardDescription>Informacoes da sua empresa</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="companyName">Nome da Empresa</Label>
                    <Input
                      id="companyName"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      className="bg-input border-border"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Follow-ups</CardTitle>
                  <CardDescription>Configuracoes padrao para follow-ups</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="defaultTime">Horario Padrao</Label>
                    <Input
                      id="defaultTime"
                      type="time"
                      value={settings.defaultFollowupTime}
                      onChange={(e) => setSettings({ ...settings, defaultFollowupTime: e.target.value })}
                      className="bg-input border-border w-40"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enviar aos Finais de Semana</Label>
                      <p className="text-sm text-muted-foreground">
                        Permite envio de follow-ups no sabado e domingo
                      </p>
                    </div>
                    <Switch
                      checked={settings.sendWeekends}
                      onCheckedChange={(checked) => setSettings({ ...settings, sendWeekends: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Webhook</CardTitle>
                  <CardDescription>
                    Receba todos os eventos do sistema. Quando chega a data e o horario de um follow-up, o app envia uma requisicao POST com os dados do lead, categoria e mensagem para a URL configurada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Ativar Webhook</Label>
                      <p className="text-sm text-muted-foreground">
                        Habilita o envio automatico de eventos
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhookEnabled}
                      onCheckedChange={(checked) => setSettings({ ...settings, webhookEnabled: checked })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="webhookUrl">URL do Webhook</Label>
                    <Input
                      id="webhookUrl"
                      type="url"
                      placeholder="https://seu-servico.com/webhook"
                      value={settings.webhookUrl}
                      onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                      className="bg-input border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Endereco que recebera as requisicoes POST com os eventos.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="webhookSecret">Segredo (opcional)</Label>
                    <Input
                      id="webhookSecret"
                      type="password"
                      placeholder="Chave secreta para validar a origem"
                      value={settings.webhookSecret}
                      onChange={(e) => setSettings({ ...settings, webhookSecret: e.target.value })}
                      className="bg-input border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enviado no cabecalho <code className="text-foreground">X-Webhook-Secret</code> de cada requisicao.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="testPhone">Telefone de teste</Label>
                    <Input
                      id="testPhone"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="bg-input border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Usado apenas no evento de teste abaixo. Nao e salvo no banco de dados.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={testWebhook}
                      disabled={!settings.webhookUrl || webhookTestStatus === "testing"}
                    >
                      {webhookTestStatus === "testing" ? "Enviando..." : "Enviar evento de teste"}
                    </Button>
                    {webhookTestStatus === "success" && (
                      <span className="text-sm text-emerald-400">Evento enviado com sucesso</span>
                    )}
                    {webhookTestStatus === "error" && (
                      <span className="text-sm text-red-400">Falha ao enviar. Verifique a URL.</span>
                    )}
                  </div>

                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Exemplo de payload enviado:</p>
                    <pre className="text-xs text-foreground overflow-x-auto">
{`{
  "event": "followup.scheduled",
  "timestamp": "2026-06-08T09:00:00Z",
  "lead": { "id", "name", "email", "phone", "stage" },
  "category": { "id", "name" },
  "message": { "id", "order", "dayOffset", "time", "content" }
}`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Seguranca</CardTitle>
                  <CardDescription>Altere a senha de acesso ao painel</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Senha de acesso</Label>
                      <p className="text-sm text-muted-foreground">
                        Defina uma nova senha para entrar no painel
                      </p>
                    </div>
                    <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
                      setIsPasswordDialogOpen(open)
                      if (!open) {
                        setPasswordForm({ current: "", next: "", confirm: "" })
                        setPasswordFeedback(null)
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline">Alterar senha</Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border">
                        <DialogHeader>
                          <DialogTitle>Alterar Senha</DialogTitle>
                          <DialogDescription>
                            Informe a senha atual e a nova senha de acesso.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <div className="grid gap-2">
                            <Label htmlFor="current-password">Senha atual</Label>
                            <Input
                              id="current-password"
                              type="password"
                              value={passwordForm.current}
                              onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                              className="bg-input border-border"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="new-password">Nova senha</Label>
                            <Input
                              id="new-password"
                              type="password"
                              value={passwordForm.next}
                              onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                              className="bg-input border-border"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                            <Input
                              id="confirm-password"
                              type="password"
                              value={passwordForm.confirm}
                              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                              className="bg-input border-border"
                            />
                          </div>
                          {passwordFeedback && (
                            <p className={`text-sm ${passwordFeedback.type === "success" ? "text-emerald-400" : "text-destructive"}`}>
                              {passwordFeedback.text}
                            </p>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                            Cancelar
                          </Button>
                          <Button onClick={handleChangePassword}>Salvar</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Estatisticas</CardTitle>
                  <CardDescription>Resumo dos dados do sistema</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-lg bg-secondary">
                      <p className="text-2xl font-semibold text-primary">{leads.length}</p>
                      <p className="text-sm text-muted-foreground">Leads</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-secondary">
                      <p className="text-2xl font-semibold text-primary">{categories.filter((c) => c.active).length}</p>
                      <p className="text-sm text-muted-foreground">Categorias</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-secondary">
                      <p className="text-2xl font-semibold text-primary">{messages.filter((m) => m.active).length}</p>
                      <p className="text-sm text-muted-foreground">Mensagens</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        )}
      </main>
    </div>
  )
}
