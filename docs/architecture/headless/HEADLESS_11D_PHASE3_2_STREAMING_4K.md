# Sprint 11D Phase 3.2 — Duration-scalable streamed 4K

## Preflight: prior PNG-sequence flow (frozen map)

```text
Chromium page-entry
  → canvas.toDataURL("image/png")          [data:image/png;base64,...]
  → render-session Buffer.from(b64)
  → PNG signature + IHDR dimension check
  → WorkspaceByteBudget.reserve(frame)
  → writeFileSync frames/frame_%06d.png
  → (complete sequence on disk)
  → encodePngSequence(-i frames/frame_%06d.png, …)
  → workspace/output/artifact.{webm|mp4}
  → ffprobe → buildValidatedHeadlessArtifact
  → LocalHeadlessWorkerRunner upload
```

| Concern | Prior location |
|---|---|
| Frame API | `chromium/page-entry.ts` — `__SHORTFORGE_HEADLESS_GET_PNG__` |
| Byte format | PNG file bytes (signature `89 50 4E 47`) |
| PNG creation | `chromium/render-session.ts` → `frames/frame_%06d.png` |
| Quota | `WorkspaceByteBudget` — maxSingleFrame + **disk** maxAggregateFrame + workspace + artifact |
| Audio | Owned local `-i` files; filter_complex from Phase 2.1 plan |
| FFmpeg ownership | `spawnFixedArgv` — `shell:false`, process group kill |
| Cancel/timeout | Job deadline AbortSignal → terminateProcessTree |
| MP4 seekability | `-movflags +faststart` to seekable artifact **file** (not stdout) |
| PNG-dependent tests | ffmpeg / mp4 / audio / contract fixtures (legacy sequence retained as **test/reference-only**) |

**Prior operational ceilings (superseded):** 720p/1080p 35s; 4K 5s.

## Final streaming architecture (frozen)

```text
Chromium
  → one ordered PNG frame buffer (validated)
  → bounded producer (one frame at a time)
  → FFmpeg stdin image2pipe (-f image2pipe -vcodec png -framerate 30 -i pipe:0)
  → simultaneous encode to seekable artifact file
  → ffprobe validation
  → upload
```

| Module | Role |
|---|---|
| `worker/stream/png-frame-validator.ts` | PNG signature + IHDR + max single-frame bytes |
| `worker/stream/frame-stream.types.ts` | Metrics + reject reasons + stream limits |
| `worker/ffmpeg/spawn-process-stdin.ts` | stdin write/drain/backpressure; process-tree kill |
| `worker/ffmpeg/encode-png-stream.ts` | Long-lived image2pipe session; ordered accept |
| `worker/chromium/render-session.ts` | Transient frame reserve → `onPngFrame` → release (no disk PNG) |
| `worker/runtime/execute-render-job.ts` | Start encode before Chromium; overlap metrics |
| `worker/ffmpeg/encode-png-sequence.ts` | **Test/reference-only** — not a silent production fallback |

PNG image2pipe is the initial accepted transport (preserves browser-rendered PNG semantics). Raw RGBA may be documented later — not introduced without parity evidence.

### Backpressure / bounded memory

- Only one frame rendered/written at a time (no duration-proportional in-memory array).
- `stdin.write` false → await `drain` (never ignored); drain timeout fails closed.
- `maxWritableBufferedBytes` and `maxSingleFrameBytes` enforced.
- Logical `maxTotalStreamedFrameBytes` / profile `maxAggregateFrameBytes` cap total pipe volume — **not** disk-resident PNG aggregate.
- MP4/WebM write to a **seekable file** (`+faststart` remains valid). Never pipe MP4 through stdout.

### Audio parity (Phase 2.1)

Video occupies stdin. Voice/music remain owned local file `-i` inputs with unchanged filter authority:

- silent / voice / voice-with-music
- voice trim/delay/pad, multiplicative music envelope, ducking/fades, peak protection
- Opus (WebM) / AAC (MP4)

### Failure matrix (fail closed)

malformed PNG · wrong dimensions · missing/duplicate/reordered/extra frame · FFmpeg early exit · stdin EPIPE · write/drain timeout · artifact ceiling · worker deadline · creator cancel · claim loss · probe mismatch · encoder unavailable · audio binding failure.

After claim, every path must terminalize or preserve newer terminal/owner authority.

## Duration authority

| Profile | Content op. | Render op. | maxFrames |
|---|---|---|---|
| 720p / 1080p / 4K × WebM/MP4 | **60,000ms** | **60,400ms** | **1812** |

Pipeline itself has **no hard-coded 60s assumption** — ceilings come only from canonical profile ∩ provider capacity. Architectural ceilings retain headroom (180s) so duration can rise without redesigning the stream.

Boundary fixtures: 59,999 pass · 60,000+400 pass · 60,001 reject · 60,400 pass · 60,401 reject · forged oversized end buffer reject.

## Distinctions

| Concept | Authority |
|---|---|
| Duration-scalable streaming architecture | PNG image2pipe; no duration-proportional PNG disk sequence |
| Initial 60s operational contract | Profile `operationalMax*` fields above |
| Provider-specific maximum | Operator/provider limits may narrow further |
| Total worker memory | **Hosted-provider seam** — Node RSS is coordinator-only |
| Production routes | Still **CONFIGURATION_UNAVAILABLE** |

## Native 4K

- Chromium viewport/canvas: **2160×3840**
- Streamed PNG frames: **2160×3840**
- Encoded artifact: **2160×3840**
- No 1080p capture + FFmpeg upscale
- ExportManifest v2/`"8D"` and v3/`"9C"` unchanged (720p/1080p only)
- Frozen 1080p manifest + `HeadlessRenderTarget` may elevate output pixels only

## Verification

```bash
npm run test:headless-worker-streaming
npm run test:headless-worker-streaming-evidence   # 60s real artifacts → .tmp
npm run test:headless-worker-duration-authority
npm run test:headless-worker-resource-evidence
```

Evidence lives under gitignored `.tmp/headless-11d-evidence/`. Do not commit binaries. If local resources cannot finish 60s 4K, record **HONESTLY_BLOCKED** — never fabricate Pass.

## Env / flags

No new production feature flags. Optional binary path overrides unchanged. Production Headless routes remain configuration-blocked.

## Real local 60s evidence (gitignored `.tmp/headless-11d-evidence/`)

| Artifact | Status | Notes |
|---|---|---|
| `phase32-4k-mp4-60s-evidence.json` | **REAL_LOCAL_PASS** | 2160×3840 H.264 + AAC; 1812 frames; ~58MB |
| `phase32-4k-webm-60s-evidence.json` | **REAL_LOCAL_PASS** | 2160×3840 VP9; 1812 frames |
| `phase32-1080p-mp4-60s-evidence.json` | **REAL_LOCAL_PASS** | 1080×1920 regression |

Workspace peak for 60s 4K MP4 was ~72MB (assets + artifact commit — not PNG sequence). Node coordinator RSS is Node-only.

## Phase 3.2A authority hardening

See [HEADLESS_11D_PHASE3_2A_STREAMING_AUTHORITY.md](HEADLESS_11D_PHASE3_2A_STREAMING_AUTHORITY.md):

- Renderer identity: `…-11d-phase3.2` / `capabilityVersion: 11d-phase3.2`
- Truthful stdin backpressure peaks (`writableLength` before drain)
- Pre-write artifact reservation + exact-cap → `WORKSPACE_QUOTA_EXCEEDED`
- Core evidence command exits non-zero unless all 60s artifacts PASS
- Remaining seam: whole-artifact `readFileSync` / `Uint8Array` upload

## Terminal status

```text
SPRINT 11D PHASE 3.2A STREAMING AUTHORITY: READY FOR FINAL REVIEW
4K 60S WEBM + MP4: REAL LOCAL PASS
FRAME STORAGE: DURATION-INDEPENDENT / BOUNDED
ARBITRARY-DURATION ARTIFACT UPLOAD: REMAINING SEAM
EXPORTMANIFEST V2/"8D" + V3/"9C": UNCHANGED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
NO COMMIT / NO PUSH
```
