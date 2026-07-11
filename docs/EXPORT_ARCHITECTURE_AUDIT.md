# Export Architecture Audit

Sprint 6A — production export path inventory and reliability assessment.

## Accepted architectural decision

After Sprint 6A, the production export contract is:

**[`docs/EXPORT_CONTRACT.md`](./EXPORT_CONTRACT.md)**

It requires an immutable `ExportManifest`, capability preflight before render, Preview/Export shared-domain parity, complete-success-or-explicit-failure, and hybrid/chunked renderer selection. Sprint 6B implements that contract; this audit remains the evidence base.

## Active production paths

```text
prepareStoryForExport (MasterTimeline export mode)
        ↓
Canvas semantic renderer (drawSceneFrame)
        ↓
captureStream(0) + one requestFrame / semantic frame
        ↓
MediaRecorder raw WebM (wall-clock timestamps)
        ↓
normalizeSilentVisualFrameTiming
   extract (-vsync 0 → JPEG sequence in MEMFS)
   encode (-framerate FPS → libvpx WebM)
        ↓
probe + validate duration ≈ frameCount/fps
        ↓
Audio branch (optional)
   WebM+music: browser mix → stream-copy mux
   else: FFmpeg mux (libopus / AAC)
   fallbacks: voice-only → silent download
        ↓
MP4 path: transcode/mux to H.264+AAC if needed
        ↓
downloadBlob
```

| Path | Trigger | Formats | Resolutions | Media | Reliability | Memory | Fallback |
|------|---------|---------|-------------|-------|-------------|--------|----------|
| Manual canvas capture | Always | Intermediate WebM | 720/1080 | Image+video | High for frame count | Canvas + decode | Abort if no requestFrame |
| MediaRecorder raw | Always | Raw WebM | Same | Same | High content; bad timestamps | Moderate | Empty blob error |
| Full JPEG sequence normalize | Always | Normalized WebM | Same | Same | **Low at 1080p~30s** | **Very high** | Worker abort → generic UI |
| WebM stream-copy mux | WebM + mixed audio | WebM | Same | — | Medium-high | Low (copy) | Voice-only / silent |
| FFmpeg audio mux | MP4 or voice-only | WebM/MP4 | Same | — | Medium | Moderate | Voice-only / silent |
| MP4 transcode | MP4 finalize | MP4 | Same | — | Medium | Re-encode | Error |
| Server export | — | — | — | — | — | — | **Not implemented** |
| WebCodecs | — | — | — | — | — | — | **Not implemented** |

## Root reliability finding (4.2C-8D)

Full-resolution JPEG sequences for ~952 frames at 1080×1920 inside FFmpeg.wasm MEMFS are classified:

**Not viable for production 1080p browser export.**

Evidence: forensics viability model; repeated complete export failures with generic non-`Error` aborts after image-sequence normalize landed.

## Unsupported / fictional combinations

| Combination | Status |
|-------------|--------|
| WebP export | Not offered (good) |
| Selectable 60 FPS | Not offered; hardcoded 30 |
| 1440p / 4K via ExportPanel | Legacy presets exist; **not** in UI |
| Unmute source video in export | Not supported |
| Disable watermark | UI implies branding; always on |
| `generic_mp4` → MP4 | Bug: recommends WebM |
| 1080p + mixed video + full JPEG normalize | Displayed as available; **unsafe** |
| Silent fallback without clear copy | Possible today — violates core product rule until fixed |

## Duplicate / divergent logic

1. Video clip helpers: preview-video-clip vs media-playback (same math, two files).  
2. Transition peer timing under voiceover refit.  
3. Frame-center export vs continuous preview clock.  
4. Preview watermark chrome vs export burn-in.

## Retry & cancellation

| Concern | Finding |
|---------|---------|
| FFmpeg singleton | Reused across exports |
| Auto-reset after normalize OOM | **Missing** (reset used mainly on voice-only fallback) |
| MEMFS cleanup | Best-effort `finally` per normalize; poisoned worker may remain |
| MediaRecorder / tracks | Stopped in `finally` of silent render |
| Cancel mid-export | **Not implemented** |
| Consecutive exports | Unsafe if prior worker aborted |

## Proposed ExportManifest (design only)

```ts
interface ExportManifest {
  version: 1;
  projectDurationMs: number; // === MasterTimeline.renderDurationMs
  contentEndMs: number;
  fps: number;
  width: number;
  height: number;
  format: "webm" | "mp4";
  scenes: ExportSceneManifest[];
  captions: ExportCaptionManifest[];
  audio: ExportAudioManifest;
  branding: ExportBrandingManifest; // watermark always-on today
}
```

Freeze before render; do not re-read mutable editor state mid-loop.

## Proposed capability preflight (design only)

```ts
interface ExportCapabilityResult {
  supported: boolean;
  warnings: ExportWarning[];
  blockers: ExportBlocker[];
  recommendedMode?: "browser-720" | "browser-chunked" | "server-1080";
}
```

Example blockers: unsafe memory estimate, unsupported browser, missing media, worker unavailable, narration requested without audio.

## Architecture recommendation

### Near-term: **Option B — Chunked browser image sequence**

Bound peak MEMFS; keep semantic canvas capture; preserve CFR via per-chunk `-framerate` + concat.

### Concurrent product policy: **Option E — Hybrid**

| Mode | Use when |
|------|----------|
| Browser 720p / short / image-heavy | Safe |
| Browser chunked 1080p | After 6D proves concat |
| Server/worker 1080p / long / video-heavy / MP4 priority | When browser unsafe |

### Not recommended as sole path

- Option A (keep full 1080p JPEG sequence)  
- Option C (WebCodecs) until mux + Safari story exists  
- Option D alone without browser 720p path for fast iteration  

## Evidence gaps (device QA required)

1. Exact failing normalize stage on user machine (`SHORTFORGE_EXPORT_DEBUG=1`).  
2. Safari MediaRecorder + requestFrame matrix.  
3. Real JPEG byte sizes at 1080p for mixed photographic frames.  
4. Concat seam quality for chunked WebM.  
5. Caption font metrics parity on retina displays.  
