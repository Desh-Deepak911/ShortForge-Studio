# Per-media video trim render parity

Prompt 2 evidence. Branch `staging-caption-transparency-video-trim`. HEAD `d86518967f3667e8dcc4904282a90cc37f5ed4cf` tracking `origin/staging`. Dirty / uncommitted. Nothing was committed, pushed, merged, or deployed.

## Exact root cause

Three cooperating defects, not a second-video special case:

1. **Temporary trim-preview state was scene-scoped.** `VideoTrimPreviewOverride` was keyed by `sceneId` only. `shouldApplyVideoTrimPreviewOverride` / `useActiveVideoTrimPreviewOverride` applied the override to every mounted `SceneFrameVideo` in that scene.
2. **Trim scrub disabled selected-media inspection.** `resolvePreviewSelectedMediaInspection` returned inactive when `trimScrubActive` was true. Presentation then used the canonical timeline (often item A) while the creator was editing item B. Combined with (1), item A was seeked to B’s `scrubTimeMs`.
3. **Timeline / `handleApplyVideoTrim` wrote `scene.media` only.** `buildVideoTrimPatch` → `getSceneMedia` updates the first/legacy slot. Item B’s trim never persisted from the timeline path. Inspector apply already used `updateSceneMediaItemMedia`.

Canonical clip math already existed and was not replaced:

- Preview: `resolvePreviewVideoClipTime` (`src/features/preview/utils/preview-video-clip.utils.ts`). The parameter is named `sceneElapsedMs`; callers pass **item-local** elapsed from `SceneFrameMedia`.
- Shared / export: `resolveSceneMediaClipTime` / `resolveSceneMediaPlayback` (`src/features/media-playback/`).
- Export wrapper: `resolveExportVideoSourceTimeMs` (`src/features/export/timing/resolve-export-video-source-time.ts`).

Seek-layer only: `resolveDisplayableVideoSourceTimeMs` pulls back `VIDEO_CLIP_END_EPSILON_MS` (33) from an exclusive trim end so the last displayable frame stays visible. Logical `clipTimeMs` is unchanged.

## Temporary trim state was scene-scoped

Yes. Before this change an override published while inspecting item B applied to any video in the scene. After this change overrides carry `mediaItemId` and apply only to that stable item. Legacy scene-only overrides still apply to any video in the scene.

## Canonical timing authority

`sourceTime = trimStart + clampedItemElapsed`

| Field | Rule |
| --- | --- |
| `trimStart` | Default 0 |
| `trimEnd` | Default decoded source duration |
| `trimmedDuration` | `trimEnd - trimStart` |
| `itemElapsed` | Local to the active media item, not the scene |
| Hold | If the authored window is longer than the trimmed range, hold the last valid frame. Do not loop, speed-change, or shorten narration / scene / export. |
| Short window | Render only the required portion beginning at `trimStartMs`. |
| Malformed trim | Existing `clampSceneMediaTrim` / `normalizeVideoTrim` / `validateVideoTrimWindow` only. |

Preview, Browser, and Headless consume that same result. Export seek uses the displayable epsilon; tests that assert logical `clipTimeMs === trimStart + elapsed` remain exact (including Headless real-video authority at 14500ms).

## Before / after source-time examples

Frozen story: one 8000ms scene, two items, **same source URL**, stable IDs `trim-item-a` / `trim-item-b`.

| Item | Trim | Window | Item-local 0 | Mid | After trimmed range |
| --- | --- | --- | --- | --- | --- |
| A | 0–3000 | 4000 | source 0 (`SOURCE 0`) | source 1500 (`SOURCE 1`) | hold source 3000 (`SOURCE 2`) |
| B | 2000–5000 | 4000 | source 2000 (`SOURCE 2`) | source 3500 (`SOURCE 3`) | hold source 5000, seek 4967 (`SOURCE 4`) |

**Before:** selecting B and setting trim 2000–5000 still showed A, or seeked A/B to source 0, or persisted the trim onto `scene.media` only.

**After:** inspection of B at item-local 0 is source 2000 (`SOURCE 2`). Playback at scene 4000ms mounts B at source 2000. Export freeze/hydrate keeps B’s 2000/5000. Timeline/workspace apply writes B by stable ID (mixed-media dual-write when that capability is on).

## Stable media identity

- Trim preview and persist are keyed by `sceneId` + `mediaItemId`, not array index or URL.
- Two items sharing one URL keep different trims.
- `moveSceneMediaItemRight` preserves each item’s trim.
- Removing B clears B’s override and does not attach it to A.
- Scene change hides the override via existing scene scoping; inspector unmount/item change clears it.
- Cancel restores the persisted trim; apply writes the selected item.
- Temporary scrub never enters export (`export-scene-media-renderer` has no trim-preview imports).

## Preview measurements / screenshots

Local-dev harness: `/dev/per-media-video-trim-qa` (production `PreviewFrame`, no independent playback clock).

Real Chromium screenshots under gitignored `.tmp/per-media-video-trim/`:

| File | Selected item | Item-local ms | Visible section |
| --- | --- | --- | --- |
| `preview-item-a-early.png` | A | 200 | `SOURCE 0` |
| `preview-item-b-local-zero.png` | B | 0 | `SOURCE 2` |
| `preview-item-b-mid.png` | B | 1500 | `SOURCE 3` |
| `preview-item-b-hold.png` | B | 3500 | `SOURCE 4` (hold) |
| `preview-inspect-item-b.png` | B inspection | 0 | `SOURCE 2` |
| `preview-playback-after-inspect.png` | B playback | 200 | `SOURCE 2` |

Classifier samples an off-center 8×8 at (160, 360) so the burned-in white `SOURCE N` label is not mistaken for `SOURCE 5`. One-frame tolerance: 33ms. Snapshots from the live harness already named the correct `mediaItemId` and item-local elapsed before classification.

Caption-band samples on those frames are the video section color, not an opaque black box. Prompt 1 transparency holds in Preview.

## Browser artifact

Production path: `prepareExportRequest` → `exportFootieShortFromManifest` (real Browser Blob, not an FFmpeg substitute).

| Field | Value |
| --- | --- |
| Path | `.tmp/per-media-video-trim/browser-export.webm` |
| Bytes | 808296 |
| MIME | `video/webm` |
| Codec | vp8 |
| Dimensions | 1080×1920 |
| Frame rate | 30/1 |
| Duration | 8.400s |
| Pixel format | yuv420p |

Decoded timestamps (same samples as Preview, excluding inspection-only):

| Sample | Output time | Visible section |
| --- | --- | --- |
| item-a-early | 0.200s | `SOURCE 0` |
| item-b-local-zero | 4.000s | `SOURCE 2` |
| item-b-mid | 5.500s | `SOURCE 3` |
| item-b-hold | 7.500s | `SOURCE 4` |
| playback-after-inspect | 4.200s | `SOURCE 2` |

Caption-band samples are the video color, not opaque black.

## Headless artifact

Prompt 2B closed the SpeechStylePanel page-import guard that blocked `npm run build:headless-worker`. The rebuilt page bundle digest is `672227cb3a6d5ccfd7fff2907e6ea5c80d3b567d47a6dc4af3f94bcafeaea237`.

The Prompt 2 story still does not author CTA/Brand Sting. Encoded Headless visual certification for trim + CTA + Brand Sting + transitions uses the Prompt 2B frozen story. See `docs/evidence/headless/current/CURRENT_VISUAL_FEATURE_BUNDLE_CERTIFICATION.md`.

That Headless job (`job_e67e1cc5-8236-4efc-ade6-384e0c09bad5`) succeeded on the current bundle. Decoded Item B start is `SOURCE 2`, hold is `SOURCE 4`, caption bands are not opaque black. There is no FFmpeg-created substitute.

## Transition results

`buildPerMediaVideoTrimScene({ withTransition: true })` uses untrimmed A (playable range covers the 4000ms window) plus B trim 2000–5000 so the existing continuous-footage gate does not fail-closed to Cut.

At scene 3800ms:

- Outgoing A stays inside A’s trim and does not jump to source 0.
- Incoming B starts at `2000 + incomingItemLocalMs`, never source 0.

Known exhausted trims still fail closed to Cut (existing intra-scene policy). The hold-last-frame story (A 0–3000 on a 4000ms window) is that case and is documented, not loosened.

## Persistence results

- JSON save/reload keeps A `0` and B `2000/5000`.
- Mixed-media `writeMixedMediaSequenceItems` dual-writes the same per-item trims.
- Capability-off mixed-media write throws; `applyVideoTrimToMediaItem` still persists on `mediaTimeline`.
- Legacy single-video scenes still use `buildVideoTrimForMedia` / `scene.media`.
- Mixed image + video keeps the video item’s trim.

## Tests run and exact outcomes

| Command | Outcome |
| --- | --- |
| `npm run test:per-media-video-trim-parity` | 28 passed |
| `npm run test:video-trim-preview` | 23 passed |
| `npm run test:preview-video-clip` | 14 passed |
| `npm run test:preview-runtime-parity-selected-inspection` | 33 passed |
| `npm run test:scene-media-item-inspector` | 39 passed |
| `npm run test:scene-media-preview` | 21 passed |
| `npm run test:caption-background-authority` | 28 passed |
| `npm run test:mixed-media-scenes` | 19+8+11+7+6 passed |
| `npm run test:intra-scene-transition-preview` | 25 passed |
| `npm run test:intra-scene-transition-export` | 28 passed |
| `npm run test:export-manifest` | 9 passed |
| `npm run test:media-playback` | 50 passed |
| `npm run test:timeline-video-trim` | 62 passed |
| `npm run test:headless-real-video-motion-authority` | 8 passed |
| `npm run test:export-scene-media-renderer` | 21 passed |
| `npm run test:preview-runtime-parity-desired` | 6 passed |
| characterization verify | 14 passed |
| `npx tsc --noEmit --incremental false` | passed |
| ESLint on changed Prompt 2 TS | 1 existing `react-hooks/exhaustive-deps` warning in `SceneFrameVideo.tsx` (cert capture plate). No errors. |
| `git diff --check` | passed |
| `npm run test:per-media-video-trim-parity-cert` | Real Preview + Browser artifacts produced. First classifier sampled the white label; off-center reclassify of those same artifacts is 11/11 match. |
| `npm run test:per-media-video-trim-parity-headless` | Superseded by Prompt 2B. Worker rebuild now passes. Integrated Headless artifact succeeded. |

No assertions were weakened to obtain a pass. Timeline source-string updates only accept the new third `mediaItemId` argument and restore original one-line lock expressions.

## Remaining risks

- Scene-block timeline visualization can still show the first item’s trim until a media item is selected. Apply/persist is item-scoped.
- Intra-scene fade still fail-closes to Cut when outgoing playable trim is shorter than the authored window (existing footage gate). Prompt 2B’s integrated story widens item A to 0–4500 so fade remains allowed.
- Local fixture and exports live under gitignored `.tmp/`.
- Live staging Fly image was not readable in this pass. A separately authorized rebuild/deploy is still required before claiming the deployed worker matches this local bundle.

## Exact files changed (Prompt 2 additions / edits)

Production:

- `src/features/preview/video-trim-preview/video-trim-preview.types.ts`
- `src/features/preview/video-trim-preview/video-trim-preview.utils.ts`
- `src/features/preview/video-trim-preview/VideoTrimPreviewProvider.tsx`
- `src/features/preview/video-trim-preview/index.ts`
- `src/features/preview/video-trim-preview/per-media-video-trim-contract.ts`
- `src/features/preview/video-trim-preview/per-media-video-trim-fixture.ts`
- `src/features/preview/video-trim-preview/build-per-media-video-trim-story.ts`
- `src/features/preview/runtime-parity/resolve-preview-selected-media-inspection.ts`
- `src/features/preview/runtime-parity/resolve-preview-presentation-authority.ts`
- `src/features/editor/components/SceneFrameVideo.tsx`
- `src/features/editor/components/media/SceneVideoInspector.tsx`
- `src/features/editor/components/media/SceneMediaItemInspector.tsx`
- `src/features/media-playback/media-playback.utils.ts`
- `src/features/media-playback/media-trim-patch.utils.ts`
- `src/features/media-playback/index.ts`
- `src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts`
- `src/features/scene-media-timeline/editor/index.ts`
- `src/components/StoryWorkspace.tsx`
- `src/features/timeline-editor/StudioTimeline.tsx`
- `src/features/timeline-editor/timeline-editor.types.ts`
- `src/features/timeline-editor/timeline-video-trim.utils.ts`
- `src/features/export/utils/export-scene-media-renderer.ts`

Harness / verification / evidence:

- `src/app/api/dev/per-media-video-trim-fixture/route.ts`
- `src/app/dev/per-media-video-trim-qa/page.tsx`
- `src/app/dev/per-media-video-trim-qa/PerMediaVideoTrimQaHarness.tsx`
- `src/verification/features/preview/video-trim-preview/perMediaVideoTrimParity.verify.ts`
- `src/verification/features/preview/video-trim-preview/perMediaVideoTrimParity.cert.ts`
- `src/verification/features/preview/video-trim-preview/perMediaVideoTrimParityHeadless.cert.ts`
- `src/verification/features/preview/video-trim-preview/classify-timecode-section.ts`
- `src/verification/features/preview/video-trim-preview/video-trim-preview.verify.ts`
- `src/verification/preview-runtime-parity/previewRuntimeParitySelectedInspection.verify.ts`
- `src/verification/features/timeline-editor/timeline-video-trim.verify.ts`
- `docs/evidence/preview/current/PER_MEDIA_VIDEO_TRIM_RENDER_PARITY.md`
- `package.json` (test scripts only)

Prompt 2B Headless certification: `docs/evidence/headless/current/CURRENT_VISUAL_FEATURE_BUNDLE_CERTIFICATION.md`.

Prompt 1 caption files remain in the same uncommitted tree and were not reverted.

## Prompt 1 caption work remains intact

`npm run test:caption-background-authority` — 28 passed. Frozen trim story uses `backgroundEnabled: false`. Preview and Browser caption-band samples are not an opaque black box. `draw-prepared-export-frame.ts` and `video-render.service.ts` were not edited.

## Confirmation

Nothing was committed, pushed, merged, or deployed. Credentials and providers were not changed. The full Prompt 1–2–2B tree remains uncommitted on `staging-caption-transparency-video-trim`.
