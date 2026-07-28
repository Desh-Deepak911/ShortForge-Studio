# Sprint 11E Phase 2C.1A / 2C.1B — R2 Durability + Live-Evidence Authority

**Status:** IMPLEMENTED / CONFIGURATION-GATED / LIVE FAIL ARCHIVED / 2C.1B FIXTURE CORRECTION  
**Branch:** `feature/sprint-11-headless-renderer`  
**Date basis:** 2026-07-20

## Phase status

| Surface | Status |
|---------|--------|
| Migration `004` retain decision | **DOCUMENTED** (executable IDs `000,001,002,004`; `003` is CAS markdown) |
| Neon owned-object store adapter | **IMPLEMENTED** (fixture-tested; not remotely live) |
| TOCTOU revision authority (ETag/VersionId) | **IMPLEMENTED** / locally verified |
| Upload capability signing truth | **DOCUMENTED + fixture-tested** |
| Finalized coverage reconcile | **IMPLEMENTED** / locally verified |
| R2 live harness | **IMPLEMENTED** (real matrix runners) / official evidence **FAIL archived** (pre-2C.1B) |
| **2C.1B same-snapshot fixture correction** | **IMPLEMENTED** — bytes→digest→provisional→staging; `createMinimalProvisionalJob` requires `manifestPayloadDigestClaim`; coverage accepts `blocked_incomplete` |
| **2C.1B targeted R2 harness** | **IMPLEMENTED** / gate `HEADLESS_R2_QA_TARGETED=1` / evidence `docs/evidence/headless/current/HEADLESS_11E_R2_TARGETED_EVIDENCE.md` / stop-on-first-failure |
| Production routes / `canCreateJob` | **CONFIGURATION-BLOCKED** (`false`) |
| Browser Export | **PRODUCTION DEFAULT** |

## Migration identity decision — retain 004

Executable SQL migrations discovered by the catalog are only `NNN_*.sql`. Companion markdown `003_headless_cas_transaction_spec.md` is intentionally non-executable. Contiguous IDs are **not** required. Migration `004_headless_owned_objects` is retained (not renamed); it has not been remotely applied.

See `control-plane/migrations/README.md` and `EXECUTABLE_HEADLESS_MIGRATION_ID_PATTERN`.

## TOCTOU policy

1. After verification claim, `HeadObject` captures opaque `providerRevisionId` + `revisionAuthority` (`etag` | `version_id` | `unavailable`).
2. `revisionAuthority === "unavailable"` → fail closed (`OBJECT_REVISION_UNAVAILABLE`); do not finalize.
3. Full-object `GetObject` binds revision (`IfMatch` for ETag; `VersionId` when authority is version_id).
4. HTTP 412 / PreconditionFailed → `OBJECT_REVISION_MISMATCH`; do not finalize.
5. **ETag/VersionId are NEVER treated as sha256.** Digests are computed only from streamed bytes.

## Upload capability enforcement truth

AWS SigV4 for `PutObject` in `r2-upload-capability.adapter.ts` signs `Bucket` / `Key` / `Content-Type` / `Content-Length` when those fields are present on `PutObjectCommand`. **ContentLength IS signed when passed.**

Browser must send `Content-Type` and `Content-Length` matching the signed values for R2 to accept the PUT. The URL is issuance-only and never persisted.

Independent trust policy:

- Content-Type on the capability is a **claim until trusted verify**
- Byte length is **always revalidated from the full-object stream**
- Client digests are **never trusted**

If ContentLength signing differs across SDK versions, stream length remains the sole durable length authority.

## Coverage recovery

`reconcileFinalizedOwnedObjectCoverage` appends staging refs from trusted finalized facts and updates provisional verification coverage via CAS. Duplicate reconciliation cannot regress coverage. Finalize success is independent of coverage (`coverageReconciled` on verify success). Promotion remains blocked until coverage is complete. Finalized objects are never deleted/relabeled on coverage failure.

## Live harness gates (LIVE NOT RUN)

Default matrix runners are **implemented** (real Neon/R2 port calls via injected `ctx`). Gate-off unit/authority paths still exit 0 with zero connections. **Do not** run against remote Neon/R2 in this phase (`HEADLESS_R2_QA=1` with real credentials).

```bash
# Gate off (default) — NOT_TESTED / exit 0 / zero Neon+R2 connections
npm run test:headless-r2-live

# Future authorized live (DO NOT RUN in this phase):
HEADLESS_R2_QA=1 DATABASE_URL='postgresql://…' \
  R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
  R2_BUCKET_ASSETS=… R2_BUCKET_ARTIFACTS=… R2_ENDPOINT=… \
  HEADLESS_ALLOWED_ORIGINS='https://…' \
  npm run test:headless-r2-live

# Optional preserve QA rows:
HEADLESS_R2_QA_PRESERVE=1
```

Harness **never** migrates and **never** uses `DATABASE_URL_UNPOOLED`. Project IDs are UUID v4; ownership is claimed before FK-backed staging creates. Cleanup deletes tracked R2 locators + Neon rows and verifies zero leftovers.

Evidence: `docs/evidence/headless/current/HEADLESS_11E_R2_LIVE_EVIDENCE.md` (official FAIL archive from pre-2C.1B live run — do not overwrite with gate-off).

### 2C.1B fixture correction + targeted harness

Same-snapshot fixture authority and structural evidence privacy are proven by deterministic suites (no remote Neon/R2):

```bash
npm run test:headless-r2-same-snapshot-fixture
npm run test:headless-r2-evidence-privacy
npm run test:headless-r2-targeted-harness-authority
npm run test:headless-r2-targeted   # gate-off → NOT_TESTED; writes only TARGETED evidence
```

Targeted evidence: `docs/evidence/headless/current/HEADLESS_11E_R2_TARGETED_EVIDENCE.md`  
Fixture authority note: `docs/architecture/headless/HEADLESS_11E_R2_FIXTURE_AUTHORITY_2C1B.md`

```bash
# Future authorized targeted minimum chain (DO NOT RUN unless operator-authorized):
HEADLESS_R2_QA_TARGETED=1 DATABASE_URL='postgresql://…' \
  R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
  R2_BUCKET_ASSETS=… R2_BUCKET_ARTIFACTS=… R2_ENDPOINT=… \
  HEADLESS_ALLOWED_ORIGINS='https://…' \
  npm run test:headless-r2-targeted
```

### Exact future auth commands (do not run)

```bash
# Migrate (separate operator action — uses UNPOOLED only):
HEADLESS_NEON_MIGRATE=1 DATABASE_URL_UNPOOLED='postgresql://…' npm run migrate:headless-neon

# Live R2 durability matrix (after migrate + R2 configured):
HEADLESS_R2_QA=1 DATABASE_URL='postgresql://…' npm run test:headless-r2-live
```

## Final status markers

```text
SPRINT 11E PHASE 2C.1A/2C.1B R2 DURABILITY + FIXTURE/TARGETED AUTHORITY: READY FOR REVIEW
MIGRATION IDENTITY: RETAIN 004 (EXECUTABLE 000/001/002/004; 003 MARKDOWN ONLY)
NEON OWNED-OBJECT STORE: IMPLEMENTED / FIXTURE-TESTED / NOT LIVE
R2 TOCTOU REVISION AUTHORITY: LOCALLY VERIFIED
UPLOAD CAPABILITY TRUTH: DOCUMENTED + FIXTURE-TESTED
FINALIZED COVERAGE RECONCILE: LOCALLY VERIFIED
SAME-SNAPSHOT FIXTURE CORRECTION (2C.1B): IMPLEMENTED / DETERMINISTIC
R2 LIVE HARNESS: OFFICIAL FAIL ARCHIVED (PRE-2C.1B); DO NOT OVERWRITE
R2 TARGETED HARNESS: IMPLEMENTED / GATE-OFF NOT_TESTED / SEPARATE EVIDENCE PATH
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: PRODUCTION DEFAULT
NO COMMIT / NO PUSH
```
