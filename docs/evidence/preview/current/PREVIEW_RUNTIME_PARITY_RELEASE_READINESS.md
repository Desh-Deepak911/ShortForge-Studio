# Preview runtime-parity release readiness

Generated: 2026-08-18

## Final verdict: **ready**

Prompt 6B closed the two certification-only gaps that kept Prompt 6 at `conditionally_ready`: cumulative certification-story scene timing, and a clean 9:16 Preview capture surface comparable with encoded Browser and Headless frames. Fresh 1080×1920 Browser and Headless WebMs were produced from the corrected frozen story. Clean Preview PNGs were captured from the same story at the same timestamps. The 25-sample three-way matrix passed. Later-scene Preview seek now resolves later scenes. Provider-free suites passed. The implementation fingerprint was stable through the live Studio recapture. No encoded Browser-versus-Headless production defect remains.

720p and 4K were not rerun. They stay optional/skipped and are not treated as completed. They do not hold this verdict at `conditionally_ready`.

## Frozen fingerprints

Live Studio recapture fingerprints, recorded at **2026-08-18T16:34:06Z** before the passing Preview PNGs, and unchanged through that recapture.

| Field | Value |
| --- | --- |
| Branch | `staging-preview-runtime-parity` |
| HEAD | `761d1ea4bd92642f927f2e2e8ea2f90bb1472b3d` |
| Upstream | `origin/staging` (same commit) |
| Dirty | yes — Prompt 1–6B uncommitted |
| `trackedDiffHash` | `8e827053e94f0c5ab744e61d2e08f065b3faa6d57a9343bf08fce23d52985173` |
| `implementationFingerprint` | `63f5d5229f636d9ba57039af005f145c5bf5137ebbab8cd3304b62de9858eca1` |
| `lockfileHash` | `e6881bae0415f0f7a0f5b23c51a806ffc138aa103de9345b9086ea6e51b69db2` |
| `headlessBundleHash` | `337d90a3cd2a9ba837400d539ed8994f2e5fc12db4933b6b7e6cad599d2c3190` (`dist/headless-worker/hosted-worker.js`) |
| `frozenStoryFingerprint` | `7eb07862fc268e42bc3e32150ee9ad14643ed12e5abb6c47afb5bbb82f3a9b08` |
| Browser-prep `manifestFingerprint` | `em:6bsahi` |
| Headless profiled manifest | `em:2aj2se` |
| Fingerprint stable through live Studio/Browser recapture | **yes** |

Lockfile hash and Headless worker bundle hash are unchanged from Prompt 6. The implementation fingerprint changed versus Prompt 6 because Prompt 6B added the opt-in Preview capture hook, certification seek/timing modules, and a capture-surface-only software video plate. Production export and the rebuilt Headless worker were not re-authored for this closeout.

## Closeout addendum: documentation-only fingerprint adoption

Closeout isolated the later fingerprint change with an in-memory / temporary-worktree byte comparison. The real working tree was not edited for that isolation. Comparison used `git diff` bytes and SHA-256 of file contents, not mtimes.

| Isolated state | `implementationFingerprint` | Reproduces live-cert `63f5d522…` |
| --- | --- | --- |
| 1. Current tree | `e95f97b3e8dc4d74b1f19af06888103a205044c88da08ec98d02b8f5f3318748` | no |
| 2. Entire Preview README index row removed | `d98ce56b6d424dd548b54dfe5b20be4d1a883e09da0250bfaf0b973565210714` | no |
| 3. Reconstructable `SceneFrameVideo.tsx` deps revert (`[containerRef, mediaItemId, url]` → `[mediaItemId, url]`) | same as current — current file already has `[mediaItemId, url]` | no |
| 4. States 2 + 3 | same as state 2 | no |
| Actual post-freeze README edit restored (`**ready**` → `**conditionally_ready**` on the existing Preview row) | `63f5d5229f636d9ba57039af005f145c5bf5137ebbab8cd3304b62de9858eca1` | **yes** |

Findings:

- `src/features/editor/components/SceneFrameVideo.tsx` current bytes match the live-certified version. The post-freeze ESLint deps add/revert left no residual byte change.
- The only fingerprint-included post-certification drift is `docs/evidence/README.md` verdict language on the already-present Preview row: `conditionally_ready` → `ready`.
- Classification: **documentation-only**. Not Preview-runtime-affecting. Browser and Headless production renderer inputs and the Headless bundle hash are unchanged.
- Live Browser / Headless exports and Preview recapture were **not** rerun.
- The README `ready` row is retained. That file is fingerprint-included and was not edited again after this fingerprint was adopted.

### Final certified fingerprints (commit tree)

| Field | Value |
| --- | --- |
| `implementationFingerprint` | `e95f97b3e8dc4d74b1f19af06888103a205044c88da08ec98d02b8f5f3318748` |
| `trackedDiffHash` | `4c8e3e794ccd05f277d6acf574c81f3fe395e978d4750860d4abe96630bfa3cc` |
| `lockfileHash` | `e6881bae0415f0f7a0f5b23c51a806ffc138aa103de9345b9086ea6e51b69db2` (unchanged) |
| `frozenStoryFingerprint` | `7eb07862fc268e42bc3e32150ee9ad14643ed12e5abb6c47afb5bbb82f3a9b08` (unchanged) |
| `headlessBundleHash` | `337d90a3cd2a9ba837400d539ed8994f2e5fc12db4933b6b7e6cad599d2c3190` (unchanged) |

## Corrected scene timing

Canonical authority is existing `recalculateSceneTimings` + export `applyMasterTimelineSceneTiming`, applied once by `applyPreviewRuntimeParityCertificationSceneTiming`. Seconds and milliseconds are not hand-maintained as duplicate arrays.

| Scene | start | end | duration | startMs | endMs | durationMs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `parity-scene-three-transition` | 0 | 9 | 9 | 0 | 9000 | 9000 |
| `parity-scene-mixed` | 9 | 17 | 8 | 9000 | 17000 | 8000 |
| `parity-scene-framing` | 17 | 25 | 8 | 17000 | 25000 | 8000 |
| `parity-scene-clock-return` | 25 | 31 | 6 | 25000 | 31000 | 6000 |

Production split (last authored scene is not extended to absorb subtitle hold):

| Bound | ms |
| --- | ---: |
| Last authored scene end | 31000 |
| Export `contentEndMs` | 31400 |
| Brand Sting | 31400–33900 (2500 ms) |
| Brand Sting midpoint | 32650 |
| Brand Sting late-visible sample | 33600 (still inside sting) |
| Render end | 34300 |
| Last decodable 30 fps frame | 34267 |

Scene 1 starts at 0. Each later scene starts at the previous scene’s end. No overlaps. No unintended gaps. Browser, Headless, and Preview consume this identical frozen story.

## Clean capture-surface proof

Development-harness certification capture mode (`certificationCaptureMode`, default **false**) uses the same production `PreviewFrame` composition. When armed after caption drag:

- Device bezel, outer padding, Dynamic Island, and in-frame transport footer are omitted
- Caption selection chrome / drag handles are disabled (`draggable={!certificationCaptureMode}`)
- Next.js dev portal is hidden for the cert screenshot pass
- Locator: `[data-preview-runtime-parity-cert-capture-surface]`
- Captured box: **1080×1920**, aspect **9:16**, no device padding (`captureOk: true` on all 25 samples)

Exported overlays remain: media, framing/motion, captions, CTA, title/branding/legibility, transitions, Brand Sting.

Chromium `element.screenshot()` / page screenshots do not include hardware-decoded `<video>` pixels. Inside the capture surface only, `SceneFrameVideo` paints a software canvas plate from the same mounted `<video>` (`data-preview-runtime-parity-cert-video-plate`). Studio Preview (no capture surface) does not mount that plate. After remount, an emptied `src` is restored from the existing URL so the plate can decode — this does not invent a second Preview renderer.

## Fresh Browser artifact

Production Browser path: `prepareExportRequest` + `exportFootieShortFromManifest` + captured Blob. Not FFmpeg-substituted.

| Field | Value |
| --- | --- |
| File | `.tmp/preview-runtime-parity/prompt6b-browser-1080.webm` |
| Renderer | `browser` |
| Manifest fingerprint | `em:1i8ydpe` |
| Dimensions | 1080×1920 |
| Codec / pix fmt | vp8 / yuv420p |
| Frame rate | 30/1 |
| Duration | 34.300 s |
| Size | 3,570,680 bytes |
| Export remained enabled | yes (`done:3570680`) |

## Fresh Headless artifact

Worker rebuilt earlier in Prompt 6B; bundle hash unchanged. Artifact persisted through the owned-object store.

| Field | Value |
| --- | --- |
| File | `.tmp/preview-runtime-parity/prompt6b-headless-1080.webm` |
| Manifest fingerprint | `em:2aj2se` (Headless output-profile application; same frozen story) |
| Manifest version | 5 |
| Dimensions | 1080×1920 |
| Codec / pix fmt | vp9 / yuv420p |
| Frame rate | 30/1 |
| Duration | 34.300 s (matches Browser) |
| Size | 2,618,821 bytes |
| Job | succeeded; `rendererBuildId` `headless-local-chromium-ffmpeg-11e-phase2g.24e` |
| Decoded frames | 25 / 25 timestamps |

## Brand Sting / end-frame classification

Resolved from canonical bounds, not the Prompt 6 hardcoded 33600 “terminal”.

| Sample | ms | Classification |
| --- | ---: | --- |
| Brand Sting start | 31400 | sting begins |
| Brand Sting midpoint | 32650 | `brand-sting` hold; all three paths mixed lockup |
| Brand Sting late-visible | 33600 | still inside sting (31400–33900) |
| Brand Sting end | 33900 | sting ends |
| Render end | 34300 | end buffer |
| Last decodable 30 fps frame | 34267 | **`terminal-hidden`** — after sting end; require black/neutral |

A post-sting end-buffer frame exists at 30 fps before the render boundary. Browser, Headless, and Preview are black at 34267. They agree.

Nearest-frame decode policy: `round(sampleMs / (1000/30)) * (1000/30)` at 30 fps.

## Corrected 25-sample three-way matrix

Region/color comparison of clean Preview PNG, decoded Browser frame, and decoded Headless frame. Whole-frame pixel identity is not required. Result: **25 / 25 pass**.

| Id | ms | Scene | Expected media | Preview | Browser | Headless |
| --- | ---: | --- | --- | --- | --- | --- |
| first-media | 800 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| second-media | 3800 | three-transition | `parity-video-b` | green-b | green-b | green-b |
| third-media | 7000 | three-transition | `parity-video-c` | blue-c | blue-c | blue-c |
| intra-before | 2700 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| intra-mid | 3250 | three-transition | `parity-video-a` (incoming B) | green-b | green-b | green-b |
| intra-after | 3600 | three-transition | `parity-video-b` | green-b | green-b | green-b |
| inter-mid | 8750 | three-transition | `parity-video-b` | mixed fade | mixed fade | green-b |
| fit-background | 23400 | framing | `parity-video-c-fit-bg` | blue-c | blue-c | blue-c |
| zoomed-fill | 21000 | framing | `parity-video-a-zoom` | red-a | red-a | red-a |
| caption-center-short | 26200 | clock-return | `parity-image-q` | purple-q | purple-q | purple-q |
| caption-long | 1200 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| caption-non-center | 18200 | framing | `parity-image-p-fill` | purple-q | purple-q | purple-q |
| typewriter-early | 500 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| typewriter-mid | 1400 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| typewriter-final | 2400 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-entrance-mid | 510 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-like | 900 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-share | 1600 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-subscribe | 2300 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-confirm | 2500 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-exit-mid | 2790 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| cta-collision | 1200 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| post-title | 200 | three-transition | `parity-video-a` | red-a | red-a | red-a |
| brand-sting-mid | 32650 | clock-return | — | mixed lockup | mixed lockup | mixed lockup |
| terminal-or-last-sting | 34267 | clock-return | — | black | black | black |

Later-scene Preview HUD left scene 0 at 18200 / 21000 / 23400 / 26200. Caption `outputCenterX` on scene 0 remains 540 (within 4 output-space px). CTA outer remains 680×112 with Subscribe wording. Inspection inactive on every sample. Font-metric differences remain acceptable. `fit-background` is sampled at 23400 (400 ms into the fit-bg window) so the sample is not the exclusive start boundary at 23000.

## Caption-drag result

Re-run after the capture-arm change. Capture stays off during drag; armed afterward.

- Method: Puppeteer `mouse.move` / `down` / `move` / `up`
- Followed pointer: **true**
- Committed: **true**
- Frozen story reloaded for encoded paths after drag so Browser and Headless use the persisted pre-drag snapshot

## Optional 720p / 4K limitations

| Check | Status |
| --- | --- |
| Real Browser 1080p | **required and passed** |
| Real Headless 1080p | **required and passed** |
| Browser 720p | **optional / skipped** — not this runner |
| Headless 4K | **skipped** — 31 s at 2160×3840 exceeds the local time/memory budget |

These are not completed. They do not block `ready`.

## Studio Chromium

Google Chrome 151.0.7922.138 against `http://localhost:3000/dev/preview-runtime-parity-qa` on this dirty worktree. No saved draft. `draftTouched: false`. Build marker `staging-preview-runtime-parity:prompt-5:cta-measured-parity`.

## Test summary

| Suite | Result |
| --- | --- |
| Prompt 1–6 Preview runtime-parity suites | pass |
| Certification-story timing | pass |
| Clean Preview capture-surface | pass |
| Deterministic Preview seek | pass |
| Integrated readiness | pass |
| Matched-timestamp matrix | **25 / 25** |
| `test:preview-runtime-parity-desired` | 6/6 |
| Scene-media Preview / playback / video-clip / trim | pass |
| Mixed-media | pass |
| Caption layout / animation / style / workspace | pass |
| Engagement-overlay | pass |
| Intra-scene Preview / export | pass |
| Brand Sting export | pass |
| Export manifest / capability / 1080p / production-bundle | pass |
| Headless render / page-render contract | pass |
| `npx tsc --noEmit --incremental false` | pass |
| ESLint on changed files | 0 errors; 1 hooks warning (`SceneFrameVideo` capture-surface `useLayoutEffect` deps) |
| `git diff --check` | pass |
| `test:export-subtitle-qa` | **fail — clean-staging baseline** |

## Baseline failure classification

### `test:export-subtitle-qa`

- Asserts `/normalizeCaptionMode\(scene\.captionMode\) === "subtitles"/` in unedited `src/features/export/services/video-render.service.ts`.
- Dirty vs `origin/staging` diff on that service: empty.
- Classification: **clean-staging baseline**. Not introduced by Prompt 1–6B. Not weakened or repaired.

### `test:caption-workspace`

Already repaired in Prompt 6 (test-infra path only). Still passes.

## Incidental generated-file cleanup

`next-env.d.ts` matches `origin/staging` and is absent from the feature diff. All Prompt 6B artifacts live under gitignored `.tmp/`. Browser downloads, worker bundles, and screenshots are not tracked.

## Production behavior changed during Prompt 6B

Certification-only, plus two additive Preview hooks that do not alter normal Studio rendering:

1. `PreviewFrame.certificationCaptureMode` (default false) — omits device chrome only when the development harness arms capture.
2. `SceneFrameVideo` — if mounted inside the cert capture surface, paints a software plate from the same `<video>` so screenshots include decoded frames. Also re-assigns `src` when remount left the attribute empty after retirement. Outside that surface, Studio Preview is unchanged.

No production export, Headless worker, caption engine, CTA, transition, or Brand Sting renderer was changed to force a Pass.

## Remaining risks

1. Browser vs Headless manifest fingerprints still differ after Headless profile application (`em:1i8ydpe` vs `em:2aj2se`). Durations match.
2. 4K and 720p structural spot checks were not run.
3. `test:export-subtitle-qa` remains a clean-staging baseline failure.
4. Hardware-accelerated `<video>` still does not appear in Chromium screenshots; certification capture uses the gated software plate.

## Safe for review and commit?

The tree is the closeout commit candidate. Recertification of the fingerprint change is documentation-only. Verdict remains **`ready`**.

Nothing was deployed. No PR was created during certification.
