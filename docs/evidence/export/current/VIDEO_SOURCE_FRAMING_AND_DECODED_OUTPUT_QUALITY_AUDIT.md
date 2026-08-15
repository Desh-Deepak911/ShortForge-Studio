# Video source framing and decoded output quality audit

Date: 2026-08-07  
Branch: `staging-video-quality-audit`  
Base: `origin/staging` at `d7bdccd28a3570e5ee51710e6c719a53c91d7be7`

## Scope

This audit measures the two quality responsibilities separately:

1. **Source sufficiency after framing** — how Fit, Fill, and authored zoom affect frame coverage, retained source area, and source pixels available per output pixel.
2. **Renderer/encoder fidelity** — whether a real Headless MP4 preserves the intended transformed source structure at 720p, 1080p, and 4K.

The audit is provider-free. It uses synthetic local MP4 sources, the real local Headless worker, the production framing path, and native FFmpeg decoding. It does not change production generation or export behavior.

### Prompt 1 — target-aware Source Quality authority

Effective geometry (base scale, authored zoom, active scale, source pixels per output pixel, retained region, retained area %, frame coverage %, detail class, softness cause) now lives in the production Source Quality domain:

- `measureSourceQualityTargetGeometry` / `assessSourceQuality` in `src/features/source-quality/`
- Verification corpus delegates to that authority (`src/verification/video-quality/videoQualityAuditCorpus.ts`)

Additive fields only. Existing warning codes, ExportManifest fingerprints, and persisted stories remain compatible. Quality remains advisory and never blocks export.

### Prompt 2 — non-blocking creator-facing guidance

Creator copy is mapped from the existing assessment (no second math layer) via `presentSourceQualityGuidance`:

- Ratings: Excellent / Good / May look soft / Significant enlargement / Quality cannot be estimated — always labelled with the selected export target
- Cause-aware explanations + reversible suggestions (never auto-applied)
- Inspector `SourceQualitySummary` shows the primary summary; expandable Details holds numeric density/crop facts
- Export preflight keeps short story-level warnings (deduped codes) without duplicating the inspector wall of text
- Capability-off continues to hide the inspector summary; export remains available either way

### Prompt 3 — Fit with background

Persistence: optional `backgroundTreatment: "blurred_fill"` on `SceneMedia` / `SceneImage` (absent ≡ none). Fit/Fill remain the only `fitMode` values. Legacy Fit is never reinterpreted as Fit with background.

Shared authority: `resolveMediaFramingLayerPlan` → Preview (CSS/canvas from one video element), Browser + Headless (`drawCanvasImageSource` dual draw). Blur failure falls back to dimmed Fill + sharp Fit (non-terminal).

Source Quality assesses sharp Fit geometry; suggestion `Use Fit with background` is actionable when uncovered Fit canvas is present.

## Corpus

The deterministic geometry corpus contains 135 combinations:

- Sources: vertical 720p/1080p/4K, landscape 1080p/4K, square, 4:3, ultrawide, and low-resolution vertical.
- Framing: Fit at 0.75× and 1×; Fill at 1×, 1.25×, and 1.75×.
- Outputs: 720p, 1080p, and 4K vertical.

Each case measures:

- frame coverage fraction;
- retained source area fraction;
- source pixels per output pixel after framing;
- native/downsampled, mild, material, or severe upscale classification.

## Measured final-artifact results

| Case | Output | Source pixels per output pixel | Source area retained | Structural edge SSIM | Source appearance SSIM |
|---|---:|---:|---:|---:|---:|
| Native vertical 1080p, Fill 1× | 1080×1920 H.264 | 1.000 | 100.0% | 0.9696 | 0.7691 |
| Landscape 1280×720, Fill 1× | 720×1280 H.264 | 0.5625 | 31.6% | 0.9795 | 0.7200 |
| Landscape 3840×2160, Fill 1.25× | 2160×3840 H.264 | 0.4500 | 20.3% | 0.9914 | 0.7018 |

Structural edge SSIM compares the decoded final artifact with the intended transformed source while remaining insensitive to the intentional text-legibility darkening layer. Source appearance SSIM is also recorded because that layer materially changes brightness and colour appearance.

## Findings

1. **The measured Headless renderer and encoder preserve intended spatial structure well.** All representative decoded artifacts passed their structural thresholds, including the real 4K case.
2. **A source labelled “4K” is not automatically sufficient for a vertical 4K Fill export.** A 3840×2160 landscape source must scale by about 1.78× to fill 2160×3840. At 1.25× authored zoom it provides only 0.45 source pixels per output pixel and retains about 20% of the source area. Encoding cannot restore detail that framing has already removed.
3. **Landscape-to-vertical Fill is inherently expensive.** The 1280×720-to-720×1280 case retains about 31.6% of the source area and materially upscales the retained region even though both source and output are commonly called “720p.”
4. **Fit avoids crop but can leave much of the frame uncovered.** For example, centered 16:9 landscape Fit at 1× covers only about 31.6% of a 9:16 frame. Zooming out reduces coverage further.
5. **The final renderer intentionally darkens the complete frame for text legibility.** The production gradient reaches 60% black at the top and 90% at the bottom, and the story title is drawn on every frame. This does not reduce pixel resolution, but it can make otherwise sharp footage appear dull or lower quality. The measured appearance scores of 0.70–0.77 reflect this composition difference.

## Conclusions

- No evidence supports changing Headless bitrate, codec, target dimensions, or high-quality canvas smoothing as the first fix.
- The primary preventable risk is allowing a framing choice whose effective source density is too low for the selected output.
- The secondary presentation risk is the always-on dark gradient/title treatment, which should be reviewed separately from encoder quality.
- Quality guidance must remain advisory. Weak source material should still export; it should report likely softness and the framing reason rather than fail.

## Recommended next slice

1. Surface effective source density and crop/coverage guidance for the selected target before export.
2. Distinguish “source is low resolution” from “current Fill/zoom makes this source insufficient.”
3. Offer reversible suggestions such as reducing zoom, switching to Fit, or choosing a lower output target; never silently change authored framing.
4. Audit and tune the global text-legibility gradient/title treatment with caption-safe rules.
5. Keep intermittent Headless failure classification separate and evidence-based using job ID, terminal stage/reason, progress, and logs.

## Verification commands

- `npm run test:source-quality`
- `npm run test:video-quality-audit`
- `npm run test:headless-real-video-motion-authority`
- `npm run test:headless-worker-resolution-ladder`
- `npm run typecheck`

