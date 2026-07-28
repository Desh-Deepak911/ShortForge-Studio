# ShortForge Studio Export Contract

Status: Accepted after Sprint 6A · Sprint 6B production gate **implemented** · Sprint 8D multi-media manifest **complete and accepted** (fail-closed total v2 validation) · Sprint 8 **frozen** (ExportManifest v2 / renderer contract `"8D"`; multi-image default; `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` retired in 8E.3) · Sprint 9 **frozen** — ExportManifest **v3 / `"9C"`** (intra-scene transitions) accepted and frozen (9C.1 fingerprint coherence + consecutive-boundary order; 9D.3 operator Preview/WebM/editor Pass); v2 / `"8D"` remains frozen backward-compatible

Applies to: Sprint 6B and all future export work  
Owner: Export Reliability Architecture

> This contract defines the minimum correctness, parity, timing, capability, and failure guarantees for every ShortForge Studio export path.

### Sprint 9C — ExportManifest v3 + intra-scene transitions *(frozen with Sprint 9)*

| Item | Value |
|---|---|
| Production `EXPORT_MANIFEST_VERSION` | **3** (frozen) |
| Production `EXPORT_RENDERER_CONTRACT_VERSION` | **`"9C"`** (frozen) |
| Frozen pair | `EXPORT_MANIFEST_V2_VERSION = 2` · `EXPORT_RENDERER_CONTRACT_V2 = "8D"` |
| Discriminated types | `ExportManifestV2` \| `ExportManifestV3` |
| Intra-scene track | `ExportSceneManifestV3.mediaTransitions` (always present; empty = hard-cut) |
| Manifest-only resolver | `resolveExportIntraSceneTransitionAtElapsed` |
| Integrity authority | `validateExportManifest` / `assertExportManifest` (version-dispatching) |
| Frozen v2 integrity | `validateExportManifestV2SceneMedia` unchanged (rejects `mediaTransitions`) |
| Fail-closed preflight | Dispatching integrity before cost/preload/render (unchanged ordering) |
| Fingerprint | Version-aware via `draft.rendererContractVersion`; v3 includes every transition field; validators recompute and require `MANIFEST_FINGERPRINT_MISMATCH` on drift |
| Boundary order | Strictly increasing `fromItemIndex` (A→B then B→C valid) |
| Resolution labels | **Frozen** `ExportManifestResolutionLabel = "720p" \| "1080p"` only. Sprint 11D headless **must not** extend this enum for 4K; headless pixel targets use a separate immutable `HeadlessRenderTarget` / output-profile registry. Browser preflight and renderer selection remain unchanged. Phase 3.2 streams native elevated pixels via PNG image2pipe; ExportManifest v2/`"8D"` and v3/`"9C"` remain unchanged. |

### Sprint 8D — Multi-media ExportManifest (frozen)

| Item | Value |
|---|---|
| Frozen `EXPORT_MANIFEST_V2_VERSION` | **2** |
| Frozen `EXPORT_RENDERER_CONTRACT_V2` | **`"8D"`** |
| Canonical per-scene media | `ExportSceneManifest.mediaTimeline` (frozen item windows + media) |
| Compatibility field | `ExportSceneManifest.media` = first timeline item only |
| Active-item authority | `resolveExportActiveSceneMediaFrame(sceneManifest, sceneElapsedMs)` |
| Timing (v2) | Item-local elapsed for motion + video clip; **hard-cut** intra-scene |
| Integrity | Total `validateExportManifestV2SceneMedia(unknown)` — never throws; no silent repair |
| Fail-closed preflight | Integrity runs before `estimateExportCost`, env/capability dereferences, format/timeline/media checks, resolution approval, and renderer selection. Integrity failure → `supported: false`, `renderer: "blocked"`, single `INVALID_MANIFEST`, sentinel cost (`invalid-manifest-sentinel`) |
| Runtime boundary | `prepareExportFromManifest` / `assertExportManifest` reject before draw-scene construction, preload, or render |
| Capability counts | Canonical `mediaTimeline.items` (`videoMediaItemCount` / `imageMediaItemCount`); legacy scene counts alias item counts |
| Multi-image default | Production `prepareExportRequest` / `buildExportManifest` default to complete projected `mediaTimeline` (`multiImageScenesEnabled !== false`). Opt-out `false` is tests-only. Domain does not read `process.env`. Flag `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` retired in 8E.3. |
| Runtime unknown versions | Fail closed (manifests are rebuilt every export) |

### Sprint 6B–6E implementation status

| Contract area | Status |
|---|---|
| Manifest domain (`src/features/export/domain`) | **Implemented** (6B) |
| Deep immutability + fingerprint | **Implemented** (6B) |
| Capability preflight + cost estimate | **Implemented** (6B; chunked peak model in 6D) |
| Renderer selection (`browser` / `server` / `blocked`) | **Implemented** (6B) |
| Pre-render gate via `prepareExportRequest` | **Implemented** (6B) |
| Export UI blockers / warnings | **Implemented** (6B) |
| Manifest-only renderer input | **Implemented** (6C) |
| `ExportRenderContext` separation | **Implemented** (6C) |
| Canonical manifest timing | **Implemented** (6C) |
| Compatibility adapter removal | **Implemented** (6C) |
| Runtime cleanup / FFmpeg poison reset | **Implemented** (6C/6D) |
| Bounded browser chunking (`chunked-browser-v1`) | **Implemented** (6D) |
| Chunk abstraction + segment validation | **Implemented** (6D) |
| Concatenated visual validation | **Implemented** (6D) |
| FFmpeg poison recovery + retry-clean runtime | **Implemented** (6D) |
| Format adapter rule (WebM / MP4) | **Implemented** (6E) |
| Audio completion / end policy | **Implemented** (6E) |
| Final artifact validation | **Implemented** (6E) |
| Explicit fallback rule (no silent capability loss) | **Implemented** (6E) |
| End-of-project guarantee (buffer / final frame) | **Implemented** (6E) |
| Server renderer | Future |
| 1080p browser approval | **Implemented (6F.1)** — capability-gated Approved / Warning / Blocked |
| Export session / reconfiguration UX | **Implemented (6F.1)** — options-only session; fresh manifest every attempt |
| Golden device playback suite | Sprint 6F semantic goldens + `/dev/export-qa`; real device binary matrix still documenting gaps |
| Full cancellation UI | Future |

Production entry: `exportFootieShort` → `prepareExportRequest` → `createExportRenderContext` → `renderExport(manifest, context)` → format adapter → `validateFinalExportArtifact` → `disposeExportRenderContext`.

Audio/format architecture: [`EXPORT_AUDIO_AND_FORMATS.md`](../product/EXPORT_AUDIO_AND_FORMATS.md).

Sprint 6A inventory and architecture decisions are recorded in:

- [`EXPORT_ARCHITECTURE_AUDIT.md`](EXPORT_ARCHITECTURE_AUDIT.md)
- [`EXPORT_CAPABILITIES.md`](../product/EXPORT_CAPABILITIES.md)
- [`EXPORT_TIMING_MODEL.md`](../product/EXPORT_TIMING_MODEL.md)
- [`qa/export-preview-parity-matrix.md`](../qa/export-preview-parity-matrix.md)

---

## Immutable ExportManifest

> The renderer must consume one immutable `ExportManifest`. It must not read mutable editor, React, store, timeline, or UI state after rendering begins.

### Proposed model

Exact production TypeScript names may differ; semantic boundaries must not.

```ts
export interface ExportManifest {
  readonly version: number;
  readonly manifestId: string;
  readonly createdAt: string;

  readonly project: ExportProjectManifest;
  readonly output: ExportOutputManifest;
  readonly scenes: readonly ExportSceneManifest[];
  readonly captions: readonly ExportCaptionManifest[];
  readonly audio: ExportAudioManifest;
  readonly branding: ExportBrandingManifest;
  readonly capabilities: ExportCapabilitySnapshot;
  readonly fingerprint: string;
}

export interface ExportProjectManifest {
  readonly projectId: string;
  readonly renderDurationMs: number;
  readonly contentDurationMs: number;
  readonly endBufferMs: number;
  readonly aspectRatio: string;
}

export interface ExportOutputManifest {
  readonly format: "webm" | "mp4";
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  readonly quality: "standard" | "high";
  readonly filename: string;
}

export interface ExportSceneManifest {
  readonly id: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly media: ExportMediaManifest;
  readonly transition?: ExportTransitionManifest;
}

export interface ExportCaptionManifest {
  readonly id: string;
  readonly sceneId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly style: ExportCaptionStyleManifest;
  readonly animation: ExportCaptionAnimationManifest;
}

export interface ExportAudioManifest {
  readonly mode: "silent" | "voice" | "voice-with-music";
  readonly voiceover?: ExportAudioTrackManifest;
  readonly music?: ExportMusicTrackManifest;
  readonly sourceVideoAudioPolicy: "muted";
}

export interface ExportBrandingManifest {
  readonly watermarkEnabled: boolean;
  readonly watermarkAsset?: string;
  readonly position?: string;
}
```

`ExportMediaManifest`, transition, caption style/animation, audio track, and capability snapshot types must freeze all fields required for parity with Preview (trim, fit/fill, transform, motion, fonts, ducking, fades).

---

## Manifest Immutability Rules

1. Manifest creation happens before rendering.  
2. Manifest is deeply immutable.  
3. Renderer receives the manifest by value/reference only.  
4. Renderer may not call editor stores after start.  
5. Renderer may not read live React state.  
6. Renderer may not mutate scenes, captions, or audio data.  
7. Renderer may not regenerate timings during rendering.  
8. Renderer may not infer missing fields differently from Preview.  
9. Manifest normalization occurs once before preflight.  
10. Export fingerprint is generated from the frozen manifest.

> If the editor changes after manifest creation, the running export must remain unchanged.

---

## ExportManifest Lifecycle

```text
Editor state
    ↓
Canonical domain normalization
    ↓
Build ExportManifest
    ↓
Deep freeze / immutable snapshot
    ↓
Capability preflight
    ↓
Renderer selection
    ↓
Render
    ↓
Validate
    ↓
Download
```

The renderer must never bypass this lifecycle.

---

## Export Never Breaks

> An export is successful only when every required manifest capability is rendered completely and the final file passes structural and semantic validation.

### Mandatory success criteria

1. Every manifest scene is rendered.  
2. Scene order matches the manifest.  
3. Scene boundaries match manifest timing.  
4. Every supported media asset appears.  
5. Video clips respect trim and scene duration.  
6. Images respect fit, fill, crop, position, zoom, and rotation.  
7. Motion matches shared-domain semantics.  
8. Transitions match shared-domain semantics.  
9. Captions appear at the correct timestamps.  
10. Caption animations complete.  
11. Final caption is not cut.  
12. Voiceover completes.  
13. Background music mix completes where enabled.  
14. Final narration syllable is not cut.  
15. Final visual frame is retained.  
16. Watermark is applied exactly once when enabled.  
17. Output duration matches the manifest.  
18. Output FPS matches the manifest.  
19. Output resolution matches the manifest.  
20. Container, codec, MIME type, and extension agree.  
21. The file is playable.  
22. Export retries start from clean state.

---

## Complete Success or Explicit Failure

> Export must either succeed completely or fail explicitly.

Export must not:

- Download a partial project  
- Drop later scenes  
- Freeze captions  
- Replace video with stale frames  
- Change playback speed  
- Cut the final scene  
- Cut the final caption  
- Produce silent output without explicit fallback consent  
- Ignore fit/fill  
- Ignore transitions  
- Ignore motion  
- Hide unsupported capability loss  

If a capability cannot be supported, the export must be blocked during preflight.

---

## Preview/Export Parity Invariant

> Every supported Preview capability must be implemented through shared semantic logic, with separate Preview and Export adapters.

```text
Canonical domain logic
        ↓
Resolved semantic state
       ↙ ↘
Preview Adapter   Export Adapter
```

Adapters may differ only in:

- Unit conversion  
- CSS vs Canvas vs FFmpeg representation  
- Browser rendering API  
- Codec/container application  

Adapters must not independently redefine:

- Timing  
- Easing  
- Interpolation  
- Fit/fill semantics  
- Crop semantics  
- Clip timing  
- Caption timing  
- Transition timing  
- Voice duration  
- Project end  

---

## Capability Ownership Table

| Capability | Shared semantic owner | Preview adapter | Export adapter |
|---|---|---|---|
| Scene timing | MasterTimeline | Preview timing / `usePreviewPlayback` | Export frame timing (`resolveTimelineFrameSampleTimeMs`) |
| Video clip timing | Media Playback Engine | `preview-video-clip` / `SceneFrameVideo` | Export scene media renderer |
| Image framing | Media framing / scene image resolvers | CSS (`SceneFrameImage`) | Canvas draw path |
| Motion | Shared media-motion engine | `previewMotionAdapter` | `exportMotionAdapter` |
| Captions | Caption timing + MasterTimeline subtitle track | DOM caption overlays | Export subtitle / caption canvas |
| Transitions | Transition resolver | Preview transition layers | Export transition canvas |
| Voice duration | Generated audio metadata (TTS Model A) | Preview audio player | Export audio mux |
| Project end | `renderDurationMs` | Preview completion / tail hold | Export frame count + mux `-t` |
| Watermark | Branding manifest | Optional preview chrome | Export branding renderer |

---

## Unsupported Capability Rule

> A capability shown in Preview must not be silently omitted from Export.

Every capability must be classified:

```text
Supported
Supported with warning
Unsupported
```

If unsupported:

- Preflight blocks export.  
- UI explains the limitation.  
- Renderer never starts.  
- No partial output is produced.

---

## Capability Preflight

### Placement

```text
Export button
    ↓
Build immutable manifest
    ↓
Run capability preflight
    ↓
Supported?
    ├─ No → show blockers, do not render
    └─ Yes → select renderer and start export
```

Preflight must run before:

- Media preload  
- Canvas creation  
- Frame rendering  
- FFmpeg loading  
- MediaRecorder start  
- Audio processing  
- Temporary file creation  

### Model

```ts
export interface ExportCapabilityResult {
  readonly supported: boolean;
  readonly renderer: "browser" | "server";
  readonly warnings: readonly ExportWarning[];
  readonly blockers: readonly ExportBlocker[];
  readonly estimatedCost: ExportCostEstimate;
}

export interface ExportWarning {
  readonly code: string;
  readonly message: string;
}

export interface ExportBlocker {
  readonly code: string;
  readonly message: string;
  readonly capability?: string;
}

export interface ExportCostEstimate {
  readonly estimatedFrames: number;
  readonly estimatedMemoryBytes?: number;
  readonly estimatedDurationClass: "short" | "medium" | "long";
  readonly risk: "safe" | "borderline" | "unsafe";
}
```

### Required checks

1. Browser support  
2. Requested format support  
3. Codec availability  
4. Resolution support  
5. FPS support  
6. Estimated frame count  
7. Estimated memory pressure  
8. Project duration  
9. Number of video scenes  
10. Missing media  
11. Missing narration/audio assets  
12. Unsupported transition  
13. Unsupported caption effect  
14. Font availability  
15. Invalid timeline duration  
16. Invalid trim ranges  
17. Worker availability  
18. Renderer availability  
19. Output format/audio compatibility  
20. Retry/reset state  

---

## Renderer Selection

```text
Capability preflight
    ↓
Renderer selection
```

Policy from Sprint 6A (thresholds are versioned implementation details):

```text
Browser renderer:
- short projects
- lower-risk memory profile
- 720p where validated
- supported format combinations

Server renderer:
- 1080p mixed-media
- long projects
- video-heavy projects
- unsafe browser memory profile
- unsupported browser combinations
```

---

## Render Validation

After rendering, validate before success:

- Manifest scene count represented  
- Frame count  
- Duration  
- FPS  
- Resolution  
- Codec/container  
- Audio presence  
- Final frame  
- Final caption  
- Final narration boundary  
- File size > minimum threshold  

A renderer must not return success before validation completes.

---

## Export Fingerprint

```ts
export interface ExportFingerprintInput {
  readonly manifestVersion: number;
  readonly storyFingerprint: string;
  readonly rendererVersion: string;
  readonly captionVersion: string;
  readonly motionVersion: string;
  readonly transitionVersion: string;
  readonly audioVersion: string;
  readonly outputFormat: string;
  readonly codecProfile: string;
}
```

> Every export must be traceable to a frozen manifest and renderer version.

Supports cache invalidation, retry diagnosis, regression analysis, reproducibility, and device QA.

---

## Chunking Is an Implementation Detail

> Chunking must remain internal to the renderer.

Outside systems must not depend on:

- chunk size  
- chunk count  
- segment boundaries  
- concat mechanism  
- temporary file names  

The manifest describes one continuous project. The renderer may internally split, render, encode, concatenate, and validate without changing semantic timing.

---

## Format Adapter Rule

```ts
export interface ExportFormatAdapter {
  readonly format: "webm" | "mp4";

  validate(manifest: ExportManifest): ExportCapabilityResult;

  render(
    manifest: ExportManifest,
    context: ExportRenderContext
  ): Promise<ExportArtifact>;
}
```

Format adapters own:

- container  
- video codec  
- audio codec  
- MIME type  
- extension  
- mux strategy  
- format validation  

Shared render semantics must stay outside format adapters.

---

## Error Contract

Every export failure must preserve:

- stage  
- code  
- cause  
- manifest fingerprint  
- renderer version  
- format  
- resolution  
- frame count  

User-facing errors may be friendly; internal errors must remain typed.

```ts
export interface ExportPipelineError extends Error {
  readonly stage: ExportStage;
  readonly code: string;
  readonly manifestFingerprint: string;
  readonly cause?: unknown;
}
```

(Existing `ExportPipelineError` in `export-pipeline-forensics.utils.ts` must be extended to satisfy this contract in Sprint 6B.)

---

## Retry Contract

After failure:

- Renderer resources are disposed  
- FFmpeg worker is reset if poisoned  
- Temporary files are removed  
- MediaRecorder is stopped  
- Canvas tracks are stopped  
- Pending callbacks are invalidated  
- Retry begins from a newly built manifest  

A retry must not reuse failed transient state.

---

## Golden Export Projects

Permanent QA suite before any Export Reliability freeze:

| ID | Project |
|----|---------|
| Golden A | Image only |
| Golden B | Video only |
| Golden C | Image → video → image |
| Golden D | Captions and animations |
| Golden E | Narration + music |
| Golden F | Motion + transitions |
| Golden G | Full mixed-media project |

For each, validate: duration, frame count, scene order, caption timing, audio presence, final frame, resolution, codec/container metadata.

---

## Definition of Done

This contract is satisfied only when:

1. ExportManifest is the sole renderer input.  
2. Manifest is immutable.  
3. Preflight runs before rendering.  
4. Unsupported capabilities are blocked.  
5. Shared semantics feed Preview and Export adapters.  
6. Export either succeeds completely or fails explicitly.  
7. Final output is validated.  
8. Retry starts from clean state.  
9. Golden exports pass.  
10. Real device QA passes.

---

## Non-Goals (Sprint 6A.1)

This documentation phase does **not** implement:

- ExportManifest production code  
- Capability preflight production code  
- Chunked rendering  
- Server rendering  
- WebCodecs  
- New formats  
- New effects  
- New transitions  
- Story Intelligence  

Sprint 6B implements the contract gate (manifest, fingerprint, preflight, renderer selection).  
Sprint 6C implements manifest-only rendering + RenderContext + canonical timing.  
Sprint 6D+ continues toward chunked browser memory safety and golden execution.
