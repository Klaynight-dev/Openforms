/**
 * Correctif de base : Form.allowedEmails est passé de `String[]` (text[]
 * Postgres) à `Json` dans le schéma Prisma, mais la colonne des bases déjà
 * déployées est restée en text[]. Prisma échoue alors sur toute lecture de
 * Form avec :
 *   Inconsistent column data: Could not convert value [...] of the field
 *   `allowedEmails` to type `Json`.
 *
 * Ce script convertit la colonne en jsonb en conservant les données.
 * Idempotent : ne fait rien si la colonne est déjà en jsonb.
 *
 * Usage (depuis backend/, avec DATABASE_URL dans l'environnement) :
 *   bun run db:fix-allowed-emails
 *
 * En production dockerisée :
 *   docker compose exec backend bun run scripts/fix-allowed-emails.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[fix] DATABASE_URL manquante.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const [column] = await prisma.$queryRaw<{ data_type: string }[]>`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'Form' AND column_name = 'allowedEmails'
  `;

  if (!column) {
    console.error("[fix] Colonne \"Form\".\"allowedEmails\" introuvable.");
    process.exit(1);
  }

  if (column.data_type !== "ARRAY") {
    console.log(`[fix] Rien à faire : la colonne est déjà en ${column.data_type}.`);
    process.exit(0);
  }

  console.log("[fix] Colonne en text[], conversion vers jsonb…");

  // Un seul ALTER TABLE : la conversion et le défaut sont appliqués
  // atomiquement, sans laisser la table dans un état intermédiaire.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Form"
      ALTER COLUMN "allowedEmails" DROP DEFAULT,
      ALTER COLUMN "allowedEmails" TYPE JSONB
        USING to_jsonb(COALESCE("allowedEmails", ARRAY[]::text[])),
      ALTER COLUMN "allowedEmails" SET DEFAULT '[]'::jsonb,
      ALTER COLUMN "allowedEmails" SET NOT NULL
  `);

  const count = await prisma.form.count();
  console.log(`[fix] Terminé. ${count} formulaire(s) lisibles.`);
} catch (error) {
  console.error("[fix] Échec :", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
