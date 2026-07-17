# Scene Media Local Results (Sprint 8E / 8E.3)

Honest evidence log. Do not mark Pass without real observation.

Harness: `/dev/scene-media-qa` (development only; Sprint 8E.1 evidence truth)
Aggregate suite: `npm run test:scene-media-sprint`
Harness truth suite: `npm run test:scene-media-local-evidence`

## Evidence-class matrix

| Check | Evidence class | Result | Notes |
|-------|----------------|--------|-------|
| Golden registry (12 fixtures) | automated-semantic | **Pass** | `src/verification/scene-media-timeline/goldens/` |
| Timeline / command authority | automated-semantic | **Pass** | `sceneMediaSprint8Golden.verify.ts` + domain suite |
| Inspector per-item | automated-semantic | **Pass** | Golden + inspector suite |
| Preview checkpoints | automated-semantic | **Pass** | Boundary / midpoint / final frame |
| Export parity + integrity | automated-semantic / mocked-integration | **Pass** | Manifest v2 / 8D / fail-closed |
| Persistence / legacy / patch class | automated-semantic | **Pass** | Round-trip + legacy readable |
| Hook / export contract regression | automated-semantic | **Pass** | Included in sprint runner |
| Local evidence harness truth (8E.1) | automated-semantic | **Pass** | Checklist derivation; no auto artifact Pass; safe report |
| Local browser Preview | local-browser-preview | **Pass** | Manually confirmed by project operator (2026-07-15); multi-image flag ON during testing |
| Local 720p WebM artifact | local-export-artifact | **Pass** | Manually confirmed by project operator (2026-07-15); production path + visible playback |
| Manual editor review | manual-editor-review | **Pass** | Manually confirmed by project operator (2026-07-15); add/replace, multi-item, Preview/WebM coherent |
| Safari / Firefox device | untested-device | **Not tested** | Allowed gap |
| 1080p browser | untested-device | **Not tested** | Remains capability-gated |
| Multi-video device playback | untested-device | **Not tested** | Deterministic video coverage is semantic |

## Operator sign-off (8E.3)

Project operator manually confirmed required Sprint 8 local evidence classes as **Pass**:

- Manual editor workflow
- Local browser Preview
- Production 720p WebM
- Multi-image feature flag was ON during testing
- Add/replace controls, multiple media items, Preview switching, and WebM output worked correctly

No fabricated artifact byte counts, exact durations, or device-matrix observations are recorded here.

## 8E.2 upload affordance (layout)

Layout cause (fixed before code change): `studioShellTimelineHeight` used `h-[7.5rem]` + `overflow-hidden`, clipping `SceneMediaTimelineLane` (below each scene block) including **Add image**. Production shell uses `studioShellTimelineHeightMultiImage` (`min-h` + `h-auto`). Inspector labels **Replace current image** vs **Add another image**; both append surfaces share `SceneMediaImageAppendProvider`.

## Harness truth rules (8E.1 / 8E.1A)

- Export path: `prepareExportRequest()` (multi-image default) → `exportFootieShortFromManifest(prepared)`.
- Evidence checks are tri-state: `not-tested` | `pass` | `fail` (default `not-tested`).
- Idle / preparing / incomplete automatic checks derive **Not tested** (not Fail).
- Operator observations can record Fail; any Fail derives Fail for that class.
- Structural validation maps to `awaiting-visual-review` / `validation-fail` — never auto `Pass`.
- Captured WebM is retained in-page for review (object URL revoked on replace/unmount); not persisted in drafts/docs.
- Preview / Artifact / Editor results are derived only from tri-state checklists.
- Safe evidence report is copyable; Markdown docs are updated only after operator review.
- Refresh remounts empty evidence (Not tested) until operator re-records.

## Local Preview checklist (operator)

Golden: `sm-two-equal-images` (ITEM A / ITEM B solid colours)

- [x] ITEM A visible before boundary
- [x] ITEM B visible exactly at/after boundary
- [x] Final item held at final scene frame
- [x] No blank frame during switch
- [x] Framing/motion item-local (use `sm-per-item-framing-motion`)
- [x] Captions remain continuous
- [x] Transition layers coherent (`sm-transition-multi-item-peers`)

Result: **Pass** (manually confirmed by project operator)

## Local WebM artifact checklist (operator)

Automatic (harness-owned):

- [x] Production preflight approves
- [x] Exact prepared manifest rendered
- [x] Production renderer completes
- [x] Artifact non-empty
- [x] Structural validation passes
- [x] Duration matches manifest within tolerance

Visual (operator):

- [x] Playback shows both items in order
- [x] Switch at frozen boundary
- [x] No first-item repetition / blank boundary frame
- [x] Captions/final frame coherent

Result: **Pass** (manually confirmed by project operator)

## Manual editor checklist (operator)

- [x] Append
- [x] Reorder
- [x] Resize
- [x] Remove
- [x] Per-item framing/motion
- [x] Video trim
- [x] Draft save/reload
- [x] Duplicate-scene independence
- [x] Legacy conversion only on explicit edit

Result: **Pass** (manually confirmed by project operator)

## Flag retirement (8E.3)

`NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` is **retired**. Multi-image Scene Media Timeline is the default production capability.

**Operator action after this change lands:**

```text
Remove NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=1 from .env.local
Restart the development server
```

Do **not** commit `.env.local`. This document does not edit `.env.local` automatically.
