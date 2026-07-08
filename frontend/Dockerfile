# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy lockfile and package configuration
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build-time environment variable for Vite
ARG VITE_API_BASE=http://localhost:3535
ENV VITE_API_BASE=$VITE_API_BASE

# Build the application
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy production configurations
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy build artifacts from builder
COPY --from=builder /app/build ./build

# Port and run config
ENV PORT=5173
ENV NODE_ENV=production
EXPOSE 5173

CMD ["node", "build"]
