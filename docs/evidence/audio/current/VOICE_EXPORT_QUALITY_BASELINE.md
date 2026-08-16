# Voice export quality baseline

> **Evidence status:** Baseline-only loudness/pause measurements plus later contract notes. Speed-path certification is [VOICE_SPEED_CLARITY_AUDIT.md](VOICE_SPEED_CLARITY_AUDIT.md). Do not treat the original LUFS table as a current export guarantee.

## Scope

Provider-free measurement of one real ShortForge Browser export against one creator-supplied reference Short. The media files remain local and are not committed.

This evidence now covers the advisory contract, the selected clarity-first speech path, shared generated-speech mastering, and fast-cadence guidance. Export never applies an additional playback-speed transform. The later pitch-preserved multi-speed implementation is certified in `VOICE_SPEED_CLARITY_AUDIT.md`.

## Measured evidence

| Metric | ShortForge Browser export | Creator reference |
| --- | ---: | ---: |
| Integrated loudness | -26.5 LUFS | -15.1 LUFS |
| True peak | -7.7 dBTP | +0.4 dBTP |
| Loudness range | 4.0 LU | 1.8 LU |
| Detected silences (at -45 dB, >=60 ms) | 18 | 0 |
| Total detected silence | 5.301 s | 0 s |
| Longest detected silence | 0.786 s | 0 s |
| Maximum encoded packet gap | 1 ms | 0 ms |

## Classification

- The ShortForge output is materially quiet and pause-heavy.
- Encoded packet timing remains continuous. The perceived discontinuity is present in the narration signal, not introduced by WebM mux corruption.
- In the original baseline, 1.25x speed was baked into provider output; export did not apply a second speed transform. Newly generated non-1x narration now uses the pitch-preserved canonical-audio path.
- The reference is aggressively mastered and exceeds a safe true-peak ceiling. ShortForge should target comparable perceived loudness without copying the clipped peak.

## Initial contract

- Target integrated loudness: -16 LUFS.
- Creator-ready band: -18 to -14 LUFS.
- True-peak ceiling: -1 dBTP.
- Transport gaps and cadence pauses are classified separately.
- Missing or weak measurements never block generation or export.

## Controlled speech-path listening decision

A single football narration, voice (`alloy`), and loudness-matched listening level were used to separate model quality from speed artifacts. The comparison included `gpt-4o-mini-tts`, `tts-1`, and `tts-1-hd` at 1.0x, 1.1x, and/or 1.25x. The creator selected the `tts-1-hd` 1.0x sample (candidate C) as the clearest result. The `tts-1-hd` 1.1x sample (candidate D) retained a light audible flutter.

Implementation policy:

- Compatible voices use `tts-1-hd` for clarity, including expressive presets; existing style instructions remain attached.
- Voices that require `gpt-4o-mini-tts` remain on that model rather than creating an unsupported voice/model combination.
- 1.0x remains the default and is identified in the UI as the clearest option.
- Faster options remain available and never block generation. They now use a lossless 1.0x source plus pitch-preserving tempo conversion; the old flutter warning has been retired.
- Existing drafts must regenerate narration to receive the selected model and explicit generated-audio provenance.

## Implemented mastering result

The capability-gated `generated_speech_v1` plan is applied only when narration provenance is explicitly `generated`. Browser FFmpeg, Browser offline voice+music mixing, and Headless consume the same parameter authority. Uploaded and legacy/unknown narration are not auto-mastered.

The first aggressive mastering candidate reached -16.2 LUFS but reduced crest factor from 9.2 to 5.1 and was rejected by listening as grainy. It was replaced with a gentler single-compressor plan. On the creator-selected C sample, the final plan measured -15.8 LUFS, -1.1 dBTP, and 5.44 crest factor; the rejected aggressive plan measured -15.2 LUFS, -2.0 dBTP, and 4.09 crest factor.

The original real ShortForge export remains useful as the regression baseline:

| Metric | Before | `generated_speech_v1` |
| --- | ---: | ---: |
| Integrated loudness | -26.5 LUFS | creator-ready target band |
| True peak | -7.7 dBTP | bounded below the -1 dBTP ceiling |
| Maximum encoded packet gap | 1 ms | 0 ms |

The selected plan enters the creator-ready loudness band while retaining safer peak headroom and more transient shape than the rejected aggressive plan. Mastering does not remove cadence pauses and does not contain `atempo`/`asetrate`. Browser WebM and all Headless output profiles now use 128 kbps audio instead of 96 kbps to avoid adding unnecessary codec loss after synthesis and mastering.

At speeds >=1.2, the provider input receives a generic formatting cleanup: line breaks, ellipses, long dashes, and repeated terminal punctuation no longer request exaggerated pauses. Instruction-capable voices additionally request continuous delivery with brief natural sentence pauses and explicitly forbid word/fact changes. The persisted narration, words, fact order, selected speed, and exported playback rate remain unchanged.

## Compatibility boundary

- Newly generated narration records `voiceoverSourceKind: generated` and freezes ExportManifest v5 capability `generated-voice-mastering-v1`.
- Uploaded narration records `voiceoverSourceKind: uploaded` and remains untouched.
- Existing drafts without provenance remain untouched; regenerating narration opts them into mastering safely.
