<!--
Thanks for contributing! Please fill this in — the "how to test" section
in particular saves a lot of review round-trips.
-->

## What does this change?

<!-- One or two sentences. Link the issue it closes: "Closes #123". -->

## Why?

<!-- The problem being solved. Skip if the linked issue already says it. -->

## How to test

<!-- Concrete steps a reviewer can follow on a fresh checkout. -->

1.
2.

## Checklist

- [ ] `bun run check` passes
- [ ] `bun run test` passes
- [ ] Tests added or updated for the changed behaviour
- [ ] New user-facing strings go through i18n (no hardcoded text)
- [ ] New environment variables are declared in `config/env.ts`, `.env.example` and `docs/configuration.md`
- [ ] Prisma migration committed, and schema stays MySQL-portable (no scalar lists, no `@db.*`)
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] Documentation updated if behaviour or configuration changed

## Breaking changes

<!-- Anything a self-hoster must do when upgrading? If yes, also add a note to
     docs/upgrading.md. Write "None" otherwise. -->

None

## Screenshots

<!-- For UI changes. Before/after if you can. -->
