# Sprint 11D Phase 2.1 — Audio Timing, Staging, Envelope Authority

## Voice trim / pad (plan-consumed)

Voice FFmpeg stem (validated plan only):

```text
aresample+aformat
→ atrim=sourceTrimStart:sourceTrimEnd
→ asetpts=PTS-STARTPTS
→ adelay=requireDelayMs (stereo; skipped when 0)
→ apad=whole_dur=outputDuration
→ atrim=0:outputDuration
→ volume=volumeGain
```

A source longer than `voiceover.durationMs` is cut at `sourceTrimEndMs`.
A shorter source ends naturally; `apad` fills to project end; final `atrim` hard-caps.

## Music plan fields consumed

```text
aloop (when looping)
→ atrim=0:loopUntilOutputMs/1000
→ asetpts=PTS-STARTPTS
→ adelay=requireDelayMs (skipped when 0)
→ volume='envelope(t)':eval=frame
```

Removed from music plan: unused `sourceTrimStartMs` (frozen music has no source trim).

## Canonical music envelope

**Authority:** multiplicative model in `export-music-envelope.utils.ts`

`gain(t) = baseDuck(t) × fadeInMul(t) × fadeOutMul(t)`

Browser OfflineAudioContext now applies a sampled curve from this authority
(`setValueCurveAtTime`). Prior discrete automation diverged when fade-out
overlapped an active duck window — documented as a bug and closed.

Headless FFmpeg volume expressions are built from the same pure function’s
closed form (identical algebra).

## Peak protection policy

Browser `DynamicsCompressor` and native FFmpeg `alimiter` are
**intentionally policy-equivalent, not waveform-identical**:

| | Browser | Native headless |
|---|---|---|
| Trigger | `applyPeakProtection` | same frozen flag |
| Ceiling | ~0.98 linear (`PEAK_PROTECTION_OUTPUT_CEILING`) | `alimiter=limit=0.98:…` |
| Waveform | compressor dynamics | look-ahead limiter |

Fixtures prove: off preserves stem gain; on keeps peaks under the ceiling;
artifact samples remain finite.

## Audio descriptor preflight

Before any `openOwnedObject` / workspace write: resolve voiceover/music
descriptors by canonical slot, validate MIME + safe integer `byteLength`,
enforce `maxSingleAudioAssetBytes` and `maxAggregateAudioBytes` with
overflow-safe addition.

## Cancellation

Shared job `AbortSignal` flows into materialization. Checks surround each
open/digest/reserve/write. Partial stages are not returned; workspace cleanup
runs in `finally`.
