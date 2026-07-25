# Sprint 11E Phase 2E.2D.6C — Staging public-environment authority correction (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Bridge:** NOT REQUESTED / NOT SOURCED  

## Root cause corrected

Verify-first orchestration sourced the exact-nine secret bridge but omitted trusted public staging initialization. `HEADLESS_ENV_NAME` is required for Upstash TCP classification and must never come from the credential bridge.

## Shared authority

| Surface | Module / shell |
|---------|----------------|
| TypeScript | `fly-staging-public-environment.ts` |
| Shell | `fly_staging_apply_public_environment` in `fly-staging-common.sh` |
| Orchestrator preflight | `fly-staging-local-classify-preflight.ts` |

Trusted public values (from local staging topology, not bridge):

- `HEADLESS_ENV_NAME=staging` (exact; rejects production/local/hostile)
- renderer build ID, binary paths, concurrency 1, graceful shutdown, workspace root
- `HEADLESS_HOSTED_IMAGE_CLASS=deployable_worker`

## Bridge boundary

- Membership remains exactly nine secret names.
- Bridge rejects `HEADLESS_ENV_NAME`, other public env keys, `HEADLESS_WORKER_MODE`, and gate env vars (`public_env_in_bridge`).
- Cleanup unsets secrets, public env, process mode, and gates on EXIT.

## Preserved evidence (unchanged)

| Item | SHA-256 |
|------|---------|
| Prior verify-first FAIL (`docs/HEADLESS_11E_PHASE2E2D6_FLY_STAGING_VERIFY_FIRST.md`) | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |
| Zero-consumer PASS | `a0b56da850138275a451b9ebf7e6db7ab32d9ff65aed800e5d22a32ab132650e` |

## Staging state (unchanged)

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Machines | **0** |
| Verify-first remote rerun | **NOT RUN** (requires new bridge + re-authorization) |

## Privacy

No secret values, credential fragments, URLs, tokens, or provider dumps.
