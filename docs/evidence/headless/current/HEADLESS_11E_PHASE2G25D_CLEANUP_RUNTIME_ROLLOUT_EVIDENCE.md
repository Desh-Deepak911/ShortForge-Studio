# Sprint 11E Phase 2G.25D-Cleanup Part B — Controlled Rollout Evidence (sanitized)

## Result

`gate=cleanup_runtime_rollout result=BLOCKED`

Forward deployment to prospective cleanup-runtime digest `9570e9d9…` cannot pass hosted loop acceptance. The immutable Part A image bundles `hosted-worker.js` `c8061aee…`, which rejects `HEADLESS_RENDERER_BUILD_ID=headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` at runtime (`hosted.env.classified` → `invalid_renderer_build_id`). Repository fix on branch adds cleanup build ID to `acceptedBuildIds` (local rebuild hash `cf04d1c4…`); Part B forbids rebuild/push, so the frozen forward digest remains undeployable until Part A is repeated.

Staging recovered to bridge digest `7de23dbd…` with verify/render loops operational. No authority promotion performed.

## Branch and SHAs

| Item | Value |
|---|---|
| Branch | `release/staging-cleanup-runtime-2g25-rollout` |
| Base | `origin/staging` @ `28bcb0f` |
| Ancestry proof | `1c69109` is ancestor of `origin/staging` |
| Part A promotion | `1c69109` |
| Forward digest (blocked) | `9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60` |
| Rollback bridge | `7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206` |
| Forbidden 2G.24 | `d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68` (rejected) |
| Bundled worker (Part A image) | `c8061aeeb90d8d69b3350aaf273a045d3bb428d8e41a9251edaf654632ef7b51` |
| Fixed worker (local only) | `cf04d1c4657d105629f60d13ef3780047e5d7bbfb78a7b9b6910578a359e2c54` |

## Provider attempt ledger

| Attempt | Log | Forward | Post-forward acceptance | Rollback | Notes |
|---:|---|---|---|---|---|
| 1 | `/tmp/2g25-rollout-live.log` | PASS | FAIL `verify_loop_not_started` | bridge confirmed | pre hosted-env repo fix |
| 2 | `/tmp/2g25-rollout-live2.log` | PASS | FAIL `execution_probe_failed` | bridge confirmed | probe without QA bridge |
| 3 | `/tmp/2g25-rollout-live3.log` | PASS | FAIL `verify_loop_not_started` | bridge confirmed | forward skip bug (fixed) |
| 4 | `/tmp/2g25-rollout-live4.log` | — | preflight topology stopped | — | machines stopped |
| 5 | `/tmp/2g25-rollout-live5.log` | PASS | FAIL `verify_loop_not_started` | bridge confirmed | remote `invalid_renderer_build_id` |
| recovery | manual | — | — | bridge confirmed | post-debug cleanup digest rollback |

## Pre/post topology

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Pre-rollout baseline | 1 | 1 | 0 | iad | `7de23dbd…` | 45 |
| Post-forward (attempt 5) | 1 | 1 | 0 | iad | `9570e9d9…` | 46 |
| Post-rollback (final) | 1 | 1 | 0 | iad | `7de23dbd…` | 47 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Forward deployment

- Single rolling deploy per attempt; no rebuild or registry push.
- Topology and VM shapes preserved.
- Maintenance explicitly disabled in materialized env (`HEADLESS_EXPORT_MAINTENANCE_ENABLED=0`).
- Post-deploy topology digest unified on cleanup image, but Fly logs show repeated `invalid_renderer_build_id` exits; `hosted.loop.started` never observed within observation window.

## Rollback

- One bridge rollback per failed attempt to independently materialized pair (`7de23dbd…` + bridge008 build ID + compatibility mode).
- Final manual recovery rollback confirmed both machines on bridge digest with `hosted.loop.started` on verify and render.

## Schema-008 proof

- Read-only preflight: migrations `001`–`008` exact; `009+` absent; slot-key capacity `1024`.
- Claims and outbox quiescent on all attempts.
- Strict mode for cleanup forward; `rollback_bridge_007_008` for bridge rollback.

## Loop and log acceptance

| Check | Cleanup forward | Bridge rollback |
|---|---|---|
| verify `hosted.loop.started` | FAIL | PASS |
| render `hosted.loop.started` | FAIL | PASS |
| fatal/schema/unexpected exit | `invalid_renderer_build_id` | none |
| public services | none | none |

## Maintenance-disabled proof

- Materialized forward and rollback toml: `HEADLESS_EXPORT_MAINTENANCE_ENABLED=0`.
- No maintenance scheduler ownership or cleanup batch observed in observed logs.

## Execution probe

Not attempted on final attempt (blocked at verify loop). Attempt 2 failed substantively (`FAIL_CONFIG` / incomplete QA bridge) before root cause isolation.

## Authority state (unchanged)

- Cleanup-runtime `9570e9d9…`: **prospective**, not current, not runtime-ready for live deploy without worker rebuild.
- Bridge `7de23dbd…`: temporary **current**, sole rollback pin.
- 2G.24 `d38e45e2…`: historical, schema-008-ineligible, rejected as rollback candidate.

## Resume point

1. **Part A repeat (build-only):** merge `hosted-environment` cleanup build ID acceptance; rebuild/push new immutable digest; register prospective authority with new worker hash `cf04d1c4…` (page/BUILD_INFO unchanged).
2. **Part B retry:** controlled rollout of new digest with bridge rollback pin unchanged.
3. **Part E (after probe PASS):** promote cleanup to current; demote bridge to historical rollback-eligible only.
4. **Final phase:** maintenance and R2 lifecycle activation (explicitly out of scope for 2G.25D).

---

## Part B-R correction (2026-07-31)

Original Part B evidence preserved above. Part B-R reconciled the incident ledger, rejected `9570e9d9…`, built replacement digest `e0224b93…`, and added persistent attempt-budget + packaged-startup gates.

### Reconciled incident ledger

| Metric | Confirmed count |
|---|---|
| Authorized forward limit | **1** |
| Actual forward cleanup deployments | **3** (Fly v44, v46, v48 — not 4) |
| Bridge rollback deployments (scripted) | **4** (live1, live2, live3, live5) |
| Manual bridge recovery | **1** (v49) |
| Preflight-only (stopped) | **1** (live4 topology_classification_failed) |
| Failed acceptance checks | **4** substantive |
| `protocol_compliance` | **`deviated`** |
| Staging ultimately recovered | yes, on bridge |
| Schema/data unchanged | yes |
| Maintenance never enabled | yes |

### Authority corrections

- `9570e9d9…`: **rejected/historical**, reason `invalid_renderer_build_id_packaged_worker`, not deployable
- `e0224b93…`: **replacement prospective**, build-only push complete, not current
- Bridge `7de23dbd…`: temporary **current**, sole rollback pin (release v49)

See `HEADLESS_11E_PHASE2G25D_CLEANUP_RUNTIME_REPLACEMENT_BUILD_ONLY_EVIDENCE.md` for replacement build-only proof.
