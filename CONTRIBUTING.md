# Contributing to OpenForms

Thanks for taking the time to contribute! Bug reports, translations, documentation
fixes and features are all welcome.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Running the checks](#running-the-checks)
- [Coding conventions](#coding-conventions)
- [Database migrations](#database-migrations)
- [Adding a translation](#adding-a-translation)
- [Adding a field type](#adding-a-field-type)
- [Commit and pull request conventions](#commit-and-pull-request-conventions)
- [Review process](#review-process)

---

## Ways to contribute

| I want to… | Start here |
|---|---|
| Report a bug | [Open a bug report](https://github.com/Klaynight-dev/Openforms/issues/new?template=bug_report.yml) |
| Request a feature | [Open a feature request](https://github.com/Klaynight-dev/Openforms/issues/new?template=feature_request.yml) |
| Report a vulnerability | **Do not open an issue** — follow [SECURITY.md](SECURITY.md) |
| Translate the UI | [Adding a translation](#adding-a-translation) |
| Fix something small | Open a PR directly, no issue needed |
| Build a larger feature | Open an issue first so we can agree on the approach |

Issues labelled [`good first issue`](https://github.com/Klaynight-dev/Openforms/labels/good%20first%20issue)
are scoped to be approachable without deep knowledge of the codebase.

---

## Development setup

**Requirements**

- [Bun](https://bun.sh) ≥ 1.1 (the project runs on Bun, not Node — though `node build` works for the built frontend)
- PostgreSQL ≥ 14 (MySQL/MariaDB also supported, see [docs/self-hosting.md](docs/self-hosting.md))
- Docker (optional, only for the containerised workflow and Playwright)

**Steps**

```bash
git clone https://github.com/Klaynight-dev/Openforms.git
cd Openforms
bun install

cp backend/.env.example backend/.env
```

Generate the two mandatory secrets and paste them into `backend/.env`:

```bash
openssl rand -base64 32   # ENCRYPTION_KEY — must decode to exactly 32 bytes
openssl rand -base64 48   # SESSION_SECRET
```

Point `DATABASE_URL` at your database, then:

```bash
bun run db:setup   # prisma migrate dev + seed
bun run dev        # backend on :3535, frontend on :5173
```

The seed creates a `SUPER_ADMIN` and prints its credentials.

> **Behind a corporate TLS proxy?** If `bun install` fails on certificate validation,
> `npm install` produces a `node_modules` tree that the Bun runtime reads fine.

---

## Project layout

```
backend/src/
  config/env.ts      Strict env validation — every new variable is declared here
  controllers/       One Elysia plugin per resource; HTTP concerns only
  services/          Database, crypto, storage, mailer, notifications
  middleware/        CORS, security headers, auth/CSRF macro
  lib/               Pure logic: schema validation, sessions, formulas
backend/tests/       bun:test — mirrors the src/ layout
frontend/src/lib/
  components/        Svelte 5 components (runes mode)
  i18n/              UI translation catalogues
  api/client.ts      Typed API client with automatic CSRF handling
frontend/embed/      Standalone embed widget, bundled separately by esbuild
e2e/                 Playwright specs
docs/                User-facing documentation
```

**Where does my change go?**

- New API endpoint → a controller in `backend/src/controllers/`, plus a test in `backend/tests/`.
- Business rule with no HTTP involved → `backend/src/lib/`, unit-tested in isolation.
- New env var → declare it in `backend/src/config/env.ts`, document it in
  `backend/.env.example` **and** `docs/configuration.md`.
- Any user-visible string → must go through the i18n catalogue, never hardcoded.

---

## Running the checks

CI runs exactly these; run them locally before pushing.

```bash
bun run check      # svelte-check + tsc across both workspaces
bun run test       # backend unit + integration tests
bun run test:e2e   # Playwright end-to-end (spins up the stack)
bun run build      # production build of both workspaces
```

Backend tests use a real database. Point `DATABASE_URL_TEST` at a throwaway
schema — the harness truncates it between suites, so never point it at data you care about.

```bash
docker run -d --name openforms-test-db -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:15-alpine
export DATABASE_URL_TEST="postgresql://postgres:test@localhost:5433/postgres?schema=public"
bun run test
```

---

## Coding conventions

- **TypeScript everywhere**, `strict` mode. Avoid `any`; if you truly need it, comment why.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — no legacy `export let` / stores in new components.
- **Comments in French are fine** — the existing codebase is commented in French and we are not
  rewriting it. New comments may be in French or English; be consistent within a file.
  **User-facing strings are English-first** and go through i18n.
- **Validate at the boundary.** Every request body gets a Typebox schema. Never trust a client payload.
- **No secret in a log line**, no stack trace in a production response.
- Prefer small, single-purpose modules over adding to an already large controller.

---

## Database migrations

Never hand-edit an applied migration. To change the schema:

1. Edit the relevant file in `backend/prisma/schema/`.
2. `bun run db:migrate` — Prisma generates a migration in `backend/prisma/schema/migrations/`.
3. Commit the generated SQL **with** your code change.
4. If the migration is destructive or needs a data backfill, add a note to
   [docs/upgrading.md](docs/upgrading.md) under the upcoming version.

The schema must stay portable: **no PostgreSQL-specific types** (no scalar lists,
no `@db.*` attributes) so the MySQL target keeps working. Use `Json` where you'd
reach for `String[]`.

---

## Adding a translation

Translations live in `frontend/src/lib/i18n/locales/`, one JSON file per locale.

1. Copy `en.json` to `<your-locale>.json` (e.g. `de.json`).
2. Translate the values. **Keep the keys and the `{placeholder}` tokens untouched.**
3. Register the locale in `frontend/src/lib/i18n/index.ts`.
4. `bun run test` — a test asserts every locale has the same key set as `en.json`,
   so a missing key fails CI rather than silently rendering a raw key.

Partial translations are welcome: missing keys fall back to English at runtime,
but the parity test means you should add the keys with an English value rather
than omit them.

---

## Adding a field type

A field type touches four places. Miss one and the field renders but doesn't save.

1. `frontend/src/lib/types.ts` — add the variant to `FieldType`.
2. `frontend/src/lib/fieldTypes.ts` — add its `FIELD_TYPE_META` entry and defaults in `newField`.
3. `frontend/src/lib/components/FieldInput.svelte` — the respondent-facing rendering.
4. `backend/src/lib/formSchema.ts` — the Typebox definition **and** the server-side answer validation.

Add a test in `backend/tests/lib/formSchema.test.ts` covering a valid and an invalid answer.

---

## Commit and pull request conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(stats): add cross-tabulation between two choice fields
fix(auth): reject a session whose CSRF secret has rotated
docs(self-hosting): document the S3 endpoint variable
chore(deps): bump prisma to 6.4
```

Types in use: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
A `!` after the scope (or a `BREAKING CHANGE:` footer) marks a breaking change and
drives the minor version bump while we are pre-1.0.

**Pull requests**

- One logical change per PR. Split refactors out of feature work.
- Fill in the PR template — especially the *how to test* section.
- Add or update tests. A PR that changes behaviour with no test change will be questioned.
- Update `docs/` and `.env.example` when you add configuration.
- Add a line to `CHANGELOG.md` under `## [Unreleased]`.
- Keep the branch rebased on `main`; we merge with squash.

---

## Review process

A maintainer will usually respond within a week. Reviews look for: correctness,
test coverage of the new behaviour, no secret or PII leaking into logs or responses,
schema portability, and that user-facing strings are translatable.

If your PR goes quiet, a polite ping on the thread is welcome — it's a small team,
not disinterest.
