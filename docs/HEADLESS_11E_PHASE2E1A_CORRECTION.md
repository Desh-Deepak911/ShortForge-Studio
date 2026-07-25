# Sprint 11E Phase 2E.1A — Hosted Worker Foundation Corrections

**Status:** Local correction only. **Fly deployment: NOT STARTED.**  
**Prerequisite:** Phase 2E.1 foundation already complete — this document records 2E.1A deltas only.

## Corrections

| Item | Before (2E.1) | After (2E.1A) |
|------|----------------|---------------|
| Node image/target | Node 20 | **Node 24 LTS** |
| Fly VM | Single unscoped `[[vm]]` 2 GB | Process-specific verify/render blocks |
| Dockerfile path | `dockerfile = "Dockerfile"` | `dockerfile = "deploy/headless-worker/Dockerfile"` |
| Build context | Ambiguous | **Repository root (`footiebitz/`)** |
| BUILD_INFO | `builtAtMs: Date.now()` | Deterministic; no wall-clock |
| Image class | Unstated | **`foundation_image`** (not deployable) |

## Verifier / render VM matrix

| Process | cpu_kind | cpus | memory_mb | Notes |
|---------|----------|------|-----------|-------|
| `verify` | shared | 1 | 2048 | Bounded staging; no Chrome encode tree |
| `render` | performance | 4 | 8192 | Concurrency 1; **unproven** until process-tree measurement |

No unscoped `[[vm]]` may apply to both groups. Renderer must not inherit verifier 2 GB.

## Image classification

```json
{
  "imageClass": "foundation_image",
  "canStartConsumerLoop": false,
  "deployable": false,
  "target": "node24",
  "unresolvedDynamicModules": [
    "materialize-hosted-worker-adapters",
    "hosted-worker-loop"
  ]
}
```

2E.2 may change classification to `deployable_worker` only after adapters/loop are bundled and all required seams close.

## Native / sandbox honesty

- System Chromium + FFmpeg/ffprobe; non-root; tini; no default `--no-sandbox`; no public port  
- Apt packages are distro-channel, not digest-pinned  
- Binary versions/codecs = runtime preflight authority  
- Chromium sandbox in-container: **NOT_TESTED** until Docker runs  
- No hosted render readiness claim  

## Remaining 2E.2 seams

1. ~~`RENDER_STORAGE_PORT_SEAM`~~ — **CLOSED in 2E.2A.3** (see `docs/HEADLESS_11E_PHASE2E2A_RENDER_STORAGE_CLEANUP.md`)
2. ~~`ARTIFACT_CLEANUP_DURABLE_SEAM`~~ — **CLOSED in 2E.2A.3**
3. ~~`VERIFY_PROMOTION_COMPOSITION_SEAM`~~ — **CLOSED in 2E.2B** (see `docs/HEADLESS_11E_PHASE2E2B_TRUSTED_VERIFY_PROMOTION.md`)
3. `VERIFY_PROMOTION_COMPOSITION_SEAM` — still open
4. Bundle adapter/loop modules; promote image class when runnable
5. Authorized Fly deploy + hosted process-tree memory evidence

