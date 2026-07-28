# Headless control-plane SQL migrations (Neon / Postgres)

Phase **2B.2B** ships an explicit, operator-triggered migration runner and a gated live QA harness. Migrations are **not** applied on app startup, build, import, route handling, or ordinary tests. Remote apply and live Neon exercise remain separate authorized operator actions.

## Layout

| File | Purpose |
|------|---------|
| `000_headless_schema_migrations.sql` | Durable migration ledger (`migration_id`, SHA-256 checksum, `applied_at_ms`) |
| `001_headless_project_ownership.sql` | First-claim project ownership (`project_id` → `owner_id`, immutable) |
| `002_headless_jobs.sql` | Discriminated provisional/canonical job store + indexes/constraints |
| `003_headless_cas_transaction_spec.md` | Exact parameterized SQL for CAS operations (interactive transactions) — **not** discovered as a `.sql` migration |
| `004_headless_owned_objects.sql` | Durable owned-object metadata (Design B staging → finalize; no presigned URL columns) |
| `005_headless_cleanup_intents.sql` | Durable orphan-artifact cleanup intents bound to `object_id` (claim/CAS; no capability URL columns) |
| `006_headless_render_dispatch_outbox.sql` | Durable render-dispatch outbox intents (pending/claimed/dispatched; stable delivery_id; no URL/secret columns) |
| `007_headless_owned_object_slot_key_capacity.sql` | Widens `public.headless_owned_objects.slot_key` to `VARCHAR(1024)` — additive alignment with TypeScript canonical max |
| `migration-catalog.ts` | Deterministic discovery + repository checksums |
| `run-headless-migrations.ts` | Gated migration runner (Client + BEGIN/COMMIT + advisory lock) |
| `cli-migrate.ts` | Operator CLI entrypoint |

### Migration identity policy (retain 004)

The catalog discovers **only** executable files matching `NNN_*.sql` (see `EXECUTABLE_HEADLESS_MIGRATION_ID_PATTERN` / `isExecutableHeadlessMigrationFile`). Companion markdown such as `003_headless_cas_transaction_spec.md` is **never** treated as a migration.

Therefore the executable ID sequence is intentionally **non-contiguous**: `000`, `001`, `002`, `004`, `005`, `006`, `007`. There is **no** phantom executable `003`. Contiguous numeric IDs are **not** required by catalog policy. Migration `004` is retained as-is (not renamed). Phase **2E.2A** adds `005_headless_cleanup_intents.sql`, Phase **2E.2B.2** adds `006_headless_render_dispatch_outbox.sql`, and Phase **2E.2D.8C.2** adds `007_headless_owned_object_slot_key_capacity.sql` locally — remote apply of `007` is a separate authorized operator action.

SQL migration files intentionally **do not** wrap themselves in `BEGIN`/`COMMIT`. The runner owns the transaction boundary.

All migration-owned objects are schema-qualified to `public`. The runner sets a fixed safe `search_path` (`public, pg_temp`) per transaction and always reads/writes `public.headless_schema_migrations`. Caller/session `search_path` is never trusted.

**Checksum note (2B.2B.1):** repository migration SQL was updated for `public.` qualification before any remote apply. Checksums are recomputed from repository bytes. No deployed migration was rewritten.

## Why migrations use a direct URL

| Concern | Runtime CAS (`DATABASE_URL`) | Migrations (`DATABASE_URL_UNPOOLED`) |
|---------|------------------------------|--------------------------------------|
| Endpoint | Neon pooled / runtime URL | Direct (non-pooler) Postgres URL |
| Consumer | Neon job-store / ownership adapters via `Pool.connect` interactive transactions | Explicit `migrate:headless-neon` only |
| DDL | Never | Schema apply + ledger writes |
| Fallback | n/a | **Never** falls back to `DATABASE_URL` |

Pooler endpoints can break multi-statement DDL, advisory locks, and interactive transaction semantics. Runtime CAS stays on the existing Pool/Client executor; migrations refuse known pooler hostnames.

Accepted runtime / migration transaction pattern:

```text
Client or Pool.connect → BEGIN → work → COMMIT | ROLLBACK → release/end
```

Do **not** use a fictional `Pool.transaction(callback)` API or the HTTP `neon()` helper for migrations or interactive CAS.

## Operator apply (authorized environments only)

Requires **both**:

1. `HEADLESS_NEON_MIGRATE=1`
2. Valid `DATABASE_URL_UNPOOLED` (direct Postgres URL; pooler rejected)

```bash
HEADLESS_NEON_MIGRATE=1 DATABASE_URL_UNPOOLED='postgresql://…' npm run migrate:headless-neon
```

Without both: zero connection attempts, zero schema mutations, non-zero refusal.

### Ledger semantics

- Not previously applied → apply transactionally and record checksum
- Same ID + same checksum → safe no-op
- Same ID + different checksum → fail closed (`MIGRATION_DRIFT`)
- Partial failure → `ROLLBACK`; no successful ledger row for the failed migration
- Concurrent runners → serialize with `pg_advisory_lock`
- Applied files are immutable; content changes require a new migration ID

## Live QA (separate operator action)

Live harness **never** auto-migrates. After schema apply:

```bash
HEADLESS_NEON_QA=1 DATABASE_URL='postgresql://…' npm run test:headless-neon-live
```

Optional preserve of QA rows: `HEADLESS_NEON_QA_PRESERVE=1`.

Evidence: `docs/evidence/headless/current/HEADLESS_11E_NEON_LIVE_EVIDENCE.md` (`NOT_TESTED` / `FAIL` / `PASS`). Gate-off runs do not overwrite a prior PASS/FAIL with a false Pass.

## Design notes

- **JSONB is not trusted.** Rows read from Postgres must pass through TypeScript validators before control-plane logic runs.
- **No secrets in columns.** Opaque locator identities only.
- **CAS authority** is `store_version` on `headless_jobs`.
- **Idempotency** is unique `(owner_id, project_id, idempotency_authority_key)`.
- **Ownership** is first-claim; reassignment is rejected.

## Out of scope (this directory)

- Remote R2 contact / live bucket provisioning (2C.1A ships Neon owned-object adapter + gated live harness; live matrix NOT RUN in this phase)
- Upstash / Fly adapters
- Production Headless route activation
- Automatic migration on deploy/startup
