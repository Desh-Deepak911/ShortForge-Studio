# Sprint 11E Phase 2G.25D-Cleanup Part A — Build-Only Push Evidence (sanitized)

## Result

`gate=cleanup_runtime_build_only result=PASS`

## Deterministic local artifacts

| Artifact | SHA-256 |
|---|---|
| `hosted-worker.js` | `c8061aeeb90d8d69b3350aaf273a045d3bb428d8e41a9251edaf654632ef7b51` |
| `page-render.iife.js` | `e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c` |
| `BUILD_INFO.json` | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |

- Node 24 deployable worker
- Eight-migration embedded fingerprint including migration `008` checksum `5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de`
- Deterministic double-build: PASS

## Renderer authority

| Field | Value |
|---|---|
| Renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` |
| Capability | `2G.25-cleanup-runtime` |

## Immutable cleanup-runtime image (prospective)

| Field | Value |
|---|---|
| Manifest digest | `9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60` |
| Registry reference | `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60` |
| Image size | 396 MB |
| Build attempts | 1 |

## Staging topology (pre/post — unchanged)

| Phase | verify | render | other | region | unified digest | release |
|---|---:|---:|---:|---|---|---:|
| Before build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 41 |
| After build-only | 1 | 1 | 0 | iad | `7de23dbd…` | 41 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Authority state

- Cleanup-runtime image: **prospective / historical**, schema-008 compatible, **not current**, **not runtime-ready**, **not probe-eligible**, **not rollback-selected**
- Bridge digest `7de23dbd…`: temporary **current**, rollback-eligible
- Maintenance: disabled (`HEADLESS_EXPORT_MAINTENANCE_ENABLED=0`)
- Schema: migrations `001`–`008` exact; `009+` absent; slot-key capacity `1024`
- R2 lifecycle: unchanged (no provider mutation in this phase)

## Controlled rollout resume point

Deploy cleanup-runtime digest `9570e9d9…` onto schema `008` with bridge digest `7de23dbd…` as rollback pin. Never redeploy 2G.24 (`d38e45e2…`) after migration `008`.
