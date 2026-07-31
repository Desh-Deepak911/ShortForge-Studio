# Sprint 11E Phase 2G.25D-Cleanup Part E — Corrected Immutable Image Build-Only Push Evidence (sanitized)

## Result

`gate=cleanup_runtime_build_only result=PASS`

## Source commits packaged

| Commit | Purpose |
|---|---|
| `c9c083e` | Finalization containment and boundary correction |
| `571f4a9` | Store-revision and verification-claim correction |
| `5e16287` | Artifact-cleanup release authority |

## Deterministic local artifacts

| Artifact | SHA-256 |
|---|---|
| `hosted-worker.js` | `a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b` |
| `page-render.iife.js` | `e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c` |
| `BUILD_INFO.json` | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |

- Node 24 deployable worker
- Eight-migration embedded fingerprint including migration `008` checksum `5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de`
- Deterministic double-build: PASS
- Maintenance default disabled

## Renderer authority

| Field | Value |
|---|---|
| Renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` |
| Capability | `2G.25-cleanup-runtime-finalization-correction` |

## Immutable corrected cleanup-runtime image (prospective)

| Field | Value |
|---|---|
| Manifest digest | `41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde` |
| Registry reference | `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde` |
| Image size | 396 MB |
| Architecture | linux/amd64 |
| Build attempts | 1 |
| Differs from bridge | yes (`7de23dbd…`) |
| Differs from rejected live-finalization | yes (`e0224b93…`) |
| Differs from rejected Part A | yes (`9570e9d9…`) |
| Differs from forbidden 2G.24 | yes (`d38e45e2…`) |

## Registry extraction proof

| Check | Result |
|---|---|
| Pull mechanism | `crane export` |
| Extracted worker SHA-256 | `a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b` |
| Extracted page SHA-256 | `e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c` |
| Extracted BUILD_INFO SHA-256 | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |
| Packaged startup probe on extracted worker | PASS |

## Staging topology (pre/post — unchanged)

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Before build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 53 |
| After build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 53 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

No Machine attach, restart, scale, probe, matrix, migration, maintenance activation, or R2 lifecycle mutation.

## Authority state

- Corrected cleanup-runtime `41df9b44…`: **prospective / historical**, schema-008 compatible, **not current**, **not runtime-ready**, **not readiness-eligible**, **not probe-eligible**, **not rollback-selected**
- Record ID: `post_008_2g25_cleanup_runtime_finalization_correction_prospective`
- Pair ID: `post_008_2g25_cleanup_runtime_finalization_correction_prospective_pair`
- Rejected live-finalization digest `e0224b93…`: preserved rejected
- Rejected Part A digest `9570e9d9…`: preserved rejected
- Forbidden pre-schema-008 digest `d38e45e2…`: preserved ineligible
- Bridge digest `7de23dbd…`: temporary **current**, rollback-eligible
- Maintenance: disabled (`HEADLESS_EXPORT_MAINTENANCE_ENABLED=0`)
- Schema: migrations `001`–`008` exact; `009+` absent; slot-key capacity `1024`
- R2 lifecycle: unchanged (no provider mutation in this phase)

## Credential / temp cleanup

- QA master mode `0600` preserved
- QA master byte-identical before/after
- Ephemeral worker/neon bridges deleted by build-only script
- Materialized Fly config deleted
- Temporary inspect workdirs deleted

## Controlled rollout resume point

1. Merge PR into `staging`.
2. Authorize one controlled replacement rollout using digest `41df9b44…`.
3. Rollback pin must remain bridge `7de23dbd…`.
4. Never redeploy rejected `e0224b93…`, `9570e9d9…`, or `d38e45e2…`.
