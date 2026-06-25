# API — Painel de Follow-ups

API REST para gerenciar leads, categorias, mensagens de follow-up, configurações e o disparo de eventos para webhook.

> **Persistência:** As rotas usam Prisma + PostgreSQL. É necessário definir a variável de ambiente `DATABASE_URL` e rodar `pnpm db:push` (e `pnpm db:seed` para popular as categorias iniciais). Enquanto o banco não estiver conectado, o painel continua funcionando com o store em memória do front-end.

## Convenções

- Base URL: `/api`
- Corpo das requisições e respostas em JSON.
- Respostas de sucesso retornam `{ "data": ... }` (ou `{ "success": true }` em remoções).
- Respostas de erro retornam `{ "error": "mensagem", "details"?: "..." }` com o status HTTP adequado.

| Status | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Recurso criado |
| 400 | Requisição inválida (validação) |
| 401 | Não autorizado (cron) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex.: limite de mensagens) |
| 500 | Erro interno |

---

## Categorias

### `GET /api/categories`
Lista todas as categorias, incluindo a contagem de mensagens e leads.

### `POST /api/categories`
Cria uma categoria.
```json
{ "name": "Tomografia", "color": "bg-blue-500", "active": true }
```
- `name` (obrigatório), `color` (opcional, padrão `bg-blue-500`), `active` (opcional, padrão `true`).

### `GET /api/categories/[id]`
Detalhes de uma categoria com suas mensagens ordenadas.

### `PATCH /api/categories/[id]`
Atualiza `name`, `color` e/ou `active`.

### `DELETE /api/categories/[id]`
Remove a categoria. As mensagens vinculadas são removidas em cascata; os leads têm `categoryId` definido como `null`.

---

## Mensagens de Follow-up

Cada categoria pode ter **no máximo 6** mensagens.

### `GET /api/messages?categoryId=<id>`
Lista mensagens. O parâmetro `categoryId` é opcional (filtra por categoria).

### `POST /api/messages`
Cria uma mensagem. Retorna `409` se a categoria já tiver 6 mensagens.
```json
{
  "categoryId": "clx...",
  "order": 1,
  "dayOffset": 1,
  "time": "09:00",
  "message": "Olá! Vi seu interesse em...",
  "active": true
}
```
- `categoryId` e `message` são obrigatórios. `order` assume o próximo disponível se omitido.
- `dayOffset` deve ser um inteiro `>= 0`. Use **`0`** para disparar o webhook **imediatamente** quando um lead for criado na categoria (em vez de aguardar o cron diário).

### `GET /api/messages/[id]`
Detalhes de uma mensagem.

### `PATCH /api/messages/[id]`
Atualiza `order`, `dayOffset`, `time`, `message` e/ou `active`.

### `DELETE /api/messages/[id]`
Remove a mensagem.

---

## Leads

### `GET /api/leads?stage=<etapa>&categoryId=<id>`
Lista leads (mais recentes primeiro) com a categoria embutida. Filtros opcionais: `stage` e `categoryId`.

### `POST /api/leads`
Cria um lead. Ao criar, se a categoria tiver mensagens ativas com `dayOffset = 0`, o webhook é disparado **imediatamente** para cada uma delas (a resposta inclui `dispatched`, a quantidade de eventos enviados).
```json
{
  "name": "João Silva",
  "email": "joao@exemplo.com",
  "phone": "(11) 99999-9999",
  "categoryId": "clx...",
  "stage": "dia1",
  "notes": "Indicado por parceiro"
}
```
- `name` é obrigatório. `stage` padrão é `dia1`.

### `GET /api/leads/by-phone?phone=<telefone>`
Busca **exata** por telefone. Retorna **apenas 1** lead cujo telefone seja **idêntico** ao parâmetro informado (sem normalização, sem remover máscara, sem correspondência parcial). O `phone` é obrigatório (`400` se ausente) e retorna `404` quando nada bate exatamente.

```bash
curl "https://seu-dominio/api/leads/by-phone?phone=(11)%2099999-9999" \
  -H "Authorization: Bearer <API_KEY>"
```

### `GET /api/leads/phone/[phone]`
Variante RESTful da busca exata, com o telefone no caminho da URL (lembre de fazer o *URL-encode* de caracteres como espaços e parênteses). Mesma regra: correspondência exata, **1** resultado, `404` se não houver correspondência.

```bash
curl "https://seu-dominio/api/leads/phone/%2B5511999999999" \
  -H "Authorization: Bearer <API_KEY>"
```

> Como a busca é exata, o telefone enviado precisa ser exatamente igual ao salvo no banco (mesma formatação/máscara). Para encontrar um lead salvo como `(11) 99999-9999`, envie esse mesmo valor — não `5511999999999`.

### `GET /api/leads/[id]`
Detalhes de um lead com a categoria.

### `PATCH /api/leads/[id]`
Atualiza qualquer campo, incluindo a mudança de etapa (`stage`).

### `DELETE /api/leads/[id]`
Remove o lead.

### Status válidos (`stage`)
`ativo` · `aguardando` · `parado`
(valores legados ainda aceitos: `desqualificado` · `dia1` · `dia2` · `dia3` · `aguarda_7_dias`)

---

## Configurações

### `GET /api/settings`
Retorna as configurações (cria com valores padrão se não existir). O `webhookSecret` **não** é exposto; em seu lugar vem `hasWebhookSecret: boolean`.

### `PATCH /api/settings`
Atualiza qualquer campo:
```json
{
  "companyName": "MedicalSpin",
  "defaultFollowupTime": "09:00",
  "sendWeekends": false,
  "webhookUrl": "https://seu-servico.com/webhook",
  "webhookSecret": "minha-chave",
  "webhookEnabled": true
}
```

---

## Disparo de Follow-ups (Webhook)

### `GET|POST /api/followups/dispatch`
Verifica quais follow-ups correspondem à data/horário atuais e envia os eventos ao webhook configurado.

- Acionado automaticamente pelo **Vercel Cron** a cada minuto (ver `vercel.json`), que usa `GET`.
- Também pode ser chamado manualmente via `POST` para testes.
- Se `CRON_SECRET` estiver definido, exige o header `Authorization: Bearer <CRON_SECRET>`.

**Lógica de correspondência:**
1. O webhook precisa estar habilitado (`webhookEnabled`) e ter `webhookUrl`.
2. Finais de semana são pulados quando `sendWeekends` é `false`.
3. Cada categoria define os seus próprios dias pelo `dayOffset` das mensagens. Apenas leads `ativo` recebem envios; leads `parado` e `aguardando` são ignorados.
4. A **data alvo** é a data de cadastro do lead (`createdAt`) + `dayOffset` dias. A mensagem só dispara no dia exato — não se repete todos os dias.
5. Envia a mensagem ativa cujo `dayOffset` e `time` (`HH:mm`) batem com a data/horário atuais.

**Timezone:** toda a comparação de data e horário usa o fuso **`America/Sao_Paulo`** (horário de Brasília), independente do timezone do servidor (a Vercel roda em UTC). Um follow-up configurado para `08:00` é disparado às 8h no horário de Brasília. A conversão é feita via `Intl.DateTimeFormat` em `lib/timezone.ts`, então respeita automaticamente eventuais mudanças de horário de verão.

> Como a correspondência é por `HH:mm` exato, o cron precisa rodar a cada minuto (`* * * * *`). Cada mensagem é enviada uma única vez, no minuto em que data e horário coincidem.

**Resposta:**
```json
{ "checkedLeads": 12, "matched": 2, "dispatched": 2, "failures": [], "date": "2026-06-08", "time": "08:00", "timezone": "America/Sao_Paulo" }
```

### Payload enviado ao webhook
```json
{
  "event": "followup.scheduled",
  "timestamp": "2026-06-08T11:00:00.000Z",
  "lead": { "id": "...", "name": "...", "email": "...", "phone": "...", "stage": "dia1" },
  "category": { "id": "...", "name": "..." },
  "message": { "id": "...", "order": 1, "dayOffset": 1, "time": "08:00", "content": "..." }
}
```
> O `timestamp` é o instante ISO em UTC; o campo `message.time` é o horário configurado no fuso de Brasília.

### Evento ao ENTRAR na espera (conclusão da sequência)
Disparado quando a última mensagem do último dia da categoria é entregue e o lead passa de `ativo` para `aguardando`.
```json
{
  "event": "lead.cycle_completed",
  "timestamp": "2026-06-08T11:00:00.000Z",
  "lead": { "id": "...", "name": "...", "email": "...", "phone": "...", "stage": "aguardando" },
  "category": { "id": "...", "name": "..." },
  "transition": { "from": "ativo", "to": "aguardando" },
  "waitDays": 7
}
```

### Evento ao SAIR da espera (reinício do ciclo)
Disparado quando o lead cumpre os `waitDays` da categoria e volta de `aguardando` para `ativo`.
```json
{
  "event": "lead.cycle_restarted",
  "timestamp": "2026-06-08T11:00:00.000Z",
  "lead": { "id": "...", "name": "...", "email": "...", "phone": "...", "stage": "ativo" },
  "category": { "id": "...", "name": "..." },
  "transition": { "from": "aguardando", "to": "ativo" }
}
```

---

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | String de conexão PostgreSQL (obrigatória para as rotas de API). |
| `CRON_SECRET` | Opcional. Protege a rota de dispatch contra chamadas não autorizadas. |

---

## Deploy com Docker

O projeto inclui `Dockerfile` (multi-stage, output `standalone`), `.dockerignore` e `docker-compose.yml` (app + PostgreSQL).

### Subir tudo com Docker Compose
```bash
cp .env.example .env   # ajuste as variáveis se necessário
docker compose up --build
```
Isso sobe o PostgreSQL, executa `prisma db push` + seed (serviço `migrate`) e inicia o app em `http://localhost:3000`.

### Build manual da imagem
```bash
docker build -t followups-app .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://user:pass@host:5432/db" followups-app
```

> O cron (`vercel.json`) só roda automaticamente na Vercel. Em ambiente Docker, agende uma chamada (cron do host ou serviço externo) para `POST /api/followups/dispatch` a cada minuto, enviando `Authorization: Bearer <CRON_SECRET>`.

## Testes do agendamento (1 dia = 24h)

Toda a regra de "quando enviar" vive em `lib/followup-schedule.ts` (`decideFollowup`), uma função **pura** que recebe o instante `now` como parâmetro. Isso permite simular a passagem do tempo (24h, 48h, 72h) sem esperar de verdade nem depender do banco.

```bash
npm test
```

Os testes em `lib/followup-schedule.test.ts` cobrem:

| Cenário | Resultado esperado |
|---------|--------------------|
| Lead `dia1`, exatamente +24h, horário certo | **envia** |
| Lead `dia1`, ainda no mesmo dia (0h) | não envia |
| Lead `dia1`, +24h porém horário errado | não envia |
| Lead `dia1`, +48h (ainda na etapa 1) | não envia |
| Lead `dia2`, +48h | **envia** |
| Lead `dia3`, +72h | **envia** |
| Sábado/domingo com `sendWeekends=false` | não envia |
| Sábado com `sendWeekends=true` | **envia** |
| Mensagem inativa | não envia |
| Status não ativo (ex.: `parado`, `aguardando`) | não envia |
| Virada de dia no fuso de Brasília (UTC vs BRT) | **envia** no horário certo |

Como o `dispatch` real (`/api/followups/dispatch`) usa a mesma função, um teste verde garante que o disparo por dias funciona em produção — basta o cron rodar a cada minuto.

## Monitor de terminal (contagem regressiva)

Para acompanhar **ao vivo** quanto falta até o próximo envio de cada lead:

```bash
npm run monitor
```

O monitor (`scripts/monitor.ts`) lê os leads ativos do banco e mostra, para cada um, o instante exato do próximo webhook (no horário de Brasília) e uma contagem regressiva (`dd hh:mm:ss`) que atualiza a cada segundo. Os dados do banco são relidos a cada 30s, então leads novos aparecem sozinhos. Requer `DATABASE_URL` no ambiente.

Exemplo de saída:

```
========================================================================
  MONITOR DE FOLLOW-UP  ·  agora: 09/06/2026 20:00 (Brasília)
========================================================================

  · João Silva  [dia1]  → Boas-vindas
     próximo envio: 10/06/2026 08:00 (Brasília)
     faltam:        12:00:00
     mensagem:      "Olá! Tudo bem com você?"
```

O cálculo do próximo envio vive em `nextDispatchForLead` (mesma `lib/followup-schedule.ts`), também coberto pelos testes — ou seja, a contagem que você vê no terminal usa exatamente a regra do disparo real.
