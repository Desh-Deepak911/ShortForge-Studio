# Sprint 11D Phase 3.3 — Streamed Artifact Hashing & Upload Authority

Removes whole-artifact `readFileSync → Uint8Array → writeUploadBytes` from the production worker path. Does **not** raise the 60s operational ceiling or activate production routes.

## Ownership model (explicit)

**One-use artifact-file lease**

1. `executeHeadlessRenderJob` authorizes the workspace file, probes with ffprobe, hashes incrementally, builds the domain artifact from digest + length + probe facts, and returns a one-use `HeadlessArtifactFileLease` (workspace cleanup deferred).
2. `LocalHeadlessWorkerRunner` is the sole consumer: stages `uploading`, streams chunks via `writeUploadStream`, finalizes, CAS to `succeeded`, and **always** `dispose()`s the lease in `finally`.
3. Exactly one owner may consume chunks. Dispose is idempotent. After dispose the path is gone — no use-after-dispose, no double upload.

Job lifecycle remains: `rendering → encoding → validating → uploading → succeeded`.

## Incremental hashing

`hashArtifactFileIncremental` streams the authorized file with bounded chunks, updates SHA-256, and requires `bytesHashed === authorizedLength`. Fail-closed on abort, timeout, stream error, size drift, or file identity change. Canonical digest: `sha256:<64 lowercase hex>`.

## Streamed storage port

`HeadlessStoragePort.writeUploadStream` accepts capability, expected/max byte lengths, cancellation signal, and `AsyncIterable<Uint8Array>` chunks. Enforces no zero-byte success, no overflow, exact final count, one terminal completion. `writeUploadBytes` remains for small manifests/assets only.

## What this phase proves vs remaining seams

| Proven | Remaining |
|---|---|
| Artifact validate/hash/upload without whole-file Node buffer | Hosted-provider total memory / durable storage capacity |
| 60s 4K streamed delivery (operational ceiling unchanged) | Arbitrary-duration product ceilings |

```text
SPRINT 11D PHASE 3.3 STREAMED ARTIFACT DELIVERY: READY FOR REVIEW
WHOLE-ARTIFACT NODE BUFFER: REMOVED
ARTIFACT HASH + UPLOAD: INCREMENTAL / BOUNDED
CURRENT OPERATIONAL CEILING: 60S
HOSTED PROVIDER CAPACITY: REMAINING SEAM
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
```
