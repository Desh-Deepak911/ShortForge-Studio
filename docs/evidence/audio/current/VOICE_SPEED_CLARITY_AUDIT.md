# Voice speed clarity audit

## Outcome

Generated narration now keeps the proven native `tts-1-hd` path at 1.0x. Every
other supported preset (0.75x, 0.9x, 1.1x, 1.25x, and 1.4x) starts from a
lossless normal-speed provider render and receives one pitch-preserving FFmpeg
`atempo` conversion. The resulting MP3 is the canonical narration asset used by
Preview, Browser export, and Headless export; those consumers never apply speed
again.

If local tempo rendering is unavailable, generation retries with the previous
provider-baked speed rather than failing voice creation. The response identifies
that exceptional path as `provider_fallback`.

## Why the path changed

The earlier controlled listening baseline established that `tts-1-hd` at 1.0x
was clear, while provider-baked 1.1x and 1.25x could introduce audible flutter or
grain before export. Because that damage was already present in the source MP3,
Browser or Headless mastering could not restore it.

The new path protects the clean source before changing tempo:

1. Request lossless WAV at provider speed 1.0.
2. Apply speech-oriented, pitch-preserving `atempo` exactly once.
3. Encode the canonical mono MP3 at 48 kHz / 192 kbps.
4. Apply the existing shared export mastering and final 128 kbps transport.

Uploaded and legacy voiceovers are unchanged.

## Real production certification

One fixed narration, `alloy`, and `tts-1-hd` were generated through the real
production service. No fallback occurred.

| Selected speed | Rendering authority | Decoded duration | Canonical format |
| --- | --- | ---: | --- |
| 0.75x | pitch_preserved | 19.608 s | MP3, 48 kHz mono, 192 kbps |
| 0.9x | pitch_preserved | 15.960 s | MP3, 48 kHz mono, 192 kbps |
| 1.0x | native | 14.856 s | MP3, 24 kHz mono, 128 kbps |
| 1.1x | pitch_preserved | 13.320 s | MP3, 48 kHz mono, 192 kbps |
| 1.25x | pitch_preserved | 11.880 s | MP3, 48 kHz mono, 192 kbps |
| 1.4x | pitch_preserved | 10.560 s | MP3, 48 kHz mono, 192 kbps |

Raw pre-mastering loudness stayed stable across the ladder (-24.5 to -25.0
LUFS). True peak stayed between -7.9 and -9.3 dBTP. This indicates the tempo
stage did not create loudness jumps or clipping. Creator listening remains the
authority for subjective voice preference.

## Creator-reference comparison

The new 1.25x production voice was passed through the shipping
`generated_speech_v1` mastering plan and encoded at the export audio rate, then
measured against the original ShortForge export and the creator-supplied
YouTube Short reference.

| Metric | Original ShortForge | New mastered 1.25x | Creator reference |
| --- | ---: | ---: | ---: |
| Integrated loudness | -26.5 LUFS | **-15.7 LUFS** | -15.1 LUFS |
| Loudness range | 4.0 LU | **1.7 LU** | 1.7 LU |
| True peak | -7.7 dBTP | **-5.2 dBTP** | +0.4 dBTP |
| Silence at -45 dB, >=60 ms | 5.301 s | **1.000 s** | 0 s |
| Longest detected silence | 0.786 s | **0.293 s** | 0 s |
| Maximum encoded packet gap | 1 ms | **0.001 ms** | 0 ms |

The perceived-loudness gap fell from 11.4 LU to 0.6 LU. The new result matches
the reference's loudness range without copying its clipped +0.4 dBTP peak. The
reference contains a continuous music/background bed, so its zero detected
silence is not a speech-only cadence target. The new voice retains brief natural
sentence pauses while cutting the original ShortForge detected silence by 81%.

These measurements certify loudness, dynamics, cadence gaps, transport
continuity, and the removal of provider-baked speed as the source authority.
They cannot prove subjective timbre or the complete absence of audible flutter;
the creator-reference listening comparison remains required for that judgment.

Local artifacts are gitignored under `.tmp/voice-speed-production-cert/`.

## Compatibility and failure behavior

- The pinned renderer binary is included only in the two Node voice routes.
- A 60-second renderer timeout prevents a stuck conversion process.
- 1.0x performs no extra decode or encode.
- Existing canonical files remain valid and are not reinterpreted.
- Browser and Headless export filters remain speed-free, preventing double speed.
- Voice generation remains available through provider fallback if conversion
  cannot run.
