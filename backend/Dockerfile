# syntax=docker/dockerfile:1
# Build stage
FROM oven/bun:1.1 AS builder

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install dependencies (cache BuildKit du store bun).
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

# Copy source code and prisma schema
COPY . .

# Generate Prisma Client (cache des moteurs Prisma téléchargés).
RUN --mount=type=cache,target=/root/.cache bunx prisma generate

# Production runner stage
FROM oven/bun:1.1 AS runner

WORKDIR /app

# Copy necessary production files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3535
EXPOSE 3535

CMD ["bun", "run", "src/index.ts"]
