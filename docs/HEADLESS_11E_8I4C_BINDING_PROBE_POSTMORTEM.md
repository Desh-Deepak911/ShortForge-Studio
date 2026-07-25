# Sprint 11E Phase 2E.2D.8I.4C — Binding probe postmortem (sanitized)

**Status:** Separate post-run record — not official execution-probe evidence.

**Official evidence preserved unchanged**

- SHA-256: `f0b157c9535cbd8aece176b782bb7f073f4b40e9d038a0e9002eaef30d6402c2`
- Archive: `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-8i4-f0b157c9535cbd8aece176b782bb7f073f4b40e9d038a0e9002eaef30d6402c2.md`
- The 8I.4C provider run completed on staging image `cc04b6d7…`, but the evidence writer rejected the update with `failure_reason_invalid`. This document records directly observed boundary facts only; it does not rewrite official evidence.

**Staging image at probe time:** `cc04b6d7dc1591102e04970b6e91b9f45a7dad34ea67331c83065ccba2b0b2a4`

**Worker artifact at probe time:** `49ff267305c50cbe2dc7e6addb129ee7507e5be5445f2ea649e733eb057a8a67`

## Run window (orchestrator + render-machine boundary telemetry)

| Boundary | atMs (approx) |
|---|---|
| First post-rollout production boundary | rollout observation boundary from 8I.4B Fly releases (fallback `1784923931223` if release parse unavailable) |
| `frame_request_terminal` succeeded | `1784925001634` |
| `ffmpeg_process_terminal` succeeded | `1784925009xxx` |
| `artifact_upload_completed` succeeded | `1784925020xxx` |
| `owned_object_finalize_completed` succeeded (`provider_finalize`) | `1784925028xxx` |
| `artifact_binding_validation_completed` failed (`binding_coherence`) | `1784925032xxx` |
| `terminal_failure_cas_completed` succeeded | `1784925036xxx` |
| `cleanup_completed` ok | `1784925038439` |

Wall time for production path on render machine: ~37s (total orchestrator wall ~294s including poll/observation).

## Directly observed probe outcome

### Upstream boundaries — PASS (in Fly render-machine logs)

- Chromium / frame capture: succeeded through `frame_request_terminal`
- FFmpeg encode: succeeded through `ffmpeg_process_terminal`
- R2 streamed upload: `artifact_upload_completed` succeeded
- Provider finalize: `owned_object_finalize_completed` succeeded with `finalizeSubstage=provider_finalize`

### Binding validation — FAIL

- `artifact_binding_validation_completed` with `finalizeOutcomeClass=failed`, `finalizeSubstage=binding_coherence`
- Terminal attribution: `execution_substage=artifact_binding_validation`, `WORKER_FAILED`
- **No** `bindingFieldMismatchClass` / `bindingFieldMismatchAuthority` emitted in boundary telemetry (field comparison ran without a validated binding draft)

### Worker cleanup — PASS

- `cleanup_completed` with `cleanupOutcomeClass=ok` after terminal failure CAS

### Harness / evidence writer — FAIL (secondary)

- Probe chain observed terminal failure at binding validation
- Official evidence **not** updated — writer threw `failure_reason_invalid`
- Mapped reason `artifact_binding_validation_failed` was emitted by probe stage mapping but was **not** registered in `CLAIMED_RENDER_EXECUTION_REASON_IDS`
- Official evidence SHA remained `f0b157c9…` (pre-8I.4C archive)

## Stage matrix (observed attribution shape)

| Stage | Status |
|---|---|
| hosted.chromium_execution | PASS |
| hosted.ffmpeg_execution | PASS |
| r2.streamed_artifact_upload | PASS |
| owned_object.finalized | PASS |
| artifact.binding_coherence | FAIL |
| job.succeeded_cas | NOT_TESTED |
| Later stages | NOT_TESTED |

## Root cause (local diagnosis — Phase 8I.5)

Canonical R2 artifact object keys derived by `deriveHeadlessR2ObjectKey` are ~142 characters. Pre-fix `validateOpaqueLocator` applied `HEADLESS_MAX_ID_LENGTH` (128) to **both** `storeId` and `objectKey`. Production-shaped keys therefore failed binding schema validation with `storageLocator ids invalid.` before coherence comparison or field-mismatch telemetry could run.

**Mismatching field:** `storage_locator` (object key length class)

**Owning authority:** `storage_locator_authority` / R2 object-key derivation → binding validator

**Correction:** Allow object keys up to `HEADLESS_MAX_OBJECT_KEY_LENGTH` (1024, aligned with R2 key authority) while keeping `storeId` bounded at 128; emit structured field comparisons before aggregate binding failure; register `artifact_binding_validation_failed` in the canonical execution reason registry.

## Cleanup verification (8I.5 read-only)

- Master env: `/tmp/shortforge-fly-verify-qa.master.env` — mode `0600`, eleven-key membership preserved unchanged
- Run-scoped Neon/R2/Redis/outbox/cleanup-intent scan: no run-owned rows requiring mutation identified for the 8I.4C window (foreign resources preserved)
- Staging preserved: verify=1, render=1 on `cc04b6d7…`

## Evidence-writer rejection (authoritative)

The provider run is **not** recorded as an official probe PASS/FAIL in `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md` because the evidence writer fail-closed on an unregistered production reason. Phase 8I.5 repairs the allowlist without reconstructing official probe evidence from this postmortem.
