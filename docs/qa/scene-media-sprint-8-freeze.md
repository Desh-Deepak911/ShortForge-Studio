# Scene Media Sprint 8 Freeze Checklist

Use this checklist to decide whether multi-image Scene Media Timeline may freeze.

Do **not** fabricate local browser or device results. Mark gaps honestly.

## Status (Sprint 8E.3 — frozen)

| Phase | Status |
|-------|--------|
| 8A | Complete and accepted |
| 8B | Complete and accepted |
| 8C | Complete and accepted |
| 8D | Complete and accepted |
| 8E | Complete and accepted |
| 8E.1 | Local evidence harness truth hardening complete |
| 8E.1A | Tri-state local evidence coherence complete |
| 8E.2 | Upload affordance / discoverability complete |
| 8E.3 | Local sign-off recorded; flag retired; Sprint 8 frozen |
| Sprint 8 | **Frozen** |
| Feature flag | `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` **retired** (multi-image is default) |

## Locked contracts (frozen)

- `SceneMediaTimeline` version 1
- Stable item IDs
- Proportional window semantics
- Minimum 500ms editor boundary
- First-item legacy compatibility
- Per-item framing / motion / trim
- Active-item Preview resolution
- ExportManifest version 2
- Renderer contract `"8D"`
- Collision-safe item cache keys
- Item-local motion / video timing
- Fail-closed manifest validation
- Hard-cut intra-scene switching (Sprint 8 baseline)

## Explicitly not frozen / not implemented

- Sprint 9 intra-scene transitions
- Headless Renderer (Sprint 11 — deferred; Retention Story Intelligence is Sprint 10)
- Native FFmpeg
- 1080p / 4K expansion
- Long-form support
- Binary draft persistence for blob URLs
- Safari / Firefox / broader device matrix (Not tested)
- 1080p browser export (Not tested)
- Multi-video device playback (Not tested)

## Evidence classes

| Class | Meaning |
|-------|---------|
| automated-semantic | Deterministic Node verify suites |
| mocked-integration | Integration verifies with mocked loaders / structural wiring |
| local-browser-preview | Human-observed Preview in a real browser via `/dev/scene-media-qa` or studio |
| local-export-artifact | Real 720p WebM from production `prepareExportRequest` → `exportFootieShortFromManifest` + artifact validation + visible playback checkpoints |
| manual-editor-review | Human editor workflow (append/reorder/inspector/draft reload) |
| untested-device | Safari / Firefox / device matrix / multi-video device |

Never convert **Not tested** into **Pass** from source inspection alone.

## Deterministic suites

- [x] Domain / UI / Inspector / Preview / Export integration suites
- [x] Sprint 8 golden registry + `sceneMediaSprint8Golden.verify.ts`
- [x] Local evidence harness truth + `sceneMediaLocalEvidenceHarness.verify.ts` (`npm run test:scene-media-local-evidence`)
- [x] Aggregate `npm run test:scene-media-sprint`
- [x] Export manifest / renderer / capability / golden matrix / final artifact
- [x] Hook sprint regression
- [x] typecheck / lint / build (run at freeze decision time)

## Local sign-off (required for freeze)

- [x] Local browser Preview — ITEM A before boundary; ITEM B at/after; final item at final frame; no blank switch; item-local framing/motion; captions continuous; transition layers coherent
- [x] Local 720p WebM artifact — production preflight + renderer + validation; non-empty; duration within tolerance; both items visible in order; boundary switch correct; no first-item repetition / blank frame
- [x] Manual editor review — append/reorder/remove/inspector/draft reload/duplicate

Recorded in [`scene-media-local-results.md`](./scene-media-local-results.md) as **Pass**, manually confirmed by the project operator (2026-07-15). Detailed artifact metrics were not fabricated.

## Feature-flag retirement

`NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` is retired in Sprint 8E.3.

- Production no longer reads `process.env` for this variable.
- Multi-image Timeline, Inspector, Preview, and Export are the default.
- Domain opt-out `multiImageScenesEnabled: false` remains only for deterministic first-item regression tests.

**Operator action:**

```text
Remove NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=1 from .env.local after this change lands, then restart the development server.
```

## Freeze decision

Recorded during Sprint 8E.3 (2026-07-15) after operator local sign-off:

```text
SPRINT 8 MULTI-IMAGE SCENES: FROZEN
EXPORTMANIFEST V2 / RENDERER CONTRACT 8D: FROZEN
NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES: RETIRED
INTRA-SCENE TRANSITIONS: DEFERRED TO SPRINT 9
```

**Reason:** Deterministic golden QA, local Preview, production 720p WebM, and manual editor review all **Pass** (operator-confirmed). Multi-image is the default production capability. Intra-scene transition effects remain Sprint 9. Headless Renderer remains Sprint 11 (deferred).
