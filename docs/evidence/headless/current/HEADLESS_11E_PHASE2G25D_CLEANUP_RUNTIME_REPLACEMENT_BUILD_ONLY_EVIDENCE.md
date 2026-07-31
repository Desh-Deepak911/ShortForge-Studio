# Sprint 11E Phase 2G.25D-Cleanup Part B-R — Replacement Build-Only Push Evidence (sanitized)

## Result

`gate=cleanup_runtime_build_only result=PASS`

## Deterministic local artifacts

| Artifact | SHA-256 |
|---|---|
| `hosted-worker.js` | `3226970b12e6f1e5296a82ffc42e375a66b3a4cc7a12acfc5dba4ef3c2c6a878` |
| `page-render.iife.js` | `e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c` |
| `BUILD_INFO.json` | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |

- Node 24 deployable worker with hosted-environment cleanup build ID acceptance
- Eight-migration embedded fingerprint including migration `008` checksum `5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de`
- Deterministic double-build: PASS (identical hashes across two builds)

## Renderer authority

| Field | Value |
|---|---|
| Renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` |
| Capability | `2G.25-cleanup-runtime` |

## Immutable replacement cleanup-runtime image (prospective)

| Field | Value |
|---|---|
| Manifest digest | `e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916` |
| Registry reference | `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916` |
| Image size | 396 MB |
| Architecture | linux/amd64 |
| Build attempts | 1 |
| Differs from rejected Part A digest | yes (`9570e9d9…`) |
| Differs from bridge digest | yes (`7de23dbd…`) |

## Registry extraction proof

| Check | Result |
|---|---|
| Pull mechanism | `crane export` (Docker daemon unavailable) |
| Extracted worker SHA-256 | `3226970b12e6f1e5296a82ffc42e375a66b3a4cc7a12acfc5dba4ef3c2c6a878` |
| Extracted page SHA-256 | `e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c` |
| Extracted BUILD_INFO SHA-256 | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |
| Packaged startup probe on extracted worker | PASS |

## Staging topology (pre/post — unchanged)

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Before build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 49 |
| After build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 49 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Authority state

- Replacement cleanup-runtime `e0224b93…`: **prospective / historical**, schema-008 compatible, **not current**, **not runtime-ready**, **not probe-eligible**, **not rollback-selected**
- Rejected Part A/B digest `9570e9d9…`: **rejected / historical**, **not deployable**, reason `invalid_renderer_build_id_packaged_worker`
- Bridge digest `7de23dbd…`: temporary **current**, rollback-eligible
- Maintenance: disabled (`HEADLESS_EXPORT_MAINTENANCE_ENABLED=0`)
- Schema: migrations `001`–`008` exact; `009+` absent; slot-key capacity `1024`
- R2 lifecycle: unchanged (no provider mutation in this phase)

## Controlled rollout resume point

One authorized forward deployment of replacement digest `e0224b93…` onto schema `008` with bridge digest `7de23dbd…` as sole rollback pin. Requires `HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_NEW_TARGET_AUTHORIZATION=1` and persistent attempt budget clearance for the new target digest. Never redeploy rejected `9570e9d9…` or 2G.24 (`d38e45e2…`) after migration `008`.
