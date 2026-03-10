# Prisma / Supabase audit - 2026-03-10

## Executive summary

- Source of truth validated today: the live Supabase database.
- Current `prisma/schema.prisma` is aligned with the live database.
- Prisma migration history is marked as applied in `_prisma_migrations` and `prisma migrate status` reports `Database schema is up to date`.
- A full `migrations -> live database` diff could not be validated safely inside the current Supabase project because Prisma needs a real shadow database, not a different schema inside the same production database.

## What was checked

### 1. Prisma config

- File checked: `prisma.config.ts`
- Result: Prisma CLI uses `DIRECT_URL ?? DATABASE_URL`.
- Improvement applied: `datasource.shadowDatabaseUrl` is now configured, using `SHADOW_DATABASE_URL` when present and otherwise deriving a shadow URL from `DIRECT_URL`.

### 2. Live database vs schema.prisma

Command used:

```bash
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --script
```

Result:

```sql
-- This is an empty migration.
```

Interpretation:

- `prisma/schema.prisma` matches the live Supabase database.
- There is no immediate schema drift between code and production.

### 3. Migration history status

Command used:

```bash
prisma migrate status
```

Result:

- 5 migrations found in `prisma/migrations`
- Prisma reports `Database schema is up to date`

Interpretation:

- The migration table and the local migration directory are consistent from Prisma's point of view.
- This does not prove that replaying the whole migration chain on a fresh database reproduces the live schema exactly.

### 4. Migrations directory vs current schema

Command used:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
```

Observed limitation:

- Prisma requires a shadow database for `--from-migrations`.
- Using a different schema inside the same Supabase database produces false positives because Prisma compares objects created in the shadow schema against objects that exist in `public`.

Interpretation:

- The noisy diff seen during this audit is not trustworthy evidence of real drift.
- To prove that the migration chain is reproducible, the diff must be run against a separate disposable database or a separate Supabase development branch.

## Current repository status

### Safe conclusions

- The live DB and `prisma/schema.prisma` are aligned.
- The repo still has a usable Prisma migration history.
- The project can now support a proper `shadowDatabaseUrl` in Prisma 7.

### Remaining uncertainty

- The existing migration chain has not yet been verified end to end on a clean disposable database.
- Because of that, the migration folder should be treated as operationally usable but not yet fully certified as a reproducible canonical history.

## Recommended next step to fully align everything

Pick one of these two options:

### Option A: keep the existing migration history

Use this if you want to preserve the current migration chain.

Steps:

1. Provision a disposable Postgres database or a Supabase development branch.
2. Set `SHADOW_DATABASE_URL` to that separate database, not to another schema in production.
3. Run:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
```

Expected result:

- Exit code `0`
- No structural diff

If there is real drift:

- Fix the offending migration files only if this is still a non-production history.
- Otherwise, create a new forward-only repair migration.

### Option B: create a new canonical baseline

Use this if you want the repository history to explicitly reset around the current live schema.

Steps:

1. Keep the live Supabase DB as source of truth.
2. Keep the current `schema.prisma` as the canonical datamodel.
3. Generate a fresh baseline SQL from the current schema:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

4. Apply that baseline only in fresh environments.
5. Do not rewrite production lightly unless you are also prepared to reconcile `_prisma_migrations` deliberately.

Recommendation:

- Prefer Option A first.
- Use Option B only if you intentionally want to squash history and re-baseline the project.

## Recommended workflow from now on

1. Never modify the production Supabase schema directly unless it is an emergency.
2. Make schema changes in `prisma/schema.prisma` first.
3. Generate migrations with Prisma against a dev database or Supabase branch.
4. Validate with `prisma migrate diff` before deploying.
5. Apply to production with `prisma migrate deploy`.
6. If production was changed manually, immediately run `prisma db pull`, review the diff, and create a forward migration that formalizes that change.

## Practical environment guidance

- `DATABASE_URL`: pooled runtime connection
- `DIRECT_URL`: direct connection for Prisma CLI
- `SHADOW_DATABASE_URL`: separate disposable database for migration diff / dev workflows

Important:

- `SHADOW_DATABASE_URL` should not point to another schema in the same production database if you want trustworthy migration reproducibility checks.
