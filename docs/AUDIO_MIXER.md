# Audio Mixer v1

**Status: complete and frozen** (Creator Experience **3.9.2**). Default production behavior for legacy drafts is unchanged unless creators adjust mixer settings or stem gains exceed safe thresholds.

The **Audio Mixer** gives creators independent control over voice, background music, and master output levels in the editor. Resolved settings drive **both preview and export** through a shared `resolveAudioMixerSettings(script)` path.

**Module:** `src/features/audio-mixer/`  
**UI:** `ProjectAudioStudio` → **Audio Mixer** panel (between Background Music and Export Mix)  
**Verification:** `npm run test:audio-mixer`, `npm run test:audio-mixer-ui`, `npm run test:export-background-music`

---

## What shipped in v1

| Capability | Detail |
|------------|--------|
| **Independent volume buses** | Voice, music, and master sliders (0–200%, step 5%) |
| **Story model** | Optional `FootieScript.audioMixer` — written on first adjustment |
| **Legacy compatibility** | Drafts without `audioMixer` resolve defaults from `backgroundMusic` |
| **Preview/export parity** | Stem gain = `voice.volume × master.volume` / `music.volume × master.volume` |
| **Preview voice boost** | Voice > 100% uses Web Audio `GainNode` (HTMLMediaElement caps at 1.0) |
| **Export ducking** | Music attenuates during voiceover: `musicGain × duckingStrength` |
| **Peak protection** | Auto when stem gain > 1.0 or `peakProtection` / `limiterEnabled`; FFmpeg `alimiter` + preview compressor |

---

## Mixer resolution

```
FootieScript
  ├── audioMixer?          (optional overrides)
  └── backgroundMusic      (legacy music volume, ducking, fades)
        ↓
resolveAudioMixerSettings(script)
        ↓
  voice · music · master buses
        ↓
Preview playback · Browser export mix · FFmpeg mux
```

**Stem gains (preview = export):**

- Voice: `voice.volume × master.volume`
- Music: `music.volume × master.volume` (before ducking/fades)

**Ducking (preview + export v1):** When ducking is enabled and voiceover is present, music is reduced for the **full voiceover duration** using `duckingStrength` as a multiplier (default 35% — music plays at 35% of stem gain under narration).

**Peak protection (v1):** Activates when `master.peakProtection`, `master.limiterEnabled`, or any stem gain exceeds 1.0. Preview routes voice through a `DynamicsCompressorNode`; export applies post-mix FFmpeg `alimiter` (~0.98 ceiling). Stem gain math is unchanged — limiting happens after gain application.

---

## UI (Project Audio Studio)

| Section | Controls |
|---------|----------|
| **Voice** | Voice Volume; Normalize Voice (coming soon) |
| **Music** | Music Volume; Enable Ducking; Ducking Strength (when ducking on) |
| **Master** | Master Volume; **Peak Protection** (wired); Limiter (coming soon) |

Peak Protection can be toggled manually. Boosted stems (> 100%) also trigger protection automatically even when the toggle is off.

---

## Implementation map

| Area | Files |
|------|--------|
| Data model | `audio-mixer.types.ts`, `audio-mixer.defaults.ts`, `audio-mixer.utils.ts` |
| UI | `AudioMixerPanel.tsx`, `AudioMixerSlider.tsx` |
| Preview voice gain | `preview-voice-gain.utils.ts`, `usePreviewPlayback.ts`, `audio-engine.service.ts` |
| Preview music | `preview-background-music.utils.ts` |
| Export mix settings | `export-background-music.utils.ts` |
| FFmpeg mux | `ffmpeg.utils.ts` |
| Browser export mix | `export-browser-audio-mix.utils.ts` |
| Peak protection | `audio-mixer.peak-protection.utils.ts` |

---

## Verification

```bash
npm run test:audio-mixer
npm run test:audio-mixer-ui
npm run test:export-background-music
npm run test:preview-background-music
```

Covers: default resolution, legacy drafts, slider bindings, preview voice boost parity, export ducking, peak protection triggers, immutability, and integration with `ProjectAudioStudio`.

---

## Known future improvements (post-v1)

Not blockers for Audio Mixer v1 freeze:

| Item | Notes |
|------|--------|
| **Normalize Voice** | Loudness normalization — UI placeholder only |
| **Limiter UI** | Full limiter toggle — data field exists; UI still “Coming soon” |
| **Preview music boost > 100%** | Music still capped by `HTMLMediaElement.volume` in preview |
| **FFmpeg music fades** | Browser export mix applies fade envelopes; FFmpeg music chain uses ducking step without fade filters |
| **Scene/word-level ducking** | v1 ducks entire voiceover window only |

---

## Freeze policy

**Audio Mixer v1 is frozen.** Changes should be bug fixes or explicit milestones (e.g. normalization, advanced limiter). Do not alter stem gain math, ducking semantics, or peak protection triggers without a versioned milestone and verification updates.

**Next product milestone:** Creator Templates **3.10**.

Related: [EDITING.md](./EDITING.md) · [RENDERING.md](./RENDERING.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
