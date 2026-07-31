# Sprint 11E Phase 2G.25D-Cleanup Part F.1 — Candidate probe authority correction

## Defect classification

```text
rollout_candidate_lifecycle_missing
```

## Circular authority

1. Prospective / historical cleanup-runtime images were registered as:
   - `current=false`
   - `runtime-ready=false`
   - `probe-eligible=false`

2. Authority promotion to current required a successful execution probe.

3. The ordinary execution probe required a current / runtime-ready / probe-eligible
   render image (`lifecycle === "current"`, else `historical_lifecycle_not_current_ready`).

Therefore no prospective image could ever satisfy promotion.

## Sealed 41df9b44… incident facts

| Fact | Value |
|---|---|
| Deployment acceptance | PASS |
| Verify/render loops | PASS |
| Schema 008 | PASS |
| Maintenance | disabled |
| Probe job created | false |
| Production path exercised | false |
| Rejection reason | `probe_ineligible_historical_lifecycle` only |
| Underlying probe reason | `historical_lifecycle_not_current_ready` |
| Renderer failure claimed | false |

## Correction

Introduce fail-closed lifecycle `deployed_validation_candidate` with a separate
candidate-validation probe selector and operator gate
`HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION=1`. Ordinary current-image probes remain
unchanged.

## Recovery decision

```text
READY_FOR_ONE_TIME_CANDIDATE_RECOVERY
```

Safe because rejection was lifecycle/authority-only, forward acceptance and loops
passed, no job/render path ran, packaged hashes matched, rollback succeeded, and
the sealed rejection event remains immutable. Recovery requires an explicit
one-time protocol-recovery authorization that references incident commit
`7bd84c3` and does not erase the first forward.

No provider operation is authorized by this phase.
