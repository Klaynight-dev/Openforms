import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration end-to-end.
 *
 * Les tests attendent une pile déjà amorcée :
 *   - base migrée puis `db:seed` avec ADMIN_EMAIL / ADMIN_PASSWORD / SEED_DEMO_FORM=true
 *   - backend et frontend démarrés par les `webServer` ci-dessous
 *
 * En local :
 *   export DATABASE_URL=... ENCRYPTION_KEY=... SESSION_SECRET=...
 *   export ADMIN_EMAIL=admin@openforms.local ADMIN_PASSWORD=e2e-password-not-a-secret
 *   bun run --cwd backend db:deploy && SEED_DEMO_FORM=true bun run --cwd backend db:seed
 *   bun run build && bun run test:e2e
 */

const FRONTEND_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:3535";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // les specs partagent une base unique
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "en-GB",
  },

  projects: [
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
      use: { baseURL: API_URL },
    },
    {
      name: "chromium",
      testIgnore: /.*\.api\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "bun run --cwd backend start",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "bun frontend/build/index.js",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: "5173" },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
