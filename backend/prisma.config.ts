import path from "node:path";
import { defineConfig } from "prisma/config";

// Un fichier de config Prisma désactive le chargement automatique de `.env` :
// on le charge donc explicitement (Node ≥ 20.12 / 22 : process.loadEnvFile).
try {
  process.loadEnvFile(path.join(import.meta.dirname, ".env"));
} catch {
  // .env absent (ex: variables fournies par l'environnement) — on ignore.
}

export default defineConfig({
  schema: path.join("prisma", "schema"),
});
