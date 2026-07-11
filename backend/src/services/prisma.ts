import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.ts";

/**
 * Instance unique du client Prisma (évite d'épuiser le pool de connexions
 * lors des rechargements à chaud en développement).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Connexion explicite via un adapter driver plutôt que le moteur binaire :
// prépare le passage à Prisma 7, qui rendra l'adapter obligatoire ici
// (schema.prisma garde `url` pour l'instant, requis par le CLI 6.x pour
// generate/migrate). Voir https://pris.ly/d/prisma7-client-config
const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
