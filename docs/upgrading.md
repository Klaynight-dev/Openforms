# Upgrading OpenForms

## Version policy

OpenForms is pre-1.0. Until `1.0.0` ships we follow a slightly adapted SemVer:

| Change | Version bump |
|---|---|
| Breaking change (schema migration you cannot roll back, removed env var, changed API contract) | **minor** — `0.1.x` → `0.2.0` |
| New feature, backwards compatible | **minor** — `0.1.x` → `0.2.0` |
| Bug fix, security fix, documentation | **patch** — `0.1.0` → `0.1.1` |

Every breaking change gets an entry in this file **and** in `CHANGELOG.md`.
After `1.0.0`, standard SemVer applies: breaking changes bump the major.

### What is covered by the version contract

- The REST API surface documented in [`api.md`](api.md), including API-key scopes.
- Environment variable names and their semantics ([`configuration.md`](configuration.md)).
- The database schema, through forward-only Prisma migrations.
- The embed widget's public interface (`window.OpenForms.mount`, `data-openforms-*`).

### What is not

- Internal module layout, unexported functions, CSS class names.
- The Swagger schema of endpoints marked experimental.
- Anything behind a flag documented as experimental.

---

## Before every upgrade

1. **Read the changelog** between your version and the target — not just the latest entry.
2. **Back up the database.**
   ```bash
   docker compose exec -T db pg_dump -U openforms openforms > backup-$(date +%F).sql
   ```
3. **Back up uploaded files** (the `uploads` volume, or your S3 bucket).
4. **Confirm you still have `ENCRYPTION_KEY`.** Without it, every encrypted
   response is permanently unreadable — a restore of the database alone will not save you.
5. **Pin a tag rather than `latest`** so you can reproduce and roll back.

---

## Standard upgrade (Docker Compose)

```bash
# 1. Note the version you are on, in case you need to roll back
docker compose images

# 2. Update the pinned tag in docker-compose.yml, then
docker compose pull
docker compose up -d
```

The backend applies `prisma migrate deploy` on startup, so migrations run
automatically. Watch them land before declaring victory:

```bash
docker compose logs -f backend
```

### Rolling back

Migrations are **forward-only**. Rolling back the images is only safe if the
release you are leaving introduced no migration. Otherwise, roll back by
restoring the database backup taken in step 2 *and* re-pinning the old image tag.
This is why step 2 is not optional.

---

## Upgrade from source

```bash
git fetch --tags
git checkout v0.2.0        # the tag you are targeting
bun install
bun run db:deploy          # prisma migrate deploy — NOT `db:migrate`
bun run build
```

> `bun run db:migrate` is a development command: it can prompt to reset the
> database. On a production instance always use `bun run db:deploy`.

---

## Version-specific notes

### Unreleased

The workspace packages were renamed (`formulaire-humanitour` → `openforms`,
`@humanitour/*` → `@openforms/*`). This affects local development only — if you
have a stale `node_modules`, reinstall:

```bash
rm -rf node_modules backend/node_modules frontend/node_modules
bun install
```

No database migration, no configuration change.

### 0.1.0

Initial release — nothing to upgrade from.

---

## Troubleshooting

**`prisma migrate deploy` fails with a drift error**
Your database was changed outside of migrations (typically `prisma db push` on a
production database). Compare with `bunx prisma migrate status`, and resolve an
already-applied migration with `bunx prisma migrate resolve --applied <name>`.

**The backend starts, then exits with `[env] Missing environment variable`**
A release added a required variable. It is listed in the changelog and in
[`configuration.md`](configuration.md). The fail-fast is deliberate: the server
refuses to run half-configured rather than silently disabling a security control.

**Encrypted responses render as garbage after a restore**
`ENCRYPTION_KEY` does not match the one in use when those rows were written.
Restore the original key; there is no recovery path without it.
