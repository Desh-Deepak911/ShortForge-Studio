# Sprint 11E Phase 2E.2D.6E — Fly staged-secret activation and rollback authority (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Bridge:** NOT REQUESTED / NOT SOURCED  
**Machine creation:** NOT RUN  

## Root cause corrected (from 2E.2D.6D remote FAIL)

Verify-first deploy created the correct verify Machine topology, but all nine Fly secrets remained **Staged** — not **Deployed** to Machine runtime. Local bridge/schema preflight passed; remote worker failed `hosted.schema.preflight` (`database_unavailable`) and never reached `hosted.loop.started`.

## Secret lifecycle model

| Fly status | Meaning | Runtime-ready |
|------------|---------|---------------|
| `staged` | Names registered; not on running Machines | **Never** |
| `partial` | Mixed staged/deployed across exact-nine | **Never** |
| `deployed` | All nine deployed to Machine runtime | Required for runtime |
| `unknown` | Unbounded / unrecognized status | Fail closed |
| provider failure | `fly secrets list` failed or malformed JSON | Fail closed |

## Verify-first activation sequence (authority)

1. Deploy immutable image → exactly one verify Machine (`iad` / `shared` / 1 CPU / 2048 MB).
2. Prove topology from `fly machine list --json` (one verify, zero render).
3. Parse `fly secrets list --json` structurally (exact nine names, bounded statuses, no values).
4. If aggregate is `staged` or `partial`, run **exactly one**:
   `fly secrets deploy -a <staging-app> -c <verify-first-config>`
5. Do **not** rebuild or change the immutable image.
6. Wait for Machine update/restart; re-read secret status.
7. Require aggregate `deployed` before asserting runtime readiness.

Runtime success requires **both**:

- exact-nine `deployed` secret authority; and
- sanitized worker evidence: embedded schema preflight PASS + `hosted.loop.started`.

Never infer runtime secret availability from secret names alone, successful image deploy, Machine creation, local bridge classification, or local schema preflight.

## Rollback correction

- Replaced invalid `fly machine destroy -y` usage.
- Rollback uses exact IDs from authoritative inventory (`fly machine list -q`).
- Destroy: `fly machine destroy -a <staging-app> --force <ID>`.
- Prove exact-zero Machines after rollback.
- Provider failure during rollback → `unconfirmed`; never reported clean.

## Shared authority

| Surface | Module / shell |
|---------|----------------|
| TypeScript | `fly-staging-secret-activation.ts` |
| CLI (shell) | `fly-staging-secrets-json-cli.ts` |
| Shell orchestration | `fly_staging_verify_first_activate_staged_secrets` in `fly-staging-common.sh` |
| Verify-first gate | `fly-staging-verify-scale-up.sh` |

## Preserved evidence (unchanged)

| Item | SHA-256 |
|------|---------|
| 2E.2D.6D verify-first FAIL (`docs/HEADLESS_11E_PHASE2E2D6D_FLY_STAGING_VERIFY_FIRST.md`) | `6c64d223a9b61a00a14ed1f01e9b1461cc8d7f3d15369fc4f4bf32205fb536e2` |
| Prior verify-first FAIL (`docs/HEADLESS_11E_PHASE2E2D6_FLY_STAGING_VERIFY_FIRST.md`) | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |

## Staging state (unchanged)

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Machines | **0** |
| Immutable image | `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Verify-first remote rerun | **NOT RUN** (requires new bridge + re-authorization) |

## Privacy

No secret values, credential fragments, URLs, tokens, or provider dumps.
