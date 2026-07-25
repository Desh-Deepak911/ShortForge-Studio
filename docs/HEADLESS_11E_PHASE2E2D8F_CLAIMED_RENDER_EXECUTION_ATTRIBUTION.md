# Sprint 11E Phase 2E.2D.8F — Claimed render execution attribution

## Problem

Official render live matrix FAIL at `hosted.render_claim` (`6ba33aed…`) because the
render worker claimed and terminalized in ~300 ms — faster than the harness polling
interval. The generic `terminalized_render_failure` log action masked the exact
execution substage and durable `terminal_reason.reasonId`.

## Durable failure code audit

When `mapClaimedRenderToHostedResult` emits `terminalized_render_failure`, the
hosted worker previously logged only `action=terminalized_render_failure` with
`reasonId=render_terminalized_failure` — **not** the underlying worker reason.

The executor's `ClaimedRenderExecutionResult.reasonId` carries the durable code
(e.g. `WORKER_FAILED`, `UNSUPPORTED_CAPABILITY`, `WORKER_TIMEOUT`) written via
`terminalize()` into `canonical_job.terminal_reason.reasonId`. The hosted mapper
now forwards that `reasonId` and attaches `executionAttribution` with the exact
`executionSubstage`.

## Execution substages (frozen allowlist)

1. `claimed_delivery_received`
2. `durable_claim_reread`
3. `claim_coherence`
4. `render_request_materialization`
5. `source_binding_resolution`
6. `storage_resolution`
7. `workspace_prepare`
8. `chromium_preflight`
9. `chromium_launch`
10. `page_execution`
11. `ffmpeg_preflight`
12. `ffmpeg_execution`
13. `artifact_upload`
14. `artifact_finalize`
15. `succeeded_cas`
16. `terminal_failure_cas`
17. `cleanup`

## Worker vs harness

**Both required:**

- **Worker-runtime telemetry** (changes worker bundle): emits safe `facts` on
  `hosted.loop.delivery` after execution via `executionAttributionToSafeTelemetryFacts`.
- **Harness observation**: `claim-correlation-authority.ts` for `hosted.render_claim`;
  `buildAttributionFromTerminalJob` for execution-case FAIL attribution from Neon +
  correlated telemetry.

## Targeted probe

```bash
HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE=1 npm run test:headless-fly-render-execution-probe
```

Separate evidence: `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md` — never overwrites
official matrix evidence.

## Authority tests

```bash
npm run test:headless-fly-render-execution-probe-authority
```
