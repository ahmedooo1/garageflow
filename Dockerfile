# --- Étape 1 : dépendances ---------------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# --- Étape 2 : build ---------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valeurs factices : seules les variables nécessaires au build (aucune connexion DB).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" APP_SECRET="build-secret-0123456789abcdef0123456789abcdef"
RUN pnpm build

# --- Étape 3 : image d'exécution ---------------------------------------------
FROM node:22-alpine AS runner
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
# `next start` relit la config à l'exécution (images.qualities, formats) :
# sans elle, l'optimiseur refuse q=68 et les aperçus de l'accueil renvoient 400.
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start -p ${PORT}"]
