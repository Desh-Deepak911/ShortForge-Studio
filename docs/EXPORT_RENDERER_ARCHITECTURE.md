# Export Renderer Architecture (Sprint 6C–6D)

> Production browser export consumes **ExportManifest** (semantic) + **ExportRenderContext** (runtime) only.

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
