# Sprint 11E Phase 2G.25D-Cleanup Part C — Final Replacement Rollout Evidence (sanitized)

## Result

`gate=cleanup_runtime_rollout result=FAIL fail_class=execution_probe_failed rollback=confirmed`

One controlled forward deployment of replacement digest `e0224b93…` reached verify/render loop acceptance on schema 008. The single execution probe failed substantively (`FAIL_CONFIG` — QA secret contract incomplete when sourced from nine-key worker bridge only). One bridge rollback restored staging. **No authority promotion performed.**

## Branch and SHAs

| Item | Value |
|---|---|
| Branch | `release/staging-cleanup-runtime-2g25-final-rollout` |
| Base | `origin/staging` @ `85a7caa` (includes `07732a2`) |
| Forward target | `e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916` |
| Rollback pin | `7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206` |
| Rejected (forever) | `9570e9d9…` |
| Log | `/tmp/2g25c-rollout-dryrun.log` |

## Local/Fly attempt-state reconciliation

| Check | Result |
|---|---|
| Forward attempts for `e0224b93…` before rollout | 0 |
| Forward attempts for `e0224b93…` after rollout | 1 (budget exhausted) |
| Rejected digest blocked | yes |
| Bridge sole rollback pin | yes |
| Target never attached pre-rollout | yes |
| Post-rollback unified digest | bridge |
| `attempt_authority_incoherent` | no |

## Provider attempt ledger

| Step | Forward | Acceptance | Rollback | Notes |
|---|---|---|---|---|
| Part C forward | PASS (v50) | loops PASS | — | both machines on `e0224b93…` |
| Part C probe | — | FAIL `FAIL_CONFIG` | — | nine-key bridge insufficient for probe contract |
| Part C rollback | — | — | PASS (v51) | bridge restored |

## Pre/post topology

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Pre-rollout | 1 | 1 | 0 | iad | `7de23dbd…` | 49 |
| Post-forward | 1 | 1 | 0 | iad | `e0224b93…` | 50 |
| Post-rollback (final) | 1 | 1 | 0 | iad | `7de23dbd…` | 51 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Forward acceptance

| Check | Result |
|---|---|
| Single forward recorded | yes |
| Topology/IDs preserved | yes |
| Unified replacement digest | yes |
| Schema-008 preflight | PASS |
| Verify `hosted.loop.started` | PASS |
| Render `hosted.loop.started` | PASS |
| Cleanup renderer build ID accepted | yes |
| Maintenance disabled | yes |
| Public services | none |

## Rollback result

One rollback to independently materialized bridge pair (`7de23dbd…` + bridge008 build ID + `rollback_bridge_007_008`). Bridge verify preflight PASS after rollback.

## Schema-008 proof

Migrations `001`–`008` exact; `009+` absent; slot-key capacity `1024`; claims/outbox quiescent on forward and rollback paths.

## Loop and build-ID acceptance

Packaged cleanup build ID `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` accepted on both verify and render loops during forward window. No `invalid_renderer_build_id` observed.

## Execution probe

| Field | Value |
|---|---|
| Overall | FAIL |
| Eligibility | NOT ELIGIBLE — QA config missing or invalid |
| Root cause | `validateFlyRenderLiveQaEnvContract` failed with nine-key worker bridge; probe requires full eleven-key QA master contract |
| Retry | none (forbidden) |
| Cleanup | not_run |

## Authority state (unchanged)

- Replacement `e0224b93…`: prospective, **not current**, forward budget **exhausted**
- Bridge `7de23dbd…`: temporary **current**, rollback-eligible
- Rejected `9570e9d9…`: rejected/historical
- Maintenance: disabled
- R2 lifecycle: unchanged

## Resume point

Fix probe orchestration to materialize eleven-key QA master (not nine-key worker bridge alone) for execution probe phase, then open **new authorization** for a second forward attempt (requires explicit protocol amendment — budget for `e0224b93…` is exhausted after this attempt). Alternative: run probe-only phase against already-forwarded digest in a dedicated sub-phase if protocol permits probe without redeploy.
