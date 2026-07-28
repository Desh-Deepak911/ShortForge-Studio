# Sprint 11E Phase 2E.2D.5F — Corrected exact-zero-Machine staging release

**Status:** PASS  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T12:07:53Z`  
**End (UTC):** `2026-07-22T12:09:17Z`  
**Mechanism:** `build_only_release_then_exact_zero_machine_authority`  
**Region authority:** `configured_local_not_remotely_observed`

## Prior FAIL archive (byte-for-byte)

| Item | Value |
|------|--------|
| Archive path | `docs/evidence/headless/archive/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.pre-2e2d5f-FAIL.md` |
| SHA-256 | `0047bfbc79e5f80937e5cab4d7518ee75d016a5862eed51efd00de9d3d708a10` |
| Prior phase | 2E.2D.5D FAIL (invalid pre-first-Machine `fly config show` region gate) |

## Local authority inputs

| Item | Value |
|------|--------|
| 2E.2D.5E observation authority | PASS (17 fixtures) |
| Pre-first forbidden CLI (`fly config show` / `fly scale count` / `fly scale show`) | ABSENT from executable scripts |
| Local materialized config validate | PASS |
| Local `primary_region` | `iad` |
| Local public services | none |

## Authorization scope

| Item | Value |
|------|--------|
| App name | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Configured region | `iad` |
| Authorized gates | execution, app create, secrets install, image deploy, rollback, teardown |
| Verify-first / render | NOT AUTHORIZED / NOT RUN |
| Consumers / queue / R2 / 4K / routes | NOT AUTHORIZED / NOT RUN |
| `.env.local` / commit / push | NOT DONE |

## Accepted artifact hashes (reconfirmed)

| Artifact | SHA-256 | Result |
|----------|---------|--------|
| 2E.2D.3 sandbox evidence | `083e3d27cac72a1537a15dc2189a321deb54b6efc1d8c668345595dbbdfc3d17` | MATCH |
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` | MATCH |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` | MATCH |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` | MATCH |
| Dockerfile | `13c36f2c18c43cf70b144b2bf42f0088f54b68c4a8a1e67e32b1eade36c59b3a` | MATCH |

## Local classification + schema preflight

| Check | Result |
|------|--------|
| Neon / R2 / Upstash TCP / hosted | all `configured` |
| Schema preflight | **PASS** (no DDL / migrations) |
| Migration IDs | `000_headless_schema_migrations`, `001_headless_project_ownership`, `002_headless_jobs`, `004_headless_owned_objects`, `005_headless_cleanup_intents`, `006_headless_render_dispatch_outbox` |
| Checksum prefixes | `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451` |

## Fly release steps

| Step | Result |
|------|--------|
| App create | **PASS** (was absent) |
| Exact Machine list = 0 after create | **PASS** |
| Public services (local materialize) | none |
| Secrets install (exact nine) | **PASS** |
| Secret-name matcher (`* NAME` Staged) | **PASS** |
| Exact Machine list = 0 after secrets | **PASS** |
| Image deploy (repo-root, remote-only, build-only, push) | **PASS** |
| Post-push CLI noise | absent |
| Immutable manifest digest | `sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Exact Machine list = 0 after image deploy | **PASS** |
| App preserved | **YES** |
| Teardown | skipped (success preserve) |

## Final preserved state

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` **preserved** |
| Secrets | exact nine names staged |
| Image | immutable digest above (`deployable_worker`) |
| Machines | **0** (authoritative list success) |
| Process groups executing | none |
| Region | configured local `iad` — **not** remotely observed |
| Verify-first | NOT RUN |
| Render | NOT AUTHORIZED |

## Cleanup

| Item | Result |
|------|--------|
| Bridge deleted | PASS |
| Materialized config deleted | PASS |
| Credentials / gates unset | PASS |

## Eligibility verdict

**Eligible** for a separately authorized verify-only first deploy, subject to:

1. Explicit new authorization gates for verify-first only  
2. Operator-supplied `HEADLESS_FLY_STAGING_IMAGE_REF` including this immutable digest  
3. New or re-validated 0600 bridge if prior bridge was deleted (this run deleted the bridge on EXIT)  

Render deployment remains unauthorized.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
