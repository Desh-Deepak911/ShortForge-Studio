# Sprint 11E Phase 2E.2D.6 — Verify-only first Fly staging deployment

**Status:** FAIL  
**Fail class:** `verify_first_template_missing` (local orchestrator repo-root misresolution before provider deploy)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T12:15:54Z`  
**End (UTC):** `2026-07-22T12:16:01Z`  
**Model:** `verify_only_first_deploy_from_immutable_image`

## Accepted zero-consumer input

| Item | Value |
|------|--------|
| Evidence | `docs/operations/headless/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.md` |
| SHA-256 | `a0b56da850138275a451b9ebf7e6db7ab32d9ff65aed800e5d22a32ab132650e` |
| Immutable digest | `sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |

## Authorization scope

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Org | `personal` |
| Configured region | `iad` |
| Gates | master execution + verify-first (+ rollback for fail path) |
| Render / 4K / routes | NOT AUTHORIZED / NOT RUN |
| Rebuild | NOT RUN |
| `.env.local` / commit / push | NOT DONE |
| Retry after failure | NOT PERFORMED |

## Preflight (before abort)

| Check | Result |
|------|--------|
| Bridge mode 0600 / exact nine keys | PASS |
| App exists | PASS |
| Machines before | **0** (authoritative list success) |
| Exact nine secret names | PASS |
| Image digest match to zero-consumer release | PASS |
| Local verify-first template materialize | **FAIL** — orchestrator sourced `fly-staging-common.sh` from `.tmp/` so `$0`-derived `FOOTIEBITZ_ROOT` resolved outside `footiebitz/`; `sed` could not open verify-first template |

## Provider deploy

| Step | Result |
|------|--------|
| `fly deploy --image … --ha=false` (verify-only) | **NOT REACHED** |
| Verify Machine created | **NO** |
| Render Machine | **0** (unchanged) |
| Remote region proof | **NOT PROVEN** (no Machine) |
| Schema preflight on worker | NOT REACHED |
| Verify-loop readiness | NOT REACHED |

## Failure handling / preserved state

| Action | Result |
|------|--------|
| Machine destroy / rollback | not required (no Machines created) |
| App preserved | **YES** |
| Secrets preserved | **YES** (exact nine) |
| Immutable image preserved | **YES** (registry digest unchanged; not redeployed) |
| Exact Machine inventory after | **0** |
| Bridge deleted on EXIT | PASS |
| Credentials / gates unset | PASS |

## Root cause

Local only. Not a Fly account, image, secret, or schema defect.

The one-shot orchestrator under `.tmp/` sourced `scripts/fly-staging/fly-staging-common.sh` before export of a correct `FOOTIEBITZ_ROOT`. With `$0` pointing at the `.tmp` orchestrator, root resolution walked out of `footiebitz/`, so the verify-first template path was wrong and the run aborted under `set -e` before the authorized `fly deploy`.

## Local hygiene (no second provider attempt)

`fly-staging-common.sh` now requires a valid `FOOTIEBITZ_ROOT` (honors a caller-exported root when already correct). Operator must supply a **new** 0600 bridge and re-authorize verify-first; this phase does not retry.

## Eligibility

**Not eligible** to treat verify-first as complete. Staging remains at the accepted zero-consumer preserved state (app + secrets + image, Machine count 0). Separate re-authorization required after a new bridge.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
