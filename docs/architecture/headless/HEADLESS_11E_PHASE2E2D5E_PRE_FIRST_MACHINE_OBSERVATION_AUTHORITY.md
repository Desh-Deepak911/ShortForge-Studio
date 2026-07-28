# Sprint 11E Phase 2E.2D.5E — Pre-first-Machine observation authority correction (local)

**Status:** PASS (local authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Provider contact:** NOT AUTHORIZED / NOT RUN  
**Bridge:** NOT REQUESTED / NOT SOURCED  

## Preserved remote FAIL (unchanged)

| Item | Value |
|------|--------|
| Path | `docs/operations/headless/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.md` |
| SHA-256 | `0047bfbc79e5f80937e5cab4d7518ee75d016a5862eed51efd00de9d3d708a10` |
| Status | remains **FAIL** (not rewritten) |
| Defect corrected here | Invalid requirement that pre-first-Machine `fly config show` contain `iad` |

## Removed observer dependencies

Pre-first-Machine zero-consumer success, region, topology, and public-service gates must **not** invoke or parse:

- `fly config show`
- `fly scale count`
- `fly scale show`

Public-service and region checks use **local** materialized Fly configuration only.

`fly config show` may appear only as an optional **post-first-Machine** diagnostic (verify-first script). Its absence, failure, or unexpected formatting must never invalidate zero-consumer success.

## Exact pre-first zero-consumer success authority

1. Local materialized Fly configuration validates successfully  
2. App name and organization match authorized staging inputs  
3. Local `primary_region` is exactly `iad`  
4. Local process/resource topology is exact and contains no public services  
5. Exact nine secret names are staged  
6. Remote image build and push are proven with an immutable digest  
7. Exact Fly Machine inventory succeeds and is empty  
8. No consumer, Machine, render, verification, queue, or R2 execution  

## Configured region vs remotely observed region

| Phase | Region truth |
|-------|----------------|
| Zero-consumer (pre-first Machine) | `iad` is **configured and locally validated** — `configured_local_not_remotely_observed` |
| Verify-first (separately authorized) | Remote placement in `iad` established from the first verify Machine’s authoritative Machine status — `remotely_observed_from_verify_machine` |

Zero-consumer evidence must **not** claim remotely observed region.

## Exact next operator step

After local acceptance of this phase: request a **new** 0600 bridge and separately authorize one exact-zero-Machine remote release under the corrected observation rules. Do not authorize verify-first until that release PASSes with app+image preserved.

## Privacy

No secret values, credential fragments, URLs, tokens, or provider dumps.
