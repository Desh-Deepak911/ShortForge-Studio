# Sprint 11E Phase 2E.2D.7A.2 — Hosted verifier read-only observation + fail-path cleanup

**Phase type:** Local authority correction — no provider contact  
**Prerequisite:** Phase 7A.1 eleven-key QA contract; archived live FAIL evidence preserved  

## Defect corrected

Live matrix reached `owned_object.finalized` PASS and remote worker logs showed `hosted.loop.delivery action=verified_waiting_for_coverage`, but `coverage.reconciled` FAILed because `pollHostedVerifierState` invoked `reconcileFinalizedOwnedObjectCoverage` (mutating CAS) instead of read-only Neon observation. The hosted worker had already reconciled; the harness observer masked durable state.

Preserved FAIL evidence archive (byte-identical):

- Path: `docs/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.pre-2e2d7a2-coverage-fail-0617b7daa538620713d50e6d8c94c9a40434d5d464be6417507bbdb8a4edd292.md`
- SHA-256: `0617b7daa538620713d50e6d8c94c9a40434d5d464be6417507bbdb8a4edd292`

## Read-only observation

`observeHostedVerifierState` / `pollHostedVerifierState`:

- Never calls `reconcileFinalizedOwnedObjectCoverage` or any mutation/CAS API
- Performs bounded read-only polling of authoritative Neon job + owned-object rows
- Does not use harness `nowMs` for observation authority (live wall clock for poll intervals only)

### Durable incomplete-coverage snapshot (`validateDurableIncompleteCoverageSnapshot`)

- Finalized owned object; verification claim cleared
- Durable job remains provisional
- Required targets: `manifest` + `asset_bundle_record`
- Manifest verified target present; `asset_bundle_record` absent → coverage incomplete
- Exactly one manifest staging ref; locator/digest/byte length/MIME agree with finalized object
- No canonical promotion; render-dispatch outbox absent; no render queue delivery tracked

Cases `coverage.reconciled`, `coverage.incomplete`, `promotion.not_run`, and `render_dispatch.absent` share this read-only authority.

Safe observation attribution (`observation_status` only — no digests, URLs, keys, rows, or credentials).

## Fail-path cleanup

Gate-on harness runs cleanup in a **finally** block before evidence finalization for every outcome (prefix FAIL, runner exception, PASS). `cleanupStatus` is independently `ok` | `failed` | `preserved` — never `not_run` after gate-on execution that created a run context.

Prefix-case stop-on-first-FAIL semantics unchanged; `cleanup.complete` case may remain `NOT_TESTED` on prefix FAIL while `cleanupStatus` records actual finally cleanup.

## Cleanup recovery (separate gate)

Gate: `HEADLESS_FLY_VERIFY_QA_CLEANUP_RECOVERY=1`

- Discovers exactly one run in archived evidence time window with `fvl_owner_*` / `fly-verify-live-*` identities
- Preview safe counts only; refuses zero/multiple/ambiguous/malformed/cross-owner matches
- Writes `docs/HEADLESS_11E_FLY_VERIFY_LIVE_CLEANUP_RECOVERY_EVIDENCE.md` only — never overwrites official live evidence
- Live delete execution requires **separate authorization** (not run in this phase)

## Authority modules

| Module | Role |
|--------|------|
| `fly-verify-live/hosted-verifier-observer.ts` | Read-only observation + snapshot validation |
| `fly-verify-live/cleanup-recovery.ts` | Gated discovery + leftover verification |
| `headlessFlyVerifyLiveObservationAuthority.verify.ts` | Observation + finally cleanup fixtures |
| `headlessFlyVerifyLiveCleanupRecoveryAuthority.verify.ts` | Recovery discovery fixtures |

## Verification (local)

```bash
npm run test:headless-fly-verify-live-observation-authority
npm run test:headless-fly-verify-live-cleanup-recovery-authority
npm run test:headless-fly-verify-live-harness-authority
npm run test:headless-fly-verify-live-environment-contract-authority
```

Live matrix **not rerun** in this phase. Request separate authorization for cleanup recovery execution against staging providers.
