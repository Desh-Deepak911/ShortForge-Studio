# Sprint 11E Phase 2E.1 — Hosted Worker Foundation

**Status:** Local implementation only. **Fly deployment: NOT STARTED.**  
**Access / docs date for Fly process groups:** 2026-07-21  

## Provider authority (staging)

| Provider | Status | Evidence |
|----------|--------|----------|
| Neon | **ACCEPTED** | Prior official live matrix |
| R2 | **ACCEPTED** | Prior official live matrix |
| Upstash | **STAGING-ACCEPTED** | Official 22/22 PASS — `docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md` SHA-256 `360e059bd04b324edc759abe1638553b2347e05edd7fe3b6365dbb24e440b11e`; progressive `8b6a0fdefbca11b299d48320c1d23236c618b4604de61a87d08640e4ea750a59`; concurrency `76f3d7c4b7b9ad326f82fbc23d10ba76deaf116d46f5d6c7c88fff427d04b3f8` |
| Fly | **NOT STARTED** | Template + container only |

Production headless routes remain **CONFIGURATION-BLOCKED**. Browser Export remains the production default.

## Topology (frozen)

One immutable worker image; two explicit runtime modes:

- `verify` — consumes **only** the verification stream
- `render` — consumes **only** the render stream

Prefer Fly **process groups** on the same app (separate Machines per group), same image:

- Official: [Run multiple process groups](https://fly.io/docs/launch/processes/) (accessed 2026-07-21)
- Official: [Multiple processes guide](https://fly.io/docs/app-guides/multiple-processes/) (accessed 2026-07-21)
- Official: [`[processes]` configuration](https://fly.io/docs/reference/configuration/#the-processes-section) (accessed 2026-07-21)

Process group commands supersede image `CMD` and do **not** replace `ENTRYPOINT` (tini → mode selector → Node).

### Authority boundaries

| Concern | Authority |
|---------|-----------|
| Queue delivery | At-least-once Upstash Streams |
| Execution / claim | Neon durable claim |
| Redis entries | Lookup hints only |
| Object bytes | R2 |
| Public HTTP render | **Forbidden** |
| Browser/Vercel Chromium/FFmpeg | **Forbidden** |
| Dual-lease identities | Unchanged (`hfq-dual-lease-v1`) |

No second job/store/queue authority model.

## Mode separation

| Mode | Stream | Stores | Execution |
|------|--------|--------|-----------|
| `render` | render only | Neon job store | Chromium + FFmpeg + R2 artifact finalize (seam-blocked in 2E.1) |
| `verify` | verify only | Neon owned-object (+ job as needed) | Trusted full-object verify → coverage reconcile → promotion (seam-blocked in 2E.1) |

Neither mode may silently consume the other stream. Mode mismatch fails before provider contact.

## Environment contract

Classifier: `classifyHeadlessHostedWorkerEnvironment` → `unconfigured` | `configured` | `invalid`.

Required for `configured` (hostile/partial/oversized/mixed → `invalid`):

- `HEADLESS_WORKER_MODE=verify|render`
- `HEADLESS_ENV_NAME=staging|production` (hosted rejects `local`)
- `DATABASE_URL`
- R2 vars frozen by 2C
- `UPSTASH_REDIS_TCP_URL` (`rediss://` only)
- `HEADLESS_CHROME_PATH`, `HEADLESS_FFMPEG_PATH`, `HEADLESS_FFPROBE_PATH` (absolute)
- `HEADLESS_RENDERER_BUILD_ID` exact match to worker build id
- Render concurrency must be `1`
- Optional graceful shutdown ms + isolation flag

Forbidden in worker env: Clerk keys, `NEXT_PUBLIC_*`, `VERCEL_*`, Upstash REST URL/token.

Never logs/returns URLs, credentials, tokens, or provider messages. Does not read `.env.local`.

### Proposed Fly secrets (documentation only — not set)

`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`, `UPSTASH_REDIS_TCP_URL`

### Proposed non-secret Fly env

`HEADLESS_WORKER_MODE` (or process CMD), `HEADLESS_ENV_NAME`, binary paths, renderer build id, concurrency, shutdown ms, optional lease knobs.

## Composition map (2E.1)

| Adapter | Render | Verify |
|---------|--------|--------|
| Neon job store | planned | planned |
| Neon owned-object store | — | planned |
| Upstash TCP consumer | planned | planned |
| R2 object IO | planned | planned |
| Chromium/FFmpeg runner via `HeadlessStoragePort` | **SEAM** | — |
| Durable cleanup intents | **SEAM** | **SEAM** |
| Trusted verify → promotion/enqueue | — | **SEAM** |

`canStartConsumerLoop` is **false** until seams close. Entrypoint validates env → binary preflight → exits `composition_seam_blocked` without provider contact.

### Unresolved seams (2E.2)

1. ~~`RENDER_STORAGE_PORT_SEAM`~~ — **CLOSED in 2E.2A.3** (durable pre-upload identity + fail-closed delete saga + streamed PutObject)
2. ~~`ARTIFACT_CLEANUP_DURABLE_SEAM`~~ — **CLOSED in 2E.2A.3** (cleanup execution + terminal protected/rejected dispositions)
3. ~~`VERIFY_PROMOTION_COMPOSITION_SEAM`~~ — **CLOSED in 2E.2B** (trusted verify → coverage → promote → enqueue)

3. `VERIFY_PROMOTION_COMPOSITION_SEAM` — worker-owned trusted verify → reconcile → promote/enqueue  

## Entrypoint lifecycle

1. Classify hosted environment (no network)  
2. Compose mode; refuse memory/fake/Next/UI imports  
3. Local binary preflight (Chromium/FFmpeg/ffprobe + VP9/H.264/Opus/AAC; default sandbox)  
4. Start blocking TCP consumer **only** when `canStartConsumerLoop`  
5. Dual-lease consume; ACK only after Neon claim authority  
6. SIGTERM/SIGINT → stop accepting; drain claimed work within graceful deadline  
7. Clean process trees / workspace / streams / timers (existing worker spawn ownership + loop abort)  
8. Non-zero exit on invalid config or fatal loop  

No cron export trigger. No public HTTP.

## Build (2E.1A)

```bash
# From repository root (footiebitz/) only
npm run build:headless-worker
```

Output:

- `dist/headless-worker/hosted-worker.js` (esbuild `target=node24`, no source maps)
- `dist/headless-worker/BUILD_INFO.json` — deterministic; **no wall-clock**; `imageClass: "foundation_image"`

Two consecutive builds must produce byte-identical SHA-256 for both files. Import-boundary verification fails the build on product/testing/Next paths. Local host Node (e.g. 23) is not hosted authority.

## Container (2E.1A)

- `deploy/headless-worker/Dockerfile` — **Node 24** bookworm-slim, tini, system Chromium + FFmpeg, fonts/libs, non-root `worker`, puppeteer-core + system Chrome  
- **imageClass=`foundation_image`** — not `deployable_worker`; consumer loop seam-blocked  
- Debian apt packages are **distro-channel**, not digest-pinned; binary/codec presence is **runtime preflight** authority  
- Chromium sandbox compatibility in-container: **NOT_TESTED** until Docker runs  
- Writable workspace under `/tmp/footiebitz-headless-worker`  
- No credentials in layers; no baked source assets/artifacts  
- No public port; no default `--no-sandbox`  

Build from **repository root** only:

```bash
docker build -f deploy/headless-worker/Dockerfile .
```

## Fly staging template (2E.1A)

`deploy/headless-worker/fly.staging.template.toml` — placeholders only. Deploy from repo root:

```bash
fly deploy -c deploy/headless-worker/fly.staging.template.toml
```

- `dockerfile = "deploy/headless-worker/Dockerfile"` (repo-relative)  
- same `foundation_image` for `verify` / `render` process groups  
- **process-specific `[[vm]]` only** (no unscoped VM for both):
  - verify: shared 1 vCPU, 2048 MB  
  - render: performance 4 vCPU, 8192 MB, concurrency 1 — **unproven** until hosted process-tree measurement  
- region placeholder; restart on-failure; `kill_signal=SIGTERM`, `kill_timeout=30`  
- no `[[services]]` / no `http_service`  
- secret injection commands: documentation only  

### Documented ops (not executed)

```text
# From repository root (footiebitz/) — never cd into deploy/headless-worker for build context

# Secrets (docs only)
fly secrets set DATABASE_URL=… UPSTASH_REDIS_TCP_URL=… R2_… -a REPLACE_WITH_STAGING_APP_NAME

# Rollback to prior image
fly releases -a REPLACE_WITH_STAGING_APP_NAME
fly deploy --image-label <prior> -a REPLACE_WITH_STAGING_APP_NAME -c deploy/headless-worker/fly.staging.template.toml

# Kill switch / scale-to-zero
fly scale count verify=0 render=0 -a REPLACE_WITH_STAGING_APP_NAME
```

See also [HEADLESS_11E_PHASE2E1A_CORRECTION.md](./HEADLESS_11E_PHASE2E1A_CORRECTION.md).

## Shutdown / recovery

- Stop accepting new deliveries on signal  
- In-flight claimed work: abort/drain per existing dual-lease + Neon claim recovery  
- Redis idle reclaim ≠ Neon claim steal  
- Stale/duplicate deliveries: `acked_duplicate_live` / terminal no-op paths unchanged  

## Resource honesty

- Local 4K 60-second render evidence exists (Node RSS only)  
- Node coordinator RSS ≠ total container memory  
- Chrome + FFmpeg + Node tree must be measured **inside** the hosted container  
- Initial staging recommendation remains conservative; validate before production  
- Operational duration remains **60 seconds**; no arbitrary-duration claim  
- No autoscaling claim until queue/claim behavior is measured  
- **No hosted 4K readiness claim in 2E.1**

## Staging deployment sequence (next authorization — 2E.2)

1. Close composition seams  
2. Install/authenticate Fly CLI (operator)  
3. Create staging app + set secrets  
4. Build+push image; deploy process groups at concurrency 1  
5. Zero-provider then gated live smoke (Neon/R2/Upstash)  
6. Measure process-tree memory  
7. Only then consider production composition  

## Exact next live authorization required

Operator authorization to:

1. Close or explicitly schedule the three composition seams  
2. Authenticate Fly and deploy the staging template (real app name + secrets)  
3. Run hosted zero-provider then provider-gated worker-loop evidence  

Until then: **FLY DEPLOYMENT: NOT STARTED**.
