# Sprint 11E Phase 2G.13/2G.14 — Media visual and voice-level parity

## Scope

Staging feature branch: `feature/staging-media-visual-audio-parity`

This change adds non-destructive visual adjustments for image and video media and
corrects the voice control above 100% so preview, browser export, and hosted
headless export consume the same effective gain.

No production or staging deployment is performed by this local phase.

## Visual-adjustment audit

Before this phase, image/video media stored transform, fit, trim, motion, and
timing, but no brightness, contrast, saturation, or media shadow authority
existed. Preview and export therefore had no shared setting to consume.

The correction adds one versioned primitive model on `SceneMedia`:

- brightness: 0–200%
- contrast: 0–200%
- saturation: 0–200%
- shadow enabled
- strict `#RRGGBB` shadow color
- opacity: 0–1
- blur: 0–48 reference pixels
- x/y offsets: -48–48 reference pixels

Shadow geometry is stored in a canonical 1080-wide coordinate space and scaled
once for the preview/export target. Identity settings are omitted from stored
media. Unknown, non-finite, out-of-range, and CSS-injection-shaped values are
normalized or rejected before render.

One deterministic filter builder is used by:

1. image preview;
2. video preview;
3. browser canvas export; and
4. the bundled Chromium/headless canvas renderer.

The filter is applied only while drawing media. Caption styling, caption
animations, scene transitions, media motion, video trim, and timing remain
separate authorities.

## Export compatibility

The new frozen pair is:

- ExportManifest v4
- renderer contract `9D`
- renderer build ID `headless-local-chromium-ffmpeg-11e-phase2g.13`

Frozen v2/`8D` and v3/`9C` validation remains supported. A v4 manifest carries
only validated primitive media-adjustment values, and those values participate
in the manifest fingerprint.

Because the website will begin creating v4 manifests after merge, the 9D worker
image must be rolled out to staging before or together with the staging website
deployment. The website must not be deployed against the current 9C-only worker.

## Voice-level audit

The stored voice control already accepted 0–200%, and the frozen gain already
reached browser and hosted FFmpeg audio graphs. The confusing behavior came from
two facts:

1. 200% previously meant a simple 2.0 linear multiplier; and
2. automatic peak protection limits peaks above the safe output ceiling.

For already loud narration, peak limiting could make 100% and 200% sound
surprisingly similar.

The correction keeps 0–100% linear and maps 100–200% to an explicit 0–+10 dB
perceptual boost:

- 100% = 1.000× / 0 dB
- 150% = 1.778× / +5 dB
- 200% = 3.162× / +10 dB

The effective value is frozen into the manifest and consumed unchanged by
preview GainNode, browser export mix, and hosted FFmpeg `volume` filters. Peak
protection remains enabled where required; it is not bypassed or weakened.

The editor now labels this control “Voice Level” and displays the effective
multiplier and dB value so the user is not misled by the raw slider percentage.

## Verification

Passing local gates include:

- media visual/audio parity authority;
- audio mixer and peak-protection authority;
- export audio parity;
- export manifest v4 validation/fingerprinting;
- scene-media export and renderer authority;
- frozen v3 transition compatibility;
- headless audio and streaming;
- page-render live Chromium contract;
- worker contract, packaging, and container authority;
- claimed-render diagnostic build/authority;
- deterministic worker/page and diagnostic builds;
- TypeScript, ESLint (zero errors), and Next production build.

Current deterministic artifacts:

- `hosted-worker.js`: `aedf20f675a75b3b071081d111d0ac0131d83cb7a179eb94080ca8b72d62aced`
- `page-render.iife.js`: `7a5c3e20c9ae6ce4aa3064a371eb445f52e9871f6303ecd481a43417b4fc2372`
- `BUILD_INFO.json`: `6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a`

## Required staging sequence

1. Review and commit this feature branch.
2. Build and push the new worker image without deploying the website.
3. Register the prospective immutable staging image record.
4. Roll out the new 9D worker image to verify and render Machines.
5. Promote that image record only after topology/schema/loop checks pass.
6. Merge this branch into `staging` and redeploy the staging website.
7. Manually test image and video adjustments at 720p, 1080p, and 4K.
8. Compare voice at 100%, 150%, and 200% using the same narration.
9. Confirm download, browser playback, captions, transitions, trim, and cleanup.
