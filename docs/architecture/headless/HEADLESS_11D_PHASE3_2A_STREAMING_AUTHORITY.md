# Sprint 11D Phase 3.2A — Streaming Evidence & Output Authority Hardening

Narrow correction on the Phase 3.2 image2pipe path. Does **not** activate production routes or begin hosted-provider wiring.

## Renderer identity

| Field | Value |
|---|---|
| `rendererBuildId` | `headless-local-chromium-ffmpeg-11d-phase3.2` |
| `capabilityVersion` | `11d-phase3.2` |
| Superseded (fail closed) | `…-11d-phase3.1a` (and older `…-phase3.1`) |

Phase 3.2A evidence must identify as Phase 3.2 — never Phase 3.1A.

## Truthful stdin backpressure

`spawn-process-stdin.ts` measures peak buffering from authoritative `writableLength` **at the moment backpressure occurs**, before drain clears the buffer. `maxWritableBufferedBytes` is enforced when buffering happens. Write results return that peak (not a post-drain zero).

## Pre-write artifact workspace authority

1. Derive authorized ceiling = `min(profile/provider maxArtifact, remainingWorkspace − singleFrameHeadroom)`
2. `reserve(ceiling, "artifact")` before FFmpeg starts
3. Pass the same ceiling to FFmpeg `-fs` (best-effort; some builds briefly overshoot)
4. Transient PNG frame reserves use the headroom only — they cannot widen artifact capacity
5. Post-write exact/over-cap (`byteLength >= ceiling`) → fail closed as quota — never success
6. `commit(actualBytes)` after successful encode under ceiling
7. `release` on encode/cancel/timeout/quota failure paths
8. Exact-cap / over-cap → `WORKSPACE_QUOTA_EXCEEDED`

## Evidence exit truth

`npm run test:headless-worker-streaming-evidence` exits **non-zero** unless every required Core 60s artifact is `REAL_LOCAL_PASS`. Diagnostics are still written under `.tmp/headless-11d-evidence/`.

## Production / reference boundary

| Surface | Encoder |
|---|---|
| Production worker barrel + `execute-render-job` | `startStreamedPngEncode` only |
| `worker/testing/reference-encode` | Legacy `encodePngSequence` (test/reference only) |

## What 3.2A proves vs remaining seam

| Proven | Remaining seam |
|---|---|
| Bounded frame storage (image2pipe; no PNG disk sequence) | Whole-artifact `readFileSync` → `Uint8Array` upload |
| 60s native 4K operational contract | File/stream hashing + storage upload for arbitrary duration |
| Truthful backpressure + pre-write artifact authorization | Hosted-provider total memory measurement |

Do **not** claim arbitrary-duration end-to-end memory bounds until artifact hashing/upload become file/stream based.

## Terminal status

```text
SPRINT 11D PHASE 3.2A STREAMING AUTHORITY: READY FOR FINAL REVIEW
FRAME BACKPRESSURE EVIDENCE: TRUTHFUL
ARTIFACT WORKSPACE CAPACITY: AUTHORIZED BEFORE WRITE
ARBITRARY-DURATION ARTIFACT UPLOAD: REMAINING SEAM
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
```
