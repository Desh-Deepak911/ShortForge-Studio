# Export Capabilities

> **Status:** Historical Sprint 6A inventory. Current path and resolution rules: [../architecture/PREVIEW_AND_EXPORT.md](../architecture/PREVIEW_AND_EXPORT.md). Voice speed is no longer “Model A only”; see [VOICE_GENERATION.md](VOICE_GENERATION.md). Manifest versions: [../architecture/EXPORT_MANIFEST_AND_CAPABILITIES.md](../architecture/EXPORT_MANIFEST_AND_CAPABILITIES.md).

Sprint 6A inventory of what ShortForge Studio Preview and Export actually support.

## Formats

| Format | Supported as export? | Container | Video | Audio | Extension | MIME | Notes |
|--------|----------------------|-----------|-------|-------|-----------|------|-------|
| WebM | Yes | WebM | VP8/VP9 (MediaRecorder + libvpx CFR) | Opus | `.webm` | `video/webm` | Default |
| MP4 | Yes* | MP4 | H.264 (`libx264`) | AAC | `.mp4` | `video/mp4` | *Gated by runtime codec probe (Sprint 6F); blocked when probe fails |
| WebP | **No** | — | — | — | — | — | Not in Export UI (do not confuse with WebM) |
| GIF | No | — | — | — | — | — | — |
| MOV | Input only | — | — | — | — | — | Upload MIME, not export |

## Export UI options → production

| Control | UI values | Production effect |
|---------|-----------|-------------------|
| Format | WebM, MP4 | Selects path; never silent rewrite |
| Resolution | 1080×1920, 720×1280 | Canvas width/height; **1080p is capability-gated (6F.1)** |
| Quality | standard, high | Bitrate only (1080p 6M/8M; 720p 4M/6M) |
| FPS | Shown as 30; **not selectable** | Hardcoded 30 |
| Aspect | Shown 9:16; **not selectable** | Implied by resolution pairs |
| Include narration | checkbox | `audioMode` silent \| with-voice |
| Include background music | checkbox | Story `backgroundMusic.enabled` + mix |
| Filename | text | Sanitized download basename |
| Platform preset | generic / YT / IG / X | Patches recommended settings |
| Watermark | Always-on disabled checkbox | Always burned in on canvas (`FOOTIEBITZ`) |

### UI bugs / fiction

- Profile id `generic_mp4` recommends `format: "webm"` — label/settings mismatch.
- FPS / aspect appear informational only.
- Watermark cannot be disabled.
- Preview chrome “FootieBitz” ≠ export burn-in “FOOTIEBITZ”.

## Audio modes

| Mode | Behaviour |
|------|-----------|
| Silent | No mux; download visual only |
| Voice only | Mux voiceover (Opus/AAC by format) |
| Voice + music | Browser mix + stream-copy (WebM) or FFmpeg mix; ducking/fades |
| Voice-only fallback | Music merge failed |
| Silent fallback | All mux failed — **must remain user-visible** |

Source video audio is intentionally muted / not muxed.

## Voice speed

- **Model A:** TTS bakes speed into MP3 duration.
- Preview `playbackRate = 1`.
- Export does not apply `atempo` for story speed prefs.
- Changing speed requires regeneration to update duration/captions/scenes (unless manual scene durations preserved).

## Media

| Feature | Preview | Export |
|---------|---------|--------|
| Images fit/fill/pan/zoom | Yes | Yes |
| Shared motion | Yes | Yes |
| Video trim + hold-last-frame | Yes | Yes |
| Video unmute / source audio | No | No |
| Playback rate | No | No |
| Transitions | Yes | Yes (peer-timing risk under refit) |
| Captions + animations | Yes | Yes (font/wrap fidelity Partial) |

## Blocking gates (today)

- Story sync: narration dirty, voice dirty, missing media, no scenes
- Format path blocked only if WebM flagged unavailable (currently always available)
- Narration requested without playable voiceover URL

**Gates (6F.1):** capability-based resolution approval (`approveExportResolution`), memory peak estimate, MP4 runtime probe, worker poison flag.

## Memory / resolution profiles (estimate)

| Profile | Classification (chunked browser) |
|---------|----------------|
| 10s / 720p / 30 | Approved |
| 30s / 720p / 30 | Approved with warning (borderline) |
| short image-heavy / 1080p / 30 | Approved |
| short mixed / 1080p / 30 | Approved with warning |
| video-heavy long / 1080p / 30 | Blocked — try 720p or server renderer |
| video-heavy long / 1080p + `NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1` | Approved with warning (dev/experimental only) |

### Developer 1080p override

```bash
NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1
```

- Development/testing only (non-secret feature flag)
- Embedded into the **client** build (`NEXT_PUBLIC_*` required — a bare `SHORTFORGE_*` flag is invisible in the browser)
- Requires restarting the Next.js server after changing `.env.local`
- Bypasses only the 1080p memory/capability blocker; does **not** bypass missing media, codecs, poison, trim, or format blockers
- Do not enable in production until real 1080p device QA is complete

## Browser matrix

| Feature | Chrome | Safari | Firefox |
|---------|--------|--------|---------|
| MediaRecorder WebM | Strong | Limited / may lack VP9 | Variable |
| `captureStream(0)` + `requestFrame` | Yes | Partial | Partial |
| RVFC | Yes | Yes (recent) | Partial |
| FFmpeg.wasm memory | Best | Constrained | Constrained |
| WebCodecs | Yes | Partial | Partial |

**Target for Sprint 6:** Chromium-first reliability; Safari/Firefox capability preflight.

## Related

- `docs/architecture/EXPORT_CONTRACT.md` (formal guarantees for all export paths)
- `docs/qa/export-preview-parity-matrix.md`
- `docs/product/EXPORT_TIMING_MODEL.md`
- `docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md`
- `docs/archive/sprints/EXPORT_RELIABILITY_SPRINT.md`
