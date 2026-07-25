# Sprint 11E Phase 2E.2D.6G — canonical verify-first orchestrator authority (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Bridge:** NOT REQUESTED / NOT SOURCED  

## Problem corrected

Temporary `.tmp/run-2e2d*-verify-first.sh` wrappers caused locally invented drift (wrong root path, missing public env, nonexistent `fly_staging_source_bridge`). Remote execution must invoke the checked-in entrypoint only.

## Canonical entrypoint

| Item | Path |
|------|------|
| **Sole orchestrator** | `scripts/fly-staging/fly-staging-verify-first.sh` |
| Internal deploy step | `scripts/fly-staging/fly-staging-verify-scale-up.sh` (not invoked standalone for full flow) |
| Dry-run fixtures | `scripts/fly-staging/fixtures/*` |

Live usage (requires gates + 0600 bridge):

```sh
export HEADLESS_FLY_STAGING_BRIDGE_FILE=/path/to/bridge
export HEADLESS_FLY_STAGING_APP_NAME=shortforge-hw-staging-…
export HEADLESS_FLY_STAGING_IMAGE_REF='registry.fly.io/…@sha256:…'
export HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1
export HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP=1
export HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK=1
scripts/fly-staging/fly-staging-verify-first.sh
```

Dry-run (provider-free):

```sh
scripts/fly-staging/fly-staging-verify-first.sh --dry-run
```

## Bootstrap / bridge lifecycle

1. Bootstrap validates root, required functions (`fly_staging_load_bridge` exact name), app/region/image/templates — **no provider call, no secret read**.
2. Bridge surface validated (0600, exact nine names, no public/gate keys) — values never printed.
3. `fly_staging_accept_bridge` arms EXIT trap; only then `fly_staging_load_bridge` runs once.
4. Bootstrap failure **before accept** preserves bridge file.
5. Any failure **after accept** deletes bridge + unsets credentials/public/modes/gates on EXIT.

## Preserved evidence (unchanged)

| Item | SHA-256 |
|------|---------|
| 6D FAIL | `6c64d223a9b61a00a14ed1f01e9b1461cc8d7f3d15369fc4f4bf32205fb536e2` |
| 6D archive (pre-6F) | `6c64d223a9b61a00a14ed1f01e9b1461cc8d7f3d15369fc4f4bf32205fb536e2` |
| 6F FAIL | (see `docs/HEADLESS_11E_PHASE2E2D6F_FLY_STAGING_VERIFY_FIRST.md`) |
| Prior 2E.2D.6 FAIL | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |

## Staging state (unchanged)

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Machines | **0** |
| Secrets | nine names, **staged** |
| Immutable image | preserved in registry |
| Verify-first remote rerun | **NOT RUN** |

## Privacy

No secret values, credential fragments, URLs, tokens, or provider dumps.
