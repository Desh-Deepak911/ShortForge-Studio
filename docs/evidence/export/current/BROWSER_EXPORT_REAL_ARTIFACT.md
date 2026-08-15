# Browser export real-artifact certification

Generated: 2026-08-15T10:07:46.307Z

## Status

**Real Browser matrix complete** — eight production Browser Blobs probed below.



Missing: (none)

## Production authority

Browser silent visual uses `renderExport` → `renderChunkedSilentVisual` (canvas JPEG → libvpx chunks). Encode-probe substitutes are **not** Browser certification.

UI exposes 720p/1080p only; 4K is Headless-only. Matrix exports are **1080p WebM**.

## Measured artifacts

| File | Bytes | Size | Codec | FPS | Frames | Duration | Bitrate | Edge SSIM | Appearance SSIM | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01-native-vertical-1080-fill.webm | 1053866 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 4683848 | 0.8935 | 0.5839 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 02-landscape-4k-to-1080-fill-1x.webm | 905293 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 4023524 | 0.9734 | 0.8178 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 03-landscape-4k-to-1080-fill-1_25x.webm | 517473 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 2299880 | 0.9407 | 0.7807 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 04-landscape-fit.webm | 715891 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 3181737 | 0.9162 | 0.5205 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 05-landscape-fit-with-background.webm | 821167 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 3649631 | 0.9155 | 0.6076 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 06-trimmed-moving.webm | 535986 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 2382160 | 0.9232 | 0.4699 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 07-captioned.webm | 461177 | 1080×1920 | vp8/yuv420p | 30 | n/a | 1.800 | 2049675 | 0.9238 | 0.4513 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |
| 08-post-title-no-caption.webm | 1896629 | 1080×1920 | vp8/yuv420p | 30 | n/a | 3.300 | 4597888 | 0.8972 | 0.5819 | Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health) |

## User-assisted procedure

- 1. npm run dev
- 2. Ensure fixtures: npm run test:realistic-motion-encoding (or open /dev/browser-export-cert which uses /api/dev/browser-export-fixture/*).
- 3. Open http://localhost:3000/dev/browser-export-cert and click Run 1080p Browser matrix.
- 4. Artifacts write under .tmp/browser-export-cert/ via the cert automation / window.__BROWSER_EXPORT_CERT__.
- 5. npm run test:browser-export-artifacts

## Measurement command

```bash
npm run test:browser-export-artifacts
```
