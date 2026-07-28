# Intra-Scene Media Transitions

**Status:** Sprint 9 **frozen** (9D.3 operator sign-off). ExportManifest **v3** / renderer contract **`"9C"`** frozen. Core Chromium Preview, 720p WebM, and Studio editor Pass recorded. Optional video/audio/Safari/Firefox/1080p/device multi-video remain Not tested. Future changes require a new sprint or explicit post-freeze hotfix.

## Ownership

Module: `src/features/scene-media-transitions/`

Owns transitions between **adjacent media items inside one `FootieScene`**.

Does **not** own: scene duration, MasterTimeline, media-item windows/weights, scene-to-scene `TransitionTimelineItem`, captions, narration, voiceover, or audio. Export freezes story transitions into ExportManifest v3 via `buildExportSceneMediaTransitionTrack` (export domain owns the frozen track).

Preview composition adapter: `src/features/scene-media-transitions/preview/` (not re-exported from the feature root barrel).

## Persisted contract

```ts
interface SceneMediaTransitionBoundary {
  fromItemId: string;
  toItemId: string;
  effect: TransitionEffect; // non-Cut when stored
  durationMs: number;       // 300 | 500 | 800 | 1000
}

interface SceneMediaTransitionTrack {
  version: 1;
  boundaries: SceneMediaTransitionBoundary[];
}

// FootieScene.mediaTransitions?: SceneMediaTransitionTrack
```

- Boundary identity = ordered `fromItemId` / `toItemId` pair (no random id).
- Only currently adjacent ordered pairs are valid.
- Absence = **Cut**. Cut is never persisted.
- One record max per adjacent pair.
- Empty/single-item scenes have no track.

## Authority separation

| Authority | Type | Scope |
|-----------|------|--------|
| Scene-to-scene | `TransitionTimelineItem` | Between scenes on `timelineItems` |
| Media-to-media | `SceneMediaTransitionBoundary` | Inside one scene’s media timeline |

They may share `TransitionEffect` vocabulary and `resolveTransitionEffectLayers` mathematics only.

## Timing model (head-of-incoming)

Visual overlay inside existing media windows. Never changes scene duration, weights, MasterTimeline, audio, or captions.

- Overlay begins at the existing internal media boundary.
- Occupies the opening portion of the **incoming** item window.
- Outgoing item held at its final visual frame.
- Incoming advances from item-local 0; continuous after overlay end.
- `[startMs, endMs)` semantics; inactive at overlay end and at scene end.

### Effective duration

```
effectiveDurationMs = min(
  requestedDurationMs,
  floor(0.4 × fromWindow.durationMs),
  floor(0.4 × toWindow.durationMs)
)
```

Zero effective duration ⇒ Cut / no overlay. Stored requested duration is not mutated.

## Preview (Sprint 9B / 9B.1)

`composeIntraSceneTransitionPreview` builds peer views + effect styles.
`planPreviewMediaLayers` produces a stable primary + optional outgoing overlay plan.

PreviewFrame exclusive visual states (never simultaneous):

1. Scene-to-scene transition overlay (wins)
2. Stable media stack: primary (active/incoming) + optional outgoing overlay
3. (Ordinary is the same stack with outgoing absent)

**9B.1 continuity:** primary = incoming from transition start through completion with the same React key (`primary:<json-id>`). Outgoing uses `outgoing:<json-id>` and unmounts only when the overlay ends — no remount/seek-back of the incoming video.

Intra-scene Preview invariants:

- Subtitles/captions remain visible and continuous
- Voiceover / background audio uninterrupted
- Active scene index and scene clock unchanged
- Canvas framing edit unavailable while the two-layer overlay is active
- Outgoing video paused at final clip frame; only incoming may play
- Ordinary active view resolved at the composition boundary (leaf does not re-select)

## Export (Sprint 9C — complete and accepted; 9C.1 integrity)

| Pair | Role |
|------|------|
| ExportManifest **v2** / renderer **`"8D"`** | Frozen backward-compatible hard-cut intra-scene |
| ExportManifest **v3** / renderer **`"9C"`** | Current production — freezes `mediaTransitions` per scene |

Production `buildExportManifest` emits **v3 / `"9C"`**. Every v3 scene carries `mediaTransitions: { version: 1, boundaries }` (empty = hard-cut). Cut is absence — never stored. Runtime accepts valid v2 and v3 via `validateExportManifest` / `assertExportManifest`; unknown pairs fail closed. v2 is never repaired or silently upgraded.

Manifest-only resolver: `resolveExportIntraSceneTransitionAtElapsed`. Frame prep prepares exact from/to peers under collision-safe `buildExportMediaCacheKey(sceneId, mediaItemId)`. Canvas reuses `resolveTransitionEffectLayers`. Captions continue during intra-scene overlays; scene-to-scene caption suppression unchanged. Verify: `npm run test:intra-scene-transition-export`.

## Reconciliation

| Media edit | Transition behavior |
|------------|---------------------|
| Append | Preserve valid pairs; new boundary = Cut/absence |
| Reorder | Keep only exact ordered adjacent pairs; new adjacency = Cut |
| Remove | Drop every transition touching removed item; joined neighbours = Cut |
| Resize weights | Preserve pair records; effective duration re-derived |
| Framing/motion/trim | Preserve records |
| Legacy → first append | No track until a non-Cut is set |
| Duplicate scene | Deep-clone track with cloned media-item ids |

## Failure behavior

Read normalization is total and non-throwing: malformed, stale, non-adjacent, unsupported, or duplicate records are dropped (resolve as Cut). Unknown effects are **never** remapped to Fade. Atomic writes reject invalid proposed state. Preview composition returns null → hard-cut ordinary media.

Diagnostics never include media URLs or private content.

## Frozen timing systems

Scene duration, MasterTimeline, voiceover, captions/subtitles remain authoritative. ExportManifest v2 / `"8D"` remains frozen; production is v3 / `"9C"`.

## Sprint seams

- **9C Export:** frozen (v3 / `"9C"`); 9C.1 consecutive-boundary order + fingerprint coherence.
- **9D Golden QA:** deterministic registry (22 fixtures), Preview/Export goldens, sprint runner — accepted.
- **9D.1 / 9D.2 / 9D.3:** local evidence truth · editor discoverability · operator sign-off — Sprint 9 frozen ([qa/intra-scene-transition-sprint-9-freeze.md](../qa/intra-scene-transition-sprint-9-freeze.md)).

## Editor notice

Intra-scene transitions play in Preview and Export (v3 / `"9C"`). Frozen v2 manifests remain hard-cut.

### Discoverability (Sprint 9D.2)

- Dedicated transition-control row above the media segment track (outside `overflow-hidden`).
- Single-item guidance: add another image to create an intra-scene transition.
- Multi-item guidance: choose Cut or an effect between media items.
- Selecting a boundary opens the Inspector Image/Media group with `SceneMediaTransitionInspector`.
