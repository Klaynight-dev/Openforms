# syntax=docker/dockerfile:1
#
# Contexte de build : la RACINE du dépôt (voir docker-compose.yml). Le
# bun.lock y est, commun aux trois workspaces : l'installation le suit à la
# lettre (--frozen-lockfile) au lieu de résoudre les versions à chaque build.
#
# Les couches sont rangées de la moins à la plus changeante : tant que les
# package.json et bun.lock ne bougent pas, l'installation vient du cache, et
# tant que le schéma Prisma ne bouge pas, le client généré aussi. Un commit
# qui ne touche que src/ ne refait que la dernière copie.

# --- Dépendances de production du backend seul ---
FROM oven/bun:1.4 AS deps
WORKDIR /app

# Tous les package.json des workspaces : sans eux, bun considère que le
# lockfile ne correspond plus et refuse l'installation figée.
COPY package.json bun.lock ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY mcp-server/package.json mcp-server/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter @humanitour/backend

# --- Client Prisma (ne se régénère que si le schéma change) ---
FROM deps AS runner
WORKDIR /app/backend

COPY backend/prisma.config.ts ./
COPY backend/prisma ./prisma
RUN --mount=type=cache,target=/root/.cache bunx prisma generate

# --- Code : la seule couche refaite à chaque commit ---
COPY backend/tsconfig.json ./
COPY backend/src ./src

ENV NODE_ENV=production
ENV PORT=3535
EXPOSE 3535

CMD ["bun", "run", "src/index.ts"]
