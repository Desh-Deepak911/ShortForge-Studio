# Sprint 11E Phase 2E.2D.6H — Decoded secret synchronization + guaranteed rollback

**Local authority only.** No provider contact in this phase.

## Problem (remote attribution)

Verify Machine topology passed, but exact-nine secrets were imported from the **raw shell-source bridge** (`fly secrets import < bridge`), preserving `%q`/quote encoding. Remote schema preflight returned `database_unavailable`; `hosted.loop.started` never appeared; Machine entered a restart loop. Manual rollback destroyed Machine `d8d967d4b5d228`. Inventory restored to exact zero.

## Part A — Decoded secret sync

After `fly_staging_load_bridge`, the canonical orchestrator calls `fly_staging_sync_decoded_secrets` while the app has **zero Machines**:

- Requires dedicated `HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL` gate (not inferred from verify authorization).
- Builds import stdin from **decoded** environment values via `fly-staging-secrets-import-cli.ts`.
- Forbids `< "${HEADLESS_FLY_STAGING_BRIDGE_FILE}"` and any bridge-file pipe to `fly secrets import`.
- Rejects NUL/CR/LF and shell/`%q` serialized representations.
- Post-sync: exact-nine ledger + truthful staged/partial/deployed classification before Machine creation.

## Part B — Guaranteed rollback

- `fly_staging_observe_verify_runtime_logs` returns bounded failure (`runtime_observation=FAIL reason=…`); never `exit`/`fly_staging_die`.
- Only `fly-staging-verify-first.sh` terminalizes after rollback authorization, `--force` destroys, and exact-zero proof.
- Failed list/destroy/proof → `rollback=unconfirmed` (never clean rollback).

## Part C — Evidence axes

Orchestrator evidence distinguishes: secrets sync, deploy aggregate, remote schema preflight, loop readiness, rollback result — never values/URLs/credentials.

## Dry-run scenarios

| Scenario | Expected |
|----------|----------|
| `staged_activation_pass` | PASS, one verify Machine preserved |
| `schema_database_unavailable_rollback` | rollback confirmed, runtime fail |
| `verify_loop_not_started_rollback` | rollback confirmed |
| `rollback_destroy_fail` | rollback unconfirmed |
| `rollback_list_fail` | rollback unconfirmed |

## Staging state (preserved)

- App: `shortforge-hw-staging-4def8fa0`
- Machines: **0**
- Nine staged secrets + immutable image unchanged
