# Engagement / outro motion certification

Generated: 2026-08-17

## Verdict: **ready**

The real Browser 1080×1920 operator fixture was recertified after Prompt 4B. The Large Bottom-center CTA stayed clear of the caption across Like, Share, and Subscribe checkpoints, the displayed duration matched the probed artifact, the Brand Sting hold was intact, and the terminal frame was true black.

Shared placement and success-duration authorities are in production code. Rebuilt Headless 1080p decoded Large Bottom-center + captions without CTA/caption intersection. Headless 4K structural output matched. Focused suites, TypeScript, ESLint, and `git diff --check` passed.

## Prompt 4B defects (operator Browser evidence)

| Observation | Before |
| --- | --- |
| Browser 1080×1920 WebM | Succeeded at 30 fps |
| Probed artifact duration | **22.3s** |
| Success-screen duration | **19.8s** (story + end buffer only; omitted Brand Sting) |
| Large combined CTA, Bottom center | Overlapped the active caption in Studio Preview and the decoded Browser export |
| Like / Share / Subscribe animation | Otherwise correct; Subscribe confirmation kept the word “Subscribe” |
| Brand Sting / terminal | Lockup correct; terminal frame true black |

Root causes:

1. `layoutForPosition` reserved a fixed `360 * scale` bottom band. That is smaller than a Large (and fine-scaled) CTA plus the real caption box from `resolveCaptionLayout`.
2. The success snapshot used `prepareStoryForExport(...).exportDurationMs` (`MasterTimeline.renderDurationMs`) instead of `resolveExportRenderEndMs(manifest)`.

## Placement authority

`resolveEngagementOverlayCaptionSafePlacement` is the provider-free collision authority. It reuses `resolveCaptionLayout` for a scene-stable exclusion box (style max-lines × line-height + padding; never the active word). Preview, Browser, and Headless consume the same `resolveEngagementOverlayFrame` coordinates. Translate-only: no resize, hide, retarget, or retiming. Draw order stays CTA below captions.

## Before / after CTA and caption bounds (1080×1920, Large combined, Bottom center)

Planner (default / stored `bottom_center` caption, max-lines band):

| | x | y | width | height |
| --- | --- | --- | --- | --- |
| CTA requested (old geometry) | 138.8 | 1427.84 | 802.4 | 132.16 |
| Caption exclusion | 65 | 1496.4 | 950 | 269.6 |
| CTA applied (`above-caption` when that is nearest; default stored layout) | 138.8 | 1348.24 | 802.4 | 132.16 |

Headless cert fixture uses **legacy** caption storage (no scene layout). Nearest safe slot is `below-caption`:

| Decode | CTA navy band (y) | Caption white band (y) | Intersection |
| --- | --- | --- | --- |
| Before (stale worker / fixed 360 reserve) | 1432–1540 | 1480–1556 | **Yes** — mixed navy+white rows 1480–1556 |
| After (rebuilt worker + shared placement) | 1617–1699 | 1556–1589 | **No** — text ends ~1589; CTA starts ~1617; planned gap 16 px from exclusion bottom 1600 |

## Displayed vs probed duration

| Case | Success-screen authority | Probed file |
| --- | --- | --- |
| Operator Browser QA (2.5s Brand Sting) | Was 19.8s; now `resolveCanonicalExportSuccessDurationSec` → **22.3s** | **22.3s** |
| Same story, Brand Sting disabled | Unchanged 19.8s | Unchanged |
| Headless cert fixture (4s content + 2.5s sting + buffer) | **7.3s** | **7.3s** |

## Browser and Headless results

| Check | Result |
| --- | --- |
| New Browser 1080×1920 export | **Pass** — VP8/yuv420p, 30 fps, 22.3s, 1,810,567 bytes |
| Browser CTA checkpoints | **Pass** — decoded Like (0.7s), Share (1.4s), and Subscribe (2.1s); Large Bottom-center CTA stayed below the caption without intersection or clipping |
| Browser duration | **Pass** — success screen 22.3s; probed artifact 22.3s |
| Browser outro / terminal | **Pass** — decoded hold at 20.2s preserved the complete lockup; 22.0s terminal frame was true black |
| Headless 1080p (rebuilt `page-render.iife.js`) | 1080×1920, 30 fps, 219 frames, 7.3s, h264. Like / Share / Subscribe visible; Subscribe confirmation keeps “Subscribe”; outro navy lockup; terminal mean luma 0 |
| Headless 4K structural | 2160×3840, 30 fps, 219 frames, 7.3s, h264 |
| Manual Studio smoke | **Pass for release case** — combined CTA, Bottom center, Large, 0.2s start, 2.5s duration, 2.5s Brand Sting, Browser renderer, and success summary were exercised through the real controls |

Artifacts stay under gitignored `.tmp/engagement-outro-cert/`.

## Tests

- `npm run test:engagement-overlays` (includes caption-safe placement)
- `npm run test:brand-sting-export`
- `npm run test:export-canonical-timing` (includes success-duration)
- `npm run test:export-manifest`
- `npm run test:shortforge-motion-contract`
- `npx tsc --noEmit --incremental false`
- targeted ESLint
- `git diff --check`

## Remaining risks

- Conservative max-lines exclusion can choose `below-caption` for legacy bottom captions when that slot is nearer than `above-caption`. Export stays enabled.
- Headless local cert required a worker rebuild so Chromium used the new placement bundle; deploy builds must continue rebuilding the worker artifact.
- The Browser release case used the deterministic local visual-motion fixture rather than creator camera media; placement and timing are independent of media content.
