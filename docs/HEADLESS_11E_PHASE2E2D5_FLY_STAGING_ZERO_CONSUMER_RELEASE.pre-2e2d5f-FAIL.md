# Sprint 11E Phase 2E.2D.5D — Corrected exact-zero-Machine staging release

**Status:** FAIL  
**Fail class:** `wrong_region` (orchestrator post-success check against `fly config show` before first Machine)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T09:27:42Z`  
**End (UTC):** `2026-07-22T09:29:45Z`  
**Mechanism:** `build_only_release_then_exact_zero_machine_authority`

## Prior FAIL archive (byte-for-byte)

| Item | Value |
|------|--------|
| Archive path | `docs/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.pre-2e2d5d-FAIL.md` |
| SHA-256 | `9a6a16e0bdeb19ae3ccfe38afd49b5e9e2d549a6d34d0edf57dad01e753418de` |
| Prior phase | 2E.2D.5B FAIL (post-push CLI noise / false scale authority) |

## Accepted 5C authority (local)

| Item | Value |
|------|--------|
| Path | `docs/HEADLESS_11E_PHASE2E2D5C_FLY_STAGING_ZERO_MACHINE_LIFECYCLE.md` |
| SHA-256 | `1165706d7a171802f911b8896abf1a4dd8352815ef35acff262d5fbe71697cee` |
| Authority suite | **PASS (16)** |

## Authorization scope

| Item | Value |
|------|--------|
| App name | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Region | `iad` |
| Authorized gates | execution, app create, secrets install, image deploy, rollback, teardown |
| Verify-first / render deploy | NOT AUTHORIZED / NOT RUN |
| Consumers / queue / R2 / 4K / routes | NOT AUTHORIZED / NOT RUN |
| Launch `fly scale count/show` | NOT USED |
| `.env.local` / commit / push | NOT DONE |
| Retry after this failure | NOT PERFORMED |

## Accepted input hashes (reconfirmed)

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
| Schema preflight | **PASS** |
| Migration IDs | `000`, `001`, `002`, `004`, `005`, `006` |
| Checksum prefixes | `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451` |
| Migrations / DDL | NOT RUN |

## Fly release steps

| Step | Result |
|------|--------|
| App create | **PASS** |
| Exact Machine list = 0 after create | **PASS** |
| Public services | none |
| Secrets install (exact nine) | **PASS** |
| Secret-name matcher (`* NAME` Staged) | **PASS** |
| Exact Machine list = 0 after secrets | **PASS** |
| Image deploy (repo-root, remote-only, build-only, push) | **PASS** |
| Post-push CLI noise | absent (clean push exit) |
| Immutable manifest digest | `sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Exact Machine list = 0 after image deploy | **PASS** |
| Orchestrator `fly config show` contains `iad` | **FAIL** → `wrong_region` |
| App preserved | **NO** (fail-closed teardown) |

## Root cause

Not a Fly account, credential, schema, Dockerfile, or image-push defect.

Provider gates through image-deploy authority completed successfully under `build_only_release_then_exact_zero_machine_authority` (exact zero Machines; no Launch scale commands). The one-shot orchestrator then required `\biad\b` inside `fly config show` output. Before the first Launch Machine exists, that remote config surface is not a reliable carrier of `primary_region`, so the orchestrator false-failed and tore down a otherwise successful zero-Machine release.

Region `iad` was already proven locally via materialized template validation and operator `--primary-region iad` / app-create inputs.

## Failure handling

| Action | Result |
|------|--------|
| Exact-list destroy Machines | PASS (already zero) |
| Teardown only `shortforge-hw-staging-4def8fa0` | **PASS** (app absent verified) |
| Bridge deleted | PASS |
| Materialized config deleted | PASS |
| Credentials / gates unset | PASS |
| Retry | NOT PERFORMED |

## Eligibility verdict

**Not eligible** for separately authorized verify-only first deploy.

Image push and exact-zero Machine authority passed transiently, but the staging app was not preserved. Operator must supply a **new** 0600 bridge and re-authorize a fresh exact-zero-Machine release; orchestrators must not treat pre-first-Machine `fly config show` region text as a success gate.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
