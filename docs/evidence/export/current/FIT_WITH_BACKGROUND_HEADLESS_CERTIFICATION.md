# Fit-with-background Headless certification

Generated: 2026-08-14T19:58:20.392Z

## Renderer compatibility

- `backgroundTreatment: blurred_fill` escalates ExportManifest to **v5** with required capability `media-background-treatment-blurred-fill-v1`.
- Browser and Headless advertise the capability; older renderers without it reject the job (no silent legacy Fit).
- Draw hydration is gated on the capability; blur filter failure remains non-terminal (dimmed Fill + sharp Fit).

## Decoded cases

| Case | Output | Frames | Bytes | Corner luma | Foreground edge SSIM | Wall ms | Chromium ms | Peak RSS | Peak frame B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| landscape_4k_to_1080_fit_with_background | 1080×1920 | 30 | 75694 | 89.0 | 0.9628 | 24000 | 23056 | 119652352 | 156557 |
| landscape_4k_to_4k_fit_with_background | 2160×3840 | 30 | 181429 | 89.0 | 0.9800 | 30542 | 29201 | 102105088 | 467775 |
| trimmed_moving_landscape_1080_fit_with_background | 1080×1920 | 30 | 193008 | 83.7 | 0.9575 | 21902 | 21136 | 106446848 | 315331 |
| legacy_fit_control_1080 | 1080×1920 | 30 | 47010 | 0.0 | 0.9615 | 20405 | 19540 | 97419264 | 110019 |
| fill_control_1080 | 1080×1920 | 30 | 51012 | 133.0 | n/a | 21690 | 20220 | 66830336 | 114914 |

## 4K cost comparison (equivalent short renders)

| Case | Frames | Bytes | Wall ms | Chromium ms | Peak RSS | Peak frame B |
| --- | --- | --- | --- | --- | --- | --- |
| perf_4k_legacy_fit | 30 | 87134 | 26717 | 23254 | 99680256 | 323459 |
| perf_4k_fit_with_background | 30 | 181429 | 28839 | 27619 | 101089280 | 467775 |
| perf_4k_fill | 30 | 136927 | 23871 | 22744 | 100450304 | 341909 |

- Relative overhead Fit-with-background vs legacy Fit: **7.9%**
- Relative overhead Fit-with-background vs Fill: **20.8%**

## Objective checks

- Exact output dimensions matched Headless target ladder.
- Fit-with-background corners are not near-black (background covers canvas).
- Legacy Fit control retains near-black letterbox.
- Foreground Fit crop retains high structural-edge SSIM vs sharp Fit reference (not blurred).
- Trimmed motion case uses trimStartMs=1000 with moving `testsrc` source.

## Artifacts

- Measured JSON + PNG + MP4 under `.tmp/fit-with-background-cert/`.

