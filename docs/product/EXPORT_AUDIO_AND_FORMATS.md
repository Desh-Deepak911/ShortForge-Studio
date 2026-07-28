# Export Audio & Formats (Sprint 6E)

> Finalization after the validated silent visual: audio policy, format adapters, end-of-project guarantees, and artifact validation.

## Pipeline

```text
Validated silent visual (chunked concat)
        ↓
prepareExportAudio(manifest)
        ↓
resolveExportAudioEndPolicy()
        ↓
buildExportAudioFilterGraph()   // semantic; codecs in adapters
        ↓
WebM or MP4 format adapter mux
        ↓
validateFinalExportArtifact()
        ↓
download
```

## Audio modes

| Mode | Behaviour |
|------|-----------|
| `silent` | Video-only container (no forced silent AAC/Opus track) |
| `voice` | Mux narration; pad with silence to project end |
| `voice-with-music` | Loop+trim music, duck while voice active, fade-out at project end |

Source-video audio is always **muted**.

## Voice-speed Model A

```text
Selected speed → TTS → audio file already at final speed
Preview playbackRate = 1
Export must NOT apply atempo / asetrate
```

`sourceVoiceSpeed` is metadata only. `generatedPlaybackRate` is always `1`.

## Music semantics (preserved)

- **Loop:** music input only (`aloop` / browser schedule), never mixed output, never voice
- **Ducking:** step-gain while narration is active (not sidechaincompress)
- **Fades:** fade-out anchored to `manifest.project.renderDurationMs` (browser mix applies envelope; FFmpeg path uses duration trim + volume)

## End-of-project

Canonical end: `manifest.project.renderDurationMs` (= content + `endBufferMs`, typically 400ms).

- No `-shortest`
- `-t` only as project duration (seconds)
- Final global frame / caption / scene resolved from frozen manifest

## Format adapters

| | WebM | MP4 |
|--|------|-----|
| Video | stream-copy validated visual | `libx264` (single-pass mux or silent transcode) |
| Audio | Opus (`libopus` or browser-mix copy) | AAC |
| Fast start | — | `movflags +faststart` |
| Extension / MIME | `.webm` / `video/webm` | `.mp4` / `video/mp4` |

**Never** download WebM bytes with an `.mp4` name.

## Fallbacks

Automatic capability reduction is **not** applied.

`ExportFinalizationError.availableFallbacks` lists:

```text
retry | voice-only | silent | webm
```

User must pass `FootieExportOptions.audioFallback` to opt in.

## Modules

| Path | Role |
|------|------|
| `src/features/export/audio/` | Prepare, end policy, graph, Model A guards |
| `src/features/export/formats/` | WebM/MP4 adapters, end-of-project, mux duration audit |
| `src/features/export/validation/` | Final artifact validation |

## Future

- Broader Safari/Firefox golden binary device matrix (see `docs/qa/export-device-results.md`)
- Dynamic ducking (sidechain) if wasm-stable
- FFmpeg `afade` parity with browser mix

## Sprint 6F notes

- Runtime MP4 probe: `probeExportMp4Runtime()` — do not assume package version alone.
- Explicit fallback UI: typed `ExportFinalizationError.availableFallbacks` only; user must choose.
- Device QA harness: `/dev/export-qa` (dev only).
