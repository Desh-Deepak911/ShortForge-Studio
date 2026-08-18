# Caption transparent background export

Generated: 2026-08-19

Prompt 1 of 2 on `staging-caption-transparency-video-trim` (HEAD `d865189`, tracking `origin/staging`). Video trim is not in this slice. Nothing in this prompt was committed, pushed, merged, or deployed.

## Duplicate opacity authorities before the fix

Creators had two background opacity controls:

1. `CaptionLayoutControl` → `captionLayout.backgroundOpacity`
2. `CaptionStyleControl` → `captionStyle.backgroundEnabled`, color, and `captionStyle.backgroundOpacity`

Export picked style opacity only when caption style storage was considered non-default (`isDefaultCaptionStyleStorage`). Otherwise it used layout opacity or 45%.

When the resolved background was disabled or below 30%, `resolveLegibilityLayerPlan` set `needsLocalScrim: true`. Browser and Headless then drew a broad black region through `drawLegibilityCaptionScrimIfNeeded` (`rgba(0,0,0,0.72)`).

Preview applied a CSS pill (`.preview-narration-subtitle-pill`) with:

- fill ≈ 65% black
- `backdrop-filter: blur(12px)`
- light border
- box-shadow

Export `drawSubtitleBox` filled **and stroked** a legacy white border. Those treatments were not creator-authored.

Result:

- Background off still produced a black export box
- Opacity 0 still produced a black export box
- Low opacity (10%) was replaced by a much darker scrim
- Preview and export disagreed on fill, border, and blur

## Final creator-facing authority

`CaptionStyleControl` is the only background control.

Under Container:

- **Background** toggle
- When on: **Color** and **Opacity**
- When off: helper text `No box will appear behind captions in Preview or export.` Color and Opacity are hidden, not shown disabled.

Caption Layout owns placement only: anchor, alignment, offsets, maximum width, safe area.

Canonical resolver: `resolveCaptionBackgroundAuthority`.

Contract:

| Creator choice | Fill | Border | Blur | Caption scrim |
| --- | --- | --- | --- | --- |
| Background off | none | none | none | none |
| Opacity 0 | none | none | none | none |
| Opacity 10 | 10% exact | none | none | none |
| Opacity 45 | 45% exact | none | none | none |

Text outline / shadow / glow may remain. Title scrim and branding treatment are unchanged. CTA caption-safe placement and inter-scene caption suppression are unchanged.

The application does not invent a second automatic-contrast setting. Caption `needsLocalScrim` is always `false`. Intent is recorded as `explicit-transparent` | `enabled` | `absent` | `suppressed`. Missing background is not treated as permission to draw a new black rectangle.

## Legacy compatibility

- Existing `captionLayout.backgroundOpacity` still loads.
- It is read only when no explicit caption-style opacity exists (scene style → project style → scene layout → project layout → engine 45).
- `captionStyle.backgroundEnabled: false` always wins.
- New UI edits write caption-style fields only.
- Copy / paste / apply-all layout omit opacity. Each scene keeps its own legacy layout opacity if present.
- Legacy fields are not deleted automatically.
- Stories with enabled 45% backgrounds still draw a 45% fill, without Preview-only blur or export-only border.

## Before / after Preview

**Before:** CSS pill used ~65% black, blur, border, and box-shadow. Style container was applied only when stored style was non-default.

**After:** Shared authority always wins. CSS defaults are transparent / no border / no blur / no shadow. Inline container style sets fill from the effective alpha and forces `border: none`, `backdrop-filter: none`, `box-shadow: none`. Off / 0% are fully transparent. Drag, idle, and playback use the same combined style.

## Before / after Browser / Headless

**Before:** `drawSubtitleBox` filled and stroked a border. Disabled or <30% opacity triggered a caption-local 72% scrim on the prepared-frame path and the legacy Browser renderer.

**After:** Fill only when `drawsFill`. No container stroke. `needsLocalScrim` is always false for captions. Title scrim still draws. Watermark shadow/outline is unchanged.

`draw-prepared-export-frame.ts` and `video-render.service.ts` were not edited. Both already consume `drawExportSubtitlesCaption` and `drawLegibilityCaptionScrimIfNeeded`.

## Manifest false / zero

`buildExportManifest` freezes authority results:

- `backgroundEnabled: false` when disabled
- `backgroundOpacity: 0` when effective opacity is zero
- JSON round-trip keeps `false` and `0`
- `??` is used; `||` is documented as destructive for zero/false
- Manifest version was not bumped

Recorded cert values:

| Case | enabled | opacity | fill | scrim |
| --- | --- | --- | --- | --- |
| off | false | 0 | false | false |
| zero | true | 0 | false | false |
| ten | true | 10 | true | false |
| forty-five | true | 45 | true | false |

## Container appearance (fill, border, blur, opacity, padding, radius, bounds)

Shared default: creator color + opacity, existing radius and padding, no implicit blur or border.

Matched provider-free metrics (Preview resolved style vs export metrics):

- paddingX / paddingY / cornerRadius agree (18 / 10 / 12 at export scale 1)
- Preview CSS uses the existing UI scale of those same values
- `drawsBorder: false`, `drawsBlur: false` on all four cases
- Off / 0%: Preview `backgroundColor: transparent`, export alpha 0
- 10%: Preview `rgba(0, 0, 0, 0.100)`, export alpha 0.1
- 45%: Preview `rgba(0, 0, 0, 0.450)`, export alpha 0.45

No new blur/border schema fields were added. The unauthored export-only stroke was removed rather than ported into Preview.

## Real Browser evidence

Harness: `/dev/caption-background-authority-qa` (local development only, `assertLocalDevQaHarnessAllowed`). No saved user draft was modified.

Live Chromium screenshots (2026-08-19, `LIVE_BROWSER: ok`) under gitignored `.tmp/caption-background-authority/`:

| Case | Preview | Shared canvas | Observation |
| --- | --- | --- | --- |
| Background off | `preview-off.png` | `canvas-off.png` | White text, no pill, no border, no blur, no broad scrim |
| Opacity 0% | `preview-zero.png` | `canvas-zero.png` | Same: text only |
| Opacity 10% | `preview-ten.png` | `canvas-ten.png` | Light fill remains light; not a 72% black replacement |
| Opacity 45% | `preview-forty-five.png` | `canvas-forty-five.png` | Expected box; no stroke, no blur, no extra scrim |

Pixel sampling on the green fixture (270×480):

- Canvas off / zero: 0.000% near-black; caption-band darker-than-background 0.000%
- Canvas 10%: 0.000% near-black (10% over green stays green)
- Canvas 45%: 0.000% near-black; 7.79% of the sampled caption band is darker than the fixture (the authored box, not a full-width scrim)
- Preview off: 0.233% near-black from a small non-caption chrome mark, not a caption box

A 72% local caption scrim would have produced a large dark region. It does not appear.

## Headless evidence

Headless uses the same prepared-frame caption draw and the same `resolveLegibilityLayerPlan` as Browser.

Provider-free certification: `captionBackgroundAuthorityHeadless.cert.ts` wrote `.tmp/caption-background-authority/caption-background-authority-headless.json`.

It asserts:

- `draw-prepared-export-frame.ts` calls `drawExportSubtitlesCaption`, `captionStyleFromManifest`, and `drawLegibilityCaptionScrimIfNeeded`
- `drawSubtitleBox` returns when `!drawsFill || alpha <= 0` and no longer `stroke()`s
- scrim helper returns when `needsLocalScrim` is false
- the four cases match the table above

This is **not** an encoded Headless MP4 certification. Browser screenshots are not claimed as Headless encoded-video proof.

## Test results

Passed:

- `test:caption-background-authority` (28)
- `test:caption-layout`
- `test:caption-style`
- `test:caption-workspace`
- `test:caption-animation`
- `test:export-caption-layout`
- `test:export-caption-opacity`
- `test:timeline-caption-animation-qa`
- `test:preview-runtime-parity-caption-geometry`
- `test:preview-runtime-parity-desired`
- `test:engagement-overlays`
- `test:brand-sting-export`
- `test:export-manifest`
- `test:export-manifest-renderer`
- `test:legibility-layer`
- `test:headless-page-render-contract`
- `test:headless-render-contract`
- `npx tsc --noEmit --incremental false`
- ESLint on changed TypeScript files
- `git diff --check`

Known baseline failure (unchanged, not weakened):

- `test:export-subtitle-qa` still fails the previously documented clean-staging source-string assertion: it expects `normalizeCaptionMode(scene.captionMode) === "subtitles"` in unedited `video-render.service.ts`.

## Remaining Prompt 2 work

Per-media video trim. Not started. Caption background authority, Preview CSS, and export caption drawing must stay isolated from trim/timeline/duration work.
