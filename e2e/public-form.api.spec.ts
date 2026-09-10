import { expect, test } from "@playwright/test";

/**
 * Parcours public au niveau API : ce sont les endpoints ouverts sans
 * authentification (remplissage d'un formulaire, widget d'embed). Une
 * régression ici casse la seule partie de l'application exposée à tout
 * internet, d'où une couverture au plus près du contrat HTTP.
 *
 * Dépend du formulaire de démonstration créé par `db:seed` (SEED_DEMO_FORM=true).
 */

const DEMO_SLUG = "demo";

test.describe("API publique", () => {
  test("/health répond", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("expose la définition d'un formulaire publié", async ({ request }) => {
    const res = await request.get(`/api/v1/forms/public/${DEMO_SLUG}`);
    expect(res.ok()).toBeTruthy();

    const form = await res.json();
    expect(form).toMatchObject({ slug: DEMO_SLUG, isPublished: true });
    expect(Array.isArray(form.schema)).toBeTruthy();
    expect(form.schema.length).toBeGreaterThan(0);
  });

  test("ne divulgue aucune donnée interne dans la définition publique", async ({ request }) => {
    const res = await request.get(`/api/v1/forms/public/${DEMO_SLUG}`);
    const form = await res.json();

    // Un formulaire public est lisible par n'importe qui : rien de ce qui
    // concerne le propriétaire, les webhooks ou les réponses ne doit fuiter.
    expect(form).not.toHaveProperty("webhookUrl");
    expect(form).not.toHaveProperty("allowedEmails");
    expect(form).not.toHaveProperty("responses");
    expect(JSON.stringify(form)).not.toContain("@openforms.local");
  });

  test("renvoie 404 sur un slug inconnu", async ({ request }) => {
    const res = await request.get("/api/v1/forms/public/slug-qui-nexiste-pas");
    expect(res.status()).toBe(404);
  });

  test("accepte une soumission valide", async ({ request }) => {
    const form = await (await request.get(`/api/v1/forms/public/${DEMO_SLUG}`)).json();

    const res = await request.post("/api/v1/responses/submit", {
      data: {
        formId: form.id,
        consent: true,
        data: {
          nom: "Ada Lovelace",
          email: "ada@example.org",
          profil: "particulier",
          satisfaction: 9,
          commentaire: "Soumission end-to-end.",
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ success: true });
  });

  test("refuse une soumission à laquelle il manque un champ requis", async ({ request }) => {
    const form = await (await request.get(`/api/v1/forms/public/${DEMO_SLUG}`)).json();

    const res = await request.post("/api/v1/responses/submit", {
      data: {
        formId: form.id,
        consent: true,
        data: { commentaire: "Il manque le nom, l'email et le profil." },
      },
    });

    expect(res.ok()).toBeFalsy();
  });

  test("refuse une soumission sans consentement quand il est exigé", async ({ request }) => {
    const form = await (await request.get(`/api/v1/forms/public/${DEMO_SLUG}`)).json();
    test.skip(!form.requireConsent, "le formulaire de démonstration n'exige pas le consentement");

    const res = await request.post("/api/v1/responses/submit", {
      data: {
        formId: form.id,
        consent: false,
        data: { nom: "Ada", email: "ada@example.org", profil: "particulier" },
      },
    });

    expect(res.ok()).toBeFalsy();
  });

  test("refuse une soumission vers un identifiant de formulaire inexistant", async ({ request }) => {
    const res = await request.post("/api/v1/responses/submit", {
      data: {
        formId: "00000000-0000-4000-8000-000000000000",
        consent: true,
        data: { nom: "Ada" },
      },
    });

    expect(res.status()).toBe(404);
  });
});

test.describe("Contrôles d'accès", () => {
  test("la liste des formulaires exige une authentification", async ({ request }) => {
    const res = await request.get("/api/v1/forms");
    expect(res.status()).toBe(401);
  });

  test("la liste des utilisateurs exige une authentification", async ({ request }) => {
    const res = await request.get("/api/v1/users");
    expect([401, 403]).toContain(res.status());
  });

  test("rejette des identifiants invalides sans révéler si le compte existe", async ({ request }) => {
    const inconnu = await request.post("/api/v1/auth/login", {
      data: { email: "personne@example.org", password: "mauvais" },
    });
    const connu = await request.post("/api/v1/auth/login", {
      data: { email: process.env.ADMIN_EMAIL ?? "admin@openforms.local", password: "mauvais" },
    });

    expect(inconnu.status()).toBe(401);
    expect(connu.status()).toBe(401);
    // Anti-énumération : les deux réponses doivent être indiscernables.
    expect(await inconnu.text()).toBe(await connu.text());
  });
});

test.describe("Authentification", () => {
  test("connecte l'administrateur amorcé et expose son profil", async ({ request }) => {
    const login = await request.post("/api/v1/auth/login", {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@openforms.local",
        password: process.env.ADMIN_PASSWORD ?? "e2e-password-not-a-secret",
      },
    });
    expect(login.ok()).toBeTruthy();

    // Le contexte de requête conserve les cookies : /me doit suivre.
    const me = await request.get("/api/v1/auth/me");
    expect(me.ok()).toBeTruthy();
    expect(await me.json()).toMatchObject({ role: "SUPER_ADMIN" });
  });

  test("une mutation authentifiée sans jeton CSRF est refusée", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@openforms.local",
        password: process.env.ADMIN_PASSWORD ?? "e2e-password-not-a-secret",
      },
    });

    // Cookie de session présent, en-tête x-csrf-token absent : double-submit
    // non satisfait, la requête doit être rejetée.
    const res = await request.post("/api/v1/forms", {
      data: { title: "Créé sans jeton CSRF", schema: [] },
    });
    expect(res.status()).toBe(403);
  });
});
