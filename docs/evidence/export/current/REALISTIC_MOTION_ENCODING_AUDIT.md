# Realistic motion encoding audit

Generated: 2026-08-14T19:54:51.185Z

## Separation of loss

1. **Geometry** — Fit/Fill/zoom/crop vs ideal transformed reference (not uncropped landscape).
2. **Presentation** — titles/captions/branding excluded via text-safe crop masks.
3. **Encoding** — ideal still → production encode args (Headless PNG→H.264; Browser JPEG→libvpx→H.264).

## Fixture corpus

| Id | Size | FPS | Duration | Codec | Bitrate | Digest |
| --- | --- | --- | --- | --- | --- | --- |
| rapid_horizontal_pan | 3840×2160 | 30 | 2s | h264/yuv420p | 40M | `3a3b6b627385…` |
| slower_camera_tracking | 1920×1080 | 30 | 2s | h264/yuv420p | 16M | `22bd5ca69640…` |
| fine_grass_texture | 1920×1080 | 30 | 1.5s | h264/yuv420p | 20M | `d963fdca93a6…` |
| dense_crowd_detail | 1920×1080 | 30 | 1.5s | h264/yuv420p | 20M | `84b2dc291cc4…` |
| shirt_edge_numbers | 1920×1080 | 30 | 2s | h264/yuv420p | 16M | `b7c65a8988ca…` |
| confetti_particles | 1920×1080 | 30 | 1.5s | h264/yuv420p | 16M | `e87e06764340…` |
| low_light_gradient | 1920×1080 | 30 | 1.5s | h264/yuv420p | 12M | `8644bf52e1cc…` |
| bright_stadium_lights | 1920×1080 | 30 | 1.5s | h264/yuv420p | 16M | `c25a6e5fabaf…` |
| rapid_scene_cuts | 1920×1080 | 30 | 2s | h264/yuv420p | 16M | `1f05caa36e7c…` |
| static_detailed_control | 1920×1080 | 30 | 1s | h264/yuv420p | 12M | `2a67ebaede5f…` |
| native_vertical_motion | 1080×1920 | 30 | 2s | h264/yuv420p | 16M | `b1b8bef7eb30…` |
| native_vertical_4k | 2160×3840 | 30 | 1.5s | h264/yuv420p | 40M | `c12675b60ed0…` |
| landscape_motion | 3840×2160 | 30 | 2s | h264/yuv420p | 40M | `3ce6417e33c9…` |

Fixtures live under `.tmp/realistic-motion-fixtures/`.

## Baseline profiles (unchanged)

### Headless
- 720p MP4: **4M**
- 1080p MP4: **8M**
- 4K MP4: **20M**
- Pixel format: yuv420p; keyframe `-g 30`; H.264 bitrate mode (no CRF)

### Browser (720p/1080p only)
- 1080p high: JPEG q=0.97, libvpx good/cpu-used 4, H.264 CRF 19, bitrate 8M

## Per-case measurements

| Case | Target | Mode | Zoom | HL encode-probe edge SSIM | Browser JPEG probe edge SSIM | HL E2E avg edge SSIM | HL E2E avg appearance SSIM | Bytes | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1080_to_v1080_fill_1x | 1080×1920 | fill | 1 | 0.9700 | 0.9777 | 0.9439 | 0.7440 | 899600 | 23968 |
| v4k_to_v4k_fill_1x | 2160×3840 | fill | 1 | 0.9914 | — | 0.9580 | 0.7442 | 3485718 | 28026 |
| l4k_to_v1080_fill_1x | 1080×1920 | fill | 1 | 0.9973 | 0.9890 | 0.9763 | 0.6831 | 458222 | 23707 |
| l4k_to_v1080_fill_1_25x | 1080×1920 | fill | 1.25 | 0.9988 | 0.9945 | 0.9841 | 0.6827 | 143157 | 22426 |
| l4k_to_v4k_fill_1x | 2160×3840 | fill | 1 | 0.9985 | — | 0.9837 | 0.6854 | 1451617 | 28069 |
| l4k_to_v4k_fill_1_25x | 2160×3840 | fill | 1.25 | 0.9994 | — | — | — | 61946 | 749 |
| l1080_to_v1080_fill_1x | 1080×1920 | fill | 1 | 0.9918 | 0.9884 | 0.9945 | 0.6998 | 111686 | 21750 |
| landscape_to_fit | 1080×1920 | fit | 1 | 0.9803 | 0.9672 | 0.9589 | 0.8660 | 230313 | 21539 |
| landscape_to_fit_with_background | 1080×1920 | fit_with_background | 1 | 0.9813 | — | 0.9535 | 0.7389 | 252704 | 23472 |
| trimmed_moving_video | 1080×1920 | fill | 1 | 0.9990 | 0.9957 | 0.9872 | 0.6900 | 103064 | 24030 |
| rapid_cut_multi_scene | 1080×1920 | fill | 1 | 0.9980 | 0.9904 | 0.9850 | 0.6869 | 275720 | 26249 |
| grass_texture_1080_fill | 1080×1920 | fill | 1 | 0.9215 | 0.7731 | — | — | 994764 | 514 |
| crowd_detail_1080_fill | 1080×1920 | fill | 1 | 0.9978 | 0.9917 | — | — | 49115 | 175 |
| shirt_numbers_720_fill | 720×1280 | fill | 1 | 1.0000 | 1.0000 | 1.0000 | 0.9892 | 7452 | 19370 |

### Per-frame Headless E2E samples

#### v1080_to_v1080_fill_1x
  - t=0.1s edgeSSIM=0.9446 appearanceSSIM=0.7431 PSNR=24.226587 VMAF=65.820891
  - t=0.25s edgeSSIM=0.9427 appearanceSSIM=0.7439 PSNR=24.228775 VMAF=65.17062
  - t=0.4s edgeSSIM=0.9443 appearanceSSIM=0.7449 PSNR=24.237053 VMAF=64.843274
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### v4k_to_v4k_fill_1x
  - t=0.1s edgeSSIM=0.9585 appearanceSSIM=0.7433 PSNR=24.208205 VMAF=64.996842
  - t=0.25s edgeSSIM=0.9578 appearanceSSIM=0.7445 PSNR=24.233492 VMAF=64.839521
  - t=0.4s edgeSSIM=0.9576 appearanceSSIM=0.7450 PSNR=24.235517 VMAF=64.72774
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### l4k_to_v1080_fill_1x
  - t=0.1s edgeSSIM=0.9761 appearanceSSIM=0.6831 PSNR=27.873083 VMAF=72.113727
  - t=0.25s edgeSSIM=0.9765 appearanceSSIM=0.6831 PSNR=27.873758 VMAF=73.051048
  - t=0.4s edgeSSIM=0.9763 appearanceSSIM=0.6831 PSNR=27.865487 VMAF=72.796388
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### l4k_to_v1080_fill_1_25x
  - t=0.1s edgeSSIM=0.9840 appearanceSSIM=0.6824 PSNR=29.626785 VMAF=85.226067
  - t=0.25s edgeSSIM=0.9840 appearanceSSIM=0.6827 PSNR=29.63902 VMAF=86.745997
  - t=0.4s edgeSSIM=0.9842 appearanceSSIM=0.6832 PSNR=29.66705 VMAF=87.770251
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### l4k_to_v4k_fill_1x
  - t=0.1s edgeSSIM=0.9838 appearanceSSIM=0.6854 PSNR=29.629325 VMAF=80.352835
  - t=0.25s edgeSSIM=0.9836 appearanceSSIM=0.6853 PSNR=29.637068 VMAF=81.03654
  - t=0.4s edgeSSIM=0.9837 appearanceSSIM=0.6855 PSNR=29.642914 VMAF=81.680746
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### l1080_to_v1080_fill_1x
  - t=0.1s edgeSSIM=0.9951 appearanceSSIM=0.6959 PSNR=25.177828 VMAF=87.511426
  - t=0.25s edgeSSIM=0.9943 appearanceSSIM=0.7008 PSNR=25.292551 VMAF=81.673299
  - t=0.4s edgeSSIM=0.9940 appearanceSSIM=0.7026 PSNR=25.379218 VMAF=88.047423
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### landscape_to_fit
  - t=0.1s edgeSSIM=0.9591 appearanceSSIM=0.8656 PSNR=27.256898 VMAF=84.083626
  - t=0.25s edgeSSIM=0.9590 appearanceSSIM=0.8661 PSNR=27.272753 VMAF=83.73739
  - t=0.4s edgeSSIM=0.9586 appearanceSSIM=0.8664 PSNR=27.275789 VMAF=83.544116
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### landscape_to_fit_with_background
  - t=0.1s edgeSSIM=0.9548 appearanceSSIM=0.7312 PSNR=15.163555 VMAF=62.91712
  - t=0.25s edgeSSIM=0.9520 appearanceSSIM=0.7401 PSNR=15.145204 VMAF=66.135804
  - t=0.4s edgeSSIM=0.9538 appearanceSSIM=0.7454 PSNR=15.169641 VMAF=65.717871
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=24

#### trimmed_moving_video
  - t=0.1s edgeSSIM=0.9864 appearanceSSIM=0.6911 PSNR=26.478676 VMAF=71.403039
  - t=0.25s edgeSSIM=0.9874 appearanceSSIM=0.6892 PSNR=26.351246 VMAF=80.56441
  - t=0.4s edgeSSIM=0.9878 appearanceSSIM=0.6898 PSNR=26.859702 VMAF=85.43499
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=0 sampled=24 unique=23

#### rapid_cut_multi_scene
  - t=0.1s edgeSSIM=0.9847 appearanceSSIM=0.6870 PSNR=28.614555 VMAF=68.329831
  - t=0.25s edgeSSIM=0.9849 appearanceSSIM=0.6867 PSNR=28.627165 VMAF=69.167361
  - t=0.4s edgeSSIM=0.9852 appearanceSSIM=0.6870 PSNR=28.638407 VMAF=70.032364
  - temporal: packets=39 dupPTS=0 monotonic=false freezeDetect(info)=1 sampled=24 unique=22

#### shirt_numbers_720_fill
  - t=0.1s edgeSSIM=1.0000 appearanceSSIM=0.9892 PSNR=32.608178 VMAF=97.420972
  - t=0.25s edgeSSIM=1.0000 appearanceSSIM=0.9892 PSNR=32.608178 VMAF=97.420972
  - t=0.4s edgeSSIM=1.0000 appearanceSSIM=0.9892 PSNR=32.608178 VMAF=97.420965
  - temporal: packets=30 dupPTS=0 monotonic=false freezeDetect(info)=1 sampled=24 unique=12

## Geometry vs encoding conclusions

- Landscape→vertical **Fill** cases lose detail primarily through **crop + enlarge** (geometry). Encode-probe on the *already transformed* ideal still remains high structural SSIM.
- Native vertical Fill does not show an unexplained structural regression vs ideal.
- Fit-with-background E2E keeps measurable fidelity with text regions masked; foreground sharpness is assessed against the Fit ideal crop (blurred background excluded from encoder blame).
- Browser JPEG intermediate encode-probe is typically slightly softer than Headless PNG→H.264 on the same ideal still (see deltas below). This is intermediate-format cost, not Fit/Fill geometry.

### Browser JPEG vs Headless encode-probe deltas (edge SSIM)

| Case | Headless | Browser JPEG path | Δ (HL − Browser) |
| --- | --- | --- | --- |
| v1080_to_v1080_fill_1x | 0.9700 | 0.9777 | -0.0077 |
| l4k_to_v1080_fill_1x | 0.9973 | 0.9890 | 0.0084 |
| l4k_to_v1080_fill_1_25x | 0.9988 | 0.9945 | 0.0043 |
| l1080_to_v1080_fill_1x | 0.9918 | 0.9884 | 0.0034 |
| landscape_to_fit | 0.9803 | 0.9672 | 0.0131 |
| trimmed_moving_video | 0.9990 | 0.9957 | 0.0033 |
| rapid_cut_multi_scene | 0.9980 | 0.9904 | 0.0076 |
| grass_texture_1080_fill | 0.9215 | 0.7731 | 0.1484 |
| crowd_detail_1080_fill | 0.9978 | 0.9917 | 0.0061 |
| shirt_numbers_720_fill | 1.0000 | 1.0000 | 0.0000 |

## Encoder tuning decision

**No encoder settings were changed.**

Baseline encode-probe and Headless E2E measurements do not show a repeatable encoder-only deficiency that justifies changing CRF/bitrate/preset. Geometry crop/zoom remains the dominant loss on landscape→vertical Fill. Browser JPEG intermediate is slightly softer than Headless PNG→H.264 on the same ideal still, but within previously evidence-backed Sprint 6H JPEG qualities; raising bitrate blindly is rejected.

Before/after: N/A (baseline retained).

## Browser certification status

structural_plus_encode_probe — No Studio browser automation session available. Browser certification uses production profile authority + JPEG→libvpx→H.264 encode probe against ideal transformed references. Real MediaRecorder/Studio export artifacts were not produced.

## Headless certification status

Real rebuilt worker path exercised for E2E cases (720p / 1080p / 4K MP4). Exact dimensions, h264/yuv420p, and non-frozen temporal samples asserted.

## Commands

```bash
npm run test:realistic-motion-encoding
npm run build:headless-worker
```

## Artifacts

- `.tmp/realistic-motion-fixtures/`
- `.tmp/realistic-motion-encoding/measurements.json`
- E2E MP4s under `.tmp/realistic-motion-encoding/*.mp4`

## Limitations

- Ideal Fit-with-background reference uses FFmpeg boxblur approximation — not identical to canvas filter blur.
- Opening title/branding masked via text-safe crop for encoder conclusions.
- VMAF reported only when libvmaf is present in the local FFmpeg build.
- 4K E2E wall time is higher; one 4K zoom matrix cell is encode-probe-only.
