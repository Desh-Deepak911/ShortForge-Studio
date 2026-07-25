# Sprint 11E Phase 2 / 2.1 / 2.1A / 2.1B / 2B Phase 1 — Production Provider and Deployment Authority

**Branch:** `feature/sprint-11-headless-renderer`  
**Phase type:** Phase **2 / 2.1 / 2.1A / 2.1B** = documentation + architecture decision only. Phase **2B Phase 1** = provider-neutral control-plane foundation; Phase **2B.1A** = store + SQL authority correction (async ownership, UUID first-claim, manifest/bundle/asset verification targets, staging monotonicity, composite ownership FK, correct Neon interactive tx spec) — **no Neon runtime adapter**.  
**Date basis / access:** Official provider documentation retrieved **2026-07-19** (Phase 2 / 2.1); authority model extended **2026-07-19** (Phase 2.1A / 2.1B); Phase **2B Phase 1** foundation recorded **2026-07-19**; Phase **2B.1A** correction recorded **2026-07-19**.  

**Non-goals (Phases 2–2.1B):** no commits/pushes; no `.env.local` edits; no external resource provisioning; no production SDKs; no route activation; no dependency additions; no `src/**` or `package.json` edits in Phase 2.1 / 2.1A / 2.1B. Do not begin Clerk or provider implementation in those phases.

**Phase 2B Phase 1 / 2B.1A non-goals (still in force):** no Neon SDK; no `DATABASE_URL` consumption; no `.env.local` changes; no R2 / Upstash / Fly adapters; production headless routes remain **CONFIGURATION-BLOCKED**; Browser Export remains production default.

> **Phase 2.1 correction notice:** Phase 2 incorrectly implied that `createJob` could establish full-object `sha256:<64 hex>` authority from ordinary R2 metadata / ranged reads, under-specified Upstash Streams delivery/reclaim, and stated Hobby duration as a single 300s figure without separating Fluid vs non-Fluid. Those claims remain corrected below.

> **Phase 2.1A authority notice:** Phase 2.1 left two contradictions: (1) immediate `jobId` before trusted verification vs the canonical 11B/11C create chain; (2) Redis `XAUTOCLAIM` vs Neon claim-lease recovery after `XACK`. §8.6 and §9.1A freeze the two-stage acceptance model and dual leases. Phase 2.1A’s dual-lease design is **accepted and unchanged** by 2.1B.

> **Phase 2.1B type authority notice:** Phase 2.1A’s illustrative store shape incorrectly kept `job: HeadlessRenderJobV1` beside `canonicalRequest = null`. That is invalid: `HeadlessRenderJobV1` requires trusted `requestFingerprint` / `manifestFingerprint` / `assetBundleFingerprint`, which do not exist until Stage B. §8.6 now freezes a **discriminated** provisional vs canonical stored-record union. Phase **2B Phase 1** implements that union in provider-neutral TypeScript + memory adapters + Neon-compatible SQL/CAS spec — **not** the Neon runtime adapter (Phase 2B.2).

**Frozen product facts this decision must respect:**

- Vercel remains the web application host (Hobby today).
- Browser Export remains the production default.
- Production headless routes are configuration-blocked (`CONFIGURATION_UNAVAILABLE` / availability `configuration_unavailable`).
- Local worker architecture (11D through 3.3A.1) is accepted: 720p/1080p/4K, WebM/MP4, voice/music, streamed frames, streamed artifact delivery, atomic artifact binding, cancellation, retries, durable cleanup contracts.
- Operational content ceiling remains **60 seconds**.
- Real 60s 4K MP4 evidence ≈ **58.5 MB**, several minutes wall-clock locally.
- Node RSS evidence excludes Chrome/FFmpeg; **total hosted-worker process-tree memory is unknown** and must be measured on a hosted container before capacity claims.

---

## 1. Repository provider preflight (code-backed)

| Seam | Production code reality | Evidence |
|------|-------------------------|----------|
| Authentication / session | **Clerk (2A, configuration-gated)** | `@clerk/nextjs` + `src/proxy.ts` (headless API matcher only). Missing keys → Unavailable principal / passthrough proxy. No sign-in UI / ClerkProvider yet. |
| Trusted owner identity | **Clerk when configured (2A)** | `ClerkHeadlessPrincipalAdapter` → `HeadlessAuthenticatedPrincipal` (`ownerId` + `sessionId`); missing keys → `CONFIGURATION_UNAVAILABLE`. Product UI may still use placeholders locally; production HTTP rejects placeholders. |
| Database SDK / schema | **Neon adapters IMPLEMENTED / CONFIGURATION-GATED (2B.2–2B.2B)** | `@neondatabase/serverless` + Pool/Client interactive transactions (`connect → BEGIN → work → COMMIT\|ROLLBACK → release/end`). Runtime uses `DATABASE_URL`. Explicit migrate runner uses `DATABASE_URL_UNPOOLED` + `HEADLESS_NEON_MIGRATE=1` (ledger + checksum drift + advisory lock). Gated live harness (`HEADLESS_NEON_QA=1`) is implemented but **NOT RUN** against remote Neon in 2B.2B. Production routes remain **CONFIGURATION-BLOCKED**. Never `pool.transaction(` / HTTP `neon()` for CAS or migrations. |
| Object storage SDK | **R2 durability IMPLEMENTED / CONFIGURATION-GATED (2C.1A) — LIVE NOT RUN** | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` in server R2 adapters only. Neon owned-object store + TOCTOU revision bind + coverage reconcile + gated live harness (`HEADLESS_R2_QA`). No remote R2 contact in this phase. |
| Queue broker | **Upstash dual-lease STAGING-ACCEPTED (2D.1H.1)** — official live 22/22 PASS | REST producer + TCP consumer + FakeRedis; `productionAvailable` still false. |
| Hosted worker | **Fly foundation LOCAL ONLY (2E.1) — DEPLOY NOT STARTED** | Env classifier + composition seams + container/Fly template; no Fly auth/deploy. |
| Production composition | **Blocked** | `productionAvailable: false`, `canCreateJob: false`; may construct Clerk principal; project auth unavailable; no memory/QA adapters. |
| Headless API routes | **Auth-gated + blocked** | Shared route auth gate: missing Clerk → 503/`configuration_unavailable`; signed-out → 401/`authentication_required`; signed-in → still 503/`configuration_unavailable` (no durable providers). |
| Drafts / active job ref | **localStorage only** | `footiebitz:drafts:v1`; `footiebitz:headless-active-job:v1` (safe job id/output only). |
| Worker runtime | **Local binaries** | System Chrome via `puppeteer-core`; native ffmpeg/ffprobe; temp workspace under OS tmp. No Dockerfile / fly.toml / railway / vercel.json / CI deploy workflows. |
| Deployment config | **Minimal** | `next.config.ts` (reactCompiler; `serverExternalPackages` for ffmpeg/puppeteer). `.vercel/` local project link only. |

### Control-plane ports (provider-neutral — keep)

| Port | Production adapter |
|------|-------------------|
| `HeadlessPrincipalPort` | Clerk adapter when keys present; else Unavailable |
| `HeadlessProjectAuthorizationPort` | Contract + memory adapter (2B.1); production **Unavailable** until Neon **2B.2** |
| `HeadlessStoragePort` | Memory (test) only; R2 Design B IO via `HeadlessR2ObjectIOPort` (2C.1 foundation, not composed live) |
| `HeadlessJobStorePort` | Memory (test) only — provisional/canonical union + promotion (2B.1); Neon adapter **2B.2** |
| `HeadlessQueuePort` | Memory (test) only |
| `HeadlessArtifactCleanupPort` | Memory (test) only |

**Do not infer providers from environment variable names.** Optional path overrides (`HEADLESS_CHROME_PATH`, etc.) are local binary paths only.

---

## 2. Provider roles (exact ownership)

| Role | Must own | Must not own |
|------|----------|--------------|
| **User authentication + trusted principal** | Session verification; server-side `ownerId` from identity provider | Client-supplied `ownerId` / invented `projectId` as ownership proof |
| **Durable job/request/binding storage** | Job + request + idempotency + claim lease + artifact-object binding + progress + terminal reason + expiry | Browser localStorage as authority |
| **Durable cleanup-intent storage** | Cleanup intents + claim/complete | Silent orphan loss after failed delete |
| **Owned source-asset storage** | Manifest/bundle/asset_bytes objects with owner scoping | Proxying large media through Vercel bodies |
| **Finalized artifact storage** | Finalized opaque locators; digest/length/MIME metadata | Public unauthenticated buckets |
| **Short-lived upload capabilities** | Presigned/capability PUT (or multipart part URLs) issued by control plane; objects remain **untrusted until full-object verify** (§8) | Long-lived write credentials in the browser; metadata-as-digest |
| **Short-lived download capabilities** | Presigned GET / capability token for succeeded jobs only | Embedding storage secrets in job views |
| **Durable queue/delivery** | At-least-once delivery with stable delivery id | Browser-triggered worker HTTP |
| **Hosted worker container** | Chromium + ffmpeg encode; pull queue; cancel checks; streamed upload | Public browser-callable render API |
| **Secrets** | Server/worker env only (`NEXT_PUBLIC_*` forbidden for secrets) | Client bundles |
| **Logs/metrics** | Request logs + worker operational metrics (non-identity) | Locators/paths/capabilities in creator diagnostics |
| **Maintenance/recovery trigger** | Cron or scheduled maintenance for cleanup intents / expired claims | **Normal Export** (Export remains user-triggered) |

---

## 3. Vercel Hobby boundary

Sources (official; accessed **2026-07-19**):

- [Vercel Functions limitations](https://vercel.com/docs/functions/limitations) (Fluid Compute tables)
- [Vercel platform Limits](https://vercel.com/docs/limits) (legacy / Fluid-disabled duration table)
- [Hobby plan](https://vercel.com/docs/plans/hobby)
- [Function max duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Fluid compute](https://vercel.com/docs/fluid-compute)

### What Vercel Hobby may own (short control-plane only)

- Authenticate creator / resolve trusted **user** identity (not project ownership — see §6 / §6A).
- Freeze/prepare compact job transport (manifest **locator + expected digests**, not media bytes).
- Issue owned-upload capabilities (return URLs/tokens; browser uploads **direct to object storage**).
- Create job record + return `jobId` immediately; drive **materializing → verifying → queued** transitions without proxying bytes.
- Status / cancel / retry / download-capability issuance (capability JSON only — **not** artifact bytes).
- At most **daily** cron for maintenance/recovery ([Hobby cron: once per day](https://vercel.com/docs/cron-jobs/usage-and-pricing)).

### What Vercel must not hold

| Workload | Why |
|----------|-----|
| Long-lived Chromium render | Multi-minute 4K locally; process model unfit |
| FFmpeg encode | Native binaries + grandchildren |
| Large artifact / source proxy upload/download | **4.5 MB** request/response body limit → `FUNCTION_PAYLOAD_TOO_LARGE` ([Functions limitations](https://vercel.com/docs/functions/limitations)) |
| Full-object SHA-256 of large media inside a Function | Same body/time limits; architecture must not depend on a long request |
| Queue worker loop | Functions are request-scoped |
| Durable job execution | Neon + external worker |

### Duration: Fluid vs non-Fluid (do not collapse to one number)

| Mode | Official Hobby default | Official Hobby maximum | Source |
|------|------------------------|------------------------|--------|
| **With Fluid Compute** (enabled by default for new projects) | **300s** | **300s** | [Functions limitations](https://vercel.com/docs/functions/limitations), [max duration](https://vercel.com/docs/functions/configuring-functions/duration), [Fluid compute](https://vercel.com/docs/fluid-compute) |
| **Without Fluid Compute** (projects deployed before 2025-04-23 and Fluid disabled) | **10s** | **60s** | [Vercel Limits](https://vercel.com/docs/limits) |

**Architecture rule:** control-plane requests must remain short. **Do not make the architecture depend on a 300-second request** for upload verification or render. Verification and render run on the external worker fleet.

### Other recorded boundaries

| Limit | Hobby (Fluid path unless noted) |
|-------|----------------------------------|
| Function memory | **2 GB / 1 vCPU** ([Functions limitations](https://vercel.com/docs/functions/limitations)) |
| Request/response body | **4.5 MB** |
| Uncompressed function bundle | **250 MB** standard |
| Cron | **≤ once per day**; ±59 min precision |
| Fair use | Hobby is **non-commercial / personal**; move to **Pro before commercial production traffic** ([Hobby plan](https://vercel.com/docs/plans/hobby)) |

## 4. Candidate architecture matrix

All capacity/pricing claims below cite official pages. Where a “free” allotment exists, it is labeled as such; **no unlimited free hosting is claimed**.

### Stack A — Recommended

| Role | Provider | Official basis |
|------|----------|----------------|
| Web / control plane | **Vercel Hobby** (Next.js App Router) | [Hobby](https://vercel.com/docs/plans/hobby), [Functions limits](https://vercel.com/docs/functions/limitations) |
| Auth / principal | **Clerk** (Hobby) | [Clerk pricing](https://clerk.com/pricing) — Hobby free with **50,000 MRU/app** (MRU ≠ classic MAU; see Clerk docs) |
| Relational job / cleanup store | **Neon Postgres** (Free → Launch when needed) | [Neon pricing](https://neon.tech/pricing) — Free: 0.5 GB storage/project, 100 CU-hours/project, scale-to-zero |
| Object storage | **Cloudflare R2** | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) — Free: **10 GB-month**, 1M Class A, 10M Class B; **egress free**; [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/); [limits](https://developers.cloudflare.com/r2/platform/limits/) object size **5 TiB** |
| Queue | **Upstash Redis** (Streams / consumer groups) | [Upstash Redis pricing](https://upstash.com/pricing/redis) — Free: **256 MB**, **500K commands/month** |
| Worker container | **Fly.io Machines** | [Free trial](https://fly.io/docs/about/free-trial/) (2 VM-hours or 7 days — **not** a permanent free tier); [pricing](https://fly.io/docs/about/pricing/); [cost management](https://fly.io/docs/about/cost-management/) — pay-as-you-go after trial |

| Dimension | Assessment |
|-----------|------------|
| Max execution duration | Worker: unbounded by Vercel; sized by operator (must exceed several minutes for 4K QA) |
| CPU/memory/disk controls | Fly Machine presets + ephemeral disk; **must measure** Chrome+ffmpeg RSS on host |
| Object-size limits | R2 5 TiB ≫ 58.5 MB; Supabase Free file upload **50 MB** is **insufficient** ([Supabase pricing](https://supabase.com/pricing)) — rejected for artifact bucket on Free |
| Signed upload/download | R2 presigned GET/PUT (expiry 1s–7d) |
| Regional availability | Pin control plane, Neon, R2, Upstash, Fly to one primary region initially |
| Operational complexity | Medium (5 vendors) |
| Vendor lock-in | Ports already provider-neutral; R2 is S3-API compatible |
| Suitability for 60s 4K | **Yes**, contingent on Fly Machine size + measured memory; not advertised from Node-only RSS |

**Dev availability:** Clerk Hobby + Neon Free + R2 free tier + Upstash Free + Fly trial → enough for **adapter integration and short staging jobs**. Sustained hosted 4K QA requires **paid Fly** (and likely Neon Launch / R2 beyond free storage if artifacts accumulate).

### Stack B — Fallback

| Role | Provider | Official basis |
|------|----------|----------------|
| Web / control plane | Vercel Hobby/Pro | same as A |
| Auth | **Supabase Auth** or **Auth.js + OAuth** | [Supabase pricing](https://supabase.com/pricing) Auth MAU on Free; Auth.js self-hosted session |
| Relational store | **Supabase Postgres** (Pro when Free pause/limits bite) | Free pauses after 1 week inactivity; 500 MB DB; [database size](https://supabase.com/docs/guides/platform/database-size) |
| Object storage | **AWS S3** (or keep R2) | AWS S3 docs (presigned URLs; multipart) |
| Queue | **Amazon SQS** | AWS SQS docs (visibility timeout, DLQ) |
| Worker | **Railway** (Hobby $5/mo includes $5 usage) | [Railway plans](https://docs.railway.com/pricing/plans), [pricing](https://railway.com/pricing) |

Use when Fly.io is undesirable, or team prefers AWS-native queue/storage. Higher IAM/ops surface.

### Stack C — Concentrated backend (not recommended first)

| Role | Provider |
|------|----------|
| Auth + DB + (optional) storage | Supabase |
| Queue | Upstash or SQS |
| Worker | Fly or Railway |
| Web | Vercel |

**Risk:** Supabase Free **max file upload 50 MB** blocks 58.5 MB artifacts without Pro storage; Free project **pause** breaks staging. Acceptable only with **Pro storage** + separate artifact bucket policy.

---

## 5. Recommended topology

```text
Creator browser
  → Vercel (Next.js) short control routes
      → Clerk (session) → ownerId identity only until Neon ownership exists
      → Neon (ownership + job / request / binding / cleanup / idempotency)
      → R2 (issue short-lived upload/download capabilities only)
      → Upstash (REST XADD of stable delivery id — verify or render stream)
  → Browser uploads sources/manifest/bundle **direct to R2** (untrusted staging)
  → Fly.io private workers (never browser-callable)
      → verifier: full-object stream SHA-256 → finalize owned metadata
      → only then: render delivery eligible
      → render worker: Neon claim is authority → Chromium + ffmpeg
      → streamed artifact upload + finalize + CAS binding
      → on lost CAS: delete or durable cleanup intent
  → Creator polls status on Vercel; download capability = short-lived R2 GET
```

### Why each provider owns its role

| Provider | Why |
|----------|-----|
| **Vercel** | Already hosts the App Router; fits Hobby for short authenticated control-plane RPCs; must not render. |
| **Clerk** | Server-resolvable session for Next.js; free Hobby MRU allotment; keeps `ownerId` off client JSON. |
| **Neon** | Postgres for CAS/transactions/idempotency; Free tier for early schema work; branching maps cleanly to staging/prod. |
| **R2** | Artifact-sized objects; free egress; presigned upload/download; avoids Vercel 4.5 MB body trap. |
| **Upstash** | Lightweight durable queue/stream without running Redis ourselves; Free tier for low-volume staging. |
| **Fly Machines** | Long-running Linux containers with controllable CPU/RAM/disk; suitable for Chrome+ffmpeg; trial then pay-as-you-go. |

**Worker is not publicly callable by the browser.** Only the control plane enqueues; worker authenticates to queue/DB/storage with server secrets.

---

## 6. Authentication decision (Clerk identity ≠ project ownership)

| Topic | Decision |
|-------|----------|
| Recommended provider | **Clerk** (Hobby → Pro if MRU/features require) — [pricing](https://clerk.com/pricing) |
| What Clerk proves | Authenticated **user** session; server-derived `ownerId` (e.g. Clerk `userId` or stable mapped id) + `sessionId` |
| What Clerk does **not** prove | Ownership of a client-supplied `projectId` or `draftId` |
| Client JSON | **Never** accept `ownerId` from the body. `projectId` in transport is a **claim** only |
| Until Neon ownership schema exists | **No `projectIds` may be invented or trusted** from client JSON; principal resolution may return identity with **empty** `projectIds` |
| Phase **2A** scope | **Implemented** — Clerk session resolution + authentication gates on headless routes **only**; no sign-in UI / ClerkProvider yet |
| Job creation in 2A / 2B.1 | Remains **`CONFIGURATION_UNAVAILABLE`** until Neon **2B.2** ownership adapter **and** every other required durable port is composed (R2, queue, worker — **not started**) |
| Project authorization port | Separated from principal; **2B.1** ships contract + memory adapter + SQL schema; production adapter unavailable until Neon **2B.2** |
| Cross-owner | Fail closed (`JOB_NOT_FOUND` / `FORBIDDEN`) — never leak cross-owner existence details beyond existing patterns |
| Local development | Clerk development instance or testing `TestHeadlessPrincipalAdapter` only — never silent `pending-auth` success on production routes |
| localStorage drafts | Device-local only; not server authority; optional later authenticated “claim draft” after ownership schema exists |

### 6A. Ownership lookup contract (Phase 2B Phase 1 — contract + schema; production Neon adapter 2B.2)

```text
assertProjectAccess(principal.ownerId, projectId) → ok | forbidden
  requires durable row: project_id owned_by owner_id (first-claim, immutable)

assertDraftAccess(principal.ownerId, draftId) → ok | forbidden
  optional later; drafts may remain localStorage until product migrates
```

`HeadlessProjectAuthorizationPort.assertProjectAccess` must consult this store — **not** `HeadlessPrincipalPort`, **not** a hard-coded allow-list of client strings, and **not** Clerk organization claims alone unless those claims are mirrored into Neon under our authority rules.

**Phase 2B Phase 1 / 2B.1A (implemented — provider-neutral):** async `HeadlessProjectAuthorizationPort` (`claimUnownedProject` / `assertProjectAccess` return `Promise`); production first-claim requires unguessable UUID project IDs (`validateHeadlessClaimableProjectId`); testing adapters may use fixture IDs; `MemoryHeadlessProjectOwnershipAdapter` (test/QA); composite `(project_id, owner_id)` ownership SQL in `migrations/001_headless_project_ownership.sql` + jobs FK. Production still ships `UnavailableHeadlessProjectAuthorizationAdapter` until Neon **2B.2**. Legacy non-UUID owned projects remain a future migration seam.

**Unresolved (user decision):** Clerk vs Neon Auth vs Supabase Auth if product preference differs — ports stay the same.

#### Phase 2A.1 failure mapping (implemented)

| Condition | Code | HTTP | Availability |
|-----------|------|------|--------------|
| Env `unconfigured` / `invalid` | `CONFIGURATION_UNAVAILABLE` | 503 | `configuration_unavailable` |
| Signed-out / pending | `UNAUTHENTICATED` | 401 | `authentication_required` |
| SDK/malformed/hostile auth | `AUTHENTICATION_FAILED` | 503 | `temporarily_unavailable` |
| Authenticated, durable ports absent | `CONFIGURATION_UNAVAILABLE` | 503 | `configuration_unavailable` |

Proxy: headless matcher only; unconfigured/invalid/load/handler failure → `NextResponse.next()`; route gate remains authoritative.


## 7. Durable schema map (no domain redesign)

Map existing contracts to Postgres. Phase **2B Phase 1** ships Neon-compatible SQL under `src/features/headless-renderer/control-plane/migrations/` (`001` project ownership, `002` discriminated job store, `003` CAS transaction spec). Migrations are **not applied at runtime** until the Neon adapter (Phase **2B.2**).

| Domain / control-plane concept | Durable record | CAS / transaction needs |
|--------------------------------|----------------|-------------------------|
| Render job + request | `headless_jobs` + `headless_requests` (or JSONB request column) | CAS on `store_version`; terminal immutability |
| Idempotency authority | Unique `(owner_id, idempotency_authority_key)` | Insert-if-absent / conflict |
| Claim token / lease | Columns on job row | Compare claim token + expiry on claim/recover |
| Artifact-object binding | Private columns/table keyed by `job_id` | Written **only** in same transaction/CAS as `succeeded` |
| Cleanup intent | `headless_cleanup_intents` | Idempotent create; claim lease; complete immutable |
| Queue delivery identity | `dlv:{jobId}:{attempt}` (+ broker message id) | Stable across recoverDispatch |
| Retry parent/child | `parent_job_id` / attempt lineage on job | Insert new attempt; never mutate terminal parent identity unlawfully |
| Safe progress | Advisory columns only | Non-authoritative updates allowed under claim |
| Terminal reason | `reason_id`, `retryable` | Set once at terminal transition |
| Expiry | `expires_at_ms` on job/objects/intents | Sweep via maintenance |

**Do not redesign frozen domain validators** unless a provider limitation is demonstrated (none identified that forces contract change; Supabase Free 50 MB upload is a **storage provider** choice issue, not a domain issue).

---

## 8. Storage integrity and flow (Phase 2.1 correction)

### 8.1 What is **not** digest authority

Frozen contracts require content digests of the form `sha256:<64 lowercase hex>` over the **exact object bytes** (11B/11C). The following are **not** sufficient evidence of that digest:

| Non-authority | Why |
|---------------|-----|
| Client-provided custom metadata (`x-amz-meta-*` / `customMetadata`) | Client-controlled; spoofable |
| Ranged `GetObject` / partial read | Cannot prove full-object SHA-256 |
| Ordinary `HeadObject` / system metadata alone | Does not contain a trusted full-content SHA-256 of our contract form |
| Normal presigned `PUT` with unsigned payload (`UNSIGNED-PAYLOAD`) | Server did not hash the body at upload time ([R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)) |
| Multipart **ETag** | Not a full-content SHA-256 |
| R2 S3 **COMPOSITE** SHA-256 | Official checksum type matrix: SHA-256 is **COMPOSITE ✅ / FULL_OBJECT ❌** ([R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) — accessed 2026-07-19). COMPOSITE is not the frozen full-object `sha256:<64 hex>` |

**Workers `put({ sha256 })` binding** can store/verify checksums when **Cloudflare Workers write** the object ([Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)). That is **not** the same as trusting a browser presigned PUT or claiming S3 `FULL_OBJECT` SHA-256 for arbitrary browser uploads.

**Hard rule:** Vercel must not proxy large media bodies (4.5 MB function body limit).

### 8.2 Authority-preserving designs compared

#### Design A — Trusted streaming verification/upload service

Browser (or materializer) streams bytes to a **trusted non-Vercel service** (e.g. Fly service or Cloudflare Worker with adequate limits). That service hashes every byte as `sha256:<64 hex>`, writes into R2 (optionally using Workers `put` checksum when on Workers), and only then records finalized owned-object metadata.

| Question | Answer |
|----------|--------|
| Who reads every byte? | Trusted upload/verify service |
| Who computes/verifies SHA-256? | That service (server-side) |
| When finalized? | After hash matches expected digest + size/MIME/owner/expiry checks |
| Stage A before verification? | May persist provisional `materializing` jobId; **must not** enqueue render until Stage B |
| Body-size / multipart | Bypass Vercel; service must support large/multipart uploads |
| Failure / orphans | Abort upload; delete partial R2 objects; job → failed/retryable; cleanup intents as needed |
| Frozen 11B/11C? | Unchanged |

#### Design B — Direct browser→R2 upload, then trusted full-object verify (**recommended**)

1. Control plane issues short-lived upload capability to a **staging** object key.  
2. Browser PUTs **direct to R2** (no Vercel body). Object is **untrusted** until verified.  
3. A trusted verifier (Fly worker consumer or dedicated verifier process) **streams the entire object** once with server credentials, computes SHA-256, checks length/MIME/owner/expiry.  
4. On success, promote/finalize owned metadata in Neon (`finalized=true`); only then is the locator eligible for job acceptance / render enqueue.  
5. On failure, delete staging object; fail closed; optional cleanup intent.

| Question | Answer |
|----------|--------|
| Who reads every byte? | Trusted verifier (not Vercel; not the browser’s claim) |
| Who computes/verifies SHA-256? | Verifier over full stream |
| When finalized? | After successful full-object verify + metadata write |
| Stage A before verification? | **Yes — stable jobId** via `HeadlessProvisionalStoredJobRecord` (§8.6). **No** `HeadlessRenderJobV1` / canonical 11B request yet. **No render queue delivery** until Stage B promotion |
| Body-size / multipart | Browser uses R2 single/multipart as needed; verifier streams full object (may use ranged sequential reads that still cover **all** bytes — not a partial-proof shortcut) |
| Failure / orphans | Delete unverified object; job fails closed or waits with timeout → failed; cleanup intents |
| Frozen 11B/11C? | Unchanged — digests remain `sha256:<64 hex>` |

#### Design C — Provider-native FULL_OBJECT SHA-256 only

| Question | Answer |
|----------|--------|
| Official R2 S3 matrix | SHA-256 **FULL_OBJECT ❌** / COMPOSITE ✅ ([S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)) |
| Decision | **Rejected** as the sole authority path for frozen full-object SHA-256. Do not equate COMPOSITE SHA-256, CRC64NVME, MD5, or ETag with `sha256:<64 hex>`. |

### 8.3 Selected path

**Recommended: Design B** (direct upload + trusted full-object verify before finalize).  
Design A remains an acceptable alternative if a dedicated upload sink is preferred operationally.  
**Design C is not selected.**

`HeadlessStoragePort.verifyObjectDigest` in production **must** mean full-byte streaming verification by a trusted component — **not** metadata-only comparison.

### 8.4 Creator flow (authoritative after Phase 2.1A)

```text
Export click
  → authenticate owner + project access
  → reserve stable jobId + operation/idempotency identity
  → persist provisional materializing authority (Stage A)
  → return jobId immediately
  → upload + trusted full-object verify (async)
  → canonical request promotion (Stage B)
  → queue render delivery
  → render / encode / validate / upload
  → terminal
```

**“Synchronous creation”** means durable **job identity acceptance** (Stage A) — not synchronous full-object verification and not immediate render-queue insertion.

| Phase | State / authority |
|-------|-------------------|
| Stage A accepted | `materializing` — provisional only; **not** render-authorized |
| Upload / verify in flight | advisory progress may say uploading/verifying; digests not yet trusted |
| Stage B promotion commits | same `jobId` gains canonical `HeadlessRenderJobRequestV1` + fingerprint; transition toward `queued` |
| Render delivery enqueued | only **after** Stage B commit |
| Worker claimed | `rendering` → `encoding` → `validating` → `uploading` → terminal |

**Exact asset coverage is not weakened.** Rendering must not start before verified ownership, digest, size, MIME, expiry, and exact slot coverage exist for every required owned object.

### 8.5 End-to-end storage + acceptance flow (corrected)

```text
1. Export click freezes creator snapshot identity (manifest fingerprint / expected digests / profile) — ExportManifest v2/v3 unchanged
2. Control plane Stage A: auth + project access → reserve jobId → persist materializing record → return jobId
3. createUploadSession → short-lived R2 staging capabilities (browser PUT direct; untrusted)
4. Enqueue verify delivery (not render) for staging objects / coverage set
5. Trusted verifier streams FULL object → sha256:<64 hex> + length/MIME/owner/expiry
6. When coverage complete: Stage B promotion — validate manifest/bundle → construct canonical 11B request → atomic attach fingerprint → materializing → queued
7. Enqueue render delivery only after Stage B commit
8. Render worker: Neon claim is render authority → download verified sources
9. Stream encode → incremental hash → R2 upload → finalize artifact
10. Succeeded CAS: public artifact + private binding
11. Download capability = short-lived R2 GET for succeeded owner only
12. Expiry + cleanup intents for orphans / failed verify / failed promotion / lost CAS
```

### 8.6 Two-stage acceptance + provisional record types (Phase 2.1A / 2.1B)

#### Contradiction being resolved

Today’s local 11C `createJob` chain (`verifyObjectDigest` → open manifest/bundle → `finalizeHeadlessRenderJobRequest` → `createIfAbsent` → dispatch toward `queued`) requires a **canonical verified** `HeadlessRenderJobRequestV1` before accept. Product intent requires an **immediate stable `jobId`** while Design B verify may still be running.

Phase **2.1A** froze the two-stage product flow. Phase **2.1B** corrects the store type: a nullable request beside a canonical `HeadlessRenderJobV1` is **invalid**. `HeadlessRenderJobV1` / `HeadlessRenderJobRequestV1` are **canonical-only**.

#### Stage A — provisional materialization authority

| Rule | Authority |
|------|-----------|
| Auth | Server authenticates owner; project access via Neon ownership (when composed — not Clerk alone) |
| Freeze | Persist creator **snapshot claim** identity (claimed slot/digest/size/MIME expectations, requested profile/build, operation key) — **claims until verification succeeds** |
| Identity | Reserve **one stable public `jobId`** + provisional operation/idempotency identity |
| Persist | Durable **`HeadlessProvisionalStoredJobRecord`** (`stage: "provisional"`) |
| Return | Return the same public `jobId` immediately |
| Upload/verify | May continue asynchronously |
| Forbidden types | **No** `HeadlessRenderJobV1`; **No** `HeadlessRenderJobRequestV1`; **No** trusted `hrr` `requestFingerprint`; **No** trusted `hab` `assetBundleFingerprint` |
| Must not | Be queued for **rendering**; expose untrusted locators/digests/source details; invent canonical fingerprints for the public view |
| Recovery | Refresh/tab closure recovers status by stable `jobId` |
| Cancel | Terminalizes the **provisional** record and cleans staging objects |

#### Stage B — canonical render promotion (atomic, same `jobId`)

One durable transaction must:

1. Lock / compare the provisional record `storeVersion` (CAS).
2. Require provisional state is **materializing** and **non-terminal**.
3. Require complete trusted verification coverage for every required object.
4. Load and validate the exact manifest and asset bundle (existing 11B validators unchanged).
5. Build canonical `HeadlessRenderJobRequestV1` via existing validated builders (`finalizeHeadlessRenderJobRequest` / equivalents).
6. Build the initial coherent `HeadlessRenderJobV1` via existing validated builders (`createAcceptedHeadlessRenderJob` / equivalents).
7. **Replace** the provisional variant with `HeadlessCanonicalStoredJobRecord` under the **same** public `jobId`.
8. Preserve `ownerId`, `projectId`, operation/idempotency authority, profile/build selection, and creation lineage.
9. Prevent cancel/promotion races and double promotion (CAS + terminal lock).
10. **Never** leave a mixed provisional/canonical record or persist partial canonical fingerprints.
11. **Only after commit** permit `queued` transition and render `XADD`.

**Failed promotion:** leave the provisional record unchanged **or** atomically terminalize it with a safe reason. Never persist a half-built canonical job/request.

**Retry:** creates the authorized new operation/attempt per frozen retry policy — does not mutate prior provisional or canonical terminal evidence. Stage B **cannot** promote a provisional terminal.

#### Discriminated stored-record union (Phase 2.1B — freezes type contradiction)

```text
HeadlessStoredJobRecord =
  | HeadlessProvisionalStoredJobRecord
  | HeadlessCanonicalStoredJobRecord
```

Both variants share the **same stable public `jobId`**. This does **not** create two creator-visible identities.

##### `HeadlessProvisionalStoredJobRecord`

```text
stage: "provisional"
storeVersion: number                         # CAS
jobId: string                                # stable public id
ownerId / projectId
operationId
provisionalIdempotencyAuthorityKey
requestedOutput: rendererProfile + rendererBuildId   # selection only
snapshotClaimIdentity: {                     # CLAIMS — not trusted authority
  claimedManifestPayloadDigest?
  claimedSlotCoverage / expectedDigest/size/MIME claims
  creatorSnapshotBinding …
}
stagingObjectRefs: opaque private refs       # never in public safe view
verificationCoverage / verificationLease
state: provisionalMaterializing
     | provisionalFailed | provisionalCancelled | provisionalExpired
canonicalJob: null
canonicalRequest: null
# ABSENT:
#   HeadlessRenderJobV1
#   HeadlessRenderJobRequestV1
#   trusted hrr requestFingerprint
#   trusted hab assetBundleFingerprint
#   render claimToken / claimedAtMs
#   artifactObjectBinding
```

Private and total-validator protected. Snapshot/digest/size/MIME values are **claims until verification succeeds**.

##### `HeadlessCanonicalStoredJobRecord`

```text
stage: "canonical"
storeVersion: number
jobId: string                                # SAME public id as provisional
canonicalJob: HeadlessRenderJobV1            # full 11B coherence required
canonicalRequest: HeadlessRenderJobRequestV1 # trusted fingerprints required
# trusted manifestFingerprint, assetBundleFingerprint, requestFingerprint
claimToken / claimedAtMs …                   # existing render-claim rules
artifactObjectBinding …                      # existing binding rules when succeeded
# existing lifecycle + terminal immutability apply
```

#### Provisional terminal authority

| Event | Authority |
|-------|-----------|
| Cancel before promotion | Terminalize provisional + clean staging objects |
| Verification failure | Terminalize provisional with safe reason id |
| Expiry | Terminalize provisional |
| Immutability | Provisional terminals are immutable |
| Artifacts | Provisional terminals **never** carry artifacts or private artifact bindings |
| Retry | New authorized operation/attempt per frozen retry policy (may mint new attempt identity; does not rewrite old terminal) |
| Promotion | Stage B **rejects** provisional terminals |

Provisional allowed active state: materializing (plus advisory progress). Provisional terminals: failed / cancelled / expired only (provisional namespace — mapped into public safe `state` values without inventing canonical fingerprints).

#### Stage A idempotency

| Rule | Authority |
|------|-----------|
| Key material | Server-derived `ownerId` + `projectId` + creator operation key + normalized requested output/profile/build + **frozen snapshot claim identity** |
| Same semantics | Returns the **same** provisional `jobId` |
| Different semantics | `IDEMPOTENCY_CONFLICT` |
| Promotion | Does **not** mint a new public `jobId`; does **not** reset idempotency authority |
| Concurrent Stage A | Converges on one provisional record |
| Concurrent Stage B | Converges on one canonical record under that `jobId` |

#### Unified safe public view

Existing `HeadlessPublicJobViewV1` fields (`jobId`, `state`, `progress`, timestamps, `retryable`, `reasonId`, `artifactAvailable`, `output`) can represent either variant **honestly** if projected by a future store adapter:

| Variant | Public projection |
|---------|-------------------|
| Provisional active | same `jobId`; `state: materializing`; advisory progress; `artifactAvailable: false`; `output` from **requested** profile only |
| Provisional terminal | same `jobId`; safe `failed` / `cancelled` / `expired`; `artifactAvailable: false`; no digests/locators |
| Canonical | existing safe projection from `canonicalJob` (unchanged semantics) |

**Forbidden:** inventing canonical `hrr`/`hab` fingerprints for Stage A; exposing locators, claimed hashes as trusted, capabilities, verification internals, or secrets.

**Future adapter extension (required):** today’s `toHeadlessPublicJobView(job: HeadlessRenderJobV1)` cannot accept a provisional record. 2B must add a store-level projector (e.g. `toHeadlessPublicJobViewFromStore(record)`) that branches on `stage`. The **public type** itself needs no fingerprint fields; if product later needs an explicit `acceptanceStage: "provisional" | "canonical"` flag, that is an optional additive public-field extension — not required for honesty if `materializing` + `artifactAvailable: false` is preserved.

#### Relationship to frozen contracts

| Contract | Phase 2.1B stance |
|----------|-------------------|
| `HeadlessRenderJobV1` | **Canonical-only** |
| `HeadlessRenderJobRequestV1` | **Canonical-only** |
| Existing 11B validators | **Unchanged** — run only at Stage B |
| Provisional types + total validators | **Implemented (2B Phase 1)** — provider-neutral union + validators; Neon adapter **2B.2** |
| Existing 11C `createJob` verify→accept→dispatch | Becomes **Stage B** canonicalization / promotion logic |
| Render transition helpers | **Must not** accept provisional records |
| ExportManifest v2 / `"8D"` and v3 / `"9C"` | **Unchanged** |
| What this is | Discriminated store lifecycle — not weakened verification |

#### Superseded 2.1A illustrative shape (invalid)

The following Phase 2.1A sketch is **rejected**:

```text
# INVALID — do not implement
job: HeadlessRenderJobV1
canonicalRequest: HeadlessRenderJobRequestV1 | null
```

A nullable request alone cannot make a canonical `HeadlessRenderJobV1` provisional.

## 9. Queue protocol and worker requirements (Phase 2.1 / 2.1A — **unchanged by 2.1B**)

> Phase **2.1B** does not reopen or weaken §9.1A dual-lease recovery: `XAUTOCLAIM` only before `XACK`; Neon claim-lease recovery after `XACK`; new delivery identity after expired acknowledged execution; same split for verification delivery/execution.

### 9.1 Upstash Redis — keep only with this exact protocol

Official sources (accessed **2026-07-19**):

- [REST API](https://upstash.com/docs/redis/features/restapi) — Streams supported **except blocking** `XREAD` / `XREADGROUP`
- [Consistency](https://upstash.com/docs/redis/features/consistency) — leader-based replication; eventual consistency; strong consistency mode **deprecated**
- [Global database](https://upstash.com/docs/redis/features/globaldatabase) — multi-region reads are eventually consistent; single primary with no read regions ≈ regional
- [Pricing](https://upstash.com/pricing/redis) — Free: 256 MB, 500K commands/month

#### Database topology

| Choice | Requirement |
|--------|-------------|
| Regional vs Global | Use a **single primary region** co-located with the Fly worker; **do not** use multi-region Global read replicas for queue authority (eventual stale reads are unsafe for claim/ack). |
| Consistency | Do not rely on deprecated “strong consistency” mode. Prefer one region + **TCP Redis session** from the worker for causal/session guarantees documented by Upstash. |

#### Connection modes

| Runtime | Mode | Notes |
|---------|------|-------|
| **Fly worker** | **TLS Redis protocol** (TCP) | Required for blocking `XREADGROUP … BLOCK` |
| **Vercel control plane** | REST `XADD` (and non-blocking ops) | REST **cannot** block on `XREAD`/`XREADGROUP` ([REST API](https://upstash.com/docs/redis/features/restapi)) |
| REST polling from worker | Allowed only as fallback | Bounded poll interval; higher command count; not preferred |

#### Stream / group names (staging example; prod prefixes differ)

| Name | Value |
|------|-------|
| Render delivery stream | `hfq:render:{env}` |
| Dead-letter stream | `hfq:render-dlq:{env}` |
| Consumer group | `hfq:render-workers` |
| Verifier stream (Design B) | `hfq:verify:{env}` + group `hfq:verify-workers` |

#### `XADD` delivery shape (safe fields only)

```text
XADD hfq:render:{env} *
  deliveryId          dlv:{jobId}:{attempt}     # stable
  jobId               …
  ownerId             …                         # lookup aid only — not render authority
  attempt             …
  enqueuedAtMs        …
```

No locators, capabilities, digests, or secrets in the stream entry.

#### 9.1A Dual leases — delivery vs execution (Phase 2.1A — freezes contradiction #2)

Redis Streams **do not** provide an SQS-style visibility timeout. ShortForge uses **two distinct leases**. **Do not** use one 15–20 minute value for both without justification. **`XAUTOCLAIM` must never be described as recovering an already-`XACK`ed execution.**

| Lease name | Scope | Initial duration guidance | Recovery tool |
|------------|-------|---------------------------|---------------|
| `redisDeliveryIdleMs` | Pre-`XACK` pending Redis delivery | **60–120s** (short; recover crashed workers before Neon claim) | `XPENDING` + `XAUTOCLAIM` |
| `renderClaimLeaseMs` | Post-Neon-claim execution | **Worst-case render+upload** (local 4K 60s is multi-minute; start **≥ 20–30 min** with measurement; today’s local default `HEADLESS_CLAIM_LEASE_MS` = 10 min is a baseline to re-qualify for hosted 4K) | Neon `recoverExpiredClaim` + `recoverDispatch` → **new** `deliveryId` + `XADD` |
| `verifyDeliveryIdleMs` | Pre-`XACK` verify-stream pending | **60–120s** | `XPENDING` + `XAUTOCLAIM` on verify stream |
| `verifyClaimLeaseMs` | Post-claim full-object verify execution | **Medium** (full-object stream of large assets; start **5–10 min**, tune after measurement) | Durable verify-lease expiry → new verify `deliveryId` + `XADD` |

##### Delivery lease — before `XACK`

| Step | Action |
|------|--------|
| Read | `XREADGROUP … BLOCK` creates a **pending** Redis delivery |
| Load | Worker loads job from Neon by `jobId` + `ownerId` |
| Authorize | Attempt durable Neon `claimQueuedJob` (render) or verify claim (verify stream). Redis delivery alone **never** authorizes work |
| Die before claim/`XACK` | Pending entry remains; after `redisDeliveryIdleMs`, `XPENDING` + `XAUTOCLAIM` may redeliver to another consumer |
| Neon terminal | `XACK` as **terminal no-op** — do not render |
| Another **live** Neon claim owns the job | **Do not render; do not steal.** **Safely `XACK`** this delivery as a duplicate/no-op so it does not loop forever. Execution recovery (if the live claim later dies) is **Neon lease expiry → `recoverDispatch` → new delivery**, never reuse of the acked id |
| Neon claim succeeds | Proceed; then `XACK` (see execution lease) |
| Duplicate delivery | Harmless via claim CAS + terminal lock |

##### Execution lease — after `XACK`

| Rule | Authority |
|------|-----------|
| After durable Neon claim succeeds | `XACK` removes the Redis pending delivery |
| From this point | **`XPENDING` / `XAUTOCLAIM` cannot recover the render** |
| Crash/hang detection | Expired **Neon** `renderClaimLeaseMs` (or `verifyClaimLeaseMs`) |
| Recovery | Terminalize/preserve abandoned attempt per existing authority → create/select **one** authorized recovery attempt → mint **new** stable `deliveryId` → `XADD` new message |
| Concurrency | Concurrent `recoverDispatch` / recovery calls **converge** on one recovery attempt/delivery |
| Forbidden | Reuse old acknowledged delivery; steal a live claim; requeue a terminal job |
| Enqueue failure | Remains durably recoverable (`QUEUE_ENQUEUE_FAILED` / recoverDispatch) — same as local 11C |
| Duplicate delivery | Remains harmless through claim CAS + terminal lock |

##### Verification stream (same split)

1. Pre-claim: Redis pending recovery via `verifyDeliveryIdleMs` + `XAUTOCLAIM`.  
2. Post-claim: durable verification lease via `verifyClaimLeaseMs`; crash after ack → **new** verify delivery identity.  
3. Never treat verify-stream `XAUTOCLAIM` as recovering an already-acknowledged verify execution.

##### Trim / enqueue failure

| Step | Action |
|------|--------|
| Trim | `XTRIM MAXLEN ~` on render/verify streams after retention; never trim DLQ aggressively without ops export |
| Enqueue failure | Control-plane `recoverDispatch` path; do not leave promoted-`queued` without delivery without recovery |

### 9.1B Poison and DLQ authority (Phase 2.1A)

Separate failure classes. Only the appropriate policy may emit a **safe** DLQ message. **DLQ never replaces Neon terminal authority.**

| Class | Example | Neon / retry | DLQ? |
|-------|---------|--------------|------|
| Malformed / unauthorized queue entry | Missing `deliveryId`/`jobId`; forged fields; unknown owner | No render; ignore or terminal no-op ack | **Yes** (safe ids only) after N observations — ops signal |
| Repeated pre-claim delivery failure | Claim rejected for non-terminal reasons looping | Bounded redelivery via `redisDeliveryIdleMs`; then fail closed | **Yes** if infrastructure loop exhausted; Neon terminal if job cannot proceed |
| Expired execution claims | Worker died after `XACK` | Neon `CLAIM_LEASE_EXPIRED` + authorized new attempt / delivery | **No** as substitute for Neon — optional ops copy with safe ids after recovery mint |
| Deterministic render failure | Unsupported capability, probe mismatch, validation fail | Neon terminal `failed` with reason id | **No** (Neon is authority); optional ops mirror |
| Infrastructure retry exhaustion | Broker/`XADD`/worker fleet outage after N recoveries | Neon terminal or queued-with-recoverable reason per existing rules | **Yes** safe ids for ops; still does not authorize re-render alone |

DLQ entry shape (safe identifiers only): `deliveryId`, `jobId`, `ownerId`, `attempt`, `class`, `enqueuedAtMs`, `reasonId` — **no** locators, digests, capabilities, or secrets.

#### Command-count / free-tier implications

- Blocking `XREADGROUP` on TCP minimizes empty polls.  
- REST polling multiplies commands (risk under **500K/month** Free).  
- Staging may use Free with low volume; **production should assume a paid Upstash plan** (or migrate to SQS) for durability, retention, and command headroom.  
- Respect Upstash inactivity / archival policies on Free DBs for staging (verify current console policy before relying on idle staging queues).

#### Security

- Standard REST/TCP tokens are **server/worker secrets only**.  
- Separate staging vs production databases.  
- No browser access to queue tokens.

### 9.2 Comparison: Upstash vs SQS vs Neon outbox

| Dimension | Upstash Streams (specified above) | Amazon SQS | Neon `SKIP LOCKED` / transactional outbox |
|-----------|-----------------------------------|------------|-------------------------------------------|
| Visibility | Pre-`XACK`: `XPENDING`/`XAUTOCLAIM` via `redisDeliveryIdleMs`; post-`XACK`: Neon `renderClaimLeaseMs` only | Native visibility timeout | Row lock / `SKIP LOCKED` lease columns |
| Enqueue with job create | Separate system; needs recoverDispatch | Separate system | **Same Postgres transaction** as job insert |
| Worker UX | Mature stream consumer patterns | Very mature | Simple SQL poll |
| Vercel enqueue | REST `XADD` | AWS SDK | SQL insert |
| Ops complexity | Medium (protocol must be exact) | Medium (IAM) | Lower broker surface |
| Free/dev | Free tier w/ command limits | AWS free tier (see AWS docs) | Included in Neon Free storage/CU |

**Conclusion:** Keep **Upstash** as the Phase 2 queue recommendation **only because** the protocol above is now explicit. Prefer **Neon transactional outbox** if enqueue atomicity with `createJob` becomes the dominant risk; prefer **SQS** if production needs native visibility timeouts and simpler ops than Streams reclaim. Trade-off is explicit — not silent.

### 9.3 Worker requirements (unchanged substance)

| Requirement | Spec |
|-------------|------|
| OS | Linux container |
| Browser | Supported Chrome/Chromium for `puppeteer-core` |
| Media | ffmpeg/ffprobe with **VP9, H.264, Opus, AAC** |
| Sandbox | Default Chrome sandbox on |
| Workspace | Writable ephemeral disk; wipe after job |
| Process tree | Kill Chromium/ffmpeg grandchildren on cancel/timeout |
| Network | Allowlist: R2 + Neon + Upstash (or SQS) only |
| Initial QA sizing | **4 vCPU / 8 GB RAM / ≥ 20 GB disk / ≥ 20 min** wall — **not** a memory proof |
| Memory honesty | **Total process-tree memory still needs hosted measurement** |

## 10. Environments and deployment

| Environment | Web | Worker | DB | Buckets | Queue | Secrets |
|-------------|-----|--------|----|---------|-------|---------|
| **local** | `npm run dev` | local runner / optional Fly local | Neon branch or local Postgres optional later | R2 dev bucket or memory adapters | memory / Upstash dev | `.env.local` (untouched this phase) |
| **staging web** | Vercel preview or staging project from staging branch | — | Neon **staging** branch/project | R2 `…-staging` | Upstash staging DB | Vercel staging env |
| **staging worker** | — | Fly app `…-staging` | same staging DB | staging buckets | staging queue | Fly staging secrets |
| **production web** | Vercel production from `main` | — | Neon **production** | R2 `…-prod` | Upstash prod | Vercel prod env |
| **production worker** | — | Fly app `…-prod` | prod DB | prod buckets | prod queue | Fly prod secrets |

**Staging must not share** production jobs, assets, artifacts, queues, or secrets.  
Allowed origins: staging vs production site origins separately for R2 CORS.

---

## 11. Environment-variable ledger (proposed names only — **not added to runtime**)

> Do **not** add these to code or `.env.local` in Phase 2. Enter into `ENV_AND_FEATURE_FLAGS.md` as proposed until 2A+ consumes them.

### Vercel web / control plane

| Variable | Req? | Public? | Side | Secret? | Notes |
|----------|----------|---------|------|---------|-------|
| `CLERK_SECRET_KEY` | req (when auth on) | server | web | yes | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | req (when auth on) | public | web | no | |
| `DATABASE_URL` | req | server | web | yes | Neon pooled URL |
| `R2_ACCOUNT_ID` | req | server | web | no | |
| `R2_ACCESS_KEY_ID` | req | server | web | yes | |
| `R2_SECRET_ACCESS_KEY` | req | server | web | yes | |
| `R2_BUCKET_ASSETS` | req | server | web | no | |
| `R2_BUCKET_ARTIFACTS` | req | server | web | no | |
| `R2_ENDPOINT` | req | server | web | no | |
| `UPSTASH_REDIS_REST_URL` | req | server | web | yes | Enqueue via REST `XADD` |
| `UPSTASH_REDIS_REST_TOKEN` | req | server | web | yes | |
| `HEADLESS_CONTROL_PLANE_ENABLED` | req | server | web | no | Kill switch for **new** jobs |
| `HEADLESS_DOWNLOAD_URL_TTL_SEC` | opt | server | web | no | Default e.g. 120 |
| `HEADLESS_ALLOWED_ORIGINS` | req | server | web | no | CORS for R2/browser |
| `HEADLESS_REDIS_DELIVERY_IDLE_MS` | opt | server | worker | no | Proposed; maps to `redisDeliveryIdleMs` (§9.1A) |
| `HEADLESS_RENDER_CLAIM_LEASE_MS` | opt | server | both | no | Proposed; maps to `renderClaimLeaseMs` (§9.1A) |
| `HEADLESS_VERIFY_DELIVERY_IDLE_MS` | opt | server | worker | no | Proposed; verify-stream pre-`XACK` |
| `HEADLESS_VERIFY_CLAIM_LEASE_MS` | opt | server | both | no | Proposed; verify-stream post-claim |

### Worker

| Variable | Req? | Public? | Side | Secret? | Notes |
|----------|----------|---------|------|---------|-------|
| `DATABASE_URL` | req | server | worker | yes | Same logical DB, staging/prod separated |
| `R2_*` | req | server | worker | mixed | Same buckets as env |
| `UPSTASH_REDIS_TCP_URL` | req | server | worker | yes | Preferred for blocking Streams |
| `UPSTASH_REDIS_REST_*` | opt | server | worker | yes | Fallback non-blocking poll only |
| `HEADLESS_CHROME_PATH` | opt | server | worker | no | Container default path |
| `HEADLESS_FFMPEG_PATH` / `FFPROBE` | opt | server | worker | no | |
| `HEADLESS_PROVIDER_MAX_RSS_BYTES` | opt | server | worker | no | Capacity intersection |
| `HEADLESS_WORKER_MAX_WALL_MS` | opt | server | worker | no | |
| `HEADLESS_WORKER_AUTH_TOKEN` | req | server | worker | yes | Optional mutual auth to private ops endpoints — **not** browser |

### Shared identifiers

| Variable | Req? | Public? | Side | Secret? |
|----------|----------|---------|------|---------|
| `HEADLESS_ENV_NAME` | req | server | both | no | `local` \| `staging` \| `production` |
| `HEADLESS_RENDERER_BUILD_ID` | opt | server | both | no | Must match accepted build |

### Local / staging / production behavior

- **local:** may use memory adapters until 2A; Clerk dev instance optional.
- **staging:** all durable providers required; routes may be staging-only gated.
- **production:** kill switch default **off** until explicit opt-in; Browser Export remains default.

---

## 12. Activation and rollback contract

| Stage | Meaning | Browser Export |
|-------|---------|----------------|
| 0 | Adapters implemented but compose still blocked | Default |
| 1 | Local provider integration (dev credentials) | Default |
| 2 | Staging-only routes enabled behind auth | Default |
| 3 | Staging worker consuming staging queue | Default |
| 4 | Staging real job (short profile first, then 60s) | Default |
| 5 | Staging cancel / retry / download capability | Default |
| 6 | Production **opt-in** availability (`HEADLESS_CONTROL_PLANE_ENABLED=1` + auth) | Default |
| 7 | Production default decision (**later**, after parity evidence) | May change only after 11F |

**Kill switch:** `HEADLESS_CONTROL_PLANE_ENABLED=0` (or compose unavailable) rejects **new** creates/retries that enqueue work; status/cancel/download for existing jobs remain available; running workers finish or honor cancel — **do not** SIGKILL fleet on switch flip unless explicit incident procedure.

---

## 13. Cost and abuse controls

| Control | Initial policy |
|---------|----------------|
| Per-owner concurrency | 1 active headless job (staging); raise later |
| Queue depth | Soft cap per owner + global |
| Max active jobs | Low single-digit global for Hobby-era staging |
| Max source bytes | Existing control-plane ceilings |
| Max artifact bytes | Profile ∩ provider; 4K 60s evidence ≈ 58.5 MB as calibration |
| Duration ceiling | **60s content** until explicitly raised |
| Rate limiting | Per-owner create/retry rate on control routes |
| Storage expiry | TTL on sources + artifacts; cleanup intents |
| Retry ceiling | Existing attempt max |
| Cancellation | User cancel + worker checks |
| Quota rejection | Before Chromium (existing limit authority) |
| Billing/metering seam | Record `ownerId`, bytes, duration, profile for future metering — not billed yet |

---

## 14. Decision output summary (Phase 2.1 / 2.1A / 2.1B)

### Recommended stack (roles unchanged; integrity/queue corrected)

**Vercel (web) + Clerk (auth identity) + Neon (Postgres jobs/ownership/cleanup) + Cloudflare R2 (objects) + Upstash Redis Streams (queue with §9 protocol) + Fly.io Machines (verify + render workers).**

### Fallback stack

**Vercel + Supabase Auth/Auth.js + Postgres + AWS S3 + Amazon SQS + Railway worker** — especially if SQS visibility semantics are preferred over Streams reclaim.

### Exact unresolved user/provider decisions

1. Confirm **Clerk** vs Neon Auth vs Supabase Auth.
2. Confirm **Fly.io** vs **Railway** as first paid worker host.
3. Confirm primary **region** (pin control plane, Neon, R2, Upstash, Fly together).
4. Accept **paid worker** (+ likely paid Upstash/Neon) for sustained 4K staging.
5. Staging web: Vercel Preview vs separate project.
6. Hobby → **Pro** before commercial production traffic.
7. Optional: prefer **Neon outbox** or **SQS** over Upstash for production queue (trade-off in §9.2).
8. Optional: Design **A** upload sink vs recommended Design **B** verify-after-PUT.

### Implementation sequence (Phase 2.1A / 2.1B dependencies)

| Milestone | Scope | Create / availability |
|-----------|--------|------------------------|
| **2A / 2A.1** | Clerk session → server `ownerId` only; auth gates; env classification + fail-closed proxy/auth taxonomy | **IMPLEMENTED** — create remains CONFIGURATION_UNAVAILABLE; project auth production adapter unavailable |
| **2B Phase 1** | Provider-neutral **discriminated store** (`HeadlessProvisionalStoredJobRecord` \| `HeadlessCanonicalStoredJobRecord`) + validators + lifecycle + **Stage B promotion contract** + evolved `HeadlessJobStorePort` + memory adapter; **project ownership claim/access contract** + memory adapter; Neon-compatible SQL + CAS spec in `control-plane/migrations/` | **IMPLEMENTED (foundation only)** — no Neon SDK; no `DATABASE_URL`; routes still CONFIGURATION-BLOCKED |
| **2B.2** | Neon runtime adapter — interactive `Pool`/`Client` transactions implementing `003_headless_cas_transaction_spec.md`; project-ownership + job-store production adapters | Still unavailable until storage+queue+worker composed |
| **2C.1** | R2 owned-object + upload-capability foundation: env classifier, key authority, durable `004_headless_owned_objects.sql`, Design B verify orchestration, presign adapters (injectable), FakeS3 — **IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED** | No render enqueue; production routes still blocked; Neon accepted 29/29 (prior); Upstash/Fly still NOT STARTED |
| **2C.1A** | R2 durability + live-evidence authority: retain `004`, Neon owned-object adapter, TOCTOU revision bind, upload capability truth, coverage reconcile, gated `HEADLESS_R2_QA` harness — **IMPLEMENTED / CONFIGURATION-GATED / LIVE NOT RUN** | See `docs/HEADLESS_11E_R2_DURABILITY_EVIDENCE.md`; production routes still blocked |
| **2C** (remainder) | Authorized live R2 contact, production compose of upload/download/verify, orphan cleanup wiring | No render enqueue until Stage B promotion |
| **2D.1** | Redis/Upstash dual-lease delivery protocol with **separate pre-`XACK` and post-`XACK` recovery** (§9.1A) + DLQ (§9.1B) + FakeRedis + gated harness — **IMPLEMENTED / STAGING-ACCEPTED** (official 22/22 PASS SHA `360e059b…`) | See Upstash live evidence; Fly still NOT STARTED |
| **2D** (remainder) | Wire enqueue into create/recoverDispatch product path; full production composition | Routes still blocked until full stack |
| **2E.1** | Fly hosted-worker deployment preflight + container/runtime foundation — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E1_HOSTED_WORKER_FOUNDATION.md`; seams block consumer start; Fly deploy NOT STARTED |
| **2E.1A** | Corrections: Node 24, process-specific VMs, repo-root Dockerfile path, deterministic BUILD_INFO, `foundation_image` — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E1A_CORRECTION.md`; Fly deploy NOT STARTED |
| **2E.2A … 2E.2A.3** | Streamed R2; durable pre-upload; fail-closed delete saga; terminal cleanup dispositions (`protected`/`rejected` no-delete); Neon `005` (+ `object_id` + terminal states); storage+cleanup seams closed locally — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E2A_RENDER_STORAGE_CLEANUP.md`; foundation_image retained; no remote migration; Fly deploy NOT STARTED |
| **2E.2B** | Trusted verify→promote→enqueue under dual-lease claim; `VERIFY_PROMOTION_COMPOSITION_SEAM` closed locally — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E2B_TRUSTED_VERIFY_PROMOTION.md`; packaging still blocks consumer loop; foundation_image / not deployable; Fly deploy NOT STARTED |
| **2E.2B.1** | Signal-armed shutdown; incremental asset verify; claimed-hook catch; queued dispatch recovery — **IMPLEMENTED LOCALLY** (superseded dispatch path in 2E.2B.2) | See `docs/HEADLESS_11E_PHASE2E2B1_HOSTED_EXECUTION_CORRECTION.md` |
| **2E.2B.2** | Durable render-dispatch outbox (`006`); atomic promote+intent; outbox claim→XADD→dispatched; unified busy/shutdown — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E2B2_DURABLE_DISPATCH_OUTBOX.md`; migration 006 not applied remotely; foundation_image / not deployable; Fly deploy NOT STARTED |
| **2E.2B.3** | Outbox CAS truthfulness — exhaustive release/reject/dispatched confirmation; promotion+outbox rollback proof — **IMPLEMENTED LOCALLY** | See `docs/HEADLESS_11E_PHASE2E2B3_DISPATCH_CAS_TRUTHFULNESS.md`; packaging NOT STARTED; Fly deploy NOT STARTED |
| **2E.2** | Packaging + authorized Fly staging deploy + hosted worker-loop evidence | Blocked on deployable bundle / unresolved dynamic modules |
| **2F** | Full staging composition + evidence (short job then 60s) | Staging-only availability; **no partial composition reports `available`** |
| **2G** | Production opt-in kill switch (`HEADLESS_CONTROL_PLANE_ENABLED`); Browser Export remains default | |

**Rules:**

- Storage-integrity verification is resolved **before** R2-backed create-job activation can leave `CONFIGURATION_UNAVAILABLE`.
- Provisional Stage A acceptance + discriminated provisional/canonical store types are resolved in **2B Phase 1** (provider-neutral); Neon persistence + production composition remain **2B.2+** before create leaves blocked composition.
- Queue adapter must ship with complete **delivery-lease + execution-lease** recovery and DLQ protocol.
- Staging activation requires **all** of: auth, ownership, provisional+promotion store, verified storage, queue, hosted worker, download issuer.
- Partial provider composition must continue to report **configuration unavailable**.

### Estimated remaining implementation prompts

| Band | Estimate |
|------|----------|
| 2A–2E (auth → staging short job) | **~7–9** (verify path adds work vs Phase 2 estimate) |
| 2F (60s + memory evidence) | **+2–3** |
| 2G (production opt-in) | **+1–2** |
| **Total to production opt-in (not default)** | **~10–14** |

---

## 15. Phase markers

```text
SPRINT 11D LOCAL WORKER ARCHITECTURE: ACCEPTED
SPRINT 11E PHASE 2.1B PROVISIONAL RECORD AUTHORITY: ACCEPTED FOUNDATION
SPRINT 11E PHASE 2A CLERK PRINCIPAL + ROUTE AUTH: ACCEPTED FOUNDATION
SPRINT 11E PHASE 2A.1 CLERK AUTHORITY HARDENING: ACCEPTED FOUNDATION
SPRINT 11E PHASE 2B PHASE 1 PROVIDER-NEUTRAL STORE + OWNERSHIP FOUNDATION: ACCEPTED FOUNDATION
  — provisional/canonical union, validators, lifecycle, promotion contract, job-store port + memory adapter
  — project ownership claim/access contract + memory adapter
  — migrations: src/features/headless-renderer/control-plane/migrations/
  — Neon runtime adapter: IMPLEMENTED / CONFIGURATION-GATED (2B.2–2B.2B); remote migrate NOT EXECUTED in 2C.1
CLERK IDENTITY: IMPLEMENTED / FAIL-CLOSED
PROJECT OWNERSHIP: CONTRACT + SCHEMA IMPLEMENTED / PRODUCTION UNAVAILABLE UNTIL FULL STACK
SPRINT 11E PHASE 2C.1 R2 OWNED-OBJECT FOUNDATION: READY FOR REVIEW
SPRINT 11E PHASE 2C.1A R2 DURABILITY + EVIDENCE AUTHORITY: READY FOR REVIEW
NEON DURABLE DATABASE AUTHORITY: ACCEPTED (29/29; evidence SHA 68b1f142…e22c8fb)
NEON OWNED-OBJECT ADAPTER: IMPLEMENTED / NOT LIVE-TESTED
R2 LIVE HARNESS: IMPLEMENTED / NOT RUN (gate-off NOT_TESTED)
MIGRATION 004: NOT APPLIED REMOTELY (executable IDs 000/001/002/004; 003 markdown)
R2 ADAPTER: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
TRUSTED FULL-OBJECT VERIFICATION: LOCALLY VERIFIED (TOCTOU revision bind)
SPRINT 11E PHASE 2D.1 UPSTASH DUAL-LEASE QUEUE FOUNDATION: READY FOR REVIEW
UPSTASH DUAL-LEASE PROTOCOL: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
FLY WORKER: NOT STARTED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: PRODUCTION DEFAULT
NO COMMIT / NO PUSH
```

## 16. Official source index

| Topic | URL | Accessed |
|-------|-----|----------|
| Vercel Functions limits (Fluid) | https://vercel.com/docs/functions/limitations | 2026-07-19 |
| Vercel platform Limits (non-Fluid duration) | https://vercel.com/docs/limits | 2026-07-19 |
| Vercel Hobby plan | https://vercel.com/docs/plans/hobby | 2026-07-19 |
| Vercel max duration | https://vercel.com/docs/functions/configuring-functions/duration | 2026-07-19 |
| Vercel Fluid compute | https://vercel.com/docs/fluid-compute | 2026-07-19 |
| Vercel Cron usage | https://vercel.com/docs/cron-jobs/usage-and-pricing | 2026-07-19 |
| Clerk pricing | https://clerk.com/pricing | 2026-07-19 |
| Neon pricing | https://neon.tech/pricing | 2026-07-19 |
| Cloudflare R2 pricing | https://developers.cloudflare.com/r2/pricing/ | 2026-07-19 |
| Cloudflare R2 limits | https://developers.cloudflare.com/r2/platform/limits/ | 2026-07-19 |
| Cloudflare R2 S3 API / checksum types | https://developers.cloudflare.com/r2/api/s3/api/ | 2026-07-19 |
| Cloudflare R2 presigned URLs | https://developers.cloudflare.com/r2/api/s3/presigned-urls/ | 2026-07-19 |
| Cloudflare R2 Workers API | https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ | 2026-07-19 |
| Upstash Redis pricing | https://upstash.com/pricing/redis | 2026-07-19 |
| Upstash REST API (Streams non-blocking) | https://upstash.com/docs/redis/features/restapi | 2026-07-19 |
| Upstash consistency | https://upstash.com/docs/redis/features/consistency | 2026-07-19 |
| Upstash global database | https://upstash.com/docs/redis/features/globaldatabase | 2026-07-19 |
| Fly.io free trial | https://fly.io/docs/about/free-trial/ | 2026-07-19 |
| Fly.io pricing | https://fly.io/docs/about/pricing/ | 2026-07-19 |
| Railway plans | https://docs.railway.com/pricing/plans | 2026-07-19 |
| Supabase pricing | https://supabase.com/pricing | 2026-07-19 |
| Supabase database size | https://supabase.com/docs/guides/platform/database-size | 2026-07-19 |
