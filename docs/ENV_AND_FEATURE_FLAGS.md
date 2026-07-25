# Environment Variables and Feature Flags

Tracking ledger for ShortForge Studio runtime gates.
**Never record secret values here.**

| Variable / flag | Public or server-only | Owner / module | Introduced sprint | Default behavior | `.env.local` action required | Restart required | Current state | Removal / freeze condition |
|-----------------|----------------------|----------------|-------------------|------------------|------------------------------|------------------|---------------|----------------------------|
| *(none active for multi-image or intra-scene transitions)* | — | Scene Media Timeline + intra-scene transition editor metadata | — | Always on (no gate) | None for Sprint 9A | No | **Default** — no env flag for Sprint 9 | — |

## Sprint 11A / 11A.1 / 11B / 11B.1 / 11B.1A / 11C / 11C.1 / 11C.1A / 11D — Headless Renderer

**11A / 11A.1:** Documentation only for architecture + user-triggered Export authority.
**11B / 11B.1 / 11B.1A:** Pure domain contracts in `src/features/headless-renderer/domain/`.
**11C / 11C.1 / 11C.1A:** Control-plane ports + owned asset-byte verification + race-safe dispatch + production/testing import isolation + configuration-blocked Route Handlers.
**11D Phase 1:** Local isolated worker uses **system** Chrome + native ffmpeg/ffprobe. Optional overrides only (never required in `.env.local` for default Homebrew/macOS Chrome paths). **No production provider selected.** Production routes remain configuration-blocked. Secrets must never use `NEXT_PUBLIC_*`.

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 11A | none | none | none | none | none | no |
| 11A.1 | none | none | none | none | none | no |
| 11B | none | none | none | none | none | no |
| 11B.1 | none | none | none | none | none | no |
| 11B.1A | none | none | none | none | none | no |
| 11C | none | none | none | none | none | no |
| 11C.1 | none | none | none | none | none | no |
| 11C.1A | none | none | none | none | none | no |
| 11D | optional `HEADLESS_CHROME_PATH`, `HEADLESS_FFMPEG_PATH`, `HEADLESS_FFPROBE_PATH` (server-only path overrides; unset = system defaults) | none | none | none | **none** (defaults resolve without `.env.local`) | no |
| 11D Phase 3 / 3.1 / 3.1A / 3.1B / 3.2 / 3.2A / 3.3 / 3.3A / **3.3A.1** | none | none | none | none | **none** — total binding validators + durable orphan cleanup intents; production routes still configuration-blocked | no |
| 11E Phase 1 / 1A | none | none | none | none | **none** — product dispatch/UI/QA orchestration; availability never inferred from env; production remains configuration-unavailable; no fake Pass via env | no |
| **11E Phase 2 / 2.1 / 2.1A / 2.1B** | none (docs) | none | none | none | decision docs only | no |
| **11E Phase 2B Phase 1** | none | none | none | none | **none** — provider-neutral store/ownership foundation + SQL/CAS spec; no Neon SDK; no `DATABASE_URL`; production routes still configuration-blocked | no |
| **11E Phase 2A / 2A.1** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | publishable public; secret server-only | web (headless routes + proxy) | secret yes | **Classified** as `unconfigured` \| `configured` \| `invalid` (`classifyClerkEnvironment`). Only `configured` (matching `pk_test_`/`sk_test_` or `pk_live_`/`sk_live_` pair, no whitespace, ≤512 chars) runs Clerk SDK. Invalid/missing → `CONFIGURATION_UNAVAILABLE` without revealing which key failed. **Do not edit `.env.local` in this phase.** | yes (dev restart after adding keys) |
| **11E Phase 2B Phase 1** | none | none | none | none | **none** — provider-neutral store/ownership foundation + SQL/CAS spec in `control-plane/migrations/`; no Neon SDK; no `DATABASE_URL` consumption; production routes still configuration-blocked | no |

**Phase 2A / 2A.1 consumed (optional until interactive auth testing):** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — classified by `classifyClerkEnvironment` (`unconfigured` / `configured` / `invalid`). Only `configured` enables Clerk SDK. Proxy passes through on unconfigured/invalid/load failure. Never log values or which key failed. Auth provider throws → `AUTHENTICATION_FAILED` / `temporarily_unavailable` (not “sign in”).

| **11E Phase 2B.2 / 2B.2A / 2B.2B** | `DATABASE_URL` (runtime, classified); `DATABASE_URL_UNPOOLED` (migrate-only); `HEADLESS_NEON_MIGRATE=1` (explicit migrate gate); `HEADLESS_NEON_QA=1` (explicit live QA gate); optional `HEADLESS_NEON_QA_PRESERVE=1` | all server-only | migrate CLI / live harness / control-plane Neon adapters when configured | yes | **Classified** — runtime Neon adapters are configuration-gated; production routes remain **CONFIGURATION-BLOCKED**. Migration URL never falls back to `DATABASE_URL`. Pooler hosts rejected for migrate. Live QA never auto-migrates. **Do not edit `.env.local` in this phase.** Remote migrate + live evidence are separate authorized operator actions. | no (unless adding keys for a later authorized pass) |

**Phase 2B.2B consumed (operator-only; not required for ordinary apps):**

- `DATABASE_URL` — runtime Neon Pool/Client CAS (`classifyHeadlessNeonEnvironment`)
- `DATABASE_URL_UNPOOLED` — direct migrate URL only (`classifyHeadlessNeonMigrationEnvironment`); refuse pooler hostnames; never used by routes
- `HEADLESS_NEON_MIGRATE=1` — required with unpooled URL for `npm run migrate:headless-neon`
- `HEADLESS_NEON_QA=1` — required with `DATABASE_URL` for `npm run test:headless-neon-live`
- `HEADLESS_NEON_QA_PRESERVE=1` — optional; retain QA rows after a gated live run

| **11E Phase 2C.1 / 2C.1A / 2C.1B** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`; `HEADLESS_R2_QA=1` (full live gate); `HEADLESS_R2_QA_TARGETED=1` (targeted minimum-chain gate); optional `HEADLESS_R2_QA_PRESERVE=1` | secrets server-only; buckets/endpoint/origins non-secret but server-only | control-plane R2 classifier + adapters when composed; live/targeted harness when gated | yes (access/secret) | **Classified** by `classifyHeadlessR2Environment`. Harnesses **never** auto-migrate and **never** use `DATABASE_URL_UNPOOLED`. Targeted evidence is separate from official live evidence. **No `.env.local` edit; no remote R2 contact in 2C.1B; production routes remain CONFIGURATION-BLOCKED.** | no |

**Phase 2C.1 / 2C.1A / 2C.1B consumed (classification + gated live/targeted — do not edit `.env.local` in this phase):**

- `R2_ACCOUNT_ID` — Cloudflare account id (≤128)
- `R2_ACCESS_KEY_ID` — R2 access key id (≤256)
- `R2_SECRET_ACCESS_KEY` — R2 secret (≤256); never logged/returned
- `R2_BUCKET_ASSETS` / `R2_BUCKET_ARTIFACTS` — distinct DNS-style bucket names
- `R2_ENDPOINT` — HTTPS S3-compatible endpoint (≤2048)
- `HEADLESS_ALLOWED_ORIGINS` — comma-separated absolute https origins for upload CORS binding (≤4096)
- `HEADLESS_R2_QA=1` — required with `DATABASE_URL` + R2 configured for `npm run test:headless-r2-live`
- `HEADLESS_R2_QA_TARGETED=1` — required with `DATABASE_URL` + R2 configured for `npm run test:headless-r2-targeted` (minimum chain; stop-on-first-failure; writes `docs/HEADLESS_11E_R2_TARGETED_EVIDENCE.md` only)
- `HEADLESS_R2_QA_PRESERVE=1` — optional; retain QA rows after a gated live or targeted run

| **11E Phase 2D.1 … / 2D.1H.1** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_TCP_URL`, `HEADLESS_ENV_NAME`; optional lease ms knobs; `HEADLESS_UPSTASH_QA=1`; optional `HEADLESS_UPSTASH_QA_PRESERVE=1`; targeted QA probe gates | REST/TCP secrets server/worker-only; env name + leases non-secret but server-only | control-plane producer classifier + optional REST producer when Clerk+Neon+Upstash configured; TCP consumer under `worker/` only; live + progressive harnesses when gated | yes (REST token / TCP URL password) | **Upstash staging-accepted** — official LIVE 22/22 PASS SHA `360e059b…`; progressive PASS `8b6a0fde…`; concurrency PASS `76f3d7c4…`. No `.env.local` edit. Routes CONFIGURATION-BLOCKED. | no |
| **11E Phase 2E.1 / 2E.1A** | Hosted worker: `HEADLESS_WORKER_MODE`, `HEADLESS_ENV_NAME` (`staging`\|`production`), `DATABASE_URL`, R2 2C vars, `UPSTASH_REDIS_TCP_URL`, binary paths, `HEADLESS_RENDERER_BUILD_ID`, optional concurrency/shutdown/isolation; `HEADLESS_HOSTED_IMAGE_CLASS=foundation_image` | all worker/server-only; **no** Clerk / Vercel / `NEXT_PUBLIC_*` / Upstash REST in worker | `worker/hosted` classifier + composition + entrypoint; Fly secrets **proposed only**; image **Node 24** + `foundation_image` | yes (DB/R2/TCP) | **Classified** by `classifyHeadlessHostedWorkerEnvironment`. `canStartConsumerLoop=false`. Fly deploy **NOT STARTED**. No `.env.local` edit; no secrets set; no Fly auth. Routes CONFIGURATION-BLOCKED. See [HEADLESS_11E_PHASE2E1A_CORRECTION.md](./HEADLESS_11E_PHASE2E1A_CORRECTION.md). | yes (worker process / container) |
| **11E Phase 2E.2A … 2E.2A.3** | Same hosted env vars; local `005` (+ `object_id`, terminal `protected`/`rejected`) + streamed R2 + durable pre-upload + delete saga + terminal cleanup disposition | worker/server-only | `deleteArtifactUnderDurableAuthority`, `resolveWithoutDelete`, cleanup adapters, owned-object store, migration 005 | yes (local only) | Storage + cleanup seams **closed locally**. See [HEADLESS_11E_PHASE2E2A_RENDER_STORAGE_CLEANUP.md](./HEADLESS_11E_PHASE2E2A_RENDER_STORAGE_CLEANUP.md). | yes (worker) |
| **11E Phase 2E.2B** | Same hosted env vars; trusted verify→promote→enqueue composition under dual-lease claim | worker/server-only | `executeTrustedVerifyPromotion`, `verifyAndFinalizeR2OwnedObjectUnderClaim`, `materializeCanonicalFromFinalizedCoverage` | no | Verify promotion seam **closed locally**. Packaging still blocks `canStartConsumerLoop`. `foundation_image` / `deployable=false`. **No** Fly deploy or route activation. See [HEADLESS_11E_PHASE2E2B_TRUSTED_VERIFY_PROMOTION.md](./HEADLESS_11E_PHASE2E2B_TRUSTED_VERIFY_PROMOTION.md). | yes (worker) |
| **11E Phase 2E.2B.1** | Same hosted env vars; signal-armed shutdown; incremental asset verify; queued dispatch recovery | worker/server-only | `createHostedShutdownLifecycle`, `verifyFinalizedOwnedObjectStream`, `recoverQueuedRenderDispatchesOnce` | no | Hosted execution correction **local only**. Packaging still blocks loop. `foundation_image` / `deployable=false`. See [HEADLESS_11E_PHASE2E2B1_HOSTED_EXECUTION_CORRECTION.md](./HEADLESS_11E_PHASE2E2B1_HOSTED_EXECUTION_CORRECTION.md). | yes (worker) |
| **11E Phase 2E.2B.2** | Same hosted env vars; durable render-dispatch outbox + unified busy/shutdown | worker/server-only | `headless_render_dispatch_outbox` (006), `dispatchRenderOutboxOnce`, `ensureDispatchIntentForQueuedJob`, Neon/memory outbox adapters | yes (local only) | Durable outbox **local only**. Packaging still blocks loop. `foundation_image` / `deployable=false`. Migration 006 **not** applied remotely. See [HEADLESS_11E_PHASE2E2B2_DURABLE_DISPATCH_OUTBOX.md](./HEADLESS_11E_PHASE2E2B2_DURABLE_DISPATCH_OUTBOX.md). | yes (worker) |
| **11E Phase 2E.2B.3** | Same hosted env vars; outbox CAS truthfulness | worker/server-only | `dispatchRenderOutboxIntentOnce` exhaustive CAS outcomes | no | CAS truthfulness **local only**. Packaging not started. See [HEADLESS_11E_PHASE2E2B3_DISPATCH_CAS_TRUTHFULNESS.md](./HEADLESS_11E_PHASE2E2B3_DISPATCH_CAS_TRUTHFULNESS.md). | yes (worker) |
| **11E Phase 2E.2D.4 / 2E.2D.5C / 2E.2D.5E / 2E.2D.6E / 2E.2D.6G** | Fly staging deploy authority (local): canonical verify-first orchestrator `scripts/fly-staging/fly-staging-verify-first.sh`; no `.tmp` wrappers; dry-run fixture mode; app-name rule `shortforge-hw-staging-<suffix>`; public `[env]` pins; Fly secret **names** + bounded **deployment status**; verify-first needs `HEADLESS_FLY_STAGING_IMAGE_REF`; at most one `fly secrets deploy` when staged/partial | worker/server-only; **no** Clerk / Vercel / `NEXT_PUBLIC_*` / Upstash REST; `HEADLESS_WORKER_MODE` process-command only | `worker/hosted/fly-staging/*`; `scripts/fly-staging/*` (fail-closed); staging + verify-first templates | yes (names/status only; values via 0600 bridge later) | **Local authority only.** Zero-consumer = exact Machine list + local config; **forbids** pre-first `fly scale` / `fly config show`. Staged exact-nine valid pre-first Machine but **never** runtime-ready. Runtime requires deployed ledger + worker log proof. See [2E.2D.4](./HEADLESS_11E_PHASE2E2D4_FLY_STAGING_DEPLOYMENT_AUTHORITY.md), [2E.2D.6G](./HEADLESS_11E_PHASE2E2D6G_FLY_STAGING_CANONICAL_VERIFY_FIRST_ORCHESTRATOR.md). | yes (operator gates / worker) |

**Phase 2D.1 consumed (classification + gated live — do not edit `.env.local` in this phase):**

- `UPSTASH_REDIS_REST_URL` — HTTPS Upstash REST endpoint (web producer)
- `UPSTASH_REDIS_REST_TOKEN` — REST token; never logged/returned
- `UPSTASH_REDIS_TCP_URL` — `rediss://` TLS Redis URL (worker consumer only)
- `HEADLESS_ENV_NAME` — exact `local` \| `staging` \| `production` (stream name authority)
- Optional lease ms knobs (safe-integer bounds; defaults 90s / 30m / 90s / 10m)
- `HEADLESS_UPSTASH_QA=1` — required with `DATABASE_URL` + REST+TCP + `HEADLESS_ENV_NAME=staging` for `npm run test:headless-upstash-live`
- `HEADLESS_UPSTASH_QA_ENQUEUE_PROBE=1` — required with `DATABASE_URL` + REST+TCP + `HEADLESS_ENV_NAME=staging` for `npm run test:headless-upstash-enqueue-probe` (writes `docs/HEADLESS_11E_UPSTASH_ENQUEUE_PROBE.md` only; never overwrites official live evidence)
- `HEADLESS_UPSTASH_QA_TERMINAL_PROBE=1` — required with `DATABASE_URL` + REST+TCP + `HEADLESS_ENV_NAME=staging` for `npm run test:headless-upstash-terminal-probe` (writes `docs/HEADLESS_11E_UPSTASH_TERMINAL_PROBE.md` only; never overwrites official live evidence). PASS SHA `efb22955…` preserved.
- `HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE=1` — required with `DATABASE_URL` + REST+TCP + `HEADLESS_ENV_NAME=staging` for `npm run test:headless-upstash-claim-ack-probe` (writes `docs/HEADLESS_11E_UPSTASH_CLAIM_ACK_PROBE.md` only; never overwrites progressive/official evidence). PASS SHA `74fc6c23…` preserved.
- `HEADLESS_UPSTASH_QA_DLQ_PROBE=1` — required with `DATABASE_URL` + REST+TCP + `HEADLESS_ENV_NAME=staging` for `npm run test:headless-upstash-dlq-probe` (writes `docs/HEADLESS_11E_UPSTASH_DLQ_PROBE.md` only; never overwrites progressive/official evidence). PASS SHA `c448d9e2…` preserved.
- `HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE=1` — concurrency probe PASS SHA `76f3d7c4…` preserved.
- `HEADLESS_UPSTASH_QA_PROGRESSIVE=1` — progressive PASS SHA `8b6a0fde…` preserved.
- `HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER=<required case id>` — optional progressive stop-after for diagnosis (full-matrix PASS ineligible when set)
- Official Upstash LIVE evidence PASS SHA `360e059b…` — **staging-accepted**

**Phase 2E.1 consumed (hosted worker classifier — do not edit `.env.local`; do not set Fly secrets):**

- `HEADLESS_WORKER_MODE` — exact `verify` \| `render` (hosted opt-in)
- `HEADLESS_ENV_NAME` — hosted requires `staging` \| `production` (rejects `local`)
- Binary path overrides + `HEADLESS_RENDERER_BUILD_ID` (exact worker build id)
- Optional `HEADLESS_WORKER_CONCURRENCY` (render must be `1`), `HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS`, `HEADLESS_ALLOW_NO_SANDBOX_WITH_EXTERNAL_ISOLATION=0|1`
- Proposed Fly secrets listed in [HEADLESS_11E_PHASE2E1_HOSTED_WORKER_FOUNDATION.md](./HEADLESS_11E_PHASE2E1_HOSTED_WORKER_FOUNDATION.md) — **not set**

**Phase 2E.2D.4 / 2E.2D.5C consumed (Fly staging deployment authority — local only; do not edit `.env.local`; do not create Fly apps):**

- Public/non-secret Fly `[env]` pins — see `HEADLESS_FLY_STAGING_PUBLIC_ENV` (includes `HEADLESS_ENV_NAME=staging`, exact renderer build id, concurrency `1`, graceful shutdown ms, `HEADLESS_HOSTED_IMAGE_CLASS=deployable_worker`)
- `HEADLESS_WORKER_MODE` — **not** in Fly `[env]`; supplied only by process group commands `verify` / `render`
- Fly secret **names** (values not stored in repo): `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`, `UPSTASH_REDIS_TCP_URL`
- Forbidden on workers: `UPSTASH_REDIS_REST_*`, `CLERK_*`, `VERCEL_*`, `NEXT_PUBLIC_*`, `DATABASE_URL_UNPOOLED`
- Future operator gates (default blocked): `HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1` plus per-gate `HEADLESS_FLY_STAGING_AUTHORIZE_*` — **unset unless separately authorized**
- Future verify/render activation also needs `HEADLESS_FLY_STAGING_IMAGE_REF` (immutable registry ref including digest) — **not set in 2E.2D.5C**
- Zero-consumer success uses exact Machine list + local materialized config; do **not** treat Launch `fly scale count/show` or `fly config show` as pre-first-deploy authority
- Zero-consumer region authority is `configured_local_not_remotely_observed`; remote `iad` observation waits for separately authorized verify-first Machine status

**Phase 2E.2D.7A consumed (hosted Fly verifier live evidence — gate-off default):**

- `HEADLESS_FLY_VERIFY_QA=1` — required with canonical **eleven-key** QA bridge secrets + `HEADLESS_ENV_NAME=staging` + `HEADLESS_FLY_STAGING_APP_NAME=shortforge-hw-staging-4def8fa0` for `npm run test:headless-fly-verify-live` (writes `docs/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md` only; never overwrites verify-first PASS evidence)
- `HEADLESS_FLY_RENDER_QA=1` — separate gate for `npm run test:headless-fly-render-live` (writes `docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md`; never activates render Machines; requires `verify=1/render=1` topology from separately authorized render activation)
- `HEADLESS_FLY_RENDER_QA_PRESERVE=1` — optional; skip cleanup while retaining render live evidence
- **Eleven-key QA bridge (exact membership):** `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_TCP_URL` — **`R2_ALLOWED_ORIGINS` is forbidden** (use `HEADLESS_ALLOWED_ORIGINS` only)
- Gate-on exercises production Neon, R2, Upstash REST, and Upstash TCP classifiers before provider contact; evidence may include safe aggregate attribution (`neon_status`, `r2_status`, `upstash_rest_status`, `upstash_tcp_status`, `env_name_status`, `app_name_status`) — never secret values or per-key failure hints
- Authority: [HEADLESS_11E_PHASE2E2D7A1_FLY_VERIFY_LIVE_ENVIRONMENT_CONTRACT.md](./HEADLESS_11E_PHASE2E2D7A1_FLY_VERIFY_LIVE_ENVIRONMENT_CONTRACT.md)
- **Phase 2E.2D.7A.2:** `pollHostedVerifierState` is read-only (never calls `reconcileFinalizedOwnedObjectCoverage`); gate-on cleanup runs in harness `finally`; separate recovery gate `HEADLESS_FLY_VERIFY_QA_CLEANUP_RECOVERY=1` — authority: [HEADLESS_11E_PHASE2E2D7A2_FLY_VERIFY_OBSERVATION_AUTHORITY.md](./HEADLESS_11E_PHASE2E2D7A2_FLY_VERIFY_OBSERVATION_AUTHORITY.md)
- `HEADLESS_FLY_VERIFY_QA_PRESERVE=1` — optional; skip cleanup while retaining evidence
- Gate-off → `NOT_TESTED` / exit 0 / zero Neon, R2, Upstash, or Fly connections; preserves prior PASS/FAIL live evidence
- Harness uses production shared staging verify stream; hosted Fly verifier is sole consumer; never stops/redeploys the verify Machine
- Fly secret **deployment status** (from `fly secrets list --json`, names only): `staged` valid pre-first Machine but **never** runtime-ready; verify-first runs at most one `fly secrets deploy` when staged/partial; runtime requires aggregate `deployed` plus worker log proof (`hosted.schema.preflight` PASS + `hosted.loop.started`) — never infer from names alone, image deploy, Machine creation, or local preflight
- Rollback destroy uses `fly machine destroy -a <app> --force <ID>` (never `-y`); provider rollback failure remains unconfirmed
- Optional lease ms knobs remain non-secret defaults (not required Fly secrets)

### Phase 2G — staging website Export integration

The website control plane is fail-closed and preview/staging-only. It becomes
available only when all provider classifiers pass, `HEADLESS_ENV_NAME=staging`,
`HEADLESS_CONTROL_PLANE_ENABLED=1`, and the deployment is not a Vercel
production deployment. The browser never receives provider credentials,
durable object locators, or the renderer build identity.

Configure these values on the **staging/preview website environment only**:

- Public: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Server-only: `CLERK_SECRET_KEY`, `DATABASE_URL`
- Server-only R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`,
  `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`
- Server-only Upstash producer: `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`
- Non-secret server gates: `HEADLESS_ENV_NAME=staging`,
  `HEADLESS_CONTROL_PLANE_ENABLED=1`

`HEADLESS_ALLOWED_ORIGINS` must include the exact public staging website origin
and the R2 bucket CORS policy must allow that origin to `PUT` the signed upload
headers. Do not place `UPSTASH_REDIS_TCP_URL`, `HEADLESS_WORKER_MODE`, Fly
operator gates, `DATABASE_URL_UNPOOLED`, or any secret in `NEXT_PUBLIC_*` on
the website deployment. The Fly verify/render workers remain separately
deployed and consume the staging streams.

For an external manual tester, the staging URL must also be reachable without
requiring Fly, Neon, R2, or Upstash access. If Vercel Deployment Protection is
enabled, grant the tester preview access or use the approved bypass mechanism;
do not share provider credentials.

**`.env.local` action:** not edited in Phase 2D.1H. Official LIVE_EVIDENCE preserved unmodified (`f2f38dc…`). Progressive FAIL preserved (`482dfb11…`); claim/ACK PASS (`74fc6c23…`); DLQ PASS (`c448d9e2…`); concurrency probe / progressive / official not rerun. Browser Export does not require Upstash keys.

## Sprint 10E / 10E.1 — Retention Narrative Composer + Hook Bridge

No new environment variable or feature flag. No temporary public gate.

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 10E | none | none | none | none | none | no |
| 10E.1 | none | none | none | none | none | no |
| 10E.1A | none | none | none | none | none | no |

`.env.local` action: **none**. Restart: **no**, unless ordinary TypeScript module refresh requires it.

## Sprint 10F / 10F.3 / 10F.3A / 10F.3B / 10G / 10G.1 / 10G.1A / 10H — Retention Validator + Production + Explainability UI + Golden QA

No new **production** environment variable or feature flag. Production narration uses existing `OPENAI_API_KEY` + `OPENAI_SCRIPT_MODEL` / quality-mode model selection. No temporary public gate. Call-kind-aware `max_output_tokens`, safe Hook diagnostics authority, Story Strategy selection, and Retention persistence validators are derived/validated in-process (no env).

**QA-only live gate (not a production feature flag; not required in `.env.local`):**

| Variable | Public or server-only | Owner | Default | `.env.local` action | Restart | Notes |
|----------|----------------------|-------|---------|---------------------|---------|-------|
| `RETENTION_LIVE_QA` | server/QA process | Sprint 10H / 10H.1A live harness | unset / off | **none** (export in shell when running live QA) | **yes** if testing against a running `npm run dev` | `=1` enables core live cases; otherwise Not tested / exit 0; does not overwrite completed live-results |
| `QA_BASE_URL` | server/QA process | Sprint 10H / 10H.1A live harness | unset | **none** | n/a | Required when `RETENTION_LIVE_QA=1` |
| `RETENTION_LIVE_AUDIO_FIRST` | server/QA process | Sprint 10H / 10H.1A live harness | unset / off | **none** | n/a | When `=1`, audio-first is **Core-required** for eligibility; when unset, audio-first is **capability-gated Not tested** (never “optional Pass”) |

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 10F | none | none | none | none | none | no |
| 10F.1 | none | none | none | none | none | no |
| 10F.1A | none | none | none | none | none | no |
| 10F.1B | none | none | none | none | none | no |
| 10F.1C | none | none | none | none | none | no |
| 10F.2 | none | none | none | none | none | no |
| 10F.2A | none | none | none | none | none | no |
| 10F.3 | none | none | none | none | none | **yes** (dev server — narration path changed) |
| 10F.3A | none | none | none | none | none | **yes** (dev server — commit gate / failure envelopes / token budgets) |
| 10F.3B | none | none | none | none | none | **yes** (dev server — safe Hook diagnostics terminal coherence) |
| 10G | none | none | none | none | none | **yes** (dev server — Story Strategy + Review explainability) |
| 10G.1 | none | none | none | none | none | **yes** (dev server — persistence + explainability authority) |
| 10G.1A | none | none | none | none | none | **yes** (dev server — total persistence validator exception boundary) |
| 10H | QA-only `RETENTION_LIVE_QA` / `QA_BASE_URL` (not production) | none | none | none | **none** | **yes** for live/local Create paths against `npm run dev` |
| 10H.1 / 10H.1A | same QA-only gates; terminal-coherent success assertion + evidence preservation | none | none | none | **none** | **yes** for live/local Create paths against `npm run dev` |
| 10H.2–10H.5C | same QA-only gates; live remediation, universal reliability, final 13/13 live + local sign-off | none | none | none | **none** | **yes** only when running live/local evidence against `npm run dev` |

`.env.local` action: **none**. Restart: **yes** for a running `npm run dev` when exercising live or local Create/Review sign-off.

## Sprint 9A / 9B / 9C / 9D

No environment variable or feature flag. Intra-scene transition editor metadata, Preview, ExportManifest v3 / `"9C"`, and Sprint 9D QA harnesses are always available (no gate).

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 9A | none | none | none | none | none | none |
| 9B | none | none | none | none | none | none |
| 9C | none | none | none | none | none | none |
| 9C.1 | none | none | none | none | none | none |
| 9D | none | none | none | none | none | none |
| 9D.1 | none | none | none | none | none | none |
| 9D.2 | none | none | none | none | none | none |
| 9D.3 | none | none | none | none | none | none |

`.env.local` action: **none** (assuming the retired Sprint 8 multi-image variable has already been removed).

Restart: **no** special environment restart required.

Sprint 9 freeze (9D.3): no env or feature-flag change. Intra-scene transitions remain ungated.

Dev QA: `/dev/intra-scene-transition-qa` (production-gated; not a product feature).

## Sprint 8 post-freeze operator action (historical)

```text
Remove NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=1 from .env.local after Sprint 8E.3 lands, then restart the development server.
```

Do **not** commit `.env.local`. Multi-image scenes no longer require an environment flag.

Open `/dev/scene-media-qa` for local Preview / export regression if needed (development only).

## Retired-flag ledger

| Variable / flag | Introduced | Retired | Reason |
|-----------------|------------|---------|--------|
| `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` | Sprint 8B | Sprint 8E.3 | Local Preview, 720p WebM, manual editor, and deterministic QA all passed; multi-image became default |

## Related

- Architecture index: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md)
- Module: `src/features/scene-media-timeline/`
- Intra-scene transitions: `src/features/scene-media-transitions/` · [INTRA_SCENE_TRANSITIONS.md](./INTRA_SCENE_TRANSITIONS.md)
- UI: `src/features/timeline-editor/scene-media/`
- Freeze: [qa/scene-media-sprint-8-freeze.md](./qa/scene-media-sprint-8-freeze.md) · [qa/intra-scene-transition-sprint-9-freeze.md](./qa/intra-scene-transition-sprint-9-freeze.md)
- Verify: `npm run test:scene-media-sprint` · `npm run test:intra-scene-transition-sprint`
