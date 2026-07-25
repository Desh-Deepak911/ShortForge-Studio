# Sprint 11D Phase 2 — Frozen Audio Contract Authority Map

Read-only authority for headless voiceover + music mux. Do not invent fields absent from ExportManifest v2/`"8D"` or v3/`"9C"`.

## Frozen modes

| `ExportAudioModeManifest` | Mux combination |
|---|---|
| `silent` | silent (video-only WebM) |
| `voice` | voiceover only |
| `voice-with-music` | voiceover + music |

There is **no** frozen `music-only` mode. Music is prepared only when `mode === "voice-with-music"`. Headless mux may still exercise a music-only filter plan in unit fixtures for FFmpeg graph coverage; product freeze never emits it.

## Voiceover fields (`ExportAudioTrackManifest`)

| Field | Semantics |
|---|---|
| `source` | Owned-asset URL at freeze; headless materializes by slot `voiceover` |
| `durationMs` | Source narration length (ms) |
| `volume` | Stem gain = voice.bus × master |
| `generatedPlaybackRate` | Always `1` (Model A — never `atempo`/`asetrate`) |
| `sourceVoiceSpeed` | Metadata only |

Timeline start: **t = 0**. No offset/trim fields on the frozen track. Pad/trim to `project.renderDurationMs` per end policy (±150 ms overrun tolerance).

## Music fields (`ExportMusicTrackManifest`)

| Field | Semantics |
|---|---|
| `source` | Owned-asset URL; slot `music` |
| `volume` | Stem gain = music.bus × master |
| `duckingEnabled` / `duckingStrength` | Step-gain while `t < voiceover.durationMs/1000` |
| `fadeInMs` / `fadeOutMs` | Envelope (browser Offline mix authority) |
| `looping` | Literal `true` — loop input, trim to render end |

No frozen music `durationMs` / trimStart / trimEnd. Timeline start: **t = 0**.

## Shared audio fields

- `sourceVideoAudioPolicy: "muted"`
- `applyPeakProtection: boolean` — browser uses DynamicsCompressor; native FFmpeg uses `alimiter` when true

## Content vs render duration

- Visual freeze / captions: `project.contentDurationMs`
- Mux `-t` / frame count / audio pad target: `project.renderDurationMs`
- `renderDurationMs === contentDurationMs + endBufferMs`

## Browser parity target

Preferred WebM path: OfflineAudioContext mix + Opus MediaRecorder + stream-copy (`mixExportVoiceoverAndBackgroundMusic`).

Headless Phase 2 matches that envelope via a validated native filter plan (loop, duck step, fade multipliers from `resolveExportMusicGainAtSec` semantics), not the incomplete wasm music chain that omits `afade`.

## StoryDocument

Render/mux must not re-read live story. Freeze-time StoryDocument reads are expected only inside `buildExportManifest`. Missing frozen authority must stop implementation — not invent fields.

## Owned slots

- `voiceover\0\0\0hsrc:sha256:…`
- `music\0\0\0hsrc:sha256:…`

## Phase 3 seams (gated)

MP4, H.264, AAC, 1080p, 4K remain rejected before Chromium.
