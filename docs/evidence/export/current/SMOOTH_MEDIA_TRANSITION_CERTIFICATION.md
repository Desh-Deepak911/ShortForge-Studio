# Smooth Media Transition Certification

Status: implementation pass; manual Studio/Browser visual smoke outstanding.

## Reported artifact diagnosis

Source artifact: `Nasser Al-Khelaifi PSG.mp4` (local operator export, not tracked).

- H.264, 2160×3840, 30 fps, 26.766667 s, 803 frames.
- Frame timestamps were monotonic with no missing cadence.
- Repeated decoded frames exposed two transition-local stalls:
  - 8.733333–9.066667 s (about 0.333 s)
  - 16.300000–16.766667 s (about 0.467 s)
- Production code confirmed the cause: the outgoing intra-scene layer was held at
  its final visual frame while the incoming layer advanced.

This classified the defect as transition timing/renderer behavior, not encoder
frame loss.

## Implemented authority

- `centered-continuous-v1` centers the creator-selected transition duration on
  the existing media boundary.
- Both outgoing and incoming peers advance through the overlap.
- The overlap preserves scene, story, audio, and export duration.
- New exports carrying a transition require
  `continuous-intra-scene-transitions-v1` on ExportManifest v5 / renderer 9E.
- Browser and Headless advertise the capability. Frozen v3/v4 manifests retain
  their legacy timing and cannot silently opt into the new interpretation.
- Known exhausted video trims fail to a hard cut; export remains enabled. Images
  and video with unknown duration metadata remain non-terminal.

## Real decoded Headless result

Production bundle was rebuilt before the run.

- Artifact: `.tmp/smooth-media-transition-cert/headless_720p_centered_fade.mp4`
- Evidence: `.tmp/smooth-media-transition-cert/headless_720p_centered_fade.json`
- Output: 720×1280 H.264, 30 fps, canonical 4.4 s render duration (4.0 s
  content plus existing end buffer).
- Certified decoded window: 1.76–2.23 s inside the 1.75–2.25 s transition,
  using two distinct real motion sources.
- Result: 14/15 unique decoded frames.
- Maximum identical-frame run: 2 frames (about 0.067 s at 30 fps).

The fixed real-render fixture therefore does not reproduce the reported
0.33–0.47 s transition freeze.

## Automated coverage

- Continuous timing contract, odd durations, exact edges, and determinism.
- Preview moving-peer lifecycle and source-time continuity.
- Browser/Headless manifest runtime parity through one frozen frame plan.
- Capability/version/fingerprint validation and legacy compatibility.
- All supported effects and image/video pair combinations.
- Known insufficient outgoing/incoming video footage falls back to Cut.
- Real rebuilt Headless MP4 render and decoded frame uniqueness.

## Remaining operator check

Run one Studio Preview and Browser export using the original project/draft and
confirm the selected effect is visually pleasing at its authored duration. This
is appearance calibration, not a remaining timing-authority defect.
