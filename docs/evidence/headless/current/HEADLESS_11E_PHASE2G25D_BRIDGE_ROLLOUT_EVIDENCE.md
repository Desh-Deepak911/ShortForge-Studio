# Sprint 11E Phase 2G.25D-Bridge — Controlled Rollout Evidence (sanitized)

## Result

`gate=bridge_rollout result=PASS`

## Credential surfaces (classifications only)

| Surface | Keys | Mode | Result |
|---|---|---|---|
| QA master `/tmp/shortforge-fly-verify-qa.master.env` | 11 (`FLY_VERIFY_LIVE_QA_SECRET_KEYS`) | 0600 | PASS — REST keys legal in QA master |
| Derived Fly worker bridge | 9 (`FLY_STAGING_SECRET_NAMES`) | 0600 ephemeral | PASS — excludes REST, unpooled URL, app name |
| Neon read bridge | pooled `DATABASE_URL` | 0600 ephemeral | PASS |
| Migration master `/tmp/shortforge-neon-migrate.master.env` | `DATABASE_URL_UNPOOLED` only | 0600 | PASS — direct non-pooler endpoint |

Public pins (not in secret files): `HEADLESS_ENV_NAME=staging`, `HEADLESS_FLY_STAGING_APP_NAME=shortforge-hw-staging-4def8fa0`

## Topology

| Phase | verify | render | other | region | unified digest |
|---|---:|---:|---:|---|---|
| Before forward | 1 | 1 | 0 | iad | `d38e45e2…` |
| After forward | 1 | 1 | 0 | iad | `7de23dbd…` |
| After fresh restarts | 1 | 1 | 0 | iad | `7de23dbd…` |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Attempt ledger

| Step | Attempts | Outcome |
|---|---|---|
| Forward bridge deploy (`7de23dbd…`) | 1 | PASS (resume skipped second forward) |
| Pre-008 rollback (`d38e45e2…`) | 0 | not required |
| Migration 008 (`5ed409d7…`) | 1 | PASS |
| Fresh restart verify | 1 | PASS — loop started, schema preflight pass |
| Fresh restart render | 1 | PASS — `worker_mode=render`, loop started |

## Schema ledger (post-migration)

- Migrations `001`–`008` exact checksum match
- Migration `009+` absent
- Slot-key capacity `1024`
- Active verify claims `0`, active render claims `0`, outbox quiescent

## Maintenance

`HEADLESS_EXPORT_MAINTENANCE_ENABLED=0` on bridge materialized config and runtime public environment.

## Temporary rollback authority

Bridge digest `7de23dbd…` promoted to temporary current / runtime-ready / rollback-eligible. 2G.24 digest `d38e45e2…` demoted to historical and schema-008-ineligible.

## 2G.25 cleanup-worker resume point

Deploy the 2G.25 cleanup-runtime worker image (not yet promoted) onto schema `008` with bridge digest as rollback pin. Do not redeploy 2G.24 after migration 008.
