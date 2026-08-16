# Headless operations and failure investigation

This is the operator entry point. Chronological implementation authorities live under [../architecture/headless/](../architecture/headless/README.md). Evidence stays under [../evidence/headless/](../evidence/headless/README.md) and must not be moved without a path-and-SHA audit.

## What Headless is

A user-triggered export path that renders frames in Chromium and encodes with native ffmpeg. It is not the default Browser export path.

Local isolated workers resolve system Chrome and Homebrew/macOS ffmpeg paths by default. Optional overrides:

- `HEADLESS_CHROME_PATH`
- `HEADLESS_FFMPEG_PATH`
- `HEADLESS_FFPROBE_PATH`

These are server-only. Never use `NEXT_PUBLIC_*` for secrets or binary paths.

## What is not implied by “Headless exists in the repo”

- Production routes may still be **configuration-blocked**
- Fly deploy, Neon migrate, R2 live, and Upstash live are **gated operator actions**
- A passing provider-free contract test is not a hosted certification
- Hosted worker images are documented as **Node 24**; the Next.js app is not

Current Headless evidence files record **Pass** on named gated staging harnesses (for example Fly render live smoke, and separate 4K capacity vs operational-capacity records). A short 4K capacity Pass is not the same as `full capacity claim justified`. Read the specific `docs/evidence/headless/current/` file before stating a Pass. Do not treat those harnesses as an ungated production default.

## Environment classification

Clerk, Neon, R2, Upstash, and hosted-worker settings are classified (`unconfigured` / `configured` / `invalid`). Invalid or missing configuration must fail closed without revealing which secret failed.

Ordinary Studio development does not require these variables. See [ENV_AND_FEATURE_FLAGS.md](ENV_AND_FEATURE_FLAGS.md) for names and gates. Do not copy secret values into documentation.

## Failure investigation

1. Confirm whether the job was Browser or Headless.
2. For Browser issues use [EXPORT_FAILURE_FORENSICS.md](EXPORT_FAILURE_FORENSICS.md).
3. For Headless, start with [../evidence/headless/README.md](../evidence/headless/README.md) and the matching `current/` harness file.
4. Do not rerun a live harness in a way that overwrites official evidence unless the harness is designed to update that file.
5. Archive files (`*.pre-*`) are immutable snapshots.

Fly staging scripts live in `scripts/fly-staging/`. They are fail-closed operator tools, not part of `npm run dev`.

## Local worker build

```bash
npm run build:headless-worker
```

Provider-free contract checks:

```bash
npm run test:headless-render-contract
npm run test:headless-control-plane
```

## Staging cutover: Upstash → Neon queue (not production)

Job state already lives in Neon. Upstash Streams is only the wake/delivery broker. The Neon path claims queued rows with `FOR UPDATE SKIP LOCKED`, wakes the Fly Machine after the queued commit, drains, then explicitly stops. It does not poll while idle and does not rely on Fly Proxy autostop during an active render.

### Flag

Set the same explicit value on the staging website, the staging verify worker, and the staging render worker.

- `HEADLESS_QUEUE_PROVIDER=upstash` — current production-shaped path (REST XADD + TCP `XREADGROUP`) for verify and render
- `HEADLESS_QUEUE_PROVIDER=neon` — no Upstash runtime: Neon verify claim-next + Neon render claim-next + Fly wake/stop

Staging and production fail closed when the flag is missing or not exactly `upstash` / `neon`. Do not set both brokers for one job. Do not flip production without a later explicit approval.

Safe diagnostic: `headlessQueueProviderDiagnostic` returns provider id + status only. It never includes tokens.

### Staging runbook (no deploy from this page)

1. Confirm local suites: `npm run test:headless-neon-durable-queue`, `npm run test:headless-neon-queue-wake-provider`, `npm run test:headless-neon-verify-queue`, `npm run test:headless-trusted-verify-promotion`, `npm run test:headless-control-plane`, `npm run typecheck`.
2. After explicit staging-deploy approval, apply additive migration `009_headless_verify_queued_unclaimed.sql` with the existing gated migrate command. Do not apply it from this page.
3. Set `HEADLESS_QUEUE_PROVIDER=neon` on staging web + verify worker + render worker. Keep Upstash secrets in place for rollback; do not delete the Upstash account or stream data. Neon mode must not send Upstash commands.
4. Configure server-only Fly wake names (`FLY_API_TOKEN`, `HEADLESS_FLY_WAKE_APP_NAME`, `HEADLESS_FLY_WAKE_MACHINE_ID`, optional `HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID`) on web (wake) and workers (idle stop). Never log values.
5. Optional fairness: `HEADLESS_MAX_ACTIVE_RENDERS_PER_OWNER` (default 1), `HEADLESS_MAX_GLOBAL_RENDER_WORKERS` (default 2).
6. Verify one owned export: create → upload complete (zero Upstash) → trusted verify → same-jobId promote → render claim → progress → cancel/retry → artifact upload/download. Confirm ownership on every read.
7. Record measurements in [HEADLESS_NEON_QUEUE_STAGING_EVIDENCE.md](../evidence/headless/current/HEADLESS_NEON_QUEUE_STAGING_EVIDENCE.md). Do not invent a Pass.

Prompt 6 remains unauthorized until this staging run **and** production observation pass.

### Rollback

Set `HEADLESS_QUEUE_PROVIDER=upstash` on staging web + worker. Jobs that were only queued under Neon stay in Neon; do not replay them into Upstash. Drain in-flight Neon claims with the existing expired-lease recovery path.

Prompt 6 (remove Upstash runtime) is not authorized until Neon has passed staging **and** production observation.
