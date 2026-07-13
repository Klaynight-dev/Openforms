# syntax=docker/dockerfile:1
# Build stage
FROM oven/bun:1.1 AS builder

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install dependencies (cache BuildKit du store bun : pas de re-téléchargement
# ni de ré-extraction des paquets d'un build à l'autre).
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

# Copy source code
COPY . .

# Variable de build Vite. VIDE = appels API en relatif (/api/...) sur le domaine
# chargé -> cookie de session "same-site" (first-party) sur forms.humanitour.fr
# ET forms.klaynight.fr. NE PAS remettre une URL d'API cross-domaine.
# (Surchargeable via un build-arg, mais le défaut doit rester vide.)
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE

# Build SvelteKit (cache Vite conservé entre builds).
RUN --mount=type=cache,target=/app/node_modules/.vite bun run build

# Production runner stage
FROM oven/bun:1.1-slim AS runner

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install only production dependencies (même cache que le builder).
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --production

# Copy build artifacts from builder
COPY --from=builder /app/build ./build

# Port and run config
ENV PORT=5173
ENV NODE_ENV=production
EXPOSE 5173

# SvelteKit adapter-node generates a standard entrypoint that Bun runs natively
CMD ["bun", "run", "build/index.js"]
