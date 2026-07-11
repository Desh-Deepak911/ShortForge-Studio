# Export Timing Model

Canonical clocks for ShortForge Studio Preview and Export (Sprint 6A).

## Hierarchy

```text
FootieScript
  → buildOptimizedMasterTimeline({ mode, useVoiceoverRefit })
      contentEndMs     // last visual/caption-readable moment
      endBufferMs      // TIMELINE_END_BUFFER_MS = 400
      renderDurationMs // contentEndMs + endBufferMs  ← project end authority
  → resolveTimelineVisualTimeMs(t) = min(t, contentEndMs)  // freeze motion/captions in buffer

Export only:
  frameIndex → resolveTimelineFrameSampleTimeMs(i, fps)  // frame-center sample
  → draw → requestFrame() → MediaRecorder (wall-clock container, NOT semantic)
  → FFmpeg extract (-vsync 0) + encode (-framerate fps)   // CFR rebuild
  → mux -t (renderDurationMs / 1000)
```

## Time domains

| Domain | Unit | Source | Consumer | Conversion / clamp | Ownership |
|--------|------|--------|----------|--------------------|-----------|
| Project / render time | ms | `MasterTimeline.renderDurationMs` | Preview progress, export frame count, mux `-t` | — | Timeline intelligence |
| Content / visual time | ms | `contentEndMs` | Motion, captions, active scene freeze | `min(t, contentEndMs)` | Timeline intelligence |
| End buffer | ms | `TIMELINE_END_BUFFER_MS` (400) | Tail hold | Added after content end | Timeline intelligence |
| Subtitle readable hold | ms | `TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS` (400) | Extends content end | After final subtitle end | Timeline intelligence |
| Scene start / end | ms | Scene track / refit | Active scene resolution | Inclusive window | Timeline + story |
| Scene elapsed | ms | `timelineTime - sceneStart` | Motion, video clip, captions | Clamped to scene duration | Shared resolvers |
| Frame start time | ms | `floor(i * 1000 / fps)` | Diagnostics | Discrete | Export |
| Frame sample time | ms | `round((i + 0.5) * 1000 / fps)` | Export draw/caption/media | Discrete vs continuous preview | Export |
| Frame count | count | `ceil(renderDurationMs * fps / 1000)` | Capture accounting | Inclusive through buffer | Export |
| Video source / clip time | ms | `trimStart + sceneElapsed` clamped to trim end | Preview video / export seek | Hold last frame past trim | Media Playback Engine |
| Caption global time | ms | MasterTimeline subtitle events | Preview/Export subtitle display | Visual-time clamp | Caption / timeline |
| Caption scene-local | ms | Scene elapsed | Generated captions, legacy path | Scene bounds | Caption utils |
| Word / chunk timing | ms | equal or word_weighted strategies | Subtitle chunks | Derived from narration | subtitle-timing |
| Transition progress | 0–1 | Overlay window on outgoing scene | CSS / canvas layers | Duration-capped | Timeline transitions |
| Motion progress | 0–1 | Scene-local elapsed / duration | Preview CSS / export canvas | Shared media-motion engine | media-motion |
| Voiceover duration | ms | Generated MP3 metadata | Timeline narration lane, ducking | Canonical after TTS | Audio / story |
| Music duration | ms | Matches export/preview project span | Loop + fade envelopes | `exportDurationMs` | Audio mixer |
| MediaRecorder wall-clock | s | Browser capture timestamps | Raw WebM only | **Not semantic** | Capture |
| FFmpeg packet time (raw) | s | Demux of raw WebM | Extract only | Ignored via `-vsync 0` | Normalize |
| Normalized visual time | s | `frameIndex / fps` | Playback after encode | Sole CFR authority | Normalize |
| Export wall-clock | ms | `performance.now()` | Progress / diagnostics | May be ≫ realtime | Export UX |

## End-of-project policy

### Preview (narration mode)

1. Master clock follows narration `currentTime`, then wall-clock tail-hold.  
2. Stops when `timelineClockMs >= renderDurationMs`.  
3. Visuals/captions freeze at `contentEndMs` during the end buffer.  
4. Final subtitle readable hold is included in `contentEndMs` composition.

### Export

1. `prepareStoryForExport()` sets `exportDurationMs = masterTimeline.renderDurationMs`.  
2. Renders `ceil(exportDurationMs * fps / 1000)` frames using frame-center samples.  
3. Same visual freeze via `resolveTimelineVisualTimeMs`.  
4. Mux duration uses full `exportDurationMs` (includes buffer).  
5. Normalized visual duration must ≈ `capturedFrameCount / fps`.

### Required single resolver (Sprint 6C)

Introduce or formalize:

```ts
resolveProjectRenderEndMs(timeline): number // === renderDurationMs
```

Guarantees: final narration, final caption (incl. readable hold), final visual frame, final transition, configured end buffer.

## Voice speed model

**Model A (production):** Speed is applied at TTS generation. Generated audio duration is canonical. Preview forces `playbackRate = 1`. Export muxes the MP3 as-is.

Prefs (`voiceSettings.speed`) do not live-stretch audio until regeneration.

## Known timing deltas

1. Preview continuous audio clock vs export frame-center samples (~0.5/fps).  
2. Transition peer elapsed: Preview may use editor `scene.startMs`; Export uses refitted scenes after voiceover refit.  
3. Browser TTS preview mode does not use MasterTimeline-global clock — not comparable to export.  
4. Raw MediaRecorder duration must never drive playback speed.

## Related docs

- `docs/EXPORT_DETERMINISTIC_CAPTURE.md`  
- `docs/EXPORT_FAILURE_FORENSICS.md`  
- `docs/qa/export-preview-parity-matrix.md`  
