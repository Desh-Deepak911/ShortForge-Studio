# Export Renderer Architecture (Sprint 6C–6D / 8D / 9C)

> Current Browser encode: **`chunked-browser-v1`**. Current manifest pair: **v4 / `"9D"`** (v5 / `"9E"` when capabilities require it). See [EXPORT_MANIFEST_AND_CAPABILITIES.md](EXPORT_MANIFEST_AND_CAPABILITIES.md) and [PREVIEW_AND_EXPORT.md](PREVIEW_AND_EXPORT.md). Sprint version lines below are historical.

> Production browser export consumes **ExportManifest** (semantic) + **ExportRenderContext** (runtime) only.

## Sprint 9C — Intra-scene transition export *(frozen with Sprint 9)*

- Production manifest version **3**, renderer contract **`"9C"`** — **frozen**.
- Frozen backward-compatible pair: version **2** / **`"8D"`** (hard-cut intra-scene).
- V3 scenes always include `mediaTransitions`; empty boundaries = hard-cut parity with v2.
- Frame composition priority: scene-to-scene → v3 intra-scene → ordinary active media.
- Peers prepared under `buildExportMediaCacheKey(sceneId, mediaItemId)` (scene-id-only map insufficient).
- Captions render over intra-scene overlays; scene-to-scene caption early-return unchanged.
- Sprint 9 golden QA + local harness: `npm run test:intra-scene-transition-golden` · `/dev/intra-scene-transition-qa` · freeze evidence in `docs/qa/intra-scene-transition-sprint-9-freeze.md`.

## Sprint 8D — Multi-media items (frozen)

- Frozen manifest version **2**, renderer contract **`"8D"`**.
- Canonical per-scene media is `mediaTimeline` (frozen item windows). `scene.media` is first-item compatibility only.
- Cache keys are collision-safe `sceneId` + `mediaItemId` (`buildExportMediaCacheKey`).
- Each frame: resolve scene clock → `resolveExportActiveSceneMediaFrame` → seek/draw that item with **item-local** elapsed.
- Scene-to-scene transitions resolve from/to active items independently.
- Hard cuts between media items on v2; v3/`9C` adds frozen intra-scene transition overlays.
- Runtime v1 manifests fail the v2 check honestly.

## Lifecycle

```text
Editor / StoryDocument
        ↓
prepareExportRequest()          // prepareStoryForExport once → buildExportManifest → preflight
        ↓
createExportRenderContext()     // canvas, media cache, ffmpeg, cancellation, progress
        ↓
renderExport(manifest, context)
   ├─ renderChunkedSilentVisual()   // Sprint 6D
   │    ├─ buildExportChunkPlan()
   │    ├─ prepareExportFromManifest()
   │    ├─ preloadExportManifestMedia()
   │    ├─ for each chunk:
   │    │     prepareExportFrame(globalIndex) → draw → canvas.toBlob JPEG
   │    │     encode segment (-framerate + -frames:v)
   │    │     validate segment
   │    │     delete chunk frame files immediately
   │    ├─ concat segments (-c copy)
   │    └─ validate concatenated visual
   ├─ mux audio via WebM/MP4 format adapter (Sprint 6E)
   ├─ validateFinalExportArtifact()
   └─ download / validate
        ↓
disposeExportRenderContext()    // always in finally
```

## Separation

| Layer | Owns | Must not own |
|-------|------|--------------|
| `ExportManifest` | Timing, media semantics, captions, audio, branding, output | Canvas, FFmpeg, DOM media, AbortSignal |
| `ExportRenderContext` | Canvas, media cache, FFmpeg, temp URLs, progress, cancellation | Scenes, captions, story, export options |
| `PreparedExportFrame` | One frame’s resolved semantic state | Live editor stores |
| `ExportChunkPlan` | Bounded MEMFS frame ranges | Semantic timing (uses global indexes only) |

## Canonical timing

All clocks derive from the frozen manifest:

- `resolveExportRenderEndMs` → `manifest.project.renderDurationMs`
- `resolveExportTotalFrames` → `ceil(renderDurationMs * fps / 1000)`
- `resolveExportFrameTimestampMs` → frame-center `(i + 0.5) * 1000 / fps`
- Chunk boundaries never redefine timestamps — every frame uses its **global** index

## Chunking (Sprint 6D)

| Topic | Contract |
|-------|----------|
| Renderer version | `chunked-browser-v1` |
| Frame source | Direct `canvas.toBlob("image/jpeg")` (no full-project MediaRecorder) |
| Chunk size | Deterministic policy: 120 frames @720p, 90 @1080p (~3–4s @30fps) |
| Ranges | Half-open `[start, end)` — no gaps, no overlaps, no duplicate frames |
| MEMFS | Only current chunk JPEGs + retained encoded segments |
| Cleanup | Delete chunk frames immediately after segment validates |
| Encode | Shared libvpx profile; `-g`/`-keyint_min` = chunk length (independently decodable start) |
| Concat | FFmpeg concat demuxer + `-c copy` |
| Duration | `totalFrames / fps` |

Legacy `normalizeSilentVisualFrameTiming` (MediaRecorder → full JPEG extract) remains for isolated `exportSilentVideoBlob` tests only — **not** the production path.

## Modules

| Path | Role |
|------|------|
| `src/features/export/domain/` | Manifest build, preflight, fingerprint (Sprint 6B) |
| `src/features/export/timing/` | Canonical timing resolvers |
| `src/features/export/chunking/` | Chunk plan, encode, concat, cleanup, recovery |
| `src/features/export/runtime/` | Context, prepare frame, draw, `renderExport` |
| `src/features/export/services/video-render.service.ts` | Public entry + mux helpers |

## Cleanup & poison

- Context disposal runs on success, failure, and cancellation.
- FFmpeg chunk/mux failures classify (`FFMPEG_WORKER_ABORTED`, `FFMPEG_OUT_OF_MEMORY`, …), mark poison, and reset runtime.
- Cancellation cleans current chunk frames/segments and resets FFmpeg without treating cancel as a user-facing export failure.
- Dispose resets poisoned FFmpeg so the next export gets a fresh worker.

## Capability policy

- **720p:** browser path when APIs + memory estimate allow (chunked peak model).
- **1080p:** capability-gated (Approved / Warning / Blocked). Dev override: `NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1`.

## Future

- Server renderer
- 1080p browser approval after measured device QA (see `docs/qa/export-device-results.md`)
- Broader Safari/Firefox binary golden matrix

## Sprint 6F

- Golden A–G semantic fixtures + Preview/Export checkpoint parity
- Runtime MP4 probe before enabling MP4 in preflight
- Device QA harness + freeze checklist under `docs/qa/`
