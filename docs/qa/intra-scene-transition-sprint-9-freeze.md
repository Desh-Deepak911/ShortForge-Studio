# Intra-scene Transition Sprint 9 Freeze Checklist

Sprint 9 intra-scene transitions are **frozen**. Future changes require a new sprint or an explicit post-freeze hotfix.

Do **not** fabricate optional device or capability results. Gaps remain honestly Not tested.

## Status (Sprint 9D.3 — frozen)

| Phase | Status |
|-------|--------|
| 9A / 9A.1 | Complete and accepted |
| 9B / 9B.1 | Complete and accepted |
| 9C / 9C.1 | Complete and accepted |
| 9D | Deterministic Golden QA complete and accepted |
| 9D.1 | Local evidence truth / sign-off coherence — accepted |
| 9D.2 | Transition editor UI discoverability/visibility — accepted |
| 9D.3 | Operator sign-off recorded; Sprint 9 frozen |
| Local Chromium Preview (core) | **Pass** — operator-confirmed |
| Local 720p WebM (core) | **Pass** — operator-confirmed |
| Manual editor review (core) | **Pass** — operator-confirmed |
| Optional video / audio / device | **Not tested** (does not reopen freeze) |
| Sprint 9 | **Frozen** |

## Frozen contracts

- Transition domain and persistence (`FootieScene.mediaTransitions`)
- Canonical transition vocabulary (Cut = absence; never stored)
- Boundary selection and Inspector controls
- Head-of-incoming overlay timing `[start, end)`
- 40% duration clamp
- Preview stable-primary composition (`composeIntraSceneTransitionPreview` / `planPreviewMediaLayers`)
- Scene-to-scene `TransitionTimelineItem` precedence over intra-scene
- ExportManifest **v3** transition contract (`mediaTransitions` on every scene; empty = hard-cut)
- v3 fingerprint coherence
- Renderer contract **`"9C"`**
- Frozen ExportManifest **v2** / **`"8D"`** hard-cut compatibility
- Caption / audio / timing invariants (scene duration, narration, captions unchanged by overlays)
- Deterministic Golden fixtures (22)
- Local-evidence truth rules (core vs optional; no inferred Pass)

## Explicitly out of scope / not frozen as new work

- New transition effects beyond the accepted set
- Feature flags for transitions
- Headless Renderer (Sprint 11 — deferred; Retention Story Intelligence is Sprint 10)
- Safari / Firefox / 1080p / device multi-video (Not tested)

## Evidence classes

| Class | Result |
|-------|--------|
| automated-semantic | **pass** |
| mocked-integration | **pass** |
| local-browser-preview (core) | **pass** — operator-confirmed |
| local-export-artifact (core 720p WebM) | **pass** — operator-confirmed |
| manual-editor-review (core) | **pass** — operator-confirmed |
| untested-device / optional video-audio | **not-tested** |

Recorded in [`intra-scene-transition-local-results.md`](./intra-scene-transition-local-results.md).

## Deterministic suites

- [x] 9A domain + editor
- [x] 9B Preview
- [x] 9C Export
- [x] 9D golden registry (`22` fixtures)
- [x] Local evidence harness + `/dev/intra-scene-transition-qa`
- [x] Aggregate `npm run test:intra-scene-transition-sprint`
- [x] Local Preview / WebM / editor Pass recorded

## Local sign-off

- [x] Local Chromium Preview (core)
- [x] Local 720p WebM (core)
- [x] Manual editor (core) — controls visible/usable; multiple boundaries independent; Preview/Export parity accepted

## Freeze verdict

```text
SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN
```

## Related

- Local results: [`intra-scene-transition-local-results.md`](./intra-scene-transition-local-results.md)
- Contract: [`../INTRA_SCENE_TRANSITIONS.md`](../INTRA_SCENE_TRANSITIONS.md)
- Dev harness: `/dev/intra-scene-transition-qa`
- Verify: `npm run test:intra-scene-transition-sprint`
