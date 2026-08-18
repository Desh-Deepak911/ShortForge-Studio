# Current visual feature bundle certification

**Verdict:** `conditionally_ready`

Local production-path Headless succeeded on the rebuilt current bundle with per-media trim, transparent captions, the redesigned CTA, Brand Sting, and a fade. The existing capability handshake already rejects unknown requested capabilities as `UNSUPPORTED_CAPABILITY`. Neon mode issues zero Upstash queue commands on one full create/upload-observe/verify-wake/promote/render-dispatch. This prompt did not authorize a staging Fly rebuild/deploy. Live Fly status was unreadable here; the last documented staging image and the pinned Fly page SHA both differ from this local rebuild.

Nothing was committed, pushed, merged, deployed, or externally reconfigured.

## Merge ancestry

| Item | Value |
| --- | --- |
| Branch | `staging-caption-transparency-video-trim` |
| HEAD | `d86518967f3667e8dcc4904282a90cc37f5ed4cf` |
| Upstream | `origin/staging` |
| Dirty tree | Prompt 1–2–2B uncommitted. Not discarded or reset. |

Clean `origin/staging` already contains these commits (all ancestors of HEAD):

| Commit | Subject |
| --- | --- |
| `5cc0133` | feat(headless): add Neon-backed staging queue |
| `b8bbc6d` | feat: redesign engagement CTA and brand outro |
| `0547032` | fix(export): keep media moving through transitions |
| `211c0f6` | feat(preview): align runtime with canonical export |

Prompt 1–2 dirty files did not recreate those systems. They did not edit CTA, Brand Sting, Neon, or transition production files except the Prompt 1–2 export caption/seek files. Prompt 2B audited packaging and activation.

| Authority | Value |
| --- | --- |
| Manifest versions | v4 `4`, v5 `5` |
| Renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.24e` |
| Advertised capabilities | `engagement-overlays-v1`, `shortforge-brand-sting-v1`, `continuous-intra-scene-transitions-v1`, plus keyframed / blur / voice-mastering |

## Build failure diagnosis

**Command:** `npm run build:headless-worker`

**Error:** `[plugin: reject-blocked-page] Blocked worker import path: ./SpeechStylePanel` at `src/features/speech-style/index.ts:25`

**Exact chain (dirty tree):**

1. Prompt 2 imported `resolveDisplayableVideoSourceTimeMs` from the `@/features/media-playback` barrel in `export-scene-media-renderer.ts` (page IIFE graph).
2. Prompt 2 imported `buildVideoTrimForMedia` from the same barrel in `scene-media-timeline.commands.ts`.
3. `scene-media-timeline/index.ts` already `export *`s `./editor` on clean staging.
4. Worker/page load → media-playback barrel → `media-trim-patch.utils.ts` → `@/features/story/utils` barrel → `voice-settings.utils.ts` → `@/features/speech-style` barrel → `SpeechStylePanel`.

**Clean `origin/staging`:** `export-scene-media-renderer` imported `media-playback.engine` and types only. Commands did not import media-playback. The speech-style barrel already exported the panel, but Headless never reached it.

**Classification:** Prompt 2 regression + Headless boundary violation + barrel export. Not a clean-staging baseline. Not a guard/test defect. Not a stale generated artifact. Not caused by bundling a dev/certification route into the production page IIFE.

The page-import guard was not weakened or deleted.

## SpeechStylePanel import chain and exact fix

Headless now imports domain/runtime authorities directly.

| File | Change |
| --- | --- |
| `src/features/speech-style/index.ts` | Domain-only. No panel export. |
| `src/features/speech-style/ui.ts` | New. Exports `SpeechStylePanel`. |
| `VoiceSettingsCard.tsx`, `ProjectAudioVoiceoverSection.tsx` | Import `@/features/speech-style/ui`. |
| `export-scene-media-renderer.ts` | Imports `resolveDisplayableVideoSourceTimeMs` from `media-playback.utils`. |
| `scene-media-timeline.commands.ts` | Imports `buildVideoTrimForMedia` from `media-trim-patch.utils` and `VideoTrimRequest` from `media-trim.types`. |
| `media-trim-patch.utils.ts` | Imports `getSceneMedia` from `scene.utils`, not the story/utils barrel. |

`npm run build:headless-worker` now passes on the dirty tree. The same import-boundary assertions live in `test:current-visual-feature-bundle`. Clean staging never had this chain.

## Local bundle digest

| Artifact | SHA-256 |
| --- | --- |
| `page-render.iife.js` | `672227cb3a6d5ccfd7fff2907e6ea5c80d3b567d47a6dc4af3f94bcafeaea237` |
| Worker package | `8aa9ec274908c161e3148571137e5de68c670b51772eab5f307c316baa67a225` |
| `BUILD_INFO` | `7e8953ff7887c6dfc58c4964ce1f51787f2b10ecd4c01e42de7d586bf259cc80` |

`test:headless-deployable-worker-packaging-2e2c2` recorded the same page digest.

The rebuilt IIFE contains the current shared draw paths:

- `resolveEngagementOverlayFrame` / `drawEngagementOverlay` / `resolveEngagementOverlayCaptionSafePlacement`
- `resolveBrandStingFrame` / `drawBrandSting`
- `resolveDisplayableVideoSourceTimeMs`
- `resolveCaptionBackgroundAuthority`
- continuous intra-scene timing
- v5 capability IDs `engagement-overlays-v1`, `shortforge-brand-sting-v1`, `continuous-intra-scene-transitions-v1`

It does not contain `SpeechStylePanel`. Generated `dist/headless-worker/` was not committed.

## Deployed build / image comparison

Read-only Fly inspection was attempted. `flyctl status` was not readable in this environment.

| Source | Build / digest |
| --- | --- |
| Current source HEAD | `d865189` + dirty Prompt 1–2–2B |
| Local rebuilt page digest | `672227cb3a6d5ccfd7fff2907e6ea5c80d3b567d47a6dc4af3f94bcafeaea237` |
| Local renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.24e` |
| Last source-pinned Fly page SHA (8F.2) | `424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d` |
| Last documented live staging render (2026-08-17 Neon evidence) | renderer `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime`; image `sha256:b003bf34…` |
| This Headless job’s stored build ID | `headless-local-chromium-ffmpeg-11e-phase2g.24e` |

The local page digest is not among the Fly authority pins. A separately authorized staging rebuild/deploy is still required before claiming the hosted worker matches this local bundle. This prompt did not deploy.

## Capability and manifest trace

Frozen Prompt 2B story (`buildCurrentVisualFeatureBundleStory`):

- Two videos, stable IDs `trim-item-a` / `trim-item-b`
- Item A trim `0–4500` (fade-legal)
- Item B trim `2000–5000` on a 4000ms window (hold last frame)
- Fade 500ms at the A→B boundary
- Transparent captions (`backgroundEnabled: false`)
- Combined Like/Share/Subscribe CTA, bottom-center, medium, scale 1, start 1200ms, duration 3600ms
- Brand Sting enabled, **2500ms**
- Capabilities: `mixedMediaScenesEnabled`, `engagementOverlaysEnabled`, `shortForgeBrandStingEnabled`

Capability-on freeze (`em:c3ex1s`, manifest v5) contains:

| Field | Present |
| --- | --- |
| `engagement-overlays-v1` | yes |
| `shortforge-brand-sting-v1` | yes |
| `continuous-intra-scene-transitions-v1` | yes |
| authored `engagementOverlays` | yes (combined, medium, scale 1, bottom-center, 1200/3600) |
| authored `brandSting` | yes (`shortforge-studio-outro-v1`, 2500ms, start 8000ms) |
| `project.contentDurationMs` | 10500 |
| `project.renderDurationMs` | 10900 |
| `project.endBufferMs` | 400 |

Capability-off freeze of the same authored story omits those capability IDs, `brandSting`, and scene overlays.

## First decisive CTA/outro loss point

**Export request / `buildExportManifest` fail-closes unless `engagementOverlaysEnabled === true` and `shortForgeBrandStingEnabled === true`.**

The Prompt 2 story did not author CTA/sting. Prompt 2 Browser/Headless certs only passed `mixedMediaScenesEnabled: true`. That is why earlier Headless artifacts could succeed without CTA/outro: the features were never requested.

It is not:

1. a missing renderer (current bundle contains the draw paths)
2. a stale local bundle after this rebuild
3. hydration/draw-order for this cert
4. a missing v5 capability advertisement on the current worker
5. a second compatibility system that needs to be added

Unit test `"capability-off freeze omits CTA and Brand Sting — first decisive loss point"` passed.

After authoring the features and passing the enabled flags, the real Headless artifact rendered them.

**Classification of the historical drop:** authored story did not contain the features + capability configuration (flags off). **Current local wiring:** not a production-code defect. **Hosted staging:** unread this session; image/digest skew remains.

## Renderer compatibility

Existing authorities already enforce this. Production capability-preflight was not modified.

- Capable worker: current `HEADLESS_WORKER_PHASE3_SUPPORTED` includes `engagement-overlays-v1` and `shortforge-brand-sting-v1`. This job requested those IDs and succeeded.
- Incapable worker: `capability-preflight.ts` and page bootstrap reject unknown `requiredCapabilities` as `UNSUPPORTED_CAPABILITY`. They do not return success while omitting the feature.
- Safe diagnostics on this job: manifest version `5`, requested IDs, supported IDs, worker build ID `phase2g.24e`, bundle digest `672227cb…`, compatibility result success. No credentials, signed URLs, or creator-private text were recorded.

No second compatibility system was added.

## Neon / Upstash truth

Do not claim “Upstash removed.”

| Mode | Behavior |
| --- | --- |
| `HEADLESS_QUEUE_PROVIDER=neon` | Upload observe → Neon verify wake. Render dispatch → Neon + Fly wake. `shouldConstructUpstashRestProducer(neon) === false`. No Upstash `XADD`/`XTRIM`. |
| `HEADLESS_QUEUE_PROVIDER=upstash` | Existing rollback producer remains constructible. |
| Staging / production | Fail closed without an explicit valid provider. |
| Local development | Documented default remains. |
| Dual enqueue | Same job must never be written to both. Proven by composition test. |

Runtime in Neon mode does not issue Upstash queue commands. Rollback code remains. Production provider was not changed.

This Headless cert job used the in-process memory store (`seedAndCreateReferenceJob` / `processOnce`), not live Neon. Queue classification for the cert: local memory control plane. Neon exclusivity is the automated suite below.

### Provider-exclusive command evidence

`npm run test:headless-neon-provider-exclusive-enqueue` — 4 passed:

- Staging/production fail closed without an explicit provider
- One Neon create/upload-observe/verify-wake/render-dispatch: zero Upstash `XADD`/`XTRIM` and zero `streamQueue.enqueueRender`
- Source-string exclusivity
- Upstash rollback producer still constructible

Existing Neon queue/wake, durable queue, trusted verify, and control-plane suites also passed.

## Browser control artifact

Production path: `prepareExportRequest` + `exportFootieShortFromManifest` + Blob capture. Not an FFmpeg substitute.

The Prompt 2 Browser artifact did not contain CTA/Brand Sting, so a new bounded Browser export was produced.

| Field | Value |
| --- | --- |
| Path | `.tmp/current-visual-feature-bundle/browser-export.webm` (gitignored) |
| Bytes | 1956731 |
| Codec | vp8 |
| Dimensions | 1080×1920 |
| FPS | 30 |
| Pixel format | yuv420p |
| Duration | **10.900s** |

## Headless job evidence

Production Headless path with `HEADLESS_PAGE_BUNDLE_PATH` pointed at the rebuilt `dist/headless-worker/page-render.iife.js`. Not an FFmpeg-created substitute.

| Field | Value |
| --- | --- |
| Job ID | `job_e67e1cc5-8236-4efc-ade6-384e0c09bad5` |
| State | `succeeded` |
| Terminal reason | `null` |
| Last progress | `null` (frozen clock `1700000000000`; store version 9) |
| Frozen story / manifest fingerprint | `em:c3ex1s` (v5) |
| Asset bundle fingerprint | `hab:sha256:d9407a576601f30ff23e114858c0683c0bbc2d3525e865a4a8795317d27f2e86` |
| Worker build ID | `headless-local-chromium-ffmpeg-11e-phase2g.24e` |
| Worker bundle digest | `672227cb3a6d5ccfd7fff2907e6ea5c80d3b567d47a6dc4af3f94bcafeaea237` |
| Queue provider | local in-process memory store (not live Neon/Upstash) |
| Requested capabilities | `engagement-overlays-v1`, `shortforge-brand-sting-v1`, `continuous-intra-scene-transitions-v1` |
| Supported capabilities | those three plus keyframed / blur / voice-mastering |
| Artifact | `.tmp/current-visual-feature-bundle/headless-export.webm` |
| Bytes | 2295631 |
| Content digest | `sha256:dd701587f8257d0d8d365befca49f961d43aa459630ba1f0e04ccf1eb08a7099` |
| Codec | vp9 |
| Dimensions | 1080×1920 |
| FPS | 30 |
| Pixel format | yuv420p |
| Duration | **10.900s** |
| Wall / render | ~164s / ~161s |

If this job had failed, the stage would have been named. It did not fail.

## Decoded timestamp / appearance matrix

Same output timestamps. Classifier uses an off-center 8×8 crop so the white `SOURCE N` label is not mistaken for a section color.

| Sample | Time | Browser | Headless | Expected |
| --- | --- | --- | --- | --- |
| item-a-early | 200ms | `SOURCE 0` | `SOURCE 0` | Item A source 0 |
| cta-entrance | 1280ms | media visible | media visible | CTA entrance window |
| cta-like | 1894ms | media visible | media visible | Like active window |
| cta-share | 2947ms | media visible | media visible | Share active window |
| item-b-start | 4000ms | `SOURCE 2` | `SOURCE 2` | Never source 0 |
| cta-subscribe-confirmation | 4001ms | `SOURCE 2` | `SOURCE 2` | Subscribe confirmation window |
| transition-mid | 4000ms | `SOURCE 2` | `SOURCE 2` | Incoming B moving, not source 0 |
| item-b-mid | 5500ms | `SOURCE 3` | `SOURCE 3` | Mid trimmed B |
| item-b-hold | 7500ms | `SOURCE 4` | `SOURCE 4` | Last valid trimmed frame held |
| brand-sting-entrance | 8200ms | dark navy center | dark navy center | Current ShortForge navy sting |
| brand-sting-hold | 9000ms | dark navy center | dark navy center | Hold |
| brand-sting-exit | 10100ms | dark navy center | dark navy center | Exit still inside 2500ms |
| file duration | — | 10.900s | 10.900s | Canonical render end 10900ms |

All caption-band samples: not opaque black.

| Area | Result |
| --- | --- |
| Item B start | `SOURCE 2`, never zero |
| Item B after trimmed duration | `SOURCE 4` held |
| Caption background | no black fill / border / blur / automatic scrim |
| CTA geometry / wording | equal three columns and `Subscribe` (never `Subscribed`) on the shared `resolveEngagementOverlayFrame` plan; encoded-frame OCR was not used |
| CTA placement | caption-safe translation on the same plan (`translated: true`, Y moved up) |
| CTA animation | entrance / Like / Share / Subscribe-confirmation timestamps encoded; phases from the shared resolver |
| Transition | incoming B is `SOURCE 2` at 4000ms, not a frozen pre-transition A snapshot |
| Brand Sting | navy/neon ShortForge center on entrance, hold, and exit |
| Brand Sting timing | 2500ms once after 8000ms content |
| Terminal | sting not visible at elapsed `2500ms` on the shared resolver; 400ms end buffer is in the file duration. A post-10500 encoded frame was not kept after `.tmp` cleanup. |
| Total duration | 10.900s both artifacts |

Browser vp8 vs Headless vp9 is expected. Geometry, timing, wording authority, feature presence, and selected source frames agree.

## Tests and outcomes

| Command | Outcome |
| --- | --- |
| `npm run test:caption-background-authority` | 28 passed |
| `npm run test:caption-layout` | 19+16+13+17+8 passed |
| `npm run test:export-caption-opacity` | 6 passed |
| `npm run test:per-media-video-trim-parity` | 28 passed |
| `npm run test:video-trim-preview` | 23 passed |
| `npm run test:preview-runtime-parity-selected-inspection` | 33 passed |
| `npm run test:scene-media-item-inspector` | 39 passed |
| `npm run test:mixed-media-scenes` | passed |
| `npm run test:export-manifest` | 9 passed |
| `npm run test:engagement-overlays` | passed (includes caption-safe) |
| `npm run test:brand-sting-export` | passed |
| `npm run test:export-canonical-timing` | passed |
| `npm run test:intra-scene-transition-preview` | 25 passed |
| `npm run test:intra-scene-transition-export` | 28 passed |
| `npm run test:visual-motion-capabilities` | 13 passed |
| `npm run test:headless-page-render-contract` | 4 passed |
| `npm run test:headless-deployable-worker-packaging-2e2c2` | 11 passed |
| `npm run test:headless-real-video-motion-authority` | 8 passed |
| `npm run test:headless-neon-queue-wake-provider` | 7 passed |
| `npm run test:headless-neon-durable-queue` | 17 passed |
| `npm run test:headless-trusted-verify-promotion` | 10 passed |
| `npm run test:headless-control-plane` | 21 passed |
| `npm run test:headless-neon-provider-exclusive-enqueue` | 4 passed |
| `npm run test:current-visual-feature-bundle` | 7 passed |
| `npm run test:current-visual-feature-bundle-cert` | real Browser artifact |
| `npm run test:current-visual-feature-bundle-headless` | real Headless artifact |
| `npx tsc --noEmit --incremental false` | passed (after one shared Window type; cert no longer redeclares `Window`) |
| ESLint on changed Prompt 2B files | no errors |
| `git diff --check` | passed |

No assertion was weakened. `test:export-subtitle-qa` remains a proven clean-staging baseline source-string failure against unedited `video-render.service.ts` and was not used as a gate.

## Remaining deployment requirement

Rebuild and deploy the staging Fly worker from this tree is still required before hosted staging can be claimed to match:

- page digest `672227cb…`
- Prompt 1 caption-background authority
- Prompt 2 per-media displayable seek
- Prompt 2B SpeechStylePanel import-boundary repair

This prompt does not authorize that deploy.

## Exact files changed (Prompt 2B additions)

Production / boundary:

- `src/features/speech-style/index.ts`
- `src/features/speech-style/ui.ts` (new)
- `src/components/VoiceSettingsCard.tsx`
- `src/features/editor/components/ProjectAudioVoiceoverSection.tsx`
- `src/features/export/utils/export-scene-media-renderer.ts`
- `src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts`
- `src/features/media-playback/media-trim-patch.utils.ts`

Frozen story / harness / verification / evidence:

- `src/features/preview/video-trim-preview/build-current-visual-feature-bundle-story.ts`
- `src/features/preview/video-trim-preview/current-visual-feature-bundle-contract.ts`
- `src/app/dev/current-visual-feature-bundle-qa/page.tsx`
- `src/app/dev/current-visual-feature-bundle-qa/CurrentVisualFeatureBundleQaHarness.tsx`
- `src/verification/features/preview/video-trim-preview/currentVisualFeatureBundle.verify.ts`
- `src/verification/features/preview/video-trim-preview/currentVisualFeatureBundle.cert.ts`
- `src/verification/features/preview/video-trim-preview/currentVisualFeatureBundleHeadless.cert.ts`
- `src/verification/headless-renderer/control-plane/headlessNeonProviderExclusiveEnqueue.verify.ts`
- `docs/evidence/preview/current/PER_MEDIA_VIDEO_TRIM_RENDER_PARITY.md`
- `docs/evidence/headless/current/CURRENT_VISUAL_FEATURE_BUNDLE_CERTIFICATION.md`
- `package.json` (test scripts only)

`next-env.d.ts` is dirty and stays out of the feature diff. Generated `dist/headless-worker/` is gitignored.

## Prompt 1–2 work remains intact

- Caption background authority: 28 passed. Frozen stories keep `backgroundEnabled: false`. Encoded caption bands are not opaque black. `draw-prepared-export-frame.ts` and `video-render.service.ts` were not edited.
- Per-media trim: 28 + Preview 23 + selected inspection 33 passed. Item B starts at `SOURCE 2` and holds `SOURCE 4` on Browser and Headless.
- Prompt 2’s default story (item A `0–3000`) was not changed. Prompt 2B uses a separate builder with item A `0–4500` so fade remains legal.

## Confirmation

Nothing was committed, pushed, merged, deployed, or externally reconfigured. Credentials, Upstash, and queue providers were not changed. Prompt 6 was not run. The complete Prompt 1–2–2B tree remains uncommitted on `staging-caption-transparency-video-trim`.
