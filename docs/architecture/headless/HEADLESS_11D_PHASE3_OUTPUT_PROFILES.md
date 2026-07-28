# Sprint 11D Phase 3 — Output profiles + duration (updated by Phase 3.2)

See also [HEADLESS_11D_PHASE3_2_STREAMING_4K.md](HEADLESS_11D_PHASE3_2_STREAMING_4K.md) for the streamed image2pipe architecture.

## Preflight decisions

| Question | Decision |
|---|---|
| Content vs render duration? | **Explicit separate ceilings** on each output profile. |
| 60s story? | **Operational content ceiling = 60,000ms** for 720p / 1080p / **4K**. Render ceiling = content + accepted end buffer (400ms) = **60,400ms**. |
| Accepted end buffer? | Frozen timeline `TIMELINE_END_BUFFER_MS` / `HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS` = **400**. Forged oversized buffers fail closed. |
| ExportManifest v4? | **No.** Frozen v2/`"8D"` and v3/`"9C"` stay 720p/1080p only. |
| 4K on ExportManifest? | **Forbidden.** 4K is headless-target elevation only. |
| Frame storage? | **PNG image2pipe** — duration-independent / bounded. No duration-proportional PNG disk sequence on the production path. |
| RSS metric? | **`nodeCoordinatorPeakRssBytes`** — Node coordinator `process.memoryUsage().rss` only. Excludes Chrome/FFmpeg. Not total worker memory authority. |
| Worker limit precedence? | **`effective = min(profile, provider)`** for profile-bounded resources. Profiles may narrow; never widen provider capacity. |

## Worker limit authority (Phase 3.1B, still in force)

| Ownership | Fields |
|---|---|
| Profile-bounded (intersected) | `maxFrames`, `maxSingleFrameBytes`, `maxAggregateFrameBytes` (logical streamed volume), `maxWorkspaceBytes`, `maxArtifactBytes` |
| Provider/operator-owned | `jobTimeoutMs`, `maxStderrBytes`, `claimLeaseMs`, `processGraceMs`, `evaluateTimeoutMs`, asset/audio/bundle limits |

Provider defaults are sized to host every canonical local profile (60s streamed 720p/1080p/4K).

## Duration authority

| Field | Meaning |
|---|---|
| `testedMaxContentDurationMs` | Proven / contract content duration |
| `testedMaxRenderDurationMs` | Proven / contract render duration |
| `operationalMaxContentDurationMs` | Advertised content ceiling (**profile policy**) |
| `operationalMaxRenderDurationMs` | Advertised render ceiling (= content + ≤400ms end buffer) |
| `architecturalMaxContentDurationMs` | Design headroom (not a pipeline hard-code) |
| `architecturalMaxRenderDurationMs` | Design headroom for future raises without stream redesign |

`maxFrames` = `ceil(operationalMaxRenderDurationMs * 30 / 1000)` = **1812** at 60,400ms.

## Canonical profile matrix (Phase 3.2)

| profileId | W×H | Content op. | Render op. | maxFrames |
|---|---|---|---|---|
| `720p-webm-30` / `720p-mp4-30` | 720×1280 | 60,000 | 60,400 | 1812 |
| `1080p-webm-30` / `1080p-mp4-30` | 1080×1920 | 60,000 | 60,400 | 1812 |
| `4k-webm-30` / `4k-mp4-30` | 2160×3840 | 60,000 | 60,400 | 1812 |

`rendererBuildId`: `headless-local-chromium-ffmpeg-11d-phase3.2`  
`capabilityVersion`: `11d-phase3.2`  
(Phase 3.1A build id is superseded and fails closed.)

## Boundary matrix

| Case | Result |
|---|---|
| 59,999ms content + 400ms buffer | Pass |
| 60,000ms content + 400ms buffer | Pass |
| 60,001ms content | Reject before Chromium |
| 60,000ms content + forged oversized end buffer | Reject |
| Exact operational render ceiling (60,400) | Pass |
| Render ceiling + 1ms (60,401) | Reject |
| 60,000ms 4K content | Pass |
| 60,001ms 4K content | Reject |

## Evidence

| Suite | Path |
|---|---|
| Streaming smoke (2s) | `npm run test:headless-worker-resource-evidence` → `.tmp/headless-11d-evidence/phase32-*-2s-streaming-smoke.json` |
| 60s operational | `npm run test:headless-worker-streaming-evidence` → `phase32-*-60s-evidence.json` (PASS or HONESTLY_BLOCKED) |

Do not commit binaries. Node RSS is coordinator-only; total container/process-tree memory remains a hosted-provider seam.

## Distinctions

| Concept | Authority |
|---|---|
| Duration-scalable streaming architecture | image2pipe; bounded single-frame buffers |
| Initial 60s operational contract | Profile `operationalMax*` |
| Provider-specific maximum | May narrow further |
| Production routes | Still configuration-blocked |

## Terminal status

```text
SPRINT 11D PHASE 3.2 STREAMED 4K: READY FOR REVIEW
FRAME STORAGE: DURATION-INDEPENDENT / BOUNDED
60S OPERATIONAL CONTRACT: PROFILE AUTHORITY
EXPORTMANIFEST V2/"8D" + V3/"9C": FROZEN / UNCHANGED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
```
