# Sprint 11E Phase 2E.2D.8C.2 — Owned-object slot_key schema alignment

**Status:** Local implementation complete. **Remote migration 007 not applied.**  
**Branch:** `feature/sprint-11-headless-renderer`

## Problem (confirmed live boundary)

| Layer | `slot_key` capacity |
|-------|---------------------|
| TypeScript canonical max | 1024 |
| Neon `public.headless_owned_objects.slot_key` (pre-007) | `VARCHAR(128)` from migration 004 |
| Live `hslot:v2` asset keys | 145–179 characters |

Manifest/bundle (null `slot_key`) inserts succeed; first `asset_bytes` fails at `neon_staging_insert` with `DATABASE_UNAVAILABLE`.

**Diagnostic evidence:** `5b738502696b6b480633b04e0d4ba9a879dfacbfbea93969916842adc20567ec`  
**Official render FAIL (unchanged):** `c87e09c992b46630af89fad9bded74266a3f1db234f77abc49ad7f05b6d529de`

## Local migration 007 contract

**File:** `007_headless_owned_object_slot_key_capacity.sql`  
**SHA-256:** `699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244`

```sql
ALTER TABLE public.headless_owned_objects
  ALTER COLUMN slot_key TYPE VARCHAR(1024);
```

**Design choice:** explicit `VARCHAR(1024)` (not `TEXT` + check) so `information_schema.columns.character_maximum_length` proves exactly 1024 in schema preflight.

**Preserved byte-identically:** migrations `000`, `001`, `002`, `004`, `005`, `006` — especially `004` checksum `a2f05a8316c1…`.

**Executable catalog order:** `000`, `001`, `002`, `004`, `005`, `006`, `007` (no phantom executable `003`).

## Pre-007 Fly image classification

| Digest | Role after remote 007 |
|--------|------------------------|
| `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` | **Pre-007** — six-migration embedded fingerprint; valid for historical verify-first PASS evidence only; **not eligible** for consumer loop once Neon has 007 applied |

Post-007 workers must embed the seven-migration fingerprint and a **new** image digest.

## Staged operational upgrade sequence (NOT EXECUTED)

Requires separate operator authorization before any remote step.

### Phase A — Build boundary

1. Merge/local-verify branch with seven-migration fingerprint.
2. `npm run build:headless-worker` twice — confirm deterministic `hosted-worker.js`, `page-render.iife.js`, `BUILD_INFO.json` hashes.
3. Build and push **new** Fly image (digest ≠ `ae06963a…`).
4. Record new digest in activation/readiness authority for post-007 matrices only.

### Phase B — Migration boundary (consumers at zero)

5. Scale **staging render + verify consumers to zero** (no in-flight owned-object writes during DDL).
6. Apply migration 007 **once** on staging Neon via unpooled URL:
   ```bash
   HEADLESS_NEON_MIGRATE=1 DATABASE_URL_UNPOOLED='postgresql://…' npm run migrate:headless-neon
   ```
7. Re-run migrate — confirm idempotent no-op for 007 checksum.
8. Run seven-migration schema preflight against staging (`slot_key` must report `character_maximum_length = 1024`, nullable `YES`).

### Phase C — Verify-first on new image

9. Deploy new image to **verify** Machine only (render still scaled to zero if applicable).
10. Confirm remote schema preflight PASS with seven-migration fingerprint.
11. Rerun hosted **verify** live matrix; expect PASS with **new** digest + seven-migration fingerprint in evidence.

### Phase D — Render activation

12. Deploy same new image to **render** Machine.
13. Rerun **owned-object staging probe** — expect diagnostic PASS (asset_bytes `neon_staging_insert` ok).
14. Rerun **official render live matrix** — expect PASS (replacing `c87e09c9…` FAIL under new authorized run).

### Phase E — Production (future gate)

15. Repeat B–D on production with independent authorization. Do not activate production routes in this phase.

## Authorization request (separate)

Request operator approval for:

- [ ] Remote apply of `007_headless_owned_object_slot_key_capacity.sql` on staging Neon
- [ ] Fly image build/push (new digest)
- [ ] Staging consumer scale-to-zero during migration window
- [ ] Verify-first activation on new image
- [ ] Render activation + staging probe + official render matrix rerun

**Explicitly out of scope without new authorization:** production routes, 4K matrix, credential master use, `.env.local` edits.

## Verification commands (local — run before remote)

```bash
npm run test:headless-sql-schema
npm run test:headless-owned-object-sql-schema
npm run test:headless-owned-object-slot-key-capacity-007-authority
npm run test:headless-neon-schema-preflight-authority
npm run test:headless-deployable-worker-packaging-2e2c2
npm run test:headless-fly-verify-live-matrix-authority
npm run test:headless-fly-render-live-matrix-authority
npm run test:headless-fly-render-owned-object-staging-probe-authority
npm run build:headless-worker && npm run build:headless-worker
npm run build
npm run lint
npm run typecheck
git diff --check
```

Preserve historical evidence document SHAs byte-identically; new runs produce new evidence files only.
