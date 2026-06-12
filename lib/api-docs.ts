/**
 * Definição central de todos os endpoints da API.
 *
 * Serve como fonte única para a página de documentação (/docs):
 * exemplos de uso, parâmetros e o console interativo de testes.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE"

export type ParamDoc = {
  name: string
  type: string
  required?: boolean
  description: string
}

export type EndpointDoc = {
  id: string
  method: HttpMethod
  /** Caminho com placeholders, ex.: /api/leads/:id */
  path: string
  title: string
  description: string
  /** Parâmetros de caminho, ex.: id */
  pathParams?: ParamDoc[]
  /** Parâmetros de query string */
  queryParams?: ParamDoc[]
  /** Campos do corpo (JSON) para POST/PATCH */
  bodyParams?: ParamDoc[]
  /** Exemplo de corpo enviado (objeto JS serializável) */
  exampleBody?: Record<string, unknown>
  /** Exemplo de resposta de sucesso */
  exampleResponse: unknown
}

export type EndpointGroup = {
  name: string
  description: string
  endpoints: EndpointDoc[]
}

export const API_GROUPS: EndpointGroup[] = [
  {
    name: "Categorias",
    description: "Agrupam as sequências de mensagens de follow-up.",
    endpoints: [
      {
        id: "categories-list",
        method: "GET",
        path: "/api/categories",
        title: "Listar categorias",
        description: "Retorna todas as categorias com a contagem de mensagens e leads.",
        exampleResponse: {
          data: [
            {
              id: "cat_123",
              name: "Avaliação Estética",
              color: "bg-blue-500",
              active: true,
              createdAt: "2026-01-10T12:00:00.000Z",
              _count: { messages: 3, leads: 12 },
            },
          ],
        },
      },
      {
        id: "categories-create",
        method: "POST",
        path: "/api/categories",
        title: "Criar categoria",
        description: "Cria uma nova categoria de follow-up.",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome da categoria." },
          { name: "color", type: "string", description: "Classe de cor (padrão: bg-blue-500)." },
          { name: "active", type: "boolean", description: "Se a categoria está ativa (padrão: true)." },
        ],
        exampleBody: { name: "Avaliação Estética", color: "bg-blue-500", active: true },
        exampleResponse: {
          data: {
            id: "cat_123",
            name: "Avaliação Estética",
            color: "bg-blue-500",
            active: true,
            createdAt: "2026-01-10T12:00:00.000Z",
          },
        },
      },
      {
        id: "categories-get",
        method: "GET",
        path: "/api/categories/:id",
        title: "Detalhar categoria",
        description: "Retorna uma categoria e suas mensagens ordenadas.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da categoria." }],
        exampleResponse: {
          data: {
            id: "cat_123",
            name: "Avaliação Estética",
            color: "bg-blue-500",
            active: true,
            messages: [],
          },
        },
      },
      {
        id: "categories-update",
        method: "PATCH",
        path: "/api/categories/:id",
        title: "Atualizar categoria",
        description: "Atualiza nome, cor ou status de uma categoria.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da categoria." }],
        bodyParams: [
          { name: "name", type: "string", description: "Novo nome." },
          { name: "color", type: "string", description: "Nova cor." },
          { name: "active", type: "boolean", description: "Ativa/desativa a categoria." },
        ],
        exampleBody: { active: false },
        exampleResponse: { data: { id: "cat_123", name: "Avaliação Estética", active: false } },
      },
      {
        id: "categories-delete",
        method: "DELETE",
        path: "/api/categories/:id",
        title: "Remover categoria",
        description: "Remove a categoria e suas mensagens em cascata.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da categoria." }],
        exampleResponse: { success: true },
      },
    ],
  },
  {
    name: "Mensagens",
    description: "Mensagens de follow-up agendadas dentro de cada categoria (máx. 6).",
    endpoints: [
      {
        id: "messages-list",
        method: "GET",
        path: "/api/messages",
        title: "Listar mensagens",
        description: "Lista as mensagens, opcionalmente filtradas por categoria.",
        queryParams: [
          { name: "categoryId", type: "string", description: "Filtra mensagens de uma categoria." },
        ],
        exampleResponse: {
          data: [
            {
              id: "msg_1",
              categoryId: "cat_123",
              order: 1,
              dayOffset: 0,
              time: "09:00",
              message: "Olá {{nome}}, obrigado pelo contato!",
              active: true,
            },
          ],
        },
      },
      {
        id: "messages-create",
        method: "POST",
        path: "/api/messages",
        title: "Criar mensagem",
        description: "Cria uma mensagem de follow-up (limite de 6 por categoria).",
        bodyParams: [
          { name: "categoryId", type: "string", required: true, description: "ID da categoria." },
          { name: "message", type: "string", required: true, description: "Texto da mensagem." },
          { name: "dayOffset", type: "number", description: "Dias após a entrada do lead (0 = imediato)." },
          { name: "time", type: "string", description: "Horário do envio HH:MM (padrão 09:00)." },
          { name: "order", type: "number", description: "Ordem na sequência." },
          { name: "active", type: "boolean", description: "Se a mensagem está ativa." },
        ],
        exampleBody: {
          categoryId: "cat_123",
          message: "Olá {{nome}}, obrigado pelo contato!",
          dayOffset: 0,
          time: "09:00",
        },
        exampleResponse: {
          data: { id: "msg_1", categoryId: "cat_123", dayOffset: 0, time: "09:00", active: true },
        },
      },
      {
        id: "messages-get",
        method: "GET",
        path: "/api/messages/:id",
        title: "Detalhar mensagem",
        description: "Retorna os dados de uma mensagem.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da mensagem." }],
        exampleResponse: { data: { id: "msg_1", categoryId: "cat_123", message: "..." } },
      },
      {
        id: "messages-update",
        method: "PATCH",
        path: "/api/messages/:id",
        title: "Atualizar mensagem",
        description: "Atualiza uma mensagem. Mudar horário/dia rearma o envio.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da mensagem." }],
        bodyParams: [
          { name: "message", type: "string", description: "Novo texto." },
          { name: "dayOffset", type: "number", description: "Novo dia de envio." },
          { name: "time", type: "string", description: "Novo horário HH:MM." },
          { name: "order", type: "number", description: "Nova ordem." },
          { name: "active", type: "boolean", description: "Ativa/desativa." },
        ],
        exampleBody: { time: "10:30" },
        exampleResponse: { data: { id: "msg_1", time: "10:30" } },
      },
      {
        id: "messages-delete",
        method: "DELETE",
        path: "/api/messages/:id",
        title: "Remover mensagem",
        description: "Remove uma mensagem de follow-up.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID da mensagem." }],
        exampleResponse: { success: true },
      },
    ],
  },
  {
    name: "Leads",
    description: "Contatos que recebem as sequências de follow-up.",
    endpoints: [
      {
        id: "leads-list",
        method: "GET",
        path: "/api/leads",
        title: "Listar leads",
        description: "Lista leads com filtros opcionais por etapa e categoria.",
        queryParams: [
          { name: "stage", type: "string", description: "Etapa: desqualificado, dia1, dia2, dia3, aguarda_7_dias." },
          { name: "categoryId", type: "string", description: "Filtra por categoria." },
        ],
        exampleResponse: {
          data: [
            {
              id: "lead_1",
              name: "Maria Silva",
              email: "maria@email.com",
              phone: "+5511999999999",
              stage: "dia1",
              category: { id: "cat_123", name: "Avaliação Estética", color: "bg-blue-500" },
            },
          ],
        },
      },
      {
        id: "leads-create",
        method: "POST",
        path: "/api/leads",
        title: "Criar lead",
        description: "Cria um lead. Dispara mensagens imediatas (dayOffset 0) da categoria.",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome do lead." },
          { name: "email", type: "string", description: "E-mail do lead." },
          { name: "phone", type: "string", description: "Telefone do lead." },
          { name: "categoryId", type: "string", description: "Categoria de follow-up." },
          { name: "stage", type: "string", description: "Etapa inicial (padrão dia1)." },
          { name: "notes", type: "string", description: "Observações." },
        ],
        exampleBody: {
          name: "Maria Silva",
          email: "maria@email.com",
          phone: "+5511999999999",
          categoryId: "cat_123",
          stage: "dia1",
        },
        exampleResponse: {
          data: { id: "lead_1", name: "Maria Silva", stage: "dia1" },
          dispatched: 1,
        },
      },
      {
        id: "leads-get",
        method: "GET",
        path: "/api/leads/:id",
        title: "Detalhar lead",
        description: "Retorna os dados de um lead com sua categoria.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID do lead." }],
        exampleResponse: { data: { id: "lead_1", name: "Maria Silva", category: {} } },
      },
      {
        id: "leads-update",
        method: "PATCH",
        path: "/api/leads/:id",
        title: "Atualizar lead",
        description: "Atualiza dados ou move o lead de etapa.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID do lead." }],
        bodyParams: [
          { name: "name", type: "string", description: "Novo nome." },
          { name: "email", type: "string", description: "Novo e-mail." },
          { name: "phone", type: "string", description: "Novo telefone." },
          { name: "categoryId", type: "string", description: "Nova categoria." },
          { name: "stage", type: "string", description: "Nova etapa." },
          { name: "notes", type: "string", description: "Observações." },
        ],
        exampleBody: { stage: "dia2" },
        exampleResponse: { data: { id: "lead_1", stage: "dia2" } },
      },
      {
        id: "leads-delete",
        method: "DELETE",
        path: "/api/leads/:id",
        title: "Remover lead",
        description: "Remove um lead.",
        pathParams: [{ name: "id", type: "string", required: true, description: "ID do lead." }],
        exampleResponse: { success: true },
      },
    ],
  },
  {
    name: "Configurações",
    description: "Preferências globais e webhook de envio.",
    endpoints: [
      {
        id: "settings-get",
        method: "GET",
        path: "/api/settings",
        title: "Obter configurações",
        description: "Retorna as configurações (o segredo do webhook nunca é exposto).",
        exampleResponse: {
          data: {
            id: "default",
            companyName: "Minha Clínica",
            defaultFollowupTime: "09:00",
            sendWeekends: false,
            webhookUrl: "https://exemplo.com/webhook",
            webhookEnabled: true,
            hasWebhookSecret: true,
          },
        },
      },
      {
        id: "settings-update",
        method: "PATCH",
        path: "/api/settings",
        title: "Atualizar configurações",
        description: "Atualiza preferências e dados do webhook.",
        bodyParams: [
          { name: "companyName", type: "string", description: "Nome da empresa." },
          { name: "defaultFollowupTime", type: "string", description: "Horário padrão HH:MM." },
          { name: "sendWeekends", type: "boolean", description: "Enviar nos fins de semana." },
          { name: "webhookUrl", type: "string", description: "URL do webhook." },
          { name: "webhookSecret", type: "string", description: "Segredo enviado ao webhook." },
          { name: "webhookEnabled", type: "boolean", description: "Liga/desliga o webhook." },
        ],
        exampleBody: { companyName: "Minha Clínica", webhookEnabled: true },
        exampleResponse: { data: { id: "default", companyName: "Minha Clínica", webhookEnabled: true } },
      },
    ],
  },
  {
    name: "Disparo de follow-ups",
    description: "Processa e envia os follow-ups que já são devidos (idempotente).",
    endpoints: [
      {
        id: "dispatch-run",
        method: "POST",
        path: "/api/followups/dispatch",
        title: "Processar follow-ups",
        description:
          "Verifica quais mensagens já são devidas e as envia ao webhook. Aceita também GET. Acionável por cron externo (CRON_SECRET) ou pela API key.",
        exampleResponse: {
          date: "2026-01-10",
          time: "09:00",
          dispatched: 2,
          skipped: 5,
          failures: [],
        },
      },
    ],
  },
]

/** Todos os endpoints achatados, úteis para busca por id. */
export const ALL_ENDPOINTS: EndpointDoc[] = API_GROUPS.flatMap((g) => g.endpoints)
