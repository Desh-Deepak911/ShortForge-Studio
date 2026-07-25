# Sprint 11E Phase 2E.2A / 2E.2A.1 / 2E.2A.2 / 2E.2A.3 — Render Storage + Delete Saga + Terminal Disposition

**Status:** IMPLEMENTED LOCALLY (2E.2A.3 terminal disposition correction applied)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Remote migration:** NOT APPLIED  
**Fly deployment:** NOT RUN  
**Commit/push:** NOT DONE (this phase)

## Preflight / audit (mandatory)

| Surface | Role |
|---------|------|
| `HeadlessStoragePort` | Worker-facing upload/open/finalize/delete |
| `HeadlessR2ObjectIOPort` / `R2StorageAdapter` | Lower-level R2 IO (locator + owner) |
| `R2JobBoundStorageAdapter` | Production `HeadlessStoragePort` bound to one job attempt |
| `HeadlessOwnedObjectStorePort` | **Durable** artifact identity + staging/finalize/cleanup authority |
| `HeadlessJobStorePort` | Succeeded private artifact-binding delete guard |
| `LocalHeadlessWorkerRunner` | Lease → durable staging → streamed PutObject → finalize → binding |
| Artifact-file lease | One-use local stream source; never whole-buffer upload API |
| Artifact binding | Succeeded-job opaque locator + digest/MIME/length |
| Cleanup intents | Durable Neon rows bound to `objectId` + locator + digest |
| R2 artifacts bucket | Only store role for artifact PutObject |

### Confirmed durability defect (2E.2A.1 — closed)

Process-memory alone was not durable recovery authority:

- `capabilities` / former `finalized` maps were process-local
- Artifact upload did not create a durable owned-object staging record before PutObject
- Crash after successful PutObject lost session/finalization state
- Fresh adapter could recompute the attempt-bound locator and delete a succeeded-job artifact
- `testingProtectFinalizedSucceeded` / `testingAuthorizeCleanupDelete` were not production authority

**Deterministic object-key recomputation alone is not durable recovery identity.** Durable owned-object rows (purpose=`artifact`, store=`artifacts`) are required before bytes leave the worker.

**Confirmed streamed-upload defect (2E.2A — closed):** `R2StorageAdapter.writeUploadStream` no longer accumulates `parts[]` / `concatUint8`. Production upload uses `Readable.from` + known `ContentLength`.

## Seams

| Seam | Status |
|------|--------|
| `RENDER_STORAGE_PORT_SEAM` | **CLOSED** locally — durable pre-upload identity + fail-closed delete saga |
| `ARTIFACT_CLEANUP_DURABLE_SEAM` | **CLOSED** locally — coherent cleanup + terminal protected/rejected dispositions (no poison retry) |
| `VERIFY_PROMOTION_COMPOSITION_SEAM` | **CLOSED** locally in 2E.2B — see `HEADLESS_11E_PHASE2E2B_TRUSTED_VERIFY_PROMOTION.md` |

Global:

- `imageClass: foundation_image`
- `deployable: false`
- `canStartConsumerLoop: false` (packaging/dynamic modules unresolved; verify seam open)
- Dynamic modules still external: `materialize-hosted-worker-adapters`, `hosted-worker-loop`

## Port / API (narrow)

`HeadlessStoragePort.createUploadSession` accepts trusted worker fields (not client-controlled):

- `expectedContentDigest` — **required** for `purpose: "artifact"`
- `expectedByteLength` — **required** for `purpose: "artifact"`

Local runner passes `executed.artifact.contentDigest` / `byteLength` exactly. Memory + R2 job-bound adapters fail closed without them.

Finalize metadata authority for worker upload:

- `verifiedBy: "trusted_worker_upload_stream"` — trusted streamed upload digest/length/MIME agreement
- Do **not** claim a post-upload R2 re-read (`full_object_stream`) unless that path actually ran

No public contract / ExportManifest change.

## Durable artifact lifecycle

1. Persist attempt-bound owned-object **staging** record (`createStagingRecord`) — objectId, owner/project/job/operation, purpose=`artifact`, storeId=`artifacts`, objectKey, expected digest/length/MIME, expiry, storeVersion
2. Streamed R2 PutObject (`writeUploadStream`) — only after staging exists
3. Durable **uploaded-observed** transition (`markUploadedObserved`)
4. Trusted worker stream digest/length/MIME agreement
5. Durable **finalized** owned-object record (`finalizeStagingRecord` + `trusted_worker_upload_stream`)
6. Atomic succeeded job CAS + private artifact binding (existing runner/CAS)
7. Succeeded binding becomes **deletion protection authority** via job store (not process memory)

Idempotent create:

- Exact replay → existing durable record + same object key
- Digest/length/MIME/expiry mismatch → idempotency conflict
- Changed owner/project/job/operation/attempt → distinct identity or rejection
- Concurrent duplicate create → one durable record
- No client-provided key; attempt-bound nonce is derived and stored before upload

## True streamed R2 upload

- Consumes `AsyncIterable<Uint8Array>` under Node stream backpressure
- Passes streaming body to AWS SDK / FakeS3
- Exact `ContentLength = expectedByteLength`
- No chunk array concat; no `readFile` / `transformToByteArray`
- Enforces non-zero, exact length, max ceiling, safe integers, bounded chunks, abort, iterator errors, one terminal completion
- Metrics: `chunkCount`, `peakChunkBytes` (no paths/keys)
- Short/erroring PutObject leaves durable staging cleanup candidate

## Succeeded-binding delete guard

Before deleting an artifact locator, production path runs `deleteArtifactUnderDurableAuthority`:

1. Loads + validates cleanup authority (intent or attempt-bound synthetic intent)
2. Loads durable owned-object record + owning job
3. Validates owner/project/job/attempt/locator/digest/purpose/store coherence
4. If job is `succeeded` and private binding matches locator → **reject** (survives restart)
5. Different binding → fail closed
6. Live job → reject delete of finalized artifact (staging may clean only on active upload-failure path)
7. Terminal non-success / finalized-but-unbound → cleanup may proceed
8. Provisional / missing / malformed job → fail closed

Terminal non-success cleanup is stable because canonical terminal states are immutable — a failed/cancelled/expired job cannot later become succeeded with a coherent binding.

Removed from production adapter: `testingProtectFinalizedSucceeded`, `testingAuthorizeCleanupDelete`.

## Deletion saga (2E.2A.2)

Confirmed false-success defect (closed): `deleteObject` previously deleted R2 before durable metadata CAS and could return `ok: true` while metadata remained staging/finalized; `processHeadlessArtifactCleanupOnce` authorized via locator+owner only.

Required ordering:

1. Validate intent + durable object + job coherence
2. Re-check deletion eligibility
3. CAS → `cleanup_pending` **before** external delete
4. Delete exact object bytes
5. Exact presence probe confirms **absent** (404 only; provider error ≠ absent)
6. CAS-complete/remove durable metadata
7. Complete cleanup intent only after both R2 absence and metadata completion

Saga outcomes: `completed` | `retryable` | `rejected` | `protected` | `stale` | `unconfirmed`.

### Terminal cleanup-intent dispositions (2E.2A.3)

Confirmed poison-retry defect (closed): `protected` / permanently incoherent `rejected` saga results were `failClaim`ed back to `pending`, creating infinite reclaim loops. CAS results were sometimes discarded (`void released`).

Durable intent states:

| State | Meaning |
|-------|---------|
| `pending` / `claimed` | Retryable work |
| `completed` | R2 absence + durable metadata completion confirmed (delete happened) |
| `protected` | Terminal **no-delete** — succeeded binding / protected live artifact |
| `rejected` | Terminal **no-delete** — incoherent/invalid authority |

`protected` and `rejected` are immutable, absent from `listRetryableForOwner`, unreclaimable by `claimPending`, and never imply R2 deletion. They must not be collapsed into `completed`.

CAS: `resolveWithoutDelete({ disposition: "protected" | "rejected" })` transitions only from matching `claimed` lease (owner/cleanupId/token/storeVersion); clears claim fields; records terminal state + timestamp; increments storeVersion once; exact disposition replay is idempotent (no bump); forged/mismatched disposition fails closed.

Processor matrix:

- saga `completed` → `complete` only after confirmed delete/metadata
- saga `protected` → durable `resolveWithoutDelete(protected)`
- saga `rejected` → durable `resolveWithoutDelete(rejected)`
- saga `retryable|stale|unconfirmed` → `failClaim` → pending **only** when result confirms `pending`
- Any disposition/complete/`failClaim` stale/rejected/error → bounded `unconfirmed` (never manufactured recovery)

Hosted maintenance uses `deleteArtifactUnderDurableAuthority` / `processHeadlessArtifactCleanupOnce` with per-intent ports — never a job-bound storage adapter reused across jobs. Locator possession alone never authorizes cleanup.

## Cleanup-intent coherence

Every cleanup intent binds to durable artifact identity:

- Matching owner/project/job/attempt, locator, digest, purpose/store, `objectId`, exact reason
- Intent cannot authorize delete of a succeeded coherent binding (re-check at execution)
- Successful delete transitions/removes durable artifact metadata under CAS
- Delete failure / unconfirmed keeps retryable durable authority; completed intents immutable
- Cleanup cannot be authorized from locator possession alone

## Crash / orphan matrix

| Crash point | Behavior |
|-------------|----------|
| Before durable staging | No object; no durable row; no cleanup intent |
| After staging, before PutObject | Durable staging; no R2 object; recovery via owned-object + idempotent create; cleanup candidate |
| During PutObject | Partial/absent object; staging remains; cleanup candidate |
| After PutObject, before uploaded-observed | R2 object may exist; staging; recovery can re-upload same key; cleanup candidate |
| After uploaded-observed, before finalized | Staging + observed; recovery re-session + finalize path; cleanup candidate if abandoned |
| After finalized, before succeeded CAS | Durable finalized; orphan cleanup when job authority proves non-success |
| After succeeded CAS | Binding protects delete across restart |
| Stale/cancelled/failed + staging | Cleanup may proceed |
| Stale/cancelled/failed + finalized-unbound | Cleanup may proceed |
| Live claimed job + finalized | Delete rejected |
| Stale cleanup vs succeeded binding | Delete rejected by job-binding guard |

Recovery finds artifacts from durable data without the old capability token. Live claimed jobs are not cleaned. Bounded, idempotent. No cron export trigger; cleanup maintenance may process durable candidates.

Process-memory maps may remain only for short-lived capability mechanics — **not** for existence, finalize, succeeded protection, cleanup eligibility, recovery, or idempotency.

## Migration 005

- File: `005_headless_cleanup_intents.sql`
- Preserves `000`/`001`/`002`/`004`; `003` remains non-executable CAS markdown
- Table: `public.headless_cleanup_intents`
- Additive (2E.2A.1): `object_id` column + non-empty check + index
- Checksum SHA-256: `59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d`
- Additive (2E.2A.3): terminal states `protected` / `rejected` + payload constraints + terminal index
- **Not applied remotely in this phase**

## Neon cleanup adapter

`NeonHeadlessArtifactCleanupAdapter`:

- Idempotent create + semantic conflict rejection (includes `objectId`)
- Claim/reclaim with bounded lease; at most one active claimant
- CAS complete; CAS fail → pending
- Completed immutable
- Bounded retryable list
- BIGINT string decoding + full revalidation
- Parameterized SQL + interactive transactions
- No SQL/provider leakage

## Remaining 2E.2B

- Close `VERIFY_PROMOTION_COMPOSITION_SEAM`
- Bundle adapters/loop into deployable worker image
- Then (separately, authorized): remote migration apply, Fly staging deploy

## Restrictions honored

No provider contact · no remote migration · no Fly/Docker install · no deployment · no `.env.local` · no route activation · no commit/push
