# Timeline Intelligence

Canonical timing model for ShortForge Studio preview and export. This module introduces a single **MasterTimeline** authority so scene, subtitle, animation, audio, and transition clocks stop diverging across pipelines.

## Status

**Phase 2B — export render playback.** Export frame loop selects scene/subtitle/animation from MasterTimeline absolute timestamps. Preview playback is not wired yet.

## Files

| File | Responsibility |
|------|----------------|
| `timeline.types.ts` | `MasterTimeline`, tracks, and absolute-timestamp event types |
| `timeline-authority.ts` | Editor vs export-refit authority selection |
| `timeline-utils.ts` | Normalization, validation, and empty scaffold helpers |
| `apply-master-timeline-scenes.utils.ts` | Copies scene windows from MasterTimeline to export story (timing only) |
| `build-master-timeline.ts` | `buildMasterTimeline(script, options)` — canonical builder |
| `timeline-playback.utils.ts` | Absolute-time lookup: `getActiveSceneAtTime`, `getActiveSubtitleAtTime`, frame clock |
| `export-timeline-diagnostics.dev.utils.ts` | Dev `exportDurationSource = MasterTimeline` logging |

## buildMasterTimeline

```typescript
buildMasterTimeline(script, {
  mode: "preview" | "export",
  useVoiceoverRefit?: boolean,
  endBufferMs?: number, // default 400ms
});
```

| Mode | Refit default | Authority |
|------|---------------|-----------|
| `preview` | Editor scenes unless `useVoiceoverRefit: true` | `editor-scene-timing` or `export-refit-timing` |
| `export` | Refits to voiceover when valid | `export-refit-timing` when voiceover present |

`renderDurationMs = max(audio, narration, scene, subtitle, animation, transition spans) + endBufferMs`.

Diagnostics surface refit status, preview/export mismatch risk, audio/subtitle/scene alignment, missing timings, overlaps, line-cap risk, and final subtitle vs render end.

## Development diagnostics

In `NODE_ENV=development`, the editor preview panel shows **Timeline Intelligence** (collapsible, dev only):

- `TimelineDeveloperView.tsx` — UI in `StoryWorkspace` below the phone preview
- `timeline-diagnostics.dev.utils.ts` — builds preview + export timelines via `buildMasterTimeline` and formats warnings

Not imported in production paths; the panel returns `null` outside development builds.

## Architecture

```
FootieScript (today)
        │
        ▼ (future builders)
  MasterTimeline  ◄── authority: editor-scene-timing | export-refit-timing
        │
        ├── scene track
        ├── subtitle track
        ├── caption-animation track
        ├── audio track
        ├── image-motion track
        └── transition track
        │
        ▼ (future consumers)
   Preview clock · Export frame loop · FFmpeg mux
```

Every timed event uses **absolute milliseconds** on the master clock:

- `id`, `type`, `startMs`, `endMs`, `durationMs`, `source`, `metadata`

## Timing authorities

| Mode | Matches today | Voiceover behavior |
|------|---------------|-------------------|
| `editor-scene-timing` | Preview narration mapping | Scene windows from editor |
| `export-refit-timing` | `prepareStoryForExport()` | Scenes refitted to voiceover length |

`resolveTimelineAuthority()` selects a mode without building events. Future builders will populate tracks from story data under the chosen authority.

## MasterTimeline duration fields

| Field | Meaning |
|-------|---------|
| `renderDurationMs` | Total render/export span |
| `audioDurationMs` | Mixed audio mux span |
| `narrationDurationMs` | Voiceover/narration lane |
| `sceneDurationMs` | Active scene segment union |
| `subtitleDurationMs` | Subtitle chunk union |
| `animationDurationMs` | Caption animation union |
| `transitionDurationMs` | Transition overlay union |

## Related modules (not wired yet)

- `src/features/story/utils/scene.utils.ts` — scene timing map
- `src/features/export/utils/export-preflight.utils.ts` — export refit
- `src/features/preview/hooks/usePreviewPlayback.ts` — preview clock
