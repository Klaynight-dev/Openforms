import { Elysia } from "elysia";
import { resolveSession, type SessionContext } from "../lib/session.ts";
import { resolveApiKey } from "../lib/apiKey.ts";
import { prisma } from "../services/prisma.ts";

export type Role = "SUPER_ADMIN" | "EDITOR";

/** Origine de l'authentification : conditionne la vérification CSRF. */
export type AuthSource = "session" | "apikey" | null;

/**
 * Plugin d'authentification :
 *  - `derive` : résout l'identité depuis le cookie HttpOnly **ou** depuis une
 *    clé d'API (`Authorization: Bearer ofk_…`), et expose `auth`.
 *  - macro `requireRole` : garde de route (401 si non connecté, 403 si mauvais
 *    rôle) et vérification CSRF (double-submit) sur les requêtes mutantes.
 *
 * Usage dans un contrôleur :
 *   .use(authPlugin)
 *   .get('/me', ({ auth }) => auth?.user, { requireRole: true })
 *   .post('/', handler, { requireRole: ['SUPER_ADMIN'] })
 */
export const authPlugin = new Elysia({ name: "auth" })
  .derive({ as: "scoped" }, async ({ cookie, request }) => {
    // Une clé d'API prime sur le cookie : un client non-navigateur n'en a pas.
    const header = request.headers.get("authorization");
    if (header?.startsWith("Bearer ")) {
      const auth = await resolveApiKey(header.slice(7).trim());
      if (auth) return { auth: auth as SessionContext | null, authSource: "apikey" as AuthSource };
    }

    const token = cookie.session?.value;
    const auth = await resolveSession(typeof token === "string" ? token : undefined);
    return {
      auth: auth as SessionContext | null,
      authSource: (auth ? "session" : null) as AuthSource,
    };
  })
  // Syntaxe de macro Elysia >= 1.3. L'ancienne forme
  // `.macro(({ onBeforeHandle }) => ({ … }))` n'enregistre plus rien sur ces
  // versions : elle échouait en silence, laissant passer toute requête sur les
  // routes dont `requireRole` était la seule protection.
  .macro({
    // `ctx` n'est typé qu'à la frontière du framework : la logique de garde
    // vit dans `enforceRole`, entièrement typée.
    requireRole: (roles: Role[] | true | undefined) => ({
      beforeHandle: (ctx: any) => enforceRole(roles, ctx as GuardContext),
    }),
  });

/** Contexte minimal dont dépend la garde de route. */
type GuardContext = {
  auth: SessionContext | null;
  authSource: AuthSource;
  set: { status?: number | string };
  request: Request;
};

type GuardFailure = { success: false; error: string };

/** Applique la garde : 401 si non connecté, 403 si CSRF absent ou rôle insuffisant. */
function enforceRole(
  roles: Role[] | true | undefined,
  { auth, authSource, set, request }: GuardContext,
): GuardFailure | undefined {
  if (roles === undefined) return;

  if (!auth) {
    set.status = 401;
    return { success: false, error: "Authentification requise." };
  }

  // Protection CSRF : toute mutation authentifiée par cookie doit présenter le
  // jeton. Les clés d'API en sont exemptées : elles ne sont pas envoyées
  // automatiquement par le navigateur, donc non rejouables.
  const method = request.method.toUpperCase();
  if (authSource === "session" && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
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
}

/**
 * Détermine le niveau d'accès effectif d'un utilisateur sur un formulaire.
 * SUPER_ADMIN a tous les droits ; sinon on consulte la table FormAccess.
 */
export async function resolveFormPermission(
  prismaAccess: any,
  user: SessionContext["user"],
  formId: string,
  ownerId: string,
): Promise<"NONE" | "READ" | "WRITE"> {
  if (user.role === "SUPER_ADMIN" || user.id === ownerId) return "WRITE";

  // Check organization membership
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { organizationId: true },
  });
  if (form?.organizationId) {
    const member = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: form.organizationId, userId: user.id } },
    });
    if (member) {
      return "WRITE";
    }
  }

  const access = await prismaAccess.findUnique({
    where: { userId_formId: { userId: user.id, formId } },
  });
  if (!access) return "NONE";
  return access.permission as "READ" | "WRITE";
}
