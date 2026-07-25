# Sprint 11E Phase 2E.2D.8A — Fly render live authority

Local-only authority for hosted render live evidence. No Fly/Neon/R2/Upstash contact during authority suites.

## Activation topology and rollback authority

**Prerequisite (read-only readiness):** `verify=1`, `render=0`, region `iad`, verify VM `shared/1CPU/2048MB`.

**Target (post activation):** `verify=1`, `render=1`, render VM `performance/4CPU/8192MB`, concurrency `1`, no public services.

**Immutable image:** both Machines must run digest `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e`.

**Activation gate (separate from QA):**

- `HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1`
- `HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP=1`

**QA gate (matrix only, never activates render):**

- `HEADLESS_FLY_RENDER_QA=1`

**Canonical orchestrator:** `scripts/fly-staging/fly-staging-render-first.sh`

- Read-only inventory before mutation
- Invokes `scripts/fly-staging/fly-staging-render-scale-up.sh`
- On activation/readiness failure: `fly_staging_orchestrator_rollback_render_only` (destroys render only, preserves verify)

## Exact live-case registry (25 cases, canonical order)

1. `env.config`
2. `fly.verify_machine_healthy`
3. `fly.render_machine_healthy`
4. `fly.immutable_image_equality`
5. `neon.schema_fingerprint`
6. `job.create_queued`
7. `dispatch_outbox.intent`
8. `upstash.enqueue_render`
9. `hosted.render_claim`
10. `redis.ack_pending_cleared`
11. `hosted.chromium_execution`
12. `hosted.ffmpeg_execution`
13. `r2.streamed_artifact_upload`
14. `owned_object.finalized`
15. `job.succeeded_cas`
16. `artifact.binding_coherence`
17. `dispatch_outbox.completed`
18. `cleanup_intent.not_retryable`
19. `artifact.download_verify`
20. `replay.idempotent`
21. `job.terminal_immutability`
22. `fly.render_still_healthy`
23. `fly.verify_still_healthy`
24. `cleanup.complete`
25. `evidence.privacy`

Command: `npm run test:headless-fly-render-live`

Evidence: `docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md`

## Smoke workload boundary

- Profile: `720p-webm-30` (not 4K)
- Content duration: `2000ms`
- Poll timeout: `180000ms`
- Does **not** claim hosted 4K capacity readiness
- Separate later gate required for hosted 4K capacity testing

## Process-tree measurement method

- Metric: `process_tree_peak_rss_bytes`
- Scope: Node coordinator + Chromium + FFmpeg + child processes (sum of `/proc`-visible RSS on Linux)
- **Not** Node `process.memoryUsage().rss` alone
- Sample interval: `250ms`
- Non-Linux local authority records `unavailableReason=non_linux_local_authority`

## Cleanup contract

- Runs in harness `finally` on PASS, FAIL, timeout, or exception
- Deletes run-owned Neon rows (jobs, owned objects, project ownership, dispatch outbox)
- Deletes run-owned R2 locators and run-owned Redis render stream entries only
- Never deletes foreign/shared staging consumer state
- Cleanup failure prevents PASS

## Schema fingerprint

Six migrations: `000/001/002/004/005/006`

## Separate remote authorization requests

**A. Render activation (`verify=1` → `verify=1/render=1`):**

- Gates: `HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1`, `HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP=1`
- Entrypoint: `scripts/fly-staging/fly-staging-render-first.sh`
- Requires verify live PASS evidence SHA `93c402510d234340cd7d21904d9c49295e88c06fb4a3709a73fc794b92769e88`

**B. One hosted render smoke matrix:**

- Gate: `HEADLESS_FLY_RENDER_QA=1` + eleven-key bridge + staging public pins
- Command: `npm run test:headless-fly-render-live`
- Requires render Machine healthy at `verify=1/render=1` on accepted image

Do not combine A and B with local implementation work.
