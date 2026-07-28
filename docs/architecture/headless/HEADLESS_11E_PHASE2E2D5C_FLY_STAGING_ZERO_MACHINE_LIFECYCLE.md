# Sprint 11E Phase 2E.2D.5C — Fly staging zero-Machine lifecycle correction (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Zero-consumer release rerun:** NOT RUN  

## Accepted remote FAIL (unchanged)

| Item | Value |
|------|--------|
| Evidence | `docs/operations/headless/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.md` |
| SHA-256 | `9a6a16e0bdeb19ae3ccfe38afd49b5e9e2d549a6d34d0edf57dad01e753418de` |
| Status | remains **FAIL** (not rewritten as PASS) |
| Image push (that run) | proven then torn down — **not reusable** |

## Corrected zero-Machine authority

Mechanism: `build_only_release_then_exact_zero_machine_authority`  
Observation correction: Phase **2E.2D.5E** (`docs/architecture/headless/HEADLESS_11E_PHASE2E2D5E_PRE_FIRST_MACHINE_OBSERVATION_AUTHORITY.md`)

Success criteria for zero-consumer release:

1. Local materialized config validates; local `primary_region=iad`; local topology exact; no public services in local config  
2. App name / org match authorized staging inputs  
3. Exact nine secret names staged  
4. Remote build + push proven (manifest digest + `image: registry.fly.io/...` + `Building image done`)  
5. Bounded post-push Fly CLI zero-Machine noise tolerated **only** with that proof  
6. Exact `fly machine list` **command success** with **zero** entries  
7. No consumer / Machine / render / verify / queue / R2 execution  

**Not authority before first Machine:** `fly scale count` / `fly scale show` / `fly config show` / persisted `verify=0 render=0` Launch metadata.

**Region:** pre-first-Machine = configured + locally validated (`configured_local_not_remotely_observed`). Remote `iad` placement is observed only from the first verify Machine status in a separately authorized verify-first phase.

Provider error or malformed Machine list must **not** be treated as zero.

## First verify activation model

**Chosen:** `verify_only_first_deploy_from_immutable_image`

| Why | Detail |
|-----|--------|
| Truthful first deploy | A normal Launch deploy seeds ≥1 Machine per configured process group |
| Isolation | Verify-first template includes **only** `verify` — render cannot be seeded |
| Image | Uses accepted immutable `--image …@sha256:…`, `--ha=false`, no rebuild |
| Resources | `iad` / shared / 1 CPU / 2048 MB |
| Consistency | Stays on Fly Launch process-group authority (no unmanaged `fly machine run` mix) |

Template: `deploy/headless-worker/fly.staging.verify-first.template.toml`  
Full topology (verify+render, one image) remains in `fly.staging.template.toml`.

## Render activation boundary

- Separate gate: `HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP`
- Requires exact inventory **verify=1, render=0** before transition
- Later transition: full-topology deploy from the same immutable image
- Not part of zero-consumer release or verify-first authorization

## Rollback / teardown (pre-first-deploy safe)

| Action | Behavior |
|--------|----------|
| Rollback | Exact Machine list → destroy staging-app Machines → exact list zero; optional prior image via **build-only** push; never `fly scale count` |
| Teardown | Exact Machine list → destroy all → prove zero → `fly apps destroy` only `shortforge-hw-staging-*`; no Launch scale dependency |
| App outcome | Preserve vs destroy is the caller's authorized gate |

## Orchestrator hygiene (2E.2D.5E)

Pre-first-deploy scripts and zero-consumer orchestrators must not invoke or parse `fly config show`, `fly scale count`, or `fly scale show`. Region / public-service authority is local materialized configuration only. Optional `fly config show` after first Machine is diagnostic-only and must never invalidate zero-consumer success.

## Exact next operator step

1. Accept 2E.2D.5E local observation authority  
2. New 0600 bridge (prior bridges deleted)  
3. Explicit authorization for a fresh exact-zero-Machine release under 5E rules  
4. Do **not** authorize verify/render activation until that release PASSes with app+image preserved at exact zero Machines  

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps.
