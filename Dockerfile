# ================= BASE =================
FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ================= DEPS =================
FROM base AS deps

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Instala TODAS as dependencias (inclui devDependencies como `prisma`)
# usando pnpm de forma consistente com o lockfile do projeto.
RUN pnpm install --frozen-lockfile

# ================= BUILDER =================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 🔥 NECESSARIO PARA PRISMA DURANTE BUILD
ENV DATABASE_URL="postgresql://followups:foloowupsmedicalspin2026@5.78.203.244:5433/followdb"

ENV NEXT_TELEMETRY_DISABLED=1

# Usa o binario local do Prisma (resolve `prisma/config` do prisma.config.ts).
# `npx prisma` baixava um Prisma avulso que NAO encontra `prisma/config`.
RUN pnpm exec prisma generate
RUN pnpm run build

# ================= RUNNER =================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]