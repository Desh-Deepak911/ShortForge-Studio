# Source media, Fit/Fill, zoom, and Fit with background

This is the framing and source-quality authority. Persistent field mapping: [MEDIA_FRAMING.md](MEDIA_FRAMING.md). Export capabilities: [EXPORT_MANIFEST_AND_CAPABILITIES.md](../architecture/EXPORT_MANIFEST_AND_CAPABILITIES.md).

## Geometry

| Treatment | Behavior |
| --- | --- |
| Fill (`cover`) | Crop to fill the 9:16 frame |
| Fit (`contain`) | Letterbox / pillarbox so the whole source is visible |
| Fit with background | Fit foreground plus `backgroundTreatment: "blurred_fill"` behind it |

Pan and zoom are stored in **1080×1920 reference-frame units**, not live viewport pixels. Preview, Browser, and Headless share `resolveMediaFramingLayerPlan`.

Absent `backgroundTreatment` remains legacy Fit. Fit with background is never inferred from Fit alone.

## Fit with background

- Escalates the export manifest to **v5** with required capability `media-background-treatment-blurred-fill-v1`
- Browser and Headless must advertise the capability; older renderers reject the job instead of silently drawing legacy Fit
- If the blur filter fails, draw stays non-terminal (dimmed Fill + sharp Fit)

Headless measurements: [FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md](../evidence/export/current/FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md).

## Source Quality

Source Quality in `src/features/source-quality/` is **advisory**:

- Target-aware guidance (soft / crop / enlargement risk)
- Unknown dimensions stay non-blocking
- Warnings never block export

Creator-facing copy lives in the inspector. Automated examples are in [VIDEO_QUALITY_RELEASE_READINESS.md](../evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md).

## Legibility

Local title/fade **legibility layers** are used instead of a permanent whole-frame dark overlay. See `src/features/legibility-layer/` and [LEGIBILITY_LAYER_APPEARANCE.md](../evidence/export/current/LEGIBILITY_LAYER_APPEARANCE.md).

## Engagement overlays

Engagement overlays are a visual-retention capability (`engagement-overlays-v1`). They are staging-gated with the other 12E motion capabilities. They are not default production UI.

## Verification

```bash
npm run test:source-quality
npm run test:fit-with-background
npm run test:legibility-layer
```
