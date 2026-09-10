/**
 * Garde-fou sur la macro `requireRole`.
 *
 * L'API des macros d'Elysia a changé en 1.3 : l'ancienne forme
 * `.macro(({ onBeforeHandle }) => ({ … }))` a cessé d'enregistrer quoi que ce
 * soit, **sans erreur ni avertissement**. Toutes les routes dont `requireRole`
 * était l'unique protection sont alors devenues librement accessibles.
 *
 * Ces tests vérifient le comportement observable de la garde plutôt que sa
 * syntaxe : ils échoueront si une montée de version la neutralise à nouveau.
 */
import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { authPlugin } from "../../src/middleware/auth.ts";

type TestMode = "anon" | "session" | "apikey";

/**
 * Monte une app protégée par le vrai `authPlugin`. L'identité est injectée par
 * un `derive` postérieur, ce qui évite une base de données tout en laissant la
 * macro réellement testée décider.
 */
function buildApp() {
  return new Elysia()
    .use(authPlugin)
    .derive({ as: "scoped" }, ({ request }: { request: Request }) => {
      const mode = (request.headers.get("x-test-mode") ?? "anon") as TestMode;
      if (mode === "anon") return {};
      return {
        auth: {
          session: { id: "s1", csrfSecret: "SECRET", expiresAt: new Date(Date.now() + 3_600_000) },
          user: {
            id: "u1",
            email: "editeur@test.local",
            role: request.headers.get("x-test-role") ?? "EDITOR",
            displayName: null,
          },
        },
        authSource: mode === "apikey" ? "apikey" : "session",
      };
    })
    .get("/read", () => ({ ok: true }), { requireRole: true })
    .post("/mutate", () => ({ ok: true }), { requireRole: true })
    .post("/admin", () => ({ ok: true }), { requireRole: ["SUPER_ADMIN"] })
    .get("/public", () => ({ ok: true }));
}

function call(
  path: string,
  { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {},
) {
  return buildApp().handle(new Request(`http://localhost${path}`, { method, headers }));
}

const session = { "x-test-mode": "session" };
const withCsrf = { ...session, "x-csrf-token": "SECRET" };

describe("requireRole", () => {
  it("refuse une requête non authentifiée", async () => {
    expect((await call("/read")).status).toBe(401);
    expect((await call("/mutate", { method: "POST" })).status).toBe(401);
  });

  it("laisse passer une route non gardée", async () => {
    expect((await call("/public")).status).toBe(200);
  });

  it("autorise une lecture authentifiée", async () => {
    expect((await call("/read", { headers: session })).status).toBe(200);
  });

  it("refuse un rôle insuffisant", async () => {
    const res = await call("/admin", { method: "POST", headers: withCsrf });
    expect(res.status).toBe(403);
  });

  it("accepte le rôle requis", async () => {
    const res = await call("/admin", {
      method: "POST",
      headers: { ...withCsrf, "x-test-role": "SUPER_ADMIN" },
    });
    expect(res.status).toBe(200);
  });
});

describe("protection CSRF", () => {
  it("refuse une mutation par cookie sans jeton", async () => {
    const res = await call("/mutate", { method: "POST", headers: session });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("CSRF");
  });

  it("refuse une mutation par cookie avec un jeton invalide", async () => {
    const res = await call("/mutate", {
      method: "POST",
      headers: { ...session, "x-csrf-token": "MAUVAIS" },
    });
    expect(res.status).toBe(403);
  });

  it("accepte une mutation par cookie avec le bon jeton", async () => {
    expect((await call("/mutate", { method: "POST", headers: withCsrf })).status).toBe(200);
  });

  it("n'exige pas de jeton en lecture", async () => {
    expect((await call("/read", { headers: session })).status).toBe(200);
  });

  it("exempte les clés d'API, non rejouables par un navigateur", async () => {
    const res = await call("/mutate", { method: "POST", headers: { "x-test-mode": "apikey" } });
    expect(res.status).toBe(200);
  });
});
