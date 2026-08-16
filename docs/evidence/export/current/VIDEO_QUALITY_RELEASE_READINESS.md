# Video quality release readiness

> **Evidence status:** Current official video-quality record. Verdict in this file is **CONDITIONALLY READY**. Manual Studio smoke remains open. Policy: [../../RELEASE_READINESS_POLICY.md](../../RELEASE_READINESS_POLICY.md).

Generated: 2026-08-15T10:08:50.452Z

## Verdict: **CONDITIONALLY READY**

### Remaining blockers

- Manual Studio UX smoke not marked complete (SHORTFORGE_MANUAL_SMOKE_COMPLETE=1)


## Problem statement

Creator exports can look soft after Fit/Fill/zoom into vertical targets, permanent dark overlays reduce fidelity, and encoding may add further loss. This work separates **geometry**, **presentation**, and **encoding**, keeps Source Quality advisory, and preserves export availability.

## Architecture implemented

| Responsibility | Authority |
| --- | --- |
| Source Quality (target-aware) | `src/features/source-quality/` |
| Creator guidance (advisory) | `present-source-quality-guidance.ts` + inspector UI |
| Fit / Fill / Fit-with-background | `media-framing` layer plan + ExportManifest **v5** capability `media-background-treatment-blurred-fill-v1` |
| Preview / Browser / Headless draw hydration | Shared `hydrate-export-draw-media.ts` + layer plan |
| Local legibility | `src/features/legibility-layer/` (title 2000ms / fade 300ms) |
| Encoder evidence | Realistic-motion audit; **no profile change** |

## Compatibility decisions

- Legacy stories without `backgroundTreatment` remain legacy Fit.
- v4 rejects blurred-fill; v5 requires capability.
- Browser UI remains 720p/1080p only; 4K is Headless-only.
- Quality warnings never block export.

## Source Quality examples (automated)

- Native vertical 1080p @1080p → Excellent
- Landscape 4K Fill @ vertical 1080p → suitable with crop note
- Landscape 4K Fill @ vertical 4K → soft / enlargement risk; zoom updates cause
- Unknown dimensions → non-blocking; export remains available
- Authority: `test:source-quality` + `test:source-quality-guidance` + inspector UI

## Real Headless measurements

- Fit-with-background 1080p/4K + trimmed motion: `FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md`
- Production bundle Fit-with-background: `FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md` (rebuilt IIFE)
- Decoded quality ladder samples: `VIDEO_SOURCE_FRAMING_AND_DECODED_OUTPUT_QUALITY_AUDIT.md` / `test:video-quality-audit`
- Realistic-motion E2E matrix: `REALISTIC_MOTION_ENCODING_AUDIT.md` (settings unchanged)

## Supporting evidence (linked)

- Source Quality / framing: `VIDEO_SOURCE_FRAMING_AND_DECODED_OUTPUT_QUALITY_AUDIT.md`
- Fit-with-background Headless: `FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md`
- Fit-with-background production bundle: `FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md`
- Legibility: `LEGIBILITY_LAYER_APPEARANCE.md`
- Realistic motion encoding: `REALISTIC_MOTION_ENCODING_AUDIT.md`
- Browser real artifacts: `BROWSER_EXPORT_REAL_ARTIFACT.md`
- Brand Sting clean-staging baseline: `BRAND_STING_EXPORT_BASELINE_FAILURE.md`

## Geometry vs encoder

Headless encode-probe on ideal transformed stills remains high structural SSIM. Landscape→vertical Fill loss is primarily geometry. No encoder settings changed (realistic-motion audit evidence).

## Fit-with-background

See `FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md` and `FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md`. Production page IIFE rebuilt via `npm run build:headless-worker`; v5 capability `media-background-treatment-blurred-fill-v1` present; foreground remains sharp vs Fit control.

## Legibility before/after

See `LEGIBILITY_LAYER_APPEARANCE.md`. Full-frame dark gradient retired; title window 2000ms / fade 300ms; local scrims; no permanent global darken.

## Performance (from Fit-with-background + motion audits)

- Fit-with-background 4K overhead vs legacy Fit remains bounded (~8% wall in latest cert: 28839ms vs 26717ms).
- Realistic-motion Headless E2E short clips complete under local timeouts.
- Preview Fit-with-background paint loop is lifecycle-gated (active+playing+visible).
- Evidence is **acceptable** for release packaging; do not lower foreground resolution.

## Manual Studio smoke

- Marked complete: **no**
- Operator confirmation required before `SHORTFORGE_MANUAL_SMOKE_COMPLETE=1`.
- Studio for inspection: `http://localhost:3000` (dev server should be running).
- Checklist (confirm all):
  - Source Quality updates with target, Fit/Fill, and zoom
  - Guidance never disables export
  - Fit preserves complete source; Fit with background keeps sharp foreground; Fill covers canvas
  - Zoom, pan, play/pause, trim, scrub work; FG/BG stay synchronized
  - No-caption frames stay bright; title only in opening 2s and fades; title does not restart later
  - Captions readable; engagement overlays unchanged
  - Browser 720p/1080p work; Headless 1080p/4K remain available

## Production build (this closeout)

- Next.js `npm run build`: **passed** (after Browser cert harness type fixes)
- Headless `npm run build:headless-worker`: **passed**; v5 blurred-fill capability present in page IIFE
- No tracked build artifacts introduced (`dist/headless-worker` remains gitignored policy)

## Browser certification

- Real artifacts present: **yes**
- Automation blocker: Disk ENOSPC + incomplete multi-case matrix — see BROWSER_EXPORT_REAL_ARTIFACT.md

## Complete test summary (Prompt 6 closeout)

| Suite | Result |
| --- | --- |
| source-quality (+ guidance) | PASS |
| source-quality-ui / export | PASS |
| media-framing-parity / fit-with-background | PASS |
| fit-with-background certification + production bundle | PASS |
| legibility-layer + appearance | PASS |
| realistic-motion-encoding | PASS |
| video-quality-audit / export-media/encoder/resolution | PASS |
| export-manifest / engagement / transitions export | PASS |
| headless page contract / output profiles / resolution ladder / real-video motion | PASS |
| typecheck / eslint (Prompt 6 files) / git diff --check | PASS |
| build:headless-worker | PASS |
| next production build | SKIPPED (disk &lt; 600 MiB free) |
| browser-export-artifacts (real blobs) | INCOMPLETE (environmental) |
| manual Studio smoke | INCOMPLETE |
| brand-sting-export | FAIL (clean-staging baseline; out of scope) |

## Known baseline defects

- `test:brand-sting-export` fails on clean `origin/staging` due to engagement-overlay default `size`/`scale` injection. Documented in `BRAND_STING_EXPORT_BASELINE_FAILURE.md`. **Out of scope** for this video-quality branch.

## Remaining risks

- Browser real-artifact matrix incomplete until disk space is available and user-assisted Studio exports fill `.tmp/browser-export-cert/`.
- Manual Studio UX smoke not operator-certified in this session.
- Fit-with-background ideal refs use FFmpeg boxblur approximation for encode audits.
- Appearance SSIM on Fill includes chroma/letterbox differences; prefer structural edge SSIM for encoder conclusions.

## Next action before commit/PR

1. Free disk (≥2 GiB) and complete Browser artifact capture into `.tmp/browser-export-cert/` then `npm run test:browser-export-artifacts`
2. Complete manual Studio checklist; set `SHORTFORGE_MANUAL_SMOKE_COMPLETE=1` when done
3. Re-run `npm run test:video-quality-release-readiness`
4. Keep Brand Sting baseline failure separated; do not mix its repair into this PR
5. Only then commit / open PR (not part of this task)
