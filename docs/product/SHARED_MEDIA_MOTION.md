# Shared Media Motion (Sprint 5)

Canonical production motion architecture after 4.2C-1 → 4.2C-6.

> Preview and Export adapters may differ only in renderer-specific unit conversion and application. Motion semantics, easing, interpolation, preset resolution, timing, and transform composition belong exclusively to the shared engine.

---

## Canonical flow

```text
scene.media.motion
        ↓
normalizeSceneMediaMotion() / resolveSceneMediaMotion()
        ↓
resolveMediaMotionStateForSceneTiming()
        ↓
resolveMediaMotionState()
        ↓
composeMediaMotionTransform()
        ↓
Preview adapter / Export adapter
```

| Concern | Authority |
|---------|-----------|
| Configuration | `scene.media.motion` |
| Resolver | `resolveMediaMotionState()` |
| Preview adapter | `src/features/editor/preview/motion/previewMotionAdapter.ts` |
| Export adapter | `src/features/editor/export/motion/exportMotionAdapter.ts` |
| Composition | `composeMediaMotionTransform()` |
| Timing | Scene-local timestamp (`sceneElapsedMs` / `sceneDurationMs`) |
| Legacy compatibility | `resolveSceneMediaMotion()` read chain |
| Timeline image-motion track | Foundation / QA only — **not** production rendering |

---

## Write path

Inspector (`MediaMotionInspectorPanel` via `StudioSceneInspector`) commits through:

- `buildMediaMotionPatch` / enable / disable / reset helpers
- StoryDocument update with `intent: "media"`

New writes go **only** to `scene.media.motion`. Legacy `imageMotion` is not written by the production Motion inspector.

---

## Read path

`resolveSceneMediaMotion(scene)` precedence:

1. `scene.media.motion`
2. `scene.media.imageMotion` (legacy dual-write)
3. `scene.image.imageMotion` (legacy drafts)
4. Static / neutral motion

Rendering never mutates or persists normalized values back into the draft.

---

## Preview vs Export

| | Preview | Export |
|--|---------|--------|
| Engine | Shared | Shared |
| Adapter | CSS (`transform` / `opacity`) | Canvas draw override (px / deg) |
| Timing | Preview scene-local clock | Export frame scene-local clock |
| Video clip seek | Independent | Independent |

At the same scene-local timestamp, reference-frame state must match before unit conversion.

---

## Technical debt (post-freeze)

See also [FUTURE.md](FUTURE.md) and the Sprint 5 freeze report.

### Opacity motion

Not implemented in the shared motion engine. Adapters currently expose neutral `opacity: 1`. Do not claim opacity is supported.

### Timeline motion visualization

The MasterTimeline `image-motion` track remains foundation/QA infrastructure. It is **not** consumed by Preview or Export rendering.

### Legacy imageMotion

May still be **read** through compatibility normalization. New inspector writes use `scene.media.motion` only.

### Caption structural test

Pre-existing `test:timeline-playback` structural assertion involving `resolveCaptionAnimationState` / export-subtitle remains outside Sprint 5.

---

## Automated suite

```bash
npm run test:motion-sprint
```

Includes domain, preview adapter, export adapter, freeze matrices, inspector/video clip, fingerprint, and related regression scripts.
