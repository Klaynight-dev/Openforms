import { Elysia } from "elysia";
import { resolveSession, type SessionContext } from "../lib/session.ts";
import { resolveApiKey, type ApiKeyContext } from "../lib/apiKey.ts";
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
      if (auth) {
        return {
          auth: auth as SessionContext | null,
          authSource: "apikey" as AuthSource,
          apiKey: auth.apiKey as ApiKeyContext | null,
        };
      }
    }

    const token = cookie.session?.value;
    const auth = await resolveSession(typeof token === "string" ? token : undefined);
    return {
      auth: auth as SessionContext | null,
      authSource: (auth ? "session" : null) as AuthSource,
      apiKey: null as ApiKeyContext | null,
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
  apiKey?: ApiKeyContext | null;
  set: { status?: number | string };
  request: Request;
};

type GuardFailure = { success: false; error: string };

/** Applique la garde : 401 si non connecté, 403 si CSRF absent ou rôle insuffisant. */
function enforceRole(
  roles: Role[] | true | undefined,
  { auth, authSource, apiKey, set, request }: GuardContext,
): GuardFailure | undefined {
  if (roles === undefined) return;

  if (!auth) {
    set.status = 401;
    return { success: false, error: "Authentification requise." };
  }

  // Une clé d'embed est publiée dans le code d'un site tiers : elle n'ouvre que
  // les routes publiques (définition du formulaire, soumission), jamais une
  // route gardée- sinon le simple fait de l'intégrer donnerait accès au compte.
  if (apiKey?.scope === "EMBED") {
    set.status = 403;
    return {
      success: false,
      error: "Cette clé d'API est limitée à l'intégration d'un formulaire.",
    };
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

export type FormPermission = "NONE" | "VIEWER" | "COMMENTER" | "EDITOR";

const PERMISSION_RANK: Record<FormPermission, number> = { NONE: 0, VIEWER: 1, COMMENTER: 2, EDITOR: 3 };

/**
 * Détermine le rôle effectif d'un utilisateur sur un formulaire.
 *  - SUPER_ADMIN et propriétaire : EDITOR.
 *  - Membre de l'organisation du formulaire (quel que soit son rôle dans
 *    l'organisation) : EDITOR. Ajouter quelqu'un à l'organisation suffit donc
 *    à lui ouvrir tous ses formulaires.
 *  - Sinon, l'accès explicite (FormAccess, partage formulaire par formulaire).
 * Quand plusieurs règles s'appliquent, la plus large l'emporte.
 */
export async function resolveFormPermission(
  prismaAccess: any,
  user: SessionContext["user"],
  formId: string,
  ownerId: string,
): Promise<FormPermission> {
  if (user.role === "SUPER_ADMIN" || user.id === ownerId) return "EDITOR";

  const [access, membership] = await Promise.all([
    prismaAccess.findUnique({ where: { userId_formId: { userId: user.id, formId } } }),
    prisma.organizationMember.findFirst({
      where: { userId: user.id, organization: { forms: { some: { id: formId } } } },
      select: { id: true },
    }),
  ]);

  const explicit: FormPermission = access ? (access.role as FormPermission) : "NONE";
  const viaOrganization: FormPermission = membership ? "EDITOR" : "NONE";
  return PERMISSION_RANK[viaOrganization] > PERMISSION_RANK[explicit] ? viaOrganization : explicit;
}

/**
 * Filtre Prisma des formulaires qu'un utilisateur peut au moins lire : les
 * siens, ceux qu'on lui a partagés et ceux de ses organisations.
 */
export function readableFormsWhere(user: SessionContext["user"]) {
  if (user.role === "SUPER_ADMIN") return {};
  return {
    OR: [
      { ownerId: user.id },
      { access: { some: { userId: user.id } } },
      { organization: { members: { some: { userId: user.id } } } },
    ],
  };
}
