import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { env } from "./config/env.ts";
import { securityHeaders, corsPlugin } from "./middleware/security.ts";
import { authController } from "./controllers/auth.controller.ts";
import { usersController } from "./controllers/users.controller.ts";
import { formController } from "./controllers/form.controller.ts";
import { responseController } from "./controllers/response.controller.ts";
import { uploadController } from "./controllers/upload.controller.ts";
import { statsController } from "./controllers/stats.controller.ts";
import { purgeExpiredSessions } from "./lib/session.ts";

export const app = new Elysia()
  .use(securityHeaders)
  .use(corsPlugin)
  .onError(({ code, error, set }) => {
    // Réponses d'erreur homogènes ; on ne divulgue jamais la stack en prod.
    if (code === "VALIDATION") {
      set.status = 422;
      return { success: false, error: "Données invalides.", details: (error as any).all ?? undefined };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { success: false, error: "Ressource introuvable." };
    }
    set.status = (set.status as number) && set.status !== 200 ? set.status : 500;
    if (!env.isProduction) console.error("[erreur]", error);
    return { success: false, error: "Erreur interne du serveur." };
  })
  .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }))
  .use(
    swagger({
      documentation: {
        info: { title: "Formulaire Humanitour — API", version: "0.1.0" },
        tags: [
          { name: "auth", description: "Authentification & sessions" },
          { name: "forms", description: "Formulaires (builder)" },
          { name: "responses", description: "Réponses & tableur" },
        ],
      },
      path: "/docs",
    }),
  )
  .use(authController)
  .use(usersController)
  .use(formController)
  .use(responseController)
  .use(uploadController)
  .use(statsController);

// Purge périodique des sessions expirées (toutes les heures).
setInterval(() => {
  purgeExpiredSessions().catch(() => {});
}, 60 * 60 * 1000);

app.listen(env.port, () => {
  console.log(`🌱 API Formulaire Humanitour sur http://localhost:${env.port}`);
  console.log(`   Docs Swagger : http://localhost:${env.port}/docs`);
  console.log(`   Origines CORS autorisées : ${env.frontendOrigins.join(", ")}`);
});

export type App = typeof app;
