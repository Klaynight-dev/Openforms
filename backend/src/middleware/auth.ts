import { Elysia } from "elysia";
import { resolveSession, type SessionContext } from "../lib/session.ts";

export type Role = "SUPER_ADMIN" | "EDITOR";

/**
 * Plugin d'authentification :
 *  - `derive` : résout la session depuis le cookie HttpOnly et expose `auth`.
 *  - macro `requireRole` : garde de route (401 si non connecté, 403 si mauvais
 *    rôle) et vérification CSRF (double-submit) sur les requêtes mutantes.
 *
 * Usage dans un contrôleur :
 *   .use(authPlugin)
 *   .get('/me', ({ auth }) => auth?.user, { requireRole: true })
 *   .post('/', handler, { requireRole: ['SUPER_ADMIN'] })
 */
export const authPlugin = new Elysia({ name: "auth" })
  .derive({ as: "scoped" }, async ({ cookie }) => {
    const token = cookie.session?.value;
    const auth = await resolveSession(typeof token === "string" ? token : undefined);
    return { auth: auth as SessionContext | null };
  })
  .macro(({ onBeforeHandle }) => ({
    requireRole(roles: Role[] | true | undefined) {
      if (roles === undefined) return;
      onBeforeHandle((ctx: {
        auth: SessionContext | null;
        set: { status?: number | string };
        request: Request;
      }) => {
        const { auth, set, request } = ctx;
        if (!auth) {
          set.status = 401;
          return { success: false, error: "Authentification requise." };
        }

        // Protection CSRF : toute mutation authentifiée doit présenter le jeton.
        const method = request.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
          const header = request.headers.get("x-csrf-token");
          if (!header || header !== auth.session.csrfSecret) {
            set.status = 403;
            return { success: false, error: "Jeton CSRF manquant ou invalide." };
          }
        }

        if (Array.isArray(roles) && !roles.includes(auth.user.role)) {
          set.status = 403;
          return { success: false, error: "Accès refusé : privilèges insuffisants." };
        }
      });
    },
  }));

/**
 * Détermine le niveau d'accès effectif d'un utilisateur sur un formulaire.
 * SUPER_ADMIN a tous les droits ; sinon on consulte la table FormAccess.
 */
export async function resolveFormPermission(
  prismaAccess: { findUnique: (args: any) => Promise<{ permission: string } | null> },
  user: SessionContext["user"],
  formId: string,
  ownerId: string,
): Promise<"NONE" | "READ" | "WRITE"> {
  if (user.role === "SUPER_ADMIN" || user.id === ownerId) return "WRITE";
  const access = await prismaAccess.findUnique({
    where: { userId_formId: { userId: user.id, formId } },
  });
  if (!access) return "NONE";
  return access.permission as "READ" | "WRITE";
}
