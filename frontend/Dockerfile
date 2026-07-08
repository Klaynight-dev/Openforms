# Build stage
FROM oven/bun:1.1 AS builder

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install dependencies using Bun
RUN bun install

# Copy source code
COPY . .

# Build-time environment variable for Vite
ARG VITE_API_BASE=http://localhost:3535
ENV VITE_API_BASE=$VITE_API_BASE

# Build the SvelteKit application
RUN bun run build

# Production runner stage
FROM oven/bun:1.1-slim AS runner

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install only production dependencies
RUN bun install --production

# Copy build artifacts from builder
COPY --from=builder /app/build ./build

# Port and run config
ENV PORT=5173
ENV NODE_ENV=production
EXPOSE 5173

# SvelteKit adapter-node generates a standard entrypoint that Bun runs natively
CMD ["bun", "run", "build/index.js"]
