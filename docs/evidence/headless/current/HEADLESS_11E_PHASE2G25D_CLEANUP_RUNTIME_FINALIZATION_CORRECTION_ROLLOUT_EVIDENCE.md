# Sprint 11E Phase 2G.25D-Cleanup Part F — Finalization Correction Rollout Evidence (sanitized)

## Result

`gate=cleanup_runtime_rollout result=FAIL fail_class=execution_probe_failed rollback=confirmed`

One controlled forward deployment of correction digest `41df9b44…` reached verify/render loop acceptance on schema 008. The single execution probe failed before job creation (`FAIL_TELEMETRY_IMAGE` — render image authority rejected with `historical_lifecycle_not_current_ready` because the correction record was historical / not probe-eligible). One bridge rollback restored staging. **No authority promotion performed. No second forward authorized.**

## Branch and SHAs

| Item | Value |
|---|---|
| Branch | `release/staging-cleanup-runtime-finalization-rollout` |
| Base | `origin/staging` @ `9b58dc4` (includes `450c794`) |
| Forward target | `41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde` |
| Rollback pin | `7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206` |
| Rejected (preserved) | `e0224b93…`, `9570e9d9…`, `d38e45e2…` |
| Log | `/tmp/cleanup-runtime-rollout-part-f.log` |

## Attempt-state reconciliation

| Check | Result |
|---|---|
| Forward attempts for `41df9b44…` before rollout | 0 |
| Forward attempts for `41df9b44…` after rollout | 1 (budget exhausted) |
| Rollback attempts this phase | 1 (PASS) |
| Rejected digests blocked | yes |
| Bridge sole rollback pin | yes |
| Target never attached pre-rollout | yes |
| Post-rollback unified digest | bridge `7de23dbd…` |

## Provider attempt ledger

| Step | Forward | Acceptance | Rollback | Notes |
|---|---|---|---|---|
| Part F forward | PASS (v54) | loops PASS | — | both machines on `41df9b44…` |
| Part F probe | — | FAIL `FAIL_TELEMETRY_IMAGE` | — | closed before job creation |
| Part F rollback | — | — | PASS (v55) | bridge restored |

## Before/after topology

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Pre-rollout | 1 | 1 | 0 | iad | `7de23dbd…` | 53 |
| Post-forward | 1 | 1 | 0 | iad | `41df9b44…` | 54 |
| Post-rollback (final) | 1 | 1 | 0 | iad | `7de23dbd…` | 55 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.
Render VM remains performance / 4 CPU / 8192 MB. No public services.

## Forward rollout acceptance

| Check | Result |
|---|---|
| Single forward recorded | yes |
| Topology/IDs preserved | yes |
| Unified correction digest | yes |
| Schema-008 strict preflight | PASS |
| Verify `hosted.loop.started` | PASS |
| Render `hosted.loop.started` | PASS |
| Cleanup renderer build ID accepted | yes |
| Maintenance disabled | yes |
| Public services | none |

## Execution probe

| Field | Value |
|---|---|
| Overall | FAIL |
| Eligibility | `FAIL_TELEMETRY_IMAGE` |
| Underlying reasonId | `historical_lifecycle_not_current_ready` |
| Safe rejection classification | `probe_ineligible_historical_lifecycle` |
| Stages reached | none (closed before job creation) |
| Finalization boundaries | none |
| Cleanup | `not_run` |
| Retry | not authorized |

Official FAIL probe evidence SHA-256:

```text
cab603789d182bfdb89abe1d0c593dbf0049278093403e4843dc48369b760609
```

Pre-rollout official probe archive (byte-identical copy before Part F overwrite):

```text
docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-2g25d-finalization-correction-rollout-fbfd796168f437d1bed63f1682dc3f3f72c13e24d44e4c5ba69af000148f4121.md
```

## Gate-off preservation

Not run (PASS-only).

## Rollback result

One rollback using independently materialized bridge pair (`7de23dbd…` + bridge008 build ID + `rollback_bridge_007_008`). Both machines started in `iad` on bridge digest. Topology 1/1/0 preserved. Maintenance disabled.

## Authority lifecycle changes

| Digest | Lifecycle | Notes |
|---|---|---|
| `41df9b44…` | rejected / historical | `probe_ineligible_historical_lifecycle`; record `post_008_2g25_cleanup_runtime_finalization_correction_rejected` |
| `7de23dbd…` | temporary current + rollback-eligible | unchanged |
| `e0224b93…` | rejected | preserved |
| `9570e9d9…` | rejected | preserved |
| `d38e45e2…` | forbidden | preserved |

No promotion of `post_008_2g25_cleanup_runtime_finalization_correction_current`.
No maintenance activation. R2 lifecycle unchanged.

## Schema-008 proof

Migrations `001`–`008` exact; migration `008` checksum `5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de`; `009+` absent; slot-key capacity `1024`.

## Root cause (authority)

Part E registered the correction as prospective/historical with `eligibleForRenderLiveHarness=false` / not probe-eligible. Part F requires a probe-eligible render image before job creation, while Part J promotes only after probe PASS — the probe closed on `FAIL_TELEMETRY_IMAGE` without exercising the production path.

## Exact remaining step

Authorize a **new** cleanup-runtime image / authority protocol that resolves the probe-eligibility gate without redeploying rejected `41df9b44…`. No second forward of this digest.
