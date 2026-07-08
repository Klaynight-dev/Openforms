import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.ts";

/**
 * Instance unique du client Prisma (évite d'épuiser le pool de connexions
 * lors des rechargements à chaud en développement).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
