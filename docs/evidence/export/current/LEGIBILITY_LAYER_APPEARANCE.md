# Legibility layer appearance evidence

Generated: 2026-08-14T19:46:51.563Z

## Shared authority

- Domain: `src/features/legibility-layer/`
- Title window: first 2000ms of content; fade final 300ms; clamped to content duration
- Permanent full-frame dark gradient: **retired** (`globalGradientEnabled: false`)

## Baseline (retired full-frame gradient)

| Metric | Value |
| --- | --- |
| Mean black alpha across 1080×1920 | 0.4726 |
| Bright-source preserved fraction under baseline | 0.5274 |

## Changed plan coverage (local treatments only)

| Case | Title | Caption scrim | Local coverage | Mean local α approx | Notes |
| --- | --- | --- | --- | --- | --- |
| no_text_media_frame | — | no | 0.0000 | 0.0000 | No title, no caption, branding off |
| opening_title_frame | 1.00 | no | 0.0873 | 0.0552 | Title solid + branding local |
| title_during_fade | 0.50 | no | 0.0873 | 0.0279 | Title fading |
| post_title_frame | — | no | 0.0113 | 0.0006 | Title gone; branding local only |
| bottom_caption_with_style_bg | — | no | 0.0113 | 0.0006 | Default caption style supplies background — no extra scrim |
| top_caption_needs_scrim | — | yes | 0.1106 | 0.0721 | Local top scrim only |
| bright_source_no_global | — | no | 0.0000 | 0.0000 | Bright footage — no full-frame darken |
| dark_source_no_global | — | no | 0.0000 | 0.0000 | Dark footage — no full-frame darken |
| fit_with_background_post_title | — | no | 0.0113 | 0.0006 | Same plan above Fit-with-background composite |

## Text contrast (WCAG AA normal text ≥ 4.5:1)

| Background context | Contrast ratio |
| --- | --- |
| White footage + local scrim 0.72 | 9.29 |
| Near-black footage + local scrim 0.72 | 20.50 |
| Grass/crowd green + local scrim 0.72 | 16.72 |

## Real Headless artifact

| Field | Value |
| --- | --- |
| Case | headless_1080p_fill |
| Output | 1080×1920 |
| Bytes | 233263 |
| Opening mean luma (~0.1s, title window) | 115.78 |
| Post-title mean luma (~2.2s) | 120.48 |
| Simulated baseline-darkened post-title luma | 63.54 |

Comparative: post-title decoded mean luma is higher than the simulated baseline-darkened value (pixels outside local text regions are not unnecessarily darkened).

## Artifacts

- `.tmp/legibility-layer-cert/measurements.json`
- Optional MP4 under `.tmp/legibility-layer-cert/`
