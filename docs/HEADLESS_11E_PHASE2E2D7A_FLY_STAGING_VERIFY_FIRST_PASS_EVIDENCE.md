# Sprint 11E Phase 2E.2D.7A — Verify-first staging PASS evidence

**Status:** PASS  
**Model:** `verify_only_first_deploy_from_immutable_image`  
**App:** `shortforge-hw-staging-4def8fa0`  
**Org:** `personal`  
**Configured region:** `iad`  
**Remotely observed region:** `iad`

## Topology (remotely observed)

| Item | Value |
|------|--------|
| Verify Machines | **1** |
| Render Machines | **0** |
| Verify VM | shared / 1 CPU / 2048 MB |
| Public services | **none** |
| Restart loop in post-deploy inventory | **none observed** |

## Immutable image

| Item | Value |
|------|--------|
| Digest (sha256) | `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Image class | deployable_worker |

## Secret ledger (names/status only)

| Item | Value |
|------|--------|
| Exact-nine membership | PASS |
| Aggregate status | **deployed** |
| Sync source | decoded bridge values (6H authority) |
| Secret values | **not recorded** |

## Remote runtime readiness

| Signal | Result |
|--------|--------|
| Remote schema preflight | **PASS** |
| `hosted.loop.started` | **PASS** |
| Render process group | **absent** |

## Sanitized deployment phases

- `bootstrap`
- `bridge_surface_validated`
- `bridge_accepted`
- `bridge_loaded`
- `public_environment_applied`
- `local_preflight_pass`
- `zero_machines_confirmed`
- `secrets_synced`
- `secrets_post_sync_classified`
- `deploy_complete`
- `topology_proven`
- `secrets_activated`
- `runtime_observation_pass`

## Prior evidence preserved (unchanged bytes)

| Item | SHA-256 |
|------|---------|
| 6D FAIL evidence | `6c64d223a9b61a00a14ed1f01e9b1461cc8d7f3d15369fc4f4bf32205fb536e2` |
| 6D archive (`.pre-2e2d6f-FAIL.md`) | `6c64d223a9b61a00a14ed1f01e9b1461cc8d7f3d15369fc4f4bf32205fb536e2` |
| 6F FAIL evidence | `c24acde707a2627642e24df6193506835e8129bb2cb2d7bf0e64315d925c0554` |
| Prior 2E.2D.6 FAIL | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |

## Privacy

No secret values, credential fragments, URLs, private IPs, provider payloads, or uploaded content digests.
