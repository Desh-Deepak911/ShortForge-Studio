# Sprint 11E Phase 2E.2D.8F.1 — Telemetry image version authority

QA / deployment authority only. Extends immutable versioned Fly staging accepted-image records from two to three generations without rewriting historical evidence.

## Three-version authority (v2)

| Record ID | Lifecycle | Digest | Worker artifact | Telemetry |
|-----------|-----------|--------|-----------------|-----------|
| `pre_007_historical` | historical | `ae06963a…` | null | — |
| `post_007_pre_telemetry_historical` | historical | `28d60fb5…` | `f88f5834…` | — |
| `post_007_telemetry_current` | **current** | `9b97b63e…` | `a685ba95…` | **8F** |

Source: `src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority.ts`

## Current selection

Live verify/render readiness, activation, harness `acceptedImageDigestSha256`, and cross-bound digest matching bind to **`9b97b63e…`** (telemetry-current) with seven-migration fingerprint and migration 007 checksum `699a3565d7e1…`.

`28d60fb5…` remains **historical, not invalid** — official verify PASS, staging/finalize PASS, and render FAIL evidence stay byte-identical and validate through `validateHistoricalPost007PreTelemetryFlyLiveImageAuthority`.

## Fail-closed

- Current schema + `28d60fb5…` → `historical_lifecycle_not_current_ready`
- `9b97b63e…` + wrong worker artifact → `wrong_hosted_worker_artifact`
- Verify/render cross-digest mismatch → `cross_bound_digest_mismatch`
- Unknown digest / operator digest overrides → rejected
- Execution probe without telemetry-current render Machine image → `non_telemetry_render_image` / `missing_telemetry_capability`

## Execution probe

`claimed-render-execution-probe.ts` requires telemetry-current render Machine digest before `connectionProbe` (provider contact).

## Verification

```bash
npm run test:headless-fly-staging-versioned-image-authority
npm run test:headless-fly-render-execution-probe-authority
```

## Rollout gate

Machines remain on `28d60fb5…` until one controlled Fly image rollout deploys `9b97b63e…`.
