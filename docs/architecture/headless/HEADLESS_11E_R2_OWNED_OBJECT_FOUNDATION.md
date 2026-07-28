# Sprint 11E Phase 2C.1 — R2 Owned-Object + Upload-Capability Foundation

**Status:** IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED  
**Branch:** `feature/sprint-11-headless-renderer`  
**Date basis:** 2026-07-20

## Prerequisite — Neon Phase 2B accepted

Official Neon live matrix **29/29 PASS** on dedicated staging.

- Evidence: `docs/evidence/headless/current/HEADLESS_11E_NEON_LIVE_EVIDENCE.md`
- SHA-256: `68b1f1422c8483c3ab3eb5e8157b5f00662508d86b0122ea2f8fca884e22c8fb`
- Schema migrations **000–002** accepted on that staging database
- Migration **004** (`headless_owned_objects`) is repository-ready; **not** remotely applied in this phase
- **Migration identity (2C.1A):** retain `004` — executable catalog IDs are `000,001,002,004`; `003` is non-executable CAS markdown (see `docs/architecture/headless/HEADLESS_11E_R2_DURABILITY_EVIDENCE.md`)

## What shipped

- Total R2 env classifier (`unconfigured` \| `configured` \| `invalid`) for `R2_*` + `HEADLESS_ALLOWED_ORIGINS`
- Discriminated durable owned-object records (staging / finalized / rejected / cleanup_pending)
- Server-side R2 object key authority (hashed identity segments; no raw filenames)
- Provider-neutral owned-object store port + in-memory QA adapter
- Presigned PUT/GET capability ports + R2 adapters (injectable; FakeS3 for unit tests)
- Design B trusted verification: full-object stream → incremental `sha256:` → atomic finalize
- SQL migration `004_headless_owned_objects.sql` (discovered; **not** applied remotely in this phase)

## Design B trust boundary

1. Control plane creates a **staging** owned-object metadata row and may issue a short-lived PUT capability.
2. Browser (or worker) uploads **direct to R2**. Bytes remain **untrusted**.
3. Verifier streams the **entire** object, computes full-object `sha256:<64 hex>`, checks length/MIME/identity/expiry.
4. Only then is durable metadata **finalized**. Partial/ranged shortcuts are rejected on the default path.
5. Render is **never** enqueued from this foundation.

## Env names (classified only)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`

No `.env.local` edits in this phase. Classifier never logs or returns secrets.

## Explicit non-goals / gates

| Gate | Status |
|------|--------|
| Remote R2 contact with real credentials | **NOT DONE** |
| Remote Neon migrate apply of `004` | **NOT DONE** |
| Production headless routes | **CONFIGURATION-BLOCKED** |
| Browser Export | **PRODUCTION DEFAULT** |
| Upstash / Fly | **NOT STARTED** |
| Production barrel exporting R2 AWS adapters / FakeS3 | **FORBIDDEN** (tests import direct paths) |

## Markers

```text
SPRINT 11E PHASE 2C.1 R2 OWNED-OBJECT FOUNDATION: READY FOR REVIEW
NEON DURABLE DATABASE AUTHORITY: ACCEPTED
R2 ADAPTER: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
TRUSTED FULL-OBJECT VERIFICATION: LOCALLY VERIFIED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: PRODUCTION DEFAULT
NO COMMIT / NO PUSH
```
