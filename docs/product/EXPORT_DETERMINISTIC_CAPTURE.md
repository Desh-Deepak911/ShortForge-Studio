# Deterministic Mixed-Media Export (4.2C-8)

## Semantic frame clock

Export wall-clock duration may exceed project duration. **Encoded playback duration must always equal semantic project duration.**

```text
MasterTimeline.renderDurationMs
  → totalFrames = ceil(durationMs × fps / 1000)
  → exportTimestampMs = resolveTimelineFrameSampleTimeMs(frameIndex, fps)
  → active scene / media / captions / transitions
  → canvas draw
  → captureStream(0) + requestFrame(frameIndex)   // exactly once
  → MediaRecorder silent WebM (wall-clock timestamps — not semantic)
  → always CFR rebuild: extract frames (-vsync 0) + image2 -framerate encode
  → validate normalized duration ≈ capturedFrameCount / fps
  → audio mux (-c:v copy, -t project duration)
```

## Manual canvas capture

| Rule | Requirement |
|------|-------------|
| Stream | `canvas.captureStream(0)` only — never `captureStream(fps)` |
| Emit | `track.requestFrame()` only after full frame draw |
| Sleep | No `sleep(1000/fps)` pacing |
| Accounting | `drawn === captured === totalFrames` |

`requestFrame()` guarantees **ordered frame content and count**. It does **not** guarantee constant-FPS MediaRecorder timestamps.

Automatic wall-clock capture during video seeks caused duplicate frames, inflated silent WebM duration, and mux `-t` truncation of later scenes.

## Timestamp normalization (CFR rebuild)

Raw silent WebM timestamps are wall-clock and **not** semantic. Before audio mux:

```text
raw manual-capture WebM
  → FFmpeg extract: -vsync 0 → norm-frame-%06d.jpg   (ordered frames only)
  → FFmpeg encode: -framerate FPS -i frames -frames:v N -c:v libvpx
  → validate duration ≈ N/FPS and effective FPS ≈ requested FPS
  → mux with audio (-c:v copy)
```

`-framerate` on the image sequence is the **sole** timing authority.
Do not use conflicting `-r` + `-vsync 0` + `fps=` filter + `setpts` on the raw WebM.

Canonical visual duration: `capturedFrameCount / requestedFps`.


## Video source-time sampling

- Clip time = Media Playback Engine (`trimStart + sceneElapsed`, clamped)
- Source duration never extends scene duration
- Seek epsilon = `0.5 / exportFps` (never fixed 40ms)
- Skip seek when decoded frame already within tolerance
- Seek request tokens reject stale callbacks
- Scene switches reset sampling state

## Caption timestamps

Captions resolve from the same `exportTimestampMs` **before** media prepare and draw. Slow seeks must not freeze caption semantic time.

## Recorder flush

1. Final `requestFrame`
2. Minimal ingestion yield
3. `requestData()` when available
4. `stop()` + await `stop` event

## Visual duration validation

After silent capture:

1. Probe encoded duration when possible
2. Compute `effectivePlaybackFps = frameCount / encodedDurationSec`
3. If inflated (MediaRecorder wall-clock stamps), run `normalizeSilentVisualFrameTiming` (FFmpeg `setpts=N/(fps*TB)`, `-r fps`, `-t duration`)
4. Fail export if still invalid

## Audio mux

Mux still uses project duration (`-t`). It must not hide visual timing defects — normalize/validate **before** mux.

## Performance

Wall-clock realtime factor = `exportWallMs / projectMs` may be ≫ 1. That is acceptable. Playback speed must remain 1× semantic.

Primary remaining cost: HTML video seek/decode per output frame.

## Debug

`SHORTFORGE_EXPORT_FRAME_DEBUG=1` logs per-frame snapshots (filtered) and an `[ExportPerformance]` summary at completion.
