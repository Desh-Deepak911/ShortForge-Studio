# Headless 11E cleanup-runtime live finalization failure postmortem (sanitized)

## Result

`gate=bridge_health_recovery result=PASS corrective_local_fix=applied no_forward_deploy=confirmed`

Bridge runtime on release v53 is healthy. Cleanup-runtime digest `e0224b93…` is permanently rejected after live owned-object finalization failure.

## Bridge health classification

**Outcome A — `operator_preflight_surface_mismatch`**

Fly machines on v53 report:

- `hosted.schema.preflight` ok (verify + render)
- `hosted.loop.started` ok (verify + render)
- unified bridge digest on both machines
- maintenance disabled

Post-probe rollback preflight falsely reported `hosted_status=invalid` because eleven-key QA REST credentials remained exported in the orchestrator shell after the execution probe. Hosted worker classification correctly rejects REST keys in worker surfaces. **No bridge recovery deploy was required.**

## Failed finalization sequence (authoritative)

| Order | Boundary | Outcome |
|---|---|---|
| 1 | artifact_upload_started | reached |
| 2 | artifact_upload_completed | succeeded |
| 3 | owned_object_finalize_started | expected; missing from ingested telemetry when finalize threw |
| 4 | owned_object_finalize_completed | failed — not emitted on exception path |
| 5 | terminal_failure_cas | not emitted on legacy path |
| 6 | cleanup_completed | ok after terminal disposition |

**Root cause:** `finalizeUploadedObject` failure/exception was folded into the shared upload `catch`, skipping finalize completion boundaries and mis-attributing terminal cleanup after upload success. Neon never reached `finalized` (`OWNED_OBJECT_FINALIZED_FAILED`).

**Not root cause:** scheduled maintenance (disabled), probe credential config (corrected in prior phase), R2 upload streaming (passed).

## Provider-state classifications (failed run window, read-only)

| Surface | Classification |
|---|---|
| Provisional owned object | staging with verification claim, not finalized |
| Finalize revision/CAS | not reached |
| Job terminal | failed after finalize rejection |
| Cleanup intent | orphan scheduling after terminal failure |
| R2 primary artifact | present at upload completion; terminal cleanup safe after failure |
| Run-owned leftovers | zero |

## Local correction

1. Dedicated finalize `try/catch` — finalize failures no longer reuse upload failure containment.
2. `classifyStorageFinalizeFailureSubstage` maps control-plane codes to safe finalize substages.
3. Finalize failure emits `owned_object_finalize_completed` before terminal cleanup.
4. Terminal failure CAS attribution added on finalize failure path.
5. Bridge rollback preflight isolates QA-only keys via `fly_staging_isolate_worker_bridge_preflight_env`.

## Rejected authority

| Digest | Status | Reason |
|---|---|---|
| `e0224b93…` | rejected / historical | `live_owned_object_finalization_failure` |
| `7de23dbd…` | temporary current + rollback | unchanged |
| `9570e9d9…` | rejected | unchanged |

No prospective replacement digest registered.

## Next step

Build-only push of a newly corrected cleanup-runtime image with a **new digest** after local gates and a new operator authorization protocol. Never redeploy rejected `e0224b93…`.
