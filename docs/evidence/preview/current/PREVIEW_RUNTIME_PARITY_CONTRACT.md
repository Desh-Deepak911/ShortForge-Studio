# Preview runtime-parity contract

Generated: 2026-08-18

## Verdict: **ready**

Closeout recertification of the post-live-capture fingerprint change is **documentation-only**. Isolated byte comparison showed `SceneFrameVideo.tsx` still matches the live-certified bytes. The adopted final implementation fingerprint is `e95f97b3e8dc4d74b1f19af06888103a205044c88da08ec98d02b8f5f3318748` because `docs/evidence/README.md` kept the Preview index row at **ready**. Browser / Headless exports were not rerun. See `PREVIEW_RUNTIME_PARITY_RELEASE_READINESS.md`.

Prompt 1 modeled the contract. Prompt 2 fixed Preview media lifecycle and clock/replay reconciliation. Prompt 3 wired idle selected-media inspection. Prompt 4 fixed Preview caption geometry. Prompt 5 measured Like / Share / Subscribe Preview vs production-canvas appearance against the inner 9:16 screen. The reported oversized Preview CTA was **not reproduced** on the current dirty build. `foreignObject` scales with the SVG viewBox. Production CTA drawing was left unchanged.

Harness: `/dev/preview-runtime-parity-qa` (local development only).

## Root-cause table

| Defect | Classification | Evidence |
| --- | --- | --- |
| Removing a visible or previously visible video can leave it displayed in Studio Preview while export is correct | **fixed in Prompt 2** — Preview runtime/DOM/blob/clock, not the canonical plan | Canonical `planPreviewMediaLayers` already dropped removed IDs/URLs. Persistence came from (1) immediate owned-blob revoke before React unmounted the `<video>`, leaving a decoded last frame, (2) `SceneFrameVideo` unmount that paused but did not cancel paint loops / clear `src`, (3) no Preview identity/lifecycle authority to retire stale primary/outgoing layers after scene mutation. |
| Idle select of media item 2 or 3 does not show that item in the main Preview | **fixed in Prompt 3** — Preview presentation only | Idle inspection now resolves the selected item by stable ID and its canonical `[startMs, endMs)` window. `PreviewFrame` accepts `selectedMediaItemId` and mounts that item as the sole primary layer. Playback clears the media-item selection before starting, so pause/stop cannot resurrect inspection. |
| After play, return, replay, edit, or select, Preview can keep a stale or confusing clock/media state | **fixed in Prompt 2** | Idle Preview used the story clock whenever `playbackMode === "narration"`, even after pause/complete. Scene complete left `endMs-1` masquerading as idle. Production now uses `resolveIdlePreviewSceneElapsedMs` when not playing, marks `completed-scene` at the scene boundary, and applies Prompt 1 `select-scene` / `restart-scene` after scene selection and media mutation. Natural story end still calls documented `stopVoice()` (reset to story start). |
| Centered captions look centered while idle and shift left during playback as text width changes | **fixed in Prompt 4** — Preview placement surface, not a second caption engine | Non-legacy Preview placed the overlay at the max-width box origin with `width: max-content`. Animated/changing text grew the box from the left. `text-align: center` only centered glyphs inside that moving box. Placement now uses the shared layout engine’s anchor point plus an anchor-relative `translate(...)`. |
| Other caption anchors/alignments can change geometry between idle and playback | **fixed in Prompt 4** | The same shared `CaptionPreviewOverlay` surface now serves generated captions, narration subtitles, drag, passive, idle, playback, and inspection. Text alignment stays on the pill and is independent of the anchor. |
| Like / Share / Subscribe can appear larger in Studio Preview than Browser/Headless | **not reproduced on current build** — host-vs-inner measurement, not a Preview/export implementation mismatch | Real Chromium measurements against the inner 9:16 screen (204/244/344) match the shared 1080×1920 plan within 0.1 output-space px. `foreignObject` CSS `font-size` stays in output units (24.64) but the painted label height scales to ~5.57 CSS px at 244 inner width. Measuring against the 260 host, or reading unscaled computed `font-size`, can create a false “Preview is huge” reading. |
| Preview must match the canonical story used by Browser and Headless | **Prompt 6B certified** | Corrected cumulative scene timing. Clean 1080×1920 Preview capture surface. Fresh Browser (vp8) and Headless (vp9) 34.300 s WebMs. 25-sample three-way matrix passed. See `PREVIEW_RUNTIME_PARITY_RELEASE_READINESS.md`. |

## Prompt 2 before / after lifecycle

### Before

- Story remove called `revokeOwnedBlobUrlIfPresent` in the same turn as the story commit.
- A still-mounted Preview `<video>` kept the revoked blob’s last decoded frame.
- `SceneFrameVideo` unmount paused the element but left `src` attached and could keep a blurred-background `requestAnimationFrame` loop when the same instance received a new URL (`url` was not a paint-loop dependency).
- Intra-scene transitions could keep a deleted peer long enough to finish the old overlay because Preview mounted whatever `planPreviewMediaLayers` last produced without a retirement pass.
- Completed scene/story clocks could still drive idle Preview through `resolvePreviewPlaybackState(currentTimeMs)`.

### After

- One Preview media identity/lifecycle authority distinguishes item ID, source identity, primary vs outgoing role, scene ID, and current vs retired authority.
- `PreviewFrame` still calls `planPreviewMediaLayers`, then `reconcilePreviewMediaLayerPlan`. Retired primary/outgoing layers drop immediately. A deleted transition peer is never kept to finish the old visual. Fallback is the current canonical primary, or the existing empty-scene presentation when no media remains.
- React keys are `role + sceneId + itemId + source`. Clock ticks do not remount a valid continuously playing video. Source replacement remounts.
- `SceneFrameVideo` retirement pauses the video, cancels seek and paint rAF, removes visibility listeners via the paint-effect cleanup, stops sampling retired frames, and clears `src` on unmount. Cleanup is idempotent and non-terminal. Fit-with-background still uses one video element.
- Owned blob URLs revoke only after story state changes, Preview authority drops the media, and the mounted source unregisters. Scheduling is double-`requestAnimationFrame` (next paint), not an arbitrary timeout. Non-owned URLs are never revoked. Repeated cleanup does not double-revoke. Lane/hook unmount still does not revoke referenced URLs (`shouldRevokeOnOwnerUnmount` remains false).

## Object-URL revocation policy

1. Story state changes first.
2. Preview authority drops the removed media (reconciled plan).
3. The old element unregisters its mounted source.
4. The owned blob URL is revoked on the next paint if it is still unmounted.
5. URLs not in the editor ownership set are never revoked.
6. Replacing media does not revoke the new URL. The previous owned URL is scheduled after the new element is mounted.
7. Failed appends still revoke immediately (they were never committed / mounted).
8. Component unmount of `SceneFrameVideo` clears remaining attached sources so a pending revoke can proceed. Preview-not-mounted removals revoke on the next paint because the source was never registered.

## Clock and replay behavior

- Media removal/reorder preserves valid scene-local time where possible, then reclamps to the updated scene duration.
- The active item is recalculated from the new canonical windows.
- Completed scene playback can restart from that scene’s canonical start. `Play Scene` resumes only a valid paused scene-scope session; otherwise it starts at the selected scene start.
- Completed story playback can select an earlier scene (`select-scene` → that scene’s start). `Play Story` still begins at story start. Natural story end still uses documented `stopVoice()` (reset to 0 / scene 0) so a completed clock cannot masquerade as idle editing at the story end.
- Scene selection and media edits after completion update Preview immediately through the existing master timeline + idle scene timing. No second clock.

## Mounted-layer and URL evidence

Provider-free Prompt 2 lifecycle suite covers first/middle/last removal, non-current removal, same-ID source replacement, reorder, incoming/outgoing peer deletion, final-item deletion, rapid remove→add→remove, owned/non-owned URL ordering, video/seek/paint cleanup, scene change/return, scene/story completion replay, edit after completion, canonical vs mounted IDs, and unchanged Browser/Headless imports.

`PreviewFrame` now publishes `data-preview-mounted-primary-id`, `data-preview-mounted-outgoing-id`, `data-preview-mounted-layer-count`, and `data-preview-canonical-active-id`. `SceneFrameVideo` publishes `data-preview-video-src`.

## Browser certification status

**Attempted and passed** on Google Chrome 151.0.7922.138 against `/dev/preview-runtime-parity-qa` at `http://localhost:3000`.

This repo’s stale `next dev` (PIDs 61098 / 61110, cwd `footiebitz`) was stopped and restarted before the session. Unrelated processes were not touched. No saved draft was opened.

Harness DOM evidence (after React next-paint):

- Idle t=200ms: mounted primary `parity-video-a`, 1 layer, 1 video, 0 background canvases.
- Remove first item: mounted primary became `parity-video-b`. `parity-video-a` was gone from mounted IDs and `data-scene-media-item-id`. Layer count stayed 1. No blank empty-scene frame while media remained.
- Select remaining item 2 (`parity-video-c`): Prompt 2 recorded HUD-only selection. Prompt 3 now mounts the selected item; see Prompt 3 evidence below.
- Paused t=4500ms remove of the current item: mounted primary left that id.
- Replace changed the mounted source plan.
- Scene 2 then return to scene 1 kept the removed first id retired.
- Restart scene returned scene-local time to the start (`< 250ms`).
- Screenshots: `.tmp/preview-runtime-parity/01-idle-before-remove.png`, `02-after-remove-first.png` (gitignored). JSON: `.tmp/preview-runtime-parity/prompt2-browser-cert.json`.

SVG fixtures used as `<video src>` may leave `currentSrc` empty in Chromium; certification used mounted item IDs, canonical/primary diagnostic attrs, and layer counts for visible identity.

## Export behavior

Browser and Headless export production files, manifests, and capabilities were not edited. Shared `planPreviewMediaLayers` / scene-media windows remain the export authority. Prompt 2 only changes Preview presentation/runtime state.

## Contract and corpus

- Authority files live under `src/features/preview/runtime-parity/` with responsibility names. No barrel.
- Reuses scene-media windows, `planPreviewMediaLayers`, `resolveCaptionLayout`, `resolveEngagementOverlayFrame`, and intra-scene transition composition.
- Local fixtures: `/public/preview-runtime-parity/*` plus gitignored `.tmp/preview-runtime-parity/`.
- Identities are generic (`parity-video-a`, not color-special-cased production logic).

## Prompt 3 selected-media inspection

### Before

- Clicking media item 2 or 3 updated editor selection and HUD text only.
- Main Preview kept the timeline-active item at the idle clock.
- `PreviewFrame` had no `selectedMediaItemId`.
- Desired inspection assertions failed on purpose.

### After

- When Preview is editable-idle, a valid selected scene has a valid selected media item, and trim-scrub / playback / inter-scene transition / brand sting are inactive, the main Preview presents that item.
- Inspection uses `resolvePreviewSelectedMediaInspection`: selected scene, selected item, canonical window from `resolvePreviewSceneMediaWindows` / `resolveSceneMediaItemRenderView` (stable ID, not array index), inspection scene-local time = window start (shared `[startMs, endMs)` boundary so item 2 wins at the boundary), item-local time = 0 (video trim start / motion start). An optional offset clamps inside the window and is never persisted.
- Inspection mounts one primary layer, no outgoing intra-scene layer, no inter-scene overlay, and no brand sting.
- Captions and engagement timing use the same inspection scene-local time. Prompt 4 then fixed caption geometry on that same time authority. CTA scaling remains Prompt 5.
- Inspector edits (framing, zoom/pan/rotation, motion, trim, replace, duration/boundary, reorder) update the selected item immediately through the existing item-ID authority.
- Scene-level canvas framing is disabled during item inspection so it cannot write the wrong (first-item / scene-level) media. A non-blocking status explains this.

### Inspection versus playback authority

- Idle + valid selected item → presentation authority `inspection`.
- Play Story, Play Scene, and Browser voice call `clearSceneMediaItemSelection()` before playback starts.
- Canonical playback uses `planPreviewMediaLayers` and the Prompt 2 clock. Intra-scene transitions return during playback.
- Pause and Stop keep the canonical frame. Because the media-item selection was cleared, old inspection cannot reactivate.
- After Stop, inspection stays off until the creator selects a media item again.
- Loop Scene remains canonical scene playback. This prompt does not add “play selected item”.

### Browser evidence

**Attempted and passed** on Google Chrome 151.0.7922.138 against `/dev/preview-runtime-parity-qa` at `http://localhost:3000`. Existing repo `next dev` was reused. No saved draft was opened.

Mounted identity (not HUD text alone):

- Idle t=200ms select item 1 → mounted primary `parity-video-a`, 1 layer, no outgoing, inspection active.
- Select item 2 → mounted primary `parity-video-b` while the idle clock still belonged to item 1.
- Select item 3 → mounted primary `parity-video-c`.
- Replace / reorder kept the stable selected ID. Remove dropped the retired ID; the nearest survivor mounted only after selection became authoritative.
- Play Scene and Play Story cleared inspection. Pause and Stop did not resurrect it. Selecting an item after Stop inspected that item again.
- Mixed-media scene 2 inspected the selected item. After reload, playback near the first boundary remounted a normal intra-scene outgoing layer.
- Screenshots: `.tmp/preview-runtime-parity/03-inspect-item-1.png`, `04-inspect-item-2.png`, `05-inspect-item-3.png` (gitignored). JSON: `.tmp/preview-runtime-parity/prompt3-browser-cert.json`.

SVG fixtures used as `<video src>` may leave `currentSrc` empty in Chromium; certification used mounted item IDs and Preview diagnostic attrs.

## Prompt 4 caption geometry

### Root cause

Non-legacy Preview called `resolveCaptionLayout` without a measured content box, then set the overlay `left`/`top` to that **maximum-width box origin**. The overlay used `width: max-content`. When the active subtitle chunk, typewriter text, or wrap height changed, the box grew or shrank from its left/top edge. `text-align: center` only centered text inside the changing box; it did not keep the box on the selected caption anchor.

Static coordinate tests passed because they never measured the rendered box while content changed.

### Shared placement architecture

One Preview caption placement surface: `CaptionPreviewOverlay`.

Consumed by:

- `CaptionOverlay` (generated captions)
- `SubtitleOverlay` (narration subtitles)
- the same surface for draggable and passive rendering

Placement still comes only from:

- `resolveCaptionLayout` / `resolvePreviewCaptionLayoutForScene`
- `resolvePreviewCaptionPlacementStyle` (anchor `%` + `translate` + `max-content`)
- `resolvePreviewCaptionPillCombinedStyle`
- existing caption typography, animation, safe-area, and offset authorities

Layers:

1. Anchor authority — shared caption-layout engine.
2. Placement box — DOM overlay at the reconstructed anchor, translated by the selected anchor fractions.
3. Visual/pill box — may resize with text, around that anchor.
4. Text box — `text-align` only.
5. Animation/effect layer — inner `data-preview-caption-animation-layer`; fade/typewriter/highlight/motion transforms must not overwrite the placement `transform`.

Legacy stories without stored caption-layout settings still use `.preview-narration-subtitle-overlay` at `bottom: 8%`. That path was already width-stable (`width: 100%` / `max-width: 90%`). Explicit `bottom_center` uses the engine surface.

### Measurement / output-space policy

- Layout size uses `offsetWidth` / `offsetHeight` (not `getBoundingClientRect`, which includes animation transforms).
- CSS pixels convert to 1080×1920 through `measureContentBoxInReferencePx`.
- Zero / non-finite sizes are ignored. Equal sizes do not re-render.
- `measurementKey` (scene + chunk + effect/phase) drops a stale box.
- Measurements are never persisted and never written into the story.
- Export does not read Preview DOM measurements.
- Default Preview typography/padding/radius/border/highlight-bar use output-space proportions: `64 * frameWidth / 1080` (and matching pad/radius). CSS `cqw` is the fallback before the frame is measured. At ~220px this stays ~13px, matching the previous default. DOM vs canvas glyph metrics may still differ by a few reference pixels; documented Preview center drift tolerance is **1 reference px** (provider-free) and **4 output px** (Chromium).

### Animation isolation

Fade translation, typewriter growth, highlight-bar growth, TikTok pop, sports bounce, and news `translateY` apply on inner content. News motion has no `translateX`. Reduced-motion uses the same placement box. Animation completion uses the same anchor as static rendering.

### Before / after normalized geometry

Provider-free, unresolved max-width box, then short (180) vs long (640) content:

| Anchor | Before (left-origin shrink) | After (anchor + translate) |
| --- | --- | --- |
| `center` | visual center walked by `(640-180)/2 = 230` reference px | center drift ≤ 1 reference px |
| `top_center` / `bottom_center` | same horizontal walk | horizontal center stable; top/bottom edge preserved when height changes |
| `*_left` | left edge held, but center walked | left edge stable |
| `*_right` | right edge walked with the left origin | right edge stable |

Placement `left` is now the **anchor**, not `resolved.x` of the max-width box. For a default center layout those differ by half the unused max-width.

### Browser evidence

**Attempted and passed** on Google Chrome 151.0.7922.138 against `/dev/preview-runtime-parity-qa` at `http://localhost:3000`. Existing repo `next dev` was reused. No saved draft was opened.

Computed bounding rectangles, not markup inspection:

- Idle and playing center boxes stayed at output center **540** (drift **0.00** output px).
- Typewriter early/mid/final in this harness scene kept the same chunk box; center drift **0.00**. Short-vs-long and typewriter width change are covered by the provider-free geometry suite.
- Fade-up and highlight kept the same placement box.
- All nine anchors produced distinct output-space boxes (left column ~324, center 540, right ~756 at the 260px Preview).
- Preview widths 220 / 260 / 360 (inner frames 204 / 244 / 344 after device chrome) kept output center 0.5. Font sizes were 12.09 / 14.46 / 20.39 CSS px = `64 * frameWidth / 1080`.
- Selected-media inspection still showed the caption box.
- Synthetic headless pointer-drag did not move the box in this session; drag commit math remains covered by `test:caption-layout`.
- Screenshots: `.tmp/preview-runtime-parity/06-caption-idle-center.png`, `07-caption-playing-center.png`, `08-caption-inspection.png`. JSON: `.tmp/preview-runtime-parity/prompt4-browser-cert.json`.

### Export non-regression

Browser and Headless caption rendering files, export manifests, and capabilities were not edited. `resolveExportCaptionPlacement` remains the export adapter. Prompt 4 only changes Preview DOM placement/typography scaling.

## Prompt 5 CTA measured parity

### Question

Is the reported “CTA is much larger in Preview than export” caused by stale output, host-vs-inner measurement, `foreignObject` CSS-pixel behavior, font metrics, icon strokes, Preview-only CSS, a wrong resolver frame, duplicate scale, phone breakpoints, caption-collision translation mistaken for size, or a genuine Preview/export mismatch?

### Answer from current-build Chromium

**Not reproduced as a Preview/export size mismatch.** Classification:

1. **Inner screen vs host.** 260 host → 244 inner; 220 → 204; 360 → 344. Certification used `[data-preview-inner-screen]`, not the device wrapper.
2. **`foreignObject` scales with the parent viewBox.** Combined Medium at 244: computed `font-size` is still the output-space token **24.64px**, but the painted label height is **5.57 CSS px**, matching `24.64 * (244/1080)`. Visual label output-space height is **24.90** vs plan **24.64** (1.1%, inside the 3% font tolerance).
3. **No duplicate scale.** Hold `frame.scale` is 1. Author size/fine-scale live only in the shared layout.
4. **No Preview-only animation timer.** Preview consumes the resolved frame only.
5. **Caption collision translates, it does not resize.** Bottom-center hold Y **1448** → collided/relocated Y **1368.4**; pill height stayed **111.97 / 112**.
6. **Stale build was not the current-session cause.** Harness marker `staging-preview-runtime-parity:prompt-5:cta-measured-parity` matched the dirty worktree. A prior stale Next process could still have produced the original report; this session restarted `next dev` in this worktree.

### Tolerances used

- Outer bounds / column centers / separator X / pill height: 2 output-space px at 1080
- Icon/label group center: 3 output-space px
- Font-size and icon-size proportion: 3%
- Animation scale/translation: 0.5% or 2 output-space px, whichever is larger
- Label glyph boxes may be slightly taller than `fontSize` because of font metrics; that wider label reading was documented and was **not** used to loosen geometry tolerances.

### Preview vs canvas (combined Medium, 244 inner, hold)

| Quantity | Preview (inner-normalized → 1080) | Production canvas plan | Delta |
| --- | --- | --- | --- |
| Outer box | 359.98, 72.00, 679.98 × 111.97 | 360, 72, 680 × 112 | ≤ 0.03 px |
| Pill height | 111.97 | 112 | 0.03 px |
| Font | visual 24.90 / computed CSS 24.64 | 24.64 | 1.1% visual |
| Icon | 38.48 | 38.08 | 1.1% |
| Labels | Like / Share / Subscribe | Like / Share / Subscribe | exact |
| Canvas pixel scan | — | 358, 71, 684 × 114 | +2 px stroke halo |

204 / 344 inner widths kept the same 680 × 112 output box. Large at 244 was 132.10 vs 132.16. Max fine scale 1.15 was 128.78 vs 128.80. Single Like / Share / Subscribe were 96 × 96.

### Motion checkpoints

Shared frame: hidden before; entrance start opacity 0 (Preview unmounts at `opacity <= 0`, matching canvas no-draw); entrance mid scale 0.9925 / opacity 0.875 / translateY −3.5; hold and Like/Share/Subscribe-active visible; Subscribe confirmation label remains **Subscribe**; exit mid scale 0.995 / opacity 0.875; terminal hidden.

### Selected-media inspection

Selecting item 2 after a hold seek hid the CTA. That is correct: inspection jumps to that item’s canonical window start (~3000 ms), which is after the CTA window (400–2900 ms). It is not a size defect.

### Production change verdict

**No visual CTA production change.** `foreignObject` stayed. Additive measurement hooks only:

- `data-preview-inner-screen` on the 9:16 Preview screen
- `data-engagement-overlay-icon` / `data-engagement-overlay-label` on existing Preview spans

Browser/Headless still draw through `drawEngagementOverlay`. No second CTA renderer.

### Browser evidence

**Attempted and passed** on Google Chrome 151.0.7922.138 against `/dev/preview-runtime-parity-qa` at `http://localhost:3000`. Current dirty-branch `next dev` (this worktree). No saved draft. Not an encoded-export certification.

Artifacts under `.tmp/preview-runtime-parity/`:

- `prompt5-cta-preview-medium.png` / `prompt5-cta-canvas-medium.png`
- `prompt5-cta-preview-large.png` / `prompt5-cta-canvas-large.png`
- `prompt5-cta-preview-204.png` / `prompt5-cta-canvas-204.png`
- `prompt5-cta-preview-344.png` / `prompt5-cta-canvas-344.png`
- `prompt5-cta-measurements.json`

## Prompt 6 / 6B encoded certification

Real Browser and Headless 1080×1920 WebMs were generated from the corrected frozen integrated story. Prompt 5 canvas reference was not used as an encoded-video substitute.

- Browser: `.tmp/preview-runtime-parity/prompt6b-browser-1080.webm` — vp8, 1080×1920, 30 fps, 34.300 s, 3,570,680 bytes, fingerprint `em:1i8ydpe`.
- Headless: `.tmp/preview-runtime-parity/prompt6b-headless-1080.webm` — vp9, 1080×1920, 30 fps, 34.300 s, 2,618,821 bytes, fingerprint `em:2aj2se`.
- Clean Preview PNGs from `[data-preview-runtime-parity-cert-capture-surface]` at 1080×1920.
- Studio Chromium interaction and real pointer caption drag passed. Capture mode is armed only after drag.
- 4K / 720p skipped (optional; documented local resource / runner limit).
- Final phase verdict: **ready**. Full write-up: [PREVIEW_RUNTIME_PARITY_RELEASE_READINESS.md](PREVIEW_RUNTIME_PARITY_RELEASE_READINESS.md).

## Production files intentionally untouched

- Browser canvas caption rendering
- Headless caption rendering
- Browser/Headless encoder behavior
- Export manifest schema or capabilities
- Persisted story schema
- Narration / subtitle timing
- Engagement overlay timing or persistence
- Prompt 2 media lifecycle and object-URL retirement
- Prompt 3 inspection authority
- Prompt 4 caption geometry
- Brand sting
- Media timing and transitions
- Approved Subscribe wording
- `drawEngagementOverlay` and the shared frame resolver (no compatible-fix required)
