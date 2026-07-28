# Sprint 11E Phase 2E.2D.6A — Orchestrator root-path authority correction (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Bridge:** NOT REQUESTED / NOT SOURCED  

## Preserved remote FAIL (unchanged)

| Item | Value |
|------|--------|
| Path | `docs/architecture/headless/HEADLESS_11E_PHASE2E2D6_FLY_STAGING_VERIFY_FIRST.md` |
| SHA-256 | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |
| Status | remains **FAIL** (not rewritten) |
| Defect corrected here | `$0` from `.tmp` orchestrator redirected `FOOTIEBITZ_ROOT` away from repository root |

## Canonical root authority

| Rule | Implementation |
|------|----------------|
| Exported root honored when valid | `FOOTIEBITZ_ROOT` validated before any Fly path resolution |
| Never use caller `$0` | `fly-staging-common.sh` rejects `$0`-based fallback |
| Script-location fallback | Official scripts set `FLY_STAGING_COMMON_DIR`; orchestrators may set `FLY_STAGING_COMMON_SH` |
| Fail closed | Blank, relative, missing, wrong-package, or missing-marker roots abort before provider contact |

Validated markers under repository root:

- `package.json` (`name: footiebitz`)
- `scripts/fly-staging/fly-staging-common.sh`
- `deploy/headless-worker/fly.staging.template.toml`
- `deploy/headless-worker/fly.staging.verify-first.template.toml`
- `deploy/headless-worker/Dockerfile`
- `dist/headless-worker/hosted-worker.js`

All Fly staging scripts resolve templates, Dockerfile, artifacts, and materialized configuration through the same canonical `FOOTIEBITZ_ROOT`.

## Fixture coverage (local)

- `.tmp` orchestrator + valid exported `FOOTIEBITZ_ROOT` → verify-first template resolves at exact repository path
- Sourcing from `/tmp` with `FLY_STAGING_COMMON_DIR` → script-location fallback succeeds
- Caller `$0` under `.tmp` with only `FLY_STAGING_COMMON_SH` → cannot redirect resolution
- Relative / blank / missing / wrong-package / parent-path exported roots → fail closed with no Fly CLI
- Authority suite extended with Phase 2E.2D.6A fixtures

## Staging state (unchanged)

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Machines | **0** (preserved) |
| Verify-first remote rerun | **NOT RUN** |

## Privacy

No secret values, credential fragments, URLs, tokens, or provider dumps.
