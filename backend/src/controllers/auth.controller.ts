import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { verifyPassword, hashPassword } from "../services/crypto.ts";
import { createSession, destroySession } from "../lib/session.ts";
import { resolvePasswordSetupToken, consumePasswordSetupToken } from "../lib/passwordSetup.ts";
import { authPlugin } from "../middleware/auth.ts";
import { makeRateLimit, sessionCookieOptions } from "../middleware/security.ts";
import { env } from "../config/env.ts";

/** Extrait l'IP réelle en tenant compte d'un éventuel reverse-proxy de confiance. */
function clientIp(request: Request): string | undefined {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return undefined;
}

export const authController = new Elysia({ prefix: "/api/v1/auth" })
  // Anti brute-force : 20 requêtes / minute / IP sur l'espace d'authentification.
  .use(
    makeRateLimit({
      max: 20,
      duration: 60_000,
      message: "Trop de tentatives. Réessayez dans une minute.",
    }),
  )
  .use(authPlugin)

  .post(
    "/login",
    async ({ body, cookie, set, request }) => {
      const email = body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      // Réponse identique que l'utilisateur existe ou non (anti-énumération).
      const ok =
        user && user.isActive && user.passwordHash ? await verifyPassword(body.password, user.passwordHash) : false;
      if (!user || !ok || !user.isActive) {
        set.status = 401;
        return { success: false, error: "Identifiants invalides." };
      }

      const { token, csrfSecret, expiresAt } = await createSession(user.id, {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      cookie.session.set({ value: token, ...sessionCookieOptions(maxAge) });
      // Cookie CSRF lisible par le JS (double-submit) — non HttpOnly.
      cookie.csrf.set({
        value: csrfSecret,
        httpOnly: false,
        secure: env.cookieSecure,
        sameSite: env.cookieSameSite,
        path: "/",
        maxAge,
      });

      return {
        success: true,
        user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
        csrfToken: csrfSecret,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email", maxLength: 320 }),
        password: t.String({ minLength: 1, maxLength: 200 }),
      }),
    },
  )

  .post(
    "/register",
    async ({ body, cookie, set, request }) => {
      const email = body.email.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        set.status = 409;
        return { success: false, error: "Un compte existe déjà avec cet email." };
      }

      // 1. Créer l'utilisateur
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(body.password),
          role: "EDITOR",
          displayName: body.displayName || null,
        },
      });

      // 2. Associer à l'organisation par défaut
      const defaultOrg = await prisma.organization.findUnique({ where: { slug: "humanitours" } });
      if (defaultOrg) {
        await prisma.organizationMember.create({
          data: {
            organizationId: defaultOrg.id,
            userId: user.id,
            role: "MEMBER",
          },
        });
      }

      // 3. Connecter automatiquement
      const { token, csrfSecret, expiresAt } = await createSession(user.id, {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      cookie.session.set({ value: token, ...sessionCookieOptions(maxAge) });
      cookie.csrf.set({
        value: csrfSecret,
        httpOnly: false,
        secure: env.cookieSecure,
        sameSite: env.cookieSameSite,
        path: "/",
        maxAge,
      });

      return {
        success: true,
        user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
        csrfToken: csrfSecret,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email", maxLength: 320 }),
        password: t.String({ minLength: 10, maxLength: 200 }),
        displayName: t.Optional(t.String({ maxLength: 120 })),
      }),
    },
  )

  // --- Vérifie la validité d'un lien d'invitation (avant d'afficher le formulaire) ---
  // Renvoie toujours un statut 200 : `valid` porte le résultat, pas le code HTTP,
  // afin que le frontend puisse afficher un message sans passer par la gestion d'erreur.
  .get(
    "/invite/:token",
    async ({ params }) => {
      const resolved = await resolvePasswordSetupToken(params.token);
      if (!resolved) return { valid: false };
      return { valid: true, email: resolved.email };
    },
    { params: t.Object({ token: t.String() }) },
  )

  // --- Définit le mot de passe à partir d'un lien d'invitation, puis connecte l'utilisateur ---
  .post(
    "/accept-invite",
    async ({ body, cookie, set, request }) => {
      const resolved = await resolvePasswordSetupToken(body.token);
      if (!resolved) {
        set.status = 400;
        return { success: false, error: "Ce lien d'invitation est invalide ou a expiré." };
      }

      const user = await prisma.user.update({
        where: { id: resolved.userId },
        data: { passwordHash: await hashPassword(body.password) },
      });
      await consumePasswordSetupToken(resolved.tokenId);

      const { token, csrfSecret, expiresAt } = await createSession(user.id, {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      cookie.session.set({ value: token, ...sessionCookieOptions(maxAge) });
      cookie.csrf.set({
        value: csrfSecret,
        httpOnly: false,
        secure: env.cookieSecure,
        sameSite: env.cookieSameSite,
        path: "/",
        maxAge,
      });

      return {
        success: true,
        user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
        csrfToken: csrfSecret,
      };
    },
    {
      body: t.Object({
        token: t.String(),
        password: t.String({ minLength: 10, maxLength: 200 }),
      }),
    },
  )

  .post("/logout", async ({ cookie }) => {
    const token = cookie.session?.value;
    await destroySession(typeof token === "string" ? token : undefined);
    cookie.session.remove();
    cookie.csrf.remove();
    return { success: true };
  })

  .get("/me", ({ auth }) => {
    if (!auth) return { authenticated: false };
    return {
      authenticated: true,
      user: auth.user,
      csrfToken: auth.session.csrfSecret,
    };
  });
