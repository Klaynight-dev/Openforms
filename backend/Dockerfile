FROM oven/bun:1.1

WORKDIR /app

# Copy package configurations
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy project files
COPY . .

# Generate Prisma Client
RUN bunx prisma generate

# Environment setup
ENV NODE_ENV=production
ENV PORT=3535
EXPOSE 3535

# Start server
CMD ["bun", "run", "src/index.ts"]
