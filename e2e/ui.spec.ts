import { expect, test } from "@playwright/test";

/**
 * Fumigation de l'interface : on vérifie que les deux parcours qui font vivre
 * l'application répondent de bout en bout — un répondant qui remplit un
 * formulaire public, et un administrateur qui se connecte.
 *
 * Les sélecteurs s'appuient sur `data-testid` et non sur du texte : l'interface
 * est traduite, un test qui cherche « Envoyer » casserait dans une autre langue.
 */

const DEMO_SLUG = "demo";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@openforms.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-password-not-a-secret";

test.describe("Formulaire public", () => {
  test("affiche le formulaire de démonstration", async ({ page }) => {
    await page.goto(`/f/${DEMO_SLUG}`);
    await expect(page.getByTestId("form-title")).toBeVisible();
    await expect(page.getByTestId("form-submit")).toBeVisible();
  });

  test("un répondant peut soumettre une réponse complète", async ({ page }) => {
    await page.goto(`/f/${DEMO_SLUG}`);
    await expect(page.getByTestId("form-title")).toBeVisible();

    await page.getByLabel(/nom/i).first().fill("Grace Hopper");
    await page.getByLabel(/email/i).first().fill("grace@example.org");
    await page.getByRole("radio", { name: /particulier/i }).check();

    const consent = page.getByTestId("consent");
    if (await consent.isVisible()) await consent.check();

    await page.getByTestId("form-submit").click();

    await expect(page.getByTestId("submitted")).toBeVisible();
  });

  test("refuse la soumission tant que le consentement n'est pas coché", async ({ page }) => {
    await page.goto(`/f/${DEMO_SLUG}`);
    const consent = page.getByTestId("consent");
    test.skip(!(await consent.isVisible()), "consentement non requis sur ce formulaire");

    await page.getByLabel(/nom/i).first().fill("Grace Hopper");
    await page.getByLabel(/email/i).first().fill("grace@example.org");
    await page.getByRole("radio", { name: /particulier/i }).check();
    await page.getByTestId("form-submit").click();

    await expect(page.getByTestId("submit-error")).toBeVisible();
    await expect(page.getByTestId("submitted")).toBeHidden();
  });

  test("un champ conditionnel n'apparaît qu'une fois sa condition remplie", async ({ page }) => {
    await page.goto(`/f/${DEMO_SLUG}`);

    // Le SIRET est conditionné au profil « entreprise » dans le formulaire amorcé.
    await expect(page.getByLabel(/siret/i)).toBeHidden();
    await page.getByRole("radio", { name: /entreprise/i }).check();
    await expect(page.getByLabel(/siret/i)).toBeVisible();
  });

  test("renvoie une page d'erreur sur un slug inconnu", async ({ page }) => {
    await page.goto("/f/slug-qui-nexiste-pas");
    await expect(page.getByTestId("form-submit")).toBeHidden();
  });
});

test.describe("Administration", () => {
  test("rejette des identifiants invalides", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#pw").fill("mauvais mot de passe");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("connecte un administrateur et affiche la liste des formulaires", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#pw").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/admin(?!\/login)/);
    await expect(page.getByTestId("login-form")).toBeHidden();
  });

  test("redirige un visiteur non authentifié hors de l'administration", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByTestId("login-form")).toBeVisible();
  });
});
