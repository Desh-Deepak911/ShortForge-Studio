# Export Reliability Sprint Plan

Derived from Sprint 6A audit.

> Sprint 6B may begin only after [`EXPORT_CONTRACT.md`](./EXPORT_CONTRACT.md) is accepted.

## Product rule

> Anything supported in Preview must export with equivalent semantics or be blocked with an explicit capability message before export begins.

Never silently drop scenes, freeze captions, repeat stale video frames, change playback speed, cut narration/captions, ignore fit/motion/transitions/trims, or download incomplete files.

Contract authority: [`docs/architecture/EXPORT_CONTRACT.md`](./EXPORT_CONTRACT.md) — immutable `ExportManifest`, Export Never Breaks, parity invariant, preflight-before-render.

## Recommended architecture

**Hybrid + chunked browser renderer (Options B + E):**

1. Stabilize browser path with **chunked** CFR encode (not full-sequence MEMFS).
2. Capability preflight blocks unsafe 1080p full-sequence attempts.
3. Prefer 720p browser for reliability; plan server worker for heavy 1080p later.

## Phases

### 6B — Export Contract, Manifest & Capability Preflight

**Status: Implemented (Sprint 6B)**

- Freeze `ExportManifest` from MasterTimeline + settings before render.
- Implement `ExportCapabilityResult` blockers (memory estimate, browser, worker, missing media).
- Surface unsafe combinations before click (`ExportPanel` preflight states).
- Gate `exportFootieShort` via `prepareExportRequest` — blocked paths never preload media, create canvas, load FFmpeg, or start MediaRecorder.
- Keep friendly UI errors; preserve `ExportPipelineError` diagnostics; typed `ExportPreflightError` for capability blocks.
- Temporary compatibility adapter retired in Sprint 6C (`exportFootieShortFromManifest` → `renderExport(manifest, context)`).

### 6C — Canonical Timing, Render-End and Manifest-Only Renderer Integration

**Status: Implemented (Sprint 6C)**

- Formalize `resolveExportRenderEndMs()` ≡ `manifest.project.renderDurationMs`.
- Canonical frame-center timestamps + total frames from manifest.
- Scene / caption / transition / video source timing from manifest only.
- `ExportRenderContext` + `PreparedExportFrame` separate runtime from semantics.
- `renderExport(manifest, context)` — no StoryDocument in production renderer.
- Remove double `prepareStoryForExport` / MasterTimeline rebuild during render.
- Dispose context on success/failure; mark/reset poisoned FFmpeg.
- Architecture: [`EXPORT_RENDERER_ARCHITECTURE.md`](./EXPORT_RENDERER_ARCHITECTURE.md).

### 6D — Chunked Browser Renderer, Memory Stabilization & FFmpeg Recovery

**Status: Implemented (Sprint 6D)**

- Deterministic `buildExportChunkPlan()` — no gaps/overlaps; global frame indexes canonical.
- Production path: canvas→JPEG→per-chunk libvpx encode→immediate frame cleanup→concat.
- No full-project JPEG residency in MEMFS.
- Segment validation + stream-copy concat; audio mux only after validated visual.
- Poison classification + auto-reset; cancellation cleans chunk/runtime state.
- Cost model uses chunked peak memory; **1080p remains blocked** until device QA.
- Architecture: [`EXPORT_RENDERER_ARCHITECTURE.md`](./EXPORT_RENDERER_ARCHITECTURE.md).

### 6E — Audio, Format, Final-Frame & End-of-Project Reliability

**Status: Implemented (Sprint 6E)**

- Format adapters for WebM / MP4 (codec, MIME, extension, mux strategy).
- Canonical audio end policy vs `manifest.project.renderDurationMs`.
- Voice-speed Model A guards (no double `atempo`).
- Shared semantic audio graph; ducking/loop/fade contracts documented.
- No automatic capability-reducing fallbacks — `ExportFinalizationError` + opt-in `audioFallback`.
- Final artifact validation before success; end-buffer / final-frame snapshot.
- Architecture: [`EXPORT_AUDIO_AND_FORMATS.md`](./EXPORT_AUDIO_AND_FORMATS.md).

### 6F — Preview/Export Golden Parity, Device QA & Export Freeze

**Status: Implemented (Sprint 6F) — freeze decision recorded in QA docs**

- Golden A–G fixtures + semantic parity checkpoints.
- Device QA harness (`/dev/export-qa`) + report schema.
- Runtime MP4 codec probe; MP4 blocked when probe fails.
- Explicit fallback UI (typed choices only; no auto-trigger).
- 720p performance policy; freeze checklist under `docs/qa/`.

### 6F.1 — Export Reconfiguration UX & 1080p Capability Approval

**Status: Implemented (Sprint 6F.1)**

- ExportSession stores options only (never manifests).
- Result screen: Download / Export Again / Change Settings / Close.
- Every export attempt builds a fresh ExportManifest.
- 1080p capability-gated: Approved / Warning / Blocked (not blanket-blocked).
- Client override: `NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1` (dev/experimental; restart required).
- Device log: [`qa/export-1080p-results.md`](./qa/export-1080p-results.md).

### 6G — Preview/Export Visual Parity (detail)

- Consolidate video clip helpers on Media Playback Engine.
- Align watermark burn-in with product brand.
- Caption font loading preflight; animation fidelity device QA.
- Fit/fill single-field migration plan.

### 6H — Error Recovery & Retry Safety

- Reset FFmpeg/MEMFS/MediaRecorder/canvas tracks after every failure.
- Export cancellation + cleanup.
- Stage-specific user messages (already started in 4.2C-8D).

### 6I — Full QA Matrix & Freeze

- Cases A–F from forensics matrix at 720p and 1080p (where allowed).
- Resolution/duration scaling.
- Chrome primary; Safari/Firefox capability notes.
- Manual freeze checklist update; no “freeze” until device exports pass.

## Out of scope for this sprint

- Story Intelligence / Scene Intelligence
- New creative features
- Broad Preview rewrites
- WebCodecs as primary (research only unless mux lands)

## Exit criteria (sprint)

1. Capability preflight blocks known-unsafe exports.
2. 720p mixed-media exports succeed repeatedly.
3. 1080p either chunk-stable or explicitly server/blocked.
4. No silent incomplete downloads.
5. Preview parity matrix items marked Full or explicitly Unsupported.
6. Retry after failure succeeds without reload.

## Related docs

- `docs/architecture/EXPORT_CONTRACT.md` (accepted after Sprint 6A; required before 6B)
- `docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md`
- `docs/product/EXPORT_CAPABILITIES.md`
- `docs/product/EXPORT_TIMING_MODEL.md`
- `docs/qa/export-preview-parity-matrix.md`
- `docs/operations/EXPORT_FAILURE_FORENSICS.md`
