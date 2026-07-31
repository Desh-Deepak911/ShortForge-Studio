# Sprint 11E Phase 2G.25D-Cleanup Part C-R — Probe Credential Repair Evidence (sanitized)

## Result

`gate=cleanup_runtime_rollout result=FAIL fail_class=execution_probe_failed rollback=attempted`

Eleven-key QA probe credential surface correction succeeded. Amended forward deployment reached verify/render loop acceptance. Execution probe progressed through job create, enqueue, claim, Chromium, FFmpeg, and R2 upload, then failed substantively at `owned_object.finalized` (`OWNED_OBJECT_FINALIZED_FAILED`). **No promotion performed.** Forward budget for `e0224b93…` is **exhausted (2/2)**.

## Probe credential root cause (Part C)

Part C failed because the rollout script sourced execution probe env from the nine-key worker bridge. `validateFlyRenderLiveQaEnvContract` requires all eleven QA keys including Upstash REST credentials for job creation.

## Part C-R correction

- Added `materialize-qa-probe-env` (eleven keys + public pins, no probe gate in file)
- Added mandatory `probe-config` gate before provider contact
- Probe phase loads `QA_PROBE_BRIDGE`, not `WORKER_BRIDGE`
- Sealed authorization amendment: `operator_probe_credential_surface_correction`, limit 2, one additional forward

## Authorization amendment ledger

| Field | Value |
|---|---|
| Original limit | 1 |
| Original forwards used | 1 (loops PASS, probe config FAIL) |
| Amended limit | 2 |
| Additional authorization | 1 |
| Forwards consumed post-amendment | 2 total |
| Remaining | **0** |
| Further amendment | forbidden |

## Pre/post topology

| Phase | digest | release |
|---|---|---|
| Pre-amended forward | bridge | 51 |
| Post-amended forward | `e0224b93…` | 52 |
| Post-probe rollback (attempted) | bridge | 53 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Forward loop acceptance (amended attempt)

PASS — unified cleanup digest, schema-008 strict, verify/render loops started, maintenance disabled.

## Execution probe stage table

| Stage | Result |
|---|---|
| job.create_queued | PASS |
| dispatch_outbox.intent | PASS |
| upstash.enqueue_render | PASS |
| hosted.render_claim | PASS |
| hosted.chromium_execution | PASS |
| hosted.ffmpeg_execution | PASS |
| r2.streamed_artifact_upload | PASS |
| owned_object.finalized | **FAIL** |
| job.succeeded_cas | NOT_TESTED |
| artifact.download_verify | NOT_TESTED |
| replay.idempotent | NOT_TESTED |

Log: `/tmp/2g25cr-rollout.log`

## Authority state (unchanged)

- Cleanup `e0224b93…`: prospective, budget exhausted, not promoted
- Bridge `7de23dbd…`: temporary current
- Rejected `9570e9d9…`: rejected
- Maintenance: disabled

## Resume point

Investigate `owned_object.finalized` / `OWNED_OBJECT_FINALIZED_FAILED` on cleanup-runtime worker (schema-008 path). No further forward attempts authorized without new operator protocol. No image rebuild authorized in this phase.
