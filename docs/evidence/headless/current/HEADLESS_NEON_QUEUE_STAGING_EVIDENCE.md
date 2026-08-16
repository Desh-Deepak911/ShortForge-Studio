# Neon queue staging evidence

**Status:** `PASS — authorized single-job staging path`

Observed on 2026-08-17 IST against the staging alias only. This evidence does not authorize a production cutover, Upstash removal, or Prompt 6.

## Gated sample

| Field | Value |
| --- | --- |
| Staging URL | `https://footie-bitz-staging.vercel.app` |
| Vercel deployment | `dpl_7Aokeqw6x51t9M879mxF1xei2ALG` |
| Queue provider | `neon` |
| Job ID | `9fafdf5d-cc49-4964-84ce-8dc728491017` |
| Output | 1080p high-quality WebM, 30 fps, narration enabled |
| Story | 5 scenes; frozen content duration `30,576 ms`; frozen render duration `30,976 ms` |
| Durable terminal state | `succeeded`; store version `16`; artifact binding present |
| Migration | `009_headless_verify_queued_unclaimed` |
| Migration checksum | `f9e8a0624cecea2eed90f045f442bc6530409d68b7eea0704b0d3f1084f4e5b5` |
| Fly image digest | `sha256:b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe` |
| Renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` |

No machine was started manually for this sample. Upload completion started the stopped verify machine; successful promotion dispatched one Neon outbox row; that dispatch started the stopped render machine. Both machines explicitly stopped after draining.

## Safe diagnostics

| Field | Value |
| --- | --- |
| Queue provider | `neon` |
| Provider status | `configured` |
| Env name | `staging` |
| Dual-enqueue observed | `no` — Neon verify and render providers were selected exclusively |
| Upstash commands during Neon upload-complete | `0` by provider composition and regression authority; no external Upstash command counter was sampled |

Upstash secrets and resources remained in place for rollback. No Upstash data was deleted.

## Lifecycle

| Step | Result |
| --- | --- |
| Job create (owned) | `PASS` — accepted through the signed-in staging editor |
| Asset verification (Neon claim-next, exclusive) | `PASS` — verify worker woke automatically and verified the uploaded bundle |
| Same-jobId promote after verify | `PASS` — job `9fafdf5d-cc49-4964-84ce-8dc728491017` remained the authority through promotion |
| Render wake after promote (once) | `PASS` — one outbox row reached `dispatched`; one render-machine start event observed |
| Render claim (exclusive) | `PASS` — one `claimed_context_validated` boundary at `1786911118689` |
| Progress persist | `PASS` — creator API/UI observed queued then rendering state; durable job reached store version `16` |
| Cancellation | `NOT_EXERCISED_LIVE` — covered by the Neon verify and control-plane suites |
| Retry after failure / expired lease | `NOT_EXERCISED_LIVE` — covered by queue/lease suites |
| Artifact upload | `PASS` — upload, provider finalize, canonical binding, and succeeded CAS completed |
| Artifact download (owner-scoped) | `PASS` — signed-in creator received and downloaded the finalized artifact |

## Measurements

| Metric | Value | Notes |
| --- | --- | --- |
| Render duration | `157,750 ms` | validated render claim `1786911118689` → succeeded CAS `1786911276439` |
| Queue delay | `34,744 ms` | Neon outbox queued `1786911083945` → render claim `1786911118689`; includes dispatch, machine boot, binary/schema preflight |
| Outbox dispatch latency | `19,566 ms` | queued `1786911083945` → dispatched `1786911103511` |
| End-to-end job time | `223,496 ms` | job create `1786911052892` → artifact finalized `1786911276388` |
| Neon query count | `NOT_MEASURED` | no per-job query telemetry was enabled for this run |
| Neon writes | `NOT_MEASURED` | store version reached `16`, but store version is not treated as a write counter |
| Fly running time | verify `~46,900 ms`; render `~187,700 ms` | automatic start → clean explicit stop; approximate from Fly/hosted timestamps |
| Artifact validation | `PASS` | target `30,976 ms`; artifact `30,984 ms` (`+8 ms`, tolerance `50 ms`); 1080×1920; 30 fps; VP9 + stereo Opus; `17,536,147` bytes; full decode returned zero errors |

## Concurrency and recovery

Only the single-job idle-to-idle path was exercised live. The remaining cases retain automated authority and must not be represented as live staging observations.

| Case | Result |
| --- | --- |
| Two workers, two jobs | `AUTOMATED_PASS` — durable queue/concurrency suites |
| Concurrent claim of one job | `AUTOMATED_PASS` — exactly-one-winner coverage |
| Concurrent verify claim of one object | `AUTOMATED_PASS` — `test:headless-neon-verify-queue` |
| Verify lease expiry recovery | `AUTOMATED_PASS` |
| Cancel during verify blocks promote/render | `AUTOMATED_PASS` |
| Crash / expired lease recovery | `AUTOMATED_PASS` |
| Duplicate wake | `AUTOMATED_PASS` |
| Fly start failure leaves job queued | `AUTOMATED_PASS` |
| Idle drain then explicit stop | `LIVE_PASS` — verify and render both stopped after the empty grace |
| Job during shutdown left queued | `AUTOMATED_PASS` |

## Known observation

Fly emits a pre-existing Tini warning because Tini is not PID 1 or registered as a child subreaper. It did not prevent clean render completion or idle shutdown in this run, but it remains an operational hardening item.

## Scope guard

- Production was not deployed or mutated.
- Upstash remains available for rollback.
- No Upstash code, secrets, account, stream, or data was removed.
- Prompt 6 remains unauthorized pending later production observation and explicit approval.
