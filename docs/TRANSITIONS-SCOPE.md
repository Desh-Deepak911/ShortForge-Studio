# Transitions Scope Lock

**Status:** Locked — read before any transition rendering work.

Visual scene-to-scene transitions must not disturb the existing audio, subtitle, caption, or timing systems.

---

## Do not change

These systems are frozen while transitions are implemented:

| System | Notes |
|--------|--------|
| Voiceover generation | `/api/generate-voiceover`, `generateVoiceover`, Apply Changes flow |
| Voice speed control | `voiceSettings`, `VoiceSettingsCard`, proportional refit |
| Voiceover duration | `voiceoverDurationMs`, measured audio length, mux duration |
| Scene timing fields | `scene.durationMs`, `scene.startMs`, `scene.endMs`, `start`/`end`/`duration` |
| Subtitle chunk timing | Derived from `scene.durationMs / chunkCount` — never stored separately |
| Subtitle effects | fade-up, typewriter, highlight |
| Caption mode | generated vs subtitles |
| Generated captions | `subtitle`, `getDisplayCaption`, generated overlay path |
| Export audio track | FFmpeg mux, `voiceoverUrl`, silent-video fallback |
| Image fit/fill/position | `SceneImage` scale, x, y, rotation, fitMode |

**No transition work may modify, recalculate, or extend any of the above.**

---

## What transitions are

Transitions are **visual-only** crossfades between two real scenes.

- They apply **only while switching** from scene A to scene B.
- They use existing timeline metadata: `transition.effect`, `transition.durationMs`.
- They are **not** scenes, captions, or narration segments.

### Must never

- Render placeholder text (e.g. `"Transition to next scene"`, `TRANSITION_CARD_TITLE`).
- Create extra fake scenes or video segments.
- Add duration to total playback length.
- Shift `startMs` / `endMs` / `durationMs` on any scene.
- Pause, delay, or resync voiceover playback.
- Recompute subtitle chunk windows or effects.
- Change export audio length or scene timing map.

---

## Timing model (overlay, not extension)

Total playback duration = sum of scene durations (and voiceover when audio-first). **Transition duration is not added.**

When `transition.durationMs > 0` and effect is not `cut`:

1. Render the visual effect as an **overlay inside existing scene time**.
2. Preferred placement: **last `durationMs` of the outgoing scene** (tail overlay).
3. Alternate allowed placement: **first `durationMs` of the incoming scene** (head overlay).
4. Do **not** insert a new time range after `fromScene.endMs` that extends the timeline.

```
Scene A [========|~~overlay~~]
Scene B              [~~overlay~~|========]
                      ^ boundary — scene/subtitle clock switches here
```

### Authority for sync (unchanged)

| Concern | Source of truth |
|---------|-----------------|
| Total duration | `getStoryTotalDuration` / `resolveStoryDurationSec` |
| Active scene index | `getSceneTimingAtGlobalTime` / `getActiveSceneAtTime` |
| Subtitle chunks | `resolveActiveSubtitleForScene` from scene-local elapsed ms |
| Voiceover clock | Audio `currentTime` → global ms |
| Export frames | `resolveExportFrameTiming` → scene timing map |

Visual transition state is a **render-layer concern** derived from global time + transition metadata. It must not become a second timeline.

---

## Preview requirements

- Use `transition.effect` + `transition.durationMs` from `TransitionTimelineItem`.
- Crossfade / slide / zoom / blur = layered scene images only (`PreviewFrame`, `getTransitionLayerStyles`).
- Subtitles and captions follow **`getSceneTimingAtGlobalTime`**, not transition frame kind.
- Do not hide subtitle clock advancement during overlay; at most hide or crossfade the visual text layer.
- Browser-voice playback must not add transition time to scene advance timers.

---

## Export requirements

- Keep `renderTransitions: false` until canvas overlay rendering is implemented and QA passes.
- `getRenderableScenesFromPayload` stays scene-only; transitions are not export segments.
- When enabled: composite two scene images per overlay frame; **same** `resolveExportFrameTiming` for captions/subtitles.
- Export audio mux duration unchanged.

---

## Editor / data model

- `TransitionTimelineItem` stays between scenes in `timelineItems` — metadata only.
- `TransitionCard` is an editor control; its label is UI-only, never exported as video content.
- `applyVoiceoverChanges` may preserve transition items but must not retime them into scene slots.

---

## Implementation checklist (future PRs)

Each transition PR must verify:

- [ ] `npm run test:transitions-scope`
- [ ] `npm run test:voice-speed-qa`
- [ ] `npm run test:timing-subtitle-qa`
- [ ] `npm run test:export-subtitle-qa`
- [ ] `npm run lint` && `npm run build`

---

## Touchpoints (read-only reference)

| Area | File |
|------|------|
| Preview frame + layers | `previewTimeline.ts`, `PreviewFrame.tsx` |
| Preview playback | `usePreviewPlayback.ts`, `VideoPreview.tsx` |
| Export render | `video-render.service.ts`, `export-payload.service.ts` |
| Timeline utils | `timeline.utils.ts` |
| Transition editor | `TransitionCard.tsx`, `StudioTimeline.tsx`, `StudioSceneInspector.tsx` |
