# Sprint 11A — Headless Renderer Architecture and Authority Audit

**Status:** Ready for final acceptance after evidence-based final review + **11A.1** user-triggered export authority. Documentation only; no headless renderer is production-wired.

**Audit date:** 2026-07-17  
**Final review:** 2026-07-17 (production-code verified; documentation-only corrections)  
**11A.1 product-authority addendum:** 2026-07-17 (user-triggered immediate job **identity** acceptance; refined by 11E Phase 2.1A)  
**11E Phase 2.1A authority correction:** 2026-07-19 (two-stage acceptance + dual-lease recovery; documentation only)  
**11E Phase 2.1B provisional record types:** 2026-07-19 (discriminated provisional/canonical store; documentation only)  
**11E Phase 2A Clerk principal + route auth:** 2026-07-19 (Clerk identity + auth gates; project ownership production adapter still unavailable; create blocked)  
**11E Phase 2B Phase 1 provider-neutral store + ownership foundation:** 2026-07-19 (provisional/canonical union, validators, lifecycle, promotion contract, job-store port + memory adapter, project ownership contract + memory adapter, SQL + CAS spec in `control-plane/migrations/`; Neon runtime adapter not started)  
**Branch:** `feature/sprint-11-headless-renderer` (from frozen `staging` at `58bf269`; `HEAD` == `staging` == `main` == `58bf269`)  
**Frozen inputs:** ExportManifest v3 / renderer contract `"9C"`, v2 / `"8D"` compatibility, MasterTimeline, Preview, captions, audio, scene media, transitions, Hook Engine, and Retention Story Intelligence.

## 1. Decision summary

Sprint 11 adds an execution target, not a second storytelling, timing, or export-semantics authority.

```text
HEADLESS EXPORT TRIGGER: USER ACTION — NOT CRON
REQUEST MODEL: SYNCHRONOUS JOB IDENTITY ACCEPTANCE + ASYNCHRONOUS VERIFY/EXECUTE

Creator clicks Export
    → authenticate + freeze snapshot identity
    → reserve stable jobId + persist HeadlessProvisionalStoredJobRecord (Stage A; no HeadlessRenderJobV1)
    → return jobId immediately
    → upload + trusted full-object verify (async)
    → atomic same-jobId promotion to HeadlessCanonicalStoredJobRecord (Stage B) → queue render
    → authenticated control plane (Next.js / Vercel) + isolated worker
    → render / encode / validate / upload durable artifact
    → notify / show download
```
<!-- Phase 2.1A: “synchronous creation” = durable job identity, not sync verify or immediate render enqueue. -->

```text
StoryDocument → prepareExportRequest → frozen ExportManifest v3 / "9C"
    → HeadlessRenderJob (manifest + immutable asset bindings + output + idempotency)
    → authenticated control plane (Next.js / Vercel)
    → isolated worker (deterministic Chromium frames + native FFmpeg)
    → validated durable artifact
```

Vercel is the control plane, not the assumed render-compute host. A worker provider is deliberately not selected in 11A. Local/self-hosted and external workers must satisfy the same job contract.

### 1A. User-triggered export authority (11A.1)

Headless exports are **user-triggered**. Clicking Export is the normal start of the headless path. From the creator’s perspective the click returns a **stable jobId immediately** (Stage A provisional materialization). Upload/full-object verify and canonical request promotion (Stage B) may continue asynchronously; render enqueue happens only after Stage B. Encoding never blocks the Export HTTP response. See [HEADLESS_11E_PHASE2_PROVIDER_DECISION.md](HEADLESS_11E_PHASE2_PROVIDER_DECISION.md) §8.6.

| Rule | Authority |
|---|---|
| Trigger | Creator Export action only — **not** cron, scheduler, or batch as the normal Export path |
| On Export click | Authenticate → freeze snapshot identity → reserve stable `jobId` + persist materializing authority → return `jobId` → async upload/verify → Stage B canonical promotion → queue render |
| HTTP model | Synchronous job **identity acceptance** (Stage A); asynchronous **verify + Stage B promotion + execution**. Do **not** keep one HTTP request open for verify or render |
| Queue delay | Render worker may wait under load; **jobId acceptance** still happens immediately; render queue insertion waits for Stage B |
| Client survival | Render continues after page refresh, tab closure, and temporary client disconnection |
| Creator controls | See status/progress; cancel an active job; retry an eligible failure; download a validated completed artifact |
| Editing after Export | Does **not** mutate the active job or its frozen manifest |
| “Export updated video” | Creates a **fresh** manifest and a **new** render job |
| Progress | Advisory only; terminal state plus validated artifact remains authority |
| Cron / scheduled maintenance | May only clean expired assets/artifacts, detect abandoned jobs, and perform bounded recovery — **never** act as the normal Export trigger |

This is an **11A architecture decision** and an **11E product acceptance requirement**.

## 2. Evidence inspected

Architecture: `MASTER_ARCHITECTURE.md`, `ROADMAP.md`, `docs/architecture/EXPORT_CONTRACT.md`, `docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md`, `docs/operations/ENV_AND_FEATURE_FLAGS.md`, and the Sprint 8–10 freeze ledgers.

Production: export manifest build/fingerprint/validation/preflight/selection, `prepareExportRequest`, `ExportRenderContext`, chunked frame rendering, browser media cache, FFmpeg.wasm, `video-render.service.ts`, and `/api/assets/materialize`.

Framework/deployment: repository-bundled Next.js **16.2.9** docs under `node_modules/next/dist/docs/` — especially App Router [Route Handlers](../node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md), [`runtime` segment config](../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md) (`nodejs` | `edge`), and [Deploying](../node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md) — plus official Vercel [Function limits](https://vercel.com/docs/functions/limitations), [maximum duration](https://vercel.com/docs/functions/configuring-functions/duration), [memory/CPU](https://vercel.com/docs/functions/configuring-functions/memory), and [Blob upload guidance](https://vercel.com/docs/vercel-blob/server-upload).

## 3. Current production truth

| Boundary | Current behavior | Audit finding |
|---|---|---|
| Semantic snapshot | `buildExportManifest()` emits v3 / `"9C"`; v2 / `"8D"` remains valid | Frozen; do not create new story/timing semantics |
| Renderer selection | Type permits `browser | server | blocked` | `server` is reserved, not shipped |
| Server availability | Environment defaults it to `false` | No source proves worker availability |
| Preparation | `prepareExportRequest()` throws unless renderer is `browser` | Portable preparation and browser policy must separate |
| Render entry | Production rejects non-browser selection | No job dispatch API exists |
| Runtime | DOM canvas, HTML media, FFmpeg.wasm, Blob URLs | Not a Node-worker context |
| Media/audio | Manifest stores raw source strings | `blob:`/`data:` sources are not remotely portable |
| Fingerprint | Includes browser capability state | Execution capability and semantics are coupled |
| Success | Requires artifact validation | Preserve and strengthen remotely |
| UI | Server-required becomes blocked | No job/progress/cancel/retry/download UX |

There is no declared production dependency for headless Chromium, native FFmpeg, durable jobs, or object storage.

## 4. Frozen authority boundaries

| Authority | Headless rule |
|---|---|
| Project/scene time | Render exact frozen manifest milliseconds and half-open windows |
| Media order/windows | Resolve frozen item IDs/windows; never read editable StoryDocument |
| Intra-scene transitions | Use v3 frozen boundaries; v2 remains hard-cut |
| Scene transitions | Preserve their existing priority over intra-scene overlays |
| Framing/motion | Use shared math; no worker-specific semantic defaults |
| Captions | Preserve timing/style/layout/animation with parity evidence |
| Audio | Preserve gains, ducking, fades, loop, peak protection, and muted-source policy |
| Output | No silent format/resolution/fps/audio downgrade |
| Branding | Render exactly as frozen |
| Success | Only after binary validation and durable upload |

The browser renderer remains production authority until headless parity and operational sign-off pass.

## 5. Gaps that block implementation

### Asset portability and trust

A remote worker cannot dereference browser object URLs. It also must not fetch arbitrary manifest URLs (SSRF/ownership risk). Before job acceptance, every non-placeholder source must map exactly once to an owned materialized asset with a stable asset ID, source-binding identity, content digest, byte length, MIME, media kind, durable locator/capability, and expiry.

**Exact source coverage (production fields today):**

| Manifest location | Binding required? |
|---|---|
| `scenes[*].mediaTimeline.items[*].media.source` when type is `image` or `video` | **Yes** |
| `scenes[*].media.source` first-item compatibility field (same bytes as first timeline item when present) | Covered by the timeline-item binding; must not introduce a second fetch identity |
| `audio.voiceover.source` when non-null | **Yes** |
| `audio.music.source` when non-null | **Yes** |
| `type: "placeholder"` media | **No** asset bytes (render local placeholder) |
| `branding` | Text watermark only — **no** media source |

**Source-binding identity** = stable tuple of `{ role, sceneId?, mediaItemId?, audioRole? }` plus the exact original manifest source string used for coverage matching. Coverage is total: every required source above maps to exactly one binding; unknown/extra bindings fail closed.

**Existing `/api/assets/materialize` is not the headless binder.** Production evidence: it accepts client-supplied `previewUrl` / `fullResolutionUrl`, server-fetches them, and returns a `data:` playable URL (`strategy: "data_url"`). It has no durable object-storage binding, no content-digest job contract, and is not an allowlisted worker fetch surface. Headless materialization must be a new owned-upload + binding path (11C). Reusing unrestricted server-side fetch of manifest URLs would recreate SSRF risk.

The worker fetches validated bindings only. Large media uses signed direct/client multipart upload rather than binary Route Handler bodies (Vercel server-upload bodies remain ~4.5 MB).

### Semantic identity versus execution capability

Manifest v3 fingerprints browser capability fields (`browserRendererAvailable`, canvas/MediaRecorder/WASM flags, `serverRendererAvailable`, `ffmpegRuntimePoisoned`). Preserve v2/v3 compatibility; do not mutate a frozen manifest to claim a server exists. Browser capability state must never become headless worker authority. Worker availability, queue/runtime codecs, and renderer build belong to a separate job/control-plane identity.

### Runtime portability

The browser-only `ExportRenderContext` must remain honest (`createExportRenderContext` requires `document`):

```text
shared manifest/timing/draw plan
    ├── BrowserExportRenderContext (existing)
    └── HeadlessExportRenderContext (new, worker-owned)
```

Only deterministic planning/draw semantics are shared. DOM handles, worker filesystem paths, Chromium pages, native processes, temporary files, and upload clients stay runtime-local.

### Asynchronous lifecycle

Rendering must not rely on one HTTP request remaining open. Next.js Route Handlers are request/response control-plane endpoints, not long-lived render compute.

```text
created → materializing → queued → rendering → encoding → validating → uploading → succeeded
                                                          └──────────────→ failed
non-terminal (created…uploading) ───────────────────────────────────────→ cancelled
terminal artifact after retention ─────────────────────────────────────→ expired
```

**Terminal uniqueness:** exactly one of `succeeded` | `failed` | `cancelled` | `expired` per job. Terminal states are immutable.

**Cancellation:** owner-authenticated cancel is accepted from any non-terminal state. Best-effort worker abort; cancel never yields an artifact. Cancel after bytes are partially uploaded must not expose a downloadable artifact.

**Retry / idempotency:**

- Same owner + idempotency key + identical job fingerprint → return the existing job (no duplicate work).
- Retry after `failed` / `cancelled` creates a **new attempt** (or new job under a new idempotency key) that cannot rewrite prior terminal evidence or prior artifact digests.
- `succeeded` jobs are not retried in place; a new export is a new job.

### Security/privacy

- Authenticate create/read/cancel/download; bind job/assets to owner/project (server-derived; client cannot assert ownership).
- Use short-lived signed capabilities for upload/download/worker fetch; never serialize storage/worker secrets into manifests, jobs, or client diagnostics.
- Bound count/bytes/MIME/duration/dimensions and verify digests before queue and again before success.
- Reject unknown fields/versions and incomplete source coverage.
- Scrub signed URLs, local paths, manifest content, captions, and audio locations from creator diagnostics.
- Clean worker temp files on success, failure, and cancel; expire inputs/artifacts by retention policy (`expired` is terminal after retention).

## 5A. Authority decision register (final)

| Decision | Authority |
|---|---|
| Asset binding identity + exact source coverage | §5 table; total coverage before queue; placeholders unbound; branding text-only |
| SSRF prevention | Workers fetch only validated bindings; no arbitrary manifest URL fetch; do not reuse `/api/assets/materialize` as binder |
| Ownership / authentication | Control-plane Route Handlers; server-derived owner/project; auth on create/read/cancel/download |
| Signed URL expiry | Short-lived upload, worker-fetch, and download capabilities; refresh via authenticated control plane only |
| Upload size / body limits | Direct-to-storage / multipart for large media; do not rely on Route Handler binary bodies beyond platform limits (~4.5 MB) |
| Job lifecycle + terminal uniqueness | §5 state machine; one immutable terminal outcome |
| Cancellation + retry | Cancel any non-terminal; retry cannot rewrite prior terminal/artifact evidence; idempotency key coalesces identical creates |
| Renderer build identity | `rendererBuildId` separate from manifest fingerprint |
| Fingerprint hierarchy | `manifestFingerprint` ⊂ `assetBundleFingerprint` ⊂ `renderJobFingerprint` + `rendererBuildId` → `artifactDigest` |
| Safe diagnostics | No secrets, signed URLs, local paths, or full manifest/caption/audio payload leakage |
| Temporary-file cleanup | Mandatory on success/failure/cancel |
| Artifact retention | Policy expiry → terminal `expired`; download requires fresh signed capability |
| Browser fallback | Explicit user/path choice only; never silent on headless failure; no silent output downgrade |
| Staging vs production isolation | Separate worker deployables, queues, storage prefixes/buckets, and signing keys; independently controllable |
| v2 / `"8D"` compatibility | Remain frozen-valid; headless must accept validated v2 (hard-cut) and v3 (`"9C"`) manifests without upgrading v2 in place |
| Export trigger | **User action only** — never cron/scheduler as normal Export (§1A / 11A.1) |
| Request model | Synchronous job creation + asynchronous execution; no long-lived render HTTP request (§1A) |
| Snapshot immutability after Export | Active job bound to frozen manifest; editor edits do not mutate it; “Export updated video” → new job (§1A) |
| Client disconnection | Job continues server-side; creator reconnects via job ID for status/cancel/retry/download (§1A; 11E) |

## 6. Deployment decision for Vercel Hobby

Official Vercel documentation currently lists Hobby Functions at 2 GB / 1 vCPU and, with Fluid Compute enabled, up to 300 seconds. Function bundle limits remain, and server-upload request bodies are limited to 4.5 MB.

Repository-bundled Next.js 16.2.9 docs confirm Route Handlers are Web Request/Response endpoints with selectable `nodejs` | `edge` runtimes — suitable for authenticated control-plane APIs, not assumed Chromium/FFmpeg hosts. Deploying docs allow Node.js server, Docker, static export, or adapters; none of those imply Vercel Functions are the render worker.

Those ceilings do not prove deterministic Chromium + native FFmpeg is reliable or economical. Therefore:

1. Next.js Route Handlers authenticate/validate/create/query/cancel jobs.
2. Media uploads directly to durable object storage.
3. CPU-heavy work runs in an isolated versioned worker.
4. No Vercel upgrade is required for 11A.
5. Later benchmarks may qualify a narrow Vercel adapter, but cannot weaken the provider-neutral contract.

**Staging versus production:** app deployment and render-worker deployment remain independently controllable. Staging and production must not share worker queues, artifact/input storage prefixes (or buckets), or signing keys.

## 7. Renderer decision

| Option | Strength | Risk | Decision |
|---|---|---|---|
| Current browser export inside headless Chromium | Apparent reuse | Keeps FFmpeg.wasm/download coupling and interactive probes | Reject as final architecture |
| Pure Node/canvas | Native runtime | Reimplements typography/video/canvas semantics | Defer |
| Chromium composition + native FFmpeg | Reuses Canvas/media behavior; native encode/mux | Needs private deterministic harness and strict seeking | **Recommended** |

The worker drives explicit global frame timestamps, never wall-clock Preview playback. Shared manifest resolvers determine scene/media/transition/caption state. Chromium owns pixels; native FFmpeg owns bounded encode, audio filters/mux, probes, and container validation.

## 8. Proposed contracts (not implemented)

### HeadlessRenderJobRequest v1

Exact manifest/fingerprint, asset-bundle ID/fingerprint, renderer profile, idempotency key, and server-derived ownership.

### HeadlessAssetBundle v1

Exact source coverage, immutable descriptors, content digests, deterministic bundle fingerprint, and no public credentials/unrestricted fetch URLs.

### HeadlessRenderJob v1

Opaque ID, contract/build versions, state/attempt/safe progress, semantic fingerprints, timestamps, safe terminal reason/retryability, and artifact only on `succeeded`.

### HeadlessRenderArtifact v1

Artifact ID/digest/bytes/MIME/format/dimensions/fps, probed duration/audio/video facts, separately issued signed download, and expiry.

```text
manifestFingerprint      frozen ExportManifest identity (historical FNV; unchanged)
manifestPayloadDigest    SHA-256 of exact validated manifest payload (Headless)
assetBundleFingerprint   hab:sha256:… exact bytes bound to manifest sources
requestFingerprint       hrr:sha256:… binds payload digest + frozen fingerprint + profile
renderJobFingerprint     hrj:sha256:… binds request fingerprint + attempt + build
rendererBuildId          executable code/Chromium/FFmpeg identity
artifactDigest           actual terminal bytes (content) + hra:sha256: metadata
```

No lower identity substitutes for a higher one. ExportManifest fingerprints remain frozen FNV; Headless authority identities are SHA-256 only.

### Sprint 11B domain foundation (implemented)

Pure provider-neutral contracts live in `src/features/headless-renderer/domain/` (not production-wired):

| Contract | Status |
|---|---|
| `HeadlessAssetDescriptorV1` / `HeadlessAssetBundleV1` | Implemented + verified |
| `HeadlessRenderJobRequestV1` | Implemented + verified |
| `HeadlessRenderJobV1` + legal transitions | Implemented + verified |
| `HeadlessRenderArtifactV1` | Implemented + verified |
| Exact source coverage + fingerprints + deep-freeze | Implemented + verified |

### Sprint 11B.1 — Contract identity + terminal authority hardening

Hardens the 11B foundation before control-plane wiring (11C). Verify: `npm run test:headless-render-contract`.

| Hardening | Behavior |
|---|---|
| Cryptographic identities | `hsrc` / `hab` / `hrr` / `hrj` / `hra` / `hid` — each `*:sha256:<64 lowercase hex>` |
| Exact manifest binding | Request authority includes frozen `manifestFingerprint` **and** recomputed `manifestPayloadDigest` |
| Idempotency | Structured SHA-256 (`hid:sha256:…`); no delimiter concatenation |
| Canonical encode | Path-stack cycle detection; shared DAG ≡ copied graph; functions/symbols/bigints rejected |
| Request / job / artifact coherence | Total recompute boundaries; nested exact fields; fail-closed artifact audio/video |
| Lifecycle | Success path `… → validating → uploading → succeeded` (no `validating → succeeded`) |
| Public builders | Result-returning validators; no fingerprint-only / `approved` bypass |
| Detachment | Validators return detached deeply frozen graphs; caller input stays mutable |
| Expiry | Finite non-negative safe integer; **excluded from content identity** (mutable retention policy); cannot grant ownership/fetch; future expiry checked at control-plane acceptance (11C) |

### Sprint 11B.1A — Canonical request chain authority

Every public job/artifact/lifecycle authority path begins from a **runtime-validated** `HeadlessRenderJobRequest`. TypeScript structural typing never establishes authority.

| Hardening | Behavior |
|---|---|
| Request reassertion | `validateHeadlessRenderJobCoherence(jobValue, requestValue)` validates the request first and uses only the detached canonical result |
| Accepted job | `createAcceptedHeadlessRenderJob({ requestValue })` revalidates; casts cannot bypass |
| Transitions | `applyHeadlessJobTransition` **requires** `requestValue` for every mutation (not only `succeeded`) |
| Artifact chain | Public full-chain validates request → job → artifact intrinsically → field match (no recursive loop) |
| Public API classes | `HEADLESS_PUBLIC_API_CLASSIFICATION` — validator / validated_builder / fingerprint_utility / pure_utility |
| SHA-256 length | Complete 64-bit big-endian bit-length; parity with Node `createHash("sha256")` including 1e6 `"a"` |

### Sprint 11C — Owned materialization + control plane

Provider-neutral control plane in `src/features/headless-renderer/control-plane/`. Verify: `npm run test:headless-control-plane`.

| Seam | Status |
|---|---|
| Compact job transport | Implemented — owned manifest/bundle object refs + digests; no media/`data:` bodies |
| Storage / principal / job-store / queue ports | Implemented — injected; memory adapters for QA only |
| Production auth | **Clerk when configured (2A)** — `UnavailableHeadlessPrincipalAdapter` when unconfigured |
| Durable storage/DB/queue | **Neon adapters IMPLEMENTED / CONFIGURATION-GATED (2B.2–2B.2B)** — Pool/Client interactive transactions; migrate runner + ledger; gated live harness **NOT RUN** remotely. **R2 foundation 2C.1 IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED**. Queue **not started**. Production routes still blocked. |
| Fake worker | Implemented — deterministic lifecycle; QA metadata artifact only; no Chromium/FFmpeg |
| Routes | Present + **configuration-blocked** (`POST/GET …/jobs`, `…/cancel`) |
| `/api/assets/materialize` | Explicitly **not** headless binder authority |

**Production blockers (honest):** Neon/R2/Upstash staging-accepted as provider evidence, but product create remains configuration-blocked until full composition; hosted worker foundation exists (2E.1) with composition seams + Fly deploy NOT STARTED. Browser renderer remains production export authority. Exact manifest/source-binding authority is not weakened.

### Sprint 11E Phase 2B Phase 1 — Provider-neutral store + ownership foundation

Provider-neutral control-plane foundation in `src/features/headless-renderer/control-plane/`. Verify: `npm run test:headless-control-plane` (and SQL schema verification where present).

| Seam | Status |
|---|---|
| Discriminated stored-record union | **Implemented** — `HeadlessProvisionalStoredJobRecord` \| `HeadlessCanonicalStoredJobRecord` |
| Provisional/canonical validators + lifecycle | **Implemented** — total validators; provisional terminal states; no trusted `hrr`/`hab` at Stage A |
| Stage B promotion contract | **Implemented** — atomic same-`jobId` promotion in memory adapter + CAS spec |
| `HeadlessJobStorePort` evolution | **Implemented** — CAS / idempotency / claim / promotion surface |
| Memory job-store adapter | **Implemented** — test/QA only |
| `HeadlessProjectAuthorizationPort` + first-claim contract | **Implemented** — memory adapter; production `UnavailableHeadlessProjectAuthorizationAdapter` until **2B.2** |
| Neon-compatible SQL schema | **Implemented (spec only)** — `control-plane/migrations/001_headless_project_ownership.sql`, `002_headless_jobs.sql` |
| CAS transaction spec | **Implemented (spec only)** — `control-plane/migrations/003_headless_cas_transaction_spec.md` |
| Neon runtime adapter | **NOT STARTED** — Phase **2B.2** (interactive Pool/Client transactions) |
| R2 foundation (2C.1) | **IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED** |
| Upstash | **STAGING-ACCEPTED** (official 22/22 PASS) |
| Fly hosted worker | **2E.1 LOCAL FOUNDATION** — deploy NOT STARTED; composition seams remain |
| Production routes | **CONFIGURATION-BLOCKED** — no `.env.local` changes; no `DATABASE_URL` consumption |

### Sprint 11C.1 — Owned asset + control-plane authority hardening

Closes 11C gaps before 11D. Verify: `npm run test:headless-control-plane`.

| Hardening | Behavior |
|---|---|
| Owned asset-byte verify | Every descriptor checked against finalized `asset_bytes` objects before accept/persist/queue |
| Future lease | `HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS` = **1 hour**; never silently extended |
| UTF-8 transport ceiling | `TextEncoder` byte length vs `HEADLESS_JOB_REQUEST_MAX_BYTES` (32 KiB) |
| Storage adapter | Structured locator keys; byte copies on write/open; verify actual digests |
| Job-store CAS | Coherence + identity preservation + legal transitions; detached frozen records |
| Queue failure (superseded by 11C.1A) | Was: durable job may remain `materializing` — **fixed in 11C.1A** |
| Test-only surface | Seeding / memory adapters / fake worker via `control-plane/testing` only |

### Sprint 11C.1A — Dispatch + production isolation coherence

Closes remaining queue-delivery, recovery, production-import, and finalized-object gaps. Verify: `npm run test:headless-control-plane`.

| Hardening | Behavior |
|---|---|
| Dispatch order | `created → materializing → queued` persisted, then enqueue |
| Stable delivery id | `dlv:${jobId}:${attempt}` — reused on recovery; duplicates harmless |
| Enqueue failure | `queued → failed` with `QUEUE_ENQUEUE_FAILED`, `retryable:true`; stale CAS preserves worker claim |
| Recovery | Explicit `recoverDispatch` — new attempt after enqueue failure, or re-authorize queued delivery |
| Production compose | `runtime/compose-production-control-plane.ts` — no memory/QA imports or inert QA construction |
| Test compose | `testing/compose-test-control-plane.ts` owns memory adapters + fake worker |
| Finalized drift | Fail closed with `OBJECT_INTEGRITY_FAILED` — never rewrite metadata to match corrupted bytes |
| Expiry coherence | `descriptor.expiresAtMs` must equal finalized `metadata.expiresAtMs` exactly; safe-integer + lease overflow checks |

Production routes remain **CONFIGURATION-BLOCKED**. No Chromium/FFmpeg. No env/flag activation. Normal Export never depends on cron.

ExportManifest types/validators/fingerprints are **unchanged**. No Chromium, native FFmpeg, product UI, or env/feature-flag activation.

## 9. Failure/fallback policy

- Invalid manifest, asset mismatch, unsupported output, unsafe size, and missing capability fail before queueing.
- Worker failure never returns a successful artifact.
- Browser export remains an explicit choice; headless failure never silently starts it or changes output.
- Progress is advisory; terminal state plus validated artifact is authority.
- Cron/scheduled maintenance must not invent Export jobs; abandoned-job detection and bounded recovery only.

## 10. Delivery sequence

| Phase | Scope | Exit condition |
|---|---|---|
| **11A** | Architecture/authority audit | Frozen boundaries and provider-neutral decision accepted |
| **11A.1** | User-triggered export authority | Immediate job creation + async execution + cron boundary recorded (docs) |
| **11B** | Job/asset/status/artifact contracts | Foundation implemented — superseded for acceptance by **11B.1** |
| **11B.1** | Identity + terminal authority hardening | Implemented — acceptance gated on **11B.1A** |
| **11B.1A** | Canonical request chain authority | Accepted — runtime request reassertion on every job/artifact/lifecycle path |
| **11C** | Materialization/upload + authenticated control plane + fake worker | Implemented — acceptance gated on **11C.1** |
| **11C.1** | Owned asset + control-plane authority hardening | Accepted foundation for 11C.1A |
| **11C.1A** | Dispatch + production isolation coherence | Accepted foundation for 11D |
| **11D** | Local isolated Chromium + native FFmpeg | **Phase 3.2 ready for review** — PNG image2pipe streaming; 60s operational contract at 720p/1080p/4K |
| **11E** | Product dispatch + provider decision + later staging worker | Phase 1A dispatch + Phase 2/2.1/2.1A/2.1B provider authority + **2B Phase 1** provider-neutral store/ownership foundation (discriminated provisional/canonical store, dual-lease recovery spec, full-object verify spec, Clerk≠project ownership); Browser path unchanged; **Export → provisional jobId → verify → canonical promote → queue**; no long-lived render HTTP on Vercel; Neon adapter **2B.2**; R2/queue/worker not started |
| **11F** | Parity/load/cancel/security/staging artifact Golden QA | Deterministic + staging live + local/manual evidence; long-form 4K / hosted workers remain later |

**Resolution scope:** Phase 3 unlocks real vertical **720×1280 / 1080×1920 / 2160×3840** with WebM (VP9/Opus) and MP4 (H.264/AAC) via an immutable output-profile registry. Phase 3.2 replaces PNG-on-disk sequences with **PNG image2pipe** streaming; initial operational contract is **60s content / 60.4s render / 1812 frames** at all resolutions (profile policy, not a pipeline hard-code). See [HEADLESS_11D_PHASE3_2_STREAMING_4K.md](HEADLESS_11D_PHASE3_2_STREAMING_4K.md).

## 11. Environment impact

11A–11C.1A add/change/remove **no** named production environment variables or feature flags. `.env.local` action: **none**. Restart: **no**. Production behavior: **unchanged** for export (browser renderer remains authority). Headless routes exist but are **configuration-blocked**.

**11E Phase 2 / 2.1 / 2.1A / 2.1B:** providers and authority are selected in documentation — see [HEADLESS_11E_PHASE2_PROVIDER_DECISION.md](HEADLESS_11E_PHASE2_PROVIDER_DECISION.md). Phase **2.1A** freezes two-stage acceptance + dual-lease recovery (unchanged by 2.1B). Phase **2.1B** freezes the discriminated store: Stage A is `HeadlessProvisionalStoredJobRecord` (no `HeadlessRenderJobV1` / no trusted `hrr`/`hab` fingerprints); Stage B atomically replaces with `HeadlessCanonicalStoredJobRecord` under the same `jobId`. Exact env names are proposed but **not wired**. Secrets may not use `NEXT_PUBLIC_*`. **Phase 2A / 2A.1 implemented:** Clerk `HeadlessAuthenticatedPrincipal` + fail-closed env classification + proxy containment + `AUTHENTICATION_FAILED` taxonomy + Clerk snapshot validator. **Phase 2B Phase 1 implemented (provider-neutral foundation only):** provisional/canonical union + validators + lifecycle + promotion contract + evolved job-store port + memory adapter; project ownership claim/access contract + memory adapter; Neon-compatible SQL + CAS spec in `src/features/headless-renderer/control-plane/migrations/`. **Neon runtime adapter NOT STARTED (2B.2).** No Neon SDK; no `DATABASE_URL`; no `.env.local` changes. `HeadlessProjectAuthorizationPort` production adapter remains unavailable until Neon **2B.2**. Create stays configuration-blocked. Sign-in UI deferred.

## 12. Acceptance questions

1. Keep v3 / `"9C"` frozen and add a separate job/asset contract.
2. Use Vercel as control plane, not assumed render compute.
3. Require durable materialization for browser-local assets.
4. Adopt deterministic Chromium composition + native FFmpeg.
5. Ship 720p parity first, qualify 1080p before freeze, and capability-gate 4K/long-form.
6. Keep browser export unchanged until honest headless freeze evidence.
7. Treat headless Export as **user-triggered**: immediate jobId acceptance (Stage A) + asynchronous verify/promote/execute; cron never starts normal Export (11A.1 / 11E / 2.1A).

## 12A. 11E product acceptance requirements (from 11A.1)

When 11E ships product dispatch UX, it must demonstrate:

1. Creator clicks Export → authenticate + reserve stable jobId on a provisional store record (Stage A; no HeadlessRenderJobV1) → return jobId → async upload/verify → Stage B atomic same-jobId canonical promotion → queue render — without waiting for encode completion.
2. No long-lived HTTP request held open for the full render.
3. Status/progress visible; cancel active job; retry eligible failure; download validated artifact.
4. Job survives refresh, tab close, and temporary client disconnection.
5. Edits after Export do not mutate the active job; “Export updated video” creates a fresh manifest + new job.
6. Cron/maintenance never acts as the normal Export trigger.

## 13. Final-review notes (documentation only)

Corrected during final review against production code:

- Made exact source-coverage and source-binding identity explicit for media timeline, voiceover, music, placeholders, and branding.
- Recorded that `/api/assets/materialize` is attach-path materialization to `data:` URLs — not the headless owned-binding path.
- Tightened cancel/retry/idempotency and terminal uniqueness.
- Strengthened staging/production worker isolation (queues, storage, signing keys).
- Clarified v2/`"8D"` + v3/`"9C"` headless acceptance without in-place v2 upgrade.
- Anchored control-plane guidance to bundled Next.js 16.2.9 Route Handler / runtime / deploying docs.
- Clarified 720p-first / 1080p-before-freeze / 4K+long-form capability-gated scope in the delivery sequence.

**11A.1 addendum:** recorded user-triggered Export authority, synchronous job creation + asynchronous execution, cron boundary, snapshot/editing rules, client-disconnect survival, and 11E acceptance requirements.

Stale historical freeze lines that still say `SPRINT 11 HEADLESS RENDERER: READY TO BEGIN` (for example in `docs/qa/retention-story-sprint-10-freeze.md` and the Sprint 10 ledger block in `MASTER_ARCHITECTURE.md` §12) are preserved as freeze-time evidence and are superseded by this 11A audit for current authority. The current-status summary in `MASTER_ARCHITECTURE.md` §2 was corrected from a stale Sprint 10 “IN PROGRESS” / Sprint 11 “READY TO BEGIN” block, and the §12 Sprint 10 heading was corrected from a stale “in progress” label to frozen 10H.5C.

## 14. Verdict

### Sprint 11D Phase 3.1B — Worker limit precedence (+ 3.1A duration/RSS)

Provider-neutral local worker under `src/features/headless-renderer/worker/`:

- System Chrome via `puppeteer-core` (no browser download)
- Native `ffmpeg`/`ffprobe` spawn (`shell:false`)
- Recursively deep-frozen output-profile registry (`720p|1080p|4k` × `webm|mp4` @ 30fps)
- `HeadlessRenderTarget` is sole headless pixel/codec/quota authority; ExportManifest stays frozen 720p/1080p
- Explicit **content vs render** duration ceilings (60,000 / 60,400 for 720p·1080p·4K; Phase 3.2 streaming)
- PNG **image2pipe** encode — duration-independent frame storage; legacy PNG sequence is test/reference-only
- **Worker limits:** `effective = min(profile, provider)` for profile-bounded resources; provider-owned timeouts/claim/grace untouched; insufficient provider capacity → `UNSUPPORTED_CAPABILITY` before Chromium
- Accepted end buffer bound = frozen timeline 400ms; forged oversized buffers fail closed
- 4K compatibility: valid 1080p manifest + canonical `4k` headless profile; only pixels elevate
- WebM: VP9 + Opus (when audio); MP4: H.264 + AAC (when audio); silent = no audio stream
- `nodeCoordinatorPeakRssBytes` = Node process RSS only (excludes Chrome/FFmpeg); total worker memory is a hosted-provider seam
- Phase 2.1 audio plan/filter authority reused across formats
- Production routes remain **CONFIGURATION-BLOCKED**; no product UI; browser export remains authority

Verify: `test:headless-worker-streaming` · `test:headless-worker-streaming-evidence` · `test:headless-worker-limit-authority` · `test:headless-worker-duration-authority` · `test:headless-worker-output-profiles` · `test:headless-worker-resource-evidence` · `test:headless-worker-mp4` · `test:headless-worker-resolution-ladder` · `test:headless-worker-audio` · `test:headless-worker-local`

```text
SPRINT 11D PHASE 3.2 STREAMED 4K: READY FOR REVIEW
SPRINT 11E PHASE 2B PHASE 1 STORE + OWNERSHIP FOUNDATION: ACCEPTED FOUNDATION
FRAME STORAGE: DURATION-INDEPENDENT / BOUNDED
60S OPERATIONAL CONTRACT: 720P + 1080P + 4K
EXPORTMANIFEST V2/"8D" + V3/"9C": FROZEN / UNCHANGED
HEADLESS RENDERER: NOT PRODUCTION-ACTIVE
NEON RUNTIME ADAPTER: NOT STARTED (PHASE 2B.2)
R2 FOUNDATION (2C.1): IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
SPRINT 11E PHASE 2D.1A UPSTASH LIVE-EVIDENCE TRUTH: READY FOR REVIEW
UPSTASH LIVE HARNESS: REAL RUNNERS / CONFIGURATION-GATED / LIVE NOT RUN
UPSTASH DUAL-LEASE PROTOCOL: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
AUTHORIZED LIVE PASS: REFUSED BEFORE PROVIDER CONTACT (STUB ERA) — EVIDENCE REMAINS NOT_TESTED
SPRINT 11E PHASE 2E.1 HOSTED WORKER FOUNDATION: READY FOR REVIEW (LOCAL)
SPRINT 11E PHASE 2E.2A RENDER STORAGE + CLEANUP: IMPLEMENTED LOCALLY
RENDER_STORAGE_PORT_SEAM: CLOSED (2E.2A.3 durable pre-upload + delete saga)
ARTIFACT_CLEANUP_DURABLE_SEAM: CLOSED (2E.2A.3 terminal protected/rejected dispositions)
VERIFY_PROMOTION_COMPOSITION_SEAM: CLOSED (2E.2B trusted verify → promote → enqueue)
VERIFY_PROMOTION_COMPOSITION_SEAM: KEEP BLOCKED
FLY DEPLOYMENT: DO NOT RUN

SPRINT 11E PHASE 2E.1A HOSTED WORKER CORRECTION: READY FOR REVIEW (LOCAL)
UPSTASH AUTHORITY: STAGING-ACCEPTED
FLY DEPLOYMENT: NOT STARTED
HOSTED IMAGE CLASS: foundation_image (NOT deployable)
HOSTED NODE MAJOR: 24
PROJECT OWNERSHIP: CONTRACT + SCHEMA IMPLEMENTED / PRODUCTION UNAVAILABLE UNTIL 2B.2
PRODUCTION ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: CURRENT PRODUCTION DEFAULT
TOTAL WORKER MEMORY: HOSTED-PROVIDER SEAM (Node RSS = coordinator only)
ENV / FEATURE FLAGS: optional HEADLESS_CHROME_PATH / HEADLESS_FFMPEG_PATH / HEADLESS_FFPROBE_PATH; Clerk keys when testing auth; Neon `DATABASE_URL` / migrate-only `DATABASE_URL_UNPOOLED` + gates `HEADLESS_NEON_MIGRATE` / `HEADLESS_NEON_QA` (operator-only; not required for Browser Export). Remote Neon evidence remains NOT_TESTED until an authorized pass.
MIGRATIONS: src/features/headless-renderer/control-plane/migrations/
```



