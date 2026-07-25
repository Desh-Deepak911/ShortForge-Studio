# Sprint 11E Phase 2E.2D.6D — Verify-only first Fly staging deployment

**Status:** FAIL  
**Fail class:** `startup_logs_failed_final` (remote schema preflight `database_unavailable`; verify loop not reached)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T12:38:18Z`  
**End (UTC):** `2026-07-22T12:40:36Z` (+ manual Machine destroy to complete rollback)  
**Model:** `verify_only_first_deploy_from_immutable_image`

## Accepted authorities (local)

| Authority | Result |
|-----------|--------|
| Zero-consumer evidence SHA `a0b56da8…` | honored |
| Root-path authority (6A) | PASS |
| Shared public-environment authority (6C) | PASS |
| Machines before deploy | **0** |

## Preflight (local)

| Step | Result |
|------|--------|
| Canonical `FOOTIEBITZ_ROOT` | PASS |
| Bridge 0600 / exact nine secrets / no public keys | PASS |
| `fly_staging_apply_public_environment` | PASS |
| `HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify` | PASS |
| Neon / R2 / Upstash TCP / hosted classify | all **configured** |
| Embedded six-migration schema preflight (local, no DDL) | **PASS** |
| Exact staged secret names on app | PASS |
| Verify-first config materialized (no public services) | PASS |
| Immutable digest match | PASS |

## Deployment

| Step | Result |
|------|--------|
| `fly deploy --image … --ha=false` (no rebuild) | **PASS** |
| Verify Machine created | **YES** (`080e9612c97028`) |
| Process / region / resources | verify / **iad** / shared / 1 CPU / 2048 MB |
| Render Machines | **0** |
| Public services | none |
| `region_authority` | `remotely_observed_from_verify_machine` (inventory) |

## Post-deploy observation (FAIL)

| Check | Result |
|------|--------|
| Deployable image / env classify | PASS (logs) |
| Binary preflight | PASS |
| Adapter composition | PASS |
| Remote schema preflight | **FAIL** — `database_unavailable` |
| Verify consumer loop | **NOT REACHED** |
| Restart behavior | exit code 1 + on-failure restart during window |

Bounded log attribution (sanitized): worker reached `hosted.schema.preflight` with `status=failed`, `reasonId=database_unavailable`, then `hosted.process.exit` with `schema_database_unavailable`. Local operator preflight succeeded against bridge-sourced credentials; Fly app secrets remained **Staged** (not deployed to the Machine runtime).

## Failure handling

| Action | Result |
|------|--------|
| Orchestrator rollback script | best-effort FAIL |
| Manual Machine destroy | **PASS** (`080e9612c97028` destroyed) |
| Exact Machine inventory after | **0** |
| App preserved | **YES** |
| Secrets preserved (nine names, staged) | **YES** |
| Immutable image preserved | **YES** |
| Bridge deleted on EXIT | PASS |
| Materialized config deleted | PASS |
| Credentials / public env / gates unset | PASS |

## Prior verify-first FAIL evidence

| Item | Status |
|------|--------|
| `docs/HEADLESS_11E_PHASE2E2D6_FLY_STAGING_VERIFY_FIRST.md` | **unchanged** (archived FAIL from 2E.2D.6; not replaced — this run also FAIL) |

## Ongoing Fly cost exposure

**None after rollback** — verify Machine destroyed; zero Machines.

## Next operator step

Do **not** retry this phase. A future authorized attempt needs a new 0600 bridge and must ensure Fly secrets are **deployed** to the Machine runtime (not merely staged) before or as part of verify-first activation. Render staging preparation remains separately unauthorized.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps.
