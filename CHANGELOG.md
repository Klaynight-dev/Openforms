# Changelog

All notable changes to OpenForms are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows the pre-1.0 policy described in [docs/upgrading.md](docs/upgrading.md):
while the major version is `0`, **breaking changes bump the minor version**.

Upgrade instructions for each release live in [docs/upgrading.md](docs/upgrading.md).

## [Unreleased]

### Added

- English `README.md` as the primary document, with the French version preserved as `README.fr.md`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue forms and a pull request template.
- This changelog, and an upgrade guide with the project's version policy.

### Changed

- Renamed the workspace packages from `formulaire-humanitour` / `@humanitour/*`
  to `openforms` / `@openforms/*`, and corrected the `LICENSE` copyright holder.

## [0.1.0] — 2026-07-08

First public snapshot of the project.

### Added

- Drag & drop form builder with 17 field types, conditional logic, multi-page
  sections, validation rules, scheduling, response quotas and per-form translations.
- Public form rendering at `/f/:slug`, with a custom link editor and PUBLIC /
  RESTRICTED / PRIVATE visibility.
- Excel-like response spreadsheet: inline editing with autosave, a formula engine
  (`SUM`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT`, `CONCAT`, per-row arithmetic),
  sorting, global search, multi-criteria filters and real `.xlsx` / `.csv` import and export.
- Statistics: per-question charts, cross-tabulation, correlations, time-of-day
  analytics and editable chart palettes.
- Native embed widget (`embed.js`) rendering a public form into any site through
  a Shadow DOM, with no iframe.
- Authentication with Argon2id hashing, opaque server-side sessions in `HttpOnly`
  cookies, invitation-only account creation and password setup tokens.
- Security middleware: strict Typebox validation, security headers, CSRF
  double-submit tokens, rate limiting and a CORS allow-list.
- AES-256-GCM encryption at rest for responses and uploaded files, explicit GDPR
  consent and optional full anonymisation.
- Organisations with member roles, and per-form READ/WRITE access grants.
- Owner notifications, respondent confirmation emails and outgoing webhooks.
- MySQL/MariaDB-portable Prisma schema alongside the PostgreSQL default.
- Docker Compose deployment with a Caddy reverse-proxy example.

[Unreleased]: https://github.com/Klaynight-dev/Openforms/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Klaynight-dev/Openforms/releases/tag/v0.1.0
