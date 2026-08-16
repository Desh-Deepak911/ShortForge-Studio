# Voice generation, speed, and mastering

This is the voice authority. Mixer buses are [AUDIO_MIXER.md](AUDIO_MIXER.md). Export muxing is [PREVIEW_AND_EXPORT.md](../architecture/PREVIEW_AND_EXPORT.md).

## Models

Compatible voices use **`tts-1-hd`** for clarity, including expressive presets. Voices that require **`gpt-4o-mini-tts`** stay on that model. The default UI voice is `alloy`.

Catalog voices: alloy, echo, fable, onyx, nova, shimmer. The resolver also accepts ash, ballad, coral, sage, verse, marin, and cedar.

`FEATURES.md` still mentions `tts-1` in places; that is stale. Source: `src/features/speech-style/` and `src/features/story/services/voiceover.service.ts`.

## Speeds

Supported presets: **0.75x, 0.9x, 1.0x, 1.1x, 1.25x, 1.4x**. Default is 1.0x and is identified as the clearest option.

- **1.0x** uses the native provider render.
- **Every other preset** starts from a lossless 1.0x render and applies one pitch-preserving FFmpeg `atempo` conversion. The resulting MP3 is the canonical narration asset.
- Preview, Browser export, and Headless **do not apply speed again**.

If local tempo rendering is unavailable, generation retries with provider-baked speed and labels that path `provider_fallback` instead of failing voice creation.

Evidence: [VOICE_SPEED_CLARITY_AUDIT.md](../evidence/audio/current/VOICE_SPEED_CLARITY_AUDIT.md).

## Mastering

Capability-gated profile `generated_speech_v1` applies only when narration provenance is explicitly **generated**. Browser FFmpeg, Browser offline voice+music mixing, and Headless share the same parameter authority.

Uploaded and legacy/unknown narration are **not** auto-mastered.

Target contract from the baseline (advisory; missing measurements never block generation or export):

- Integrated loudness target: -16 LUFS
- Creator-ready band: -18 to -14 LUFS
- True-peak ceiling: -1 dBTP

The original Browser-export baseline was quieter and more pause-heavy than a creator reference. That baseline is historical measurement, not a claim that current mastering matches the reference. See [VOICE_EXPORT_QUALITY_BASELINE.md](../evidence/audio/current/VOICE_EXPORT_QUALITY_BASELINE.md).

## Fallback and limits

- Single continuous MP3 for the full narration
- Provider max input length applies per TTS call
- Regenerating voiceover does not by itself rewrite scene timings unless a refit path runs
- Faster speeds remain available and must not block generation

## Related evidence

- Speed path certified: [VOICE_SPEED_CLARITY_AUDIT.md](../evidence/audio/current/VOICE_SPEED_CLARITY_AUDIT.md)
- Loudness baseline: [VOICE_EXPORT_QUALITY_BASELINE.md](../evidence/audio/current/VOICE_EXPORT_QUALITY_BASELINE.md)
