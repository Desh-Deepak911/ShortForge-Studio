# Headless Neon queue migration

**Status:** DESIGN ACCEPTED / LOCAL FOUNDATION IMPLEMENTED (Prompts 2–5.5). Prompt 6 (remove Upstash) is not authorized. Production cutover is not authorized. Staging and production observation have not passed.
**Scope:** Replace Upstash Redis Streams as the live wake/delivery broker with the existing Neon Postgres control plane. Rendering, timing, media, captions, audio, and output quality are unchanged.
**Non-goals this document does not authorize:** production cutover, deletion of Upstash data or the Upstash account, dual-enqueue of the same production job, continuous idle polling, Fly Proxy autostop during an active render.

This is an implementation authority. Product onboarding remains [PREVIEW_AND_EXPORT.md](../PREVIEW_AND_EXPORT.md). Operator entry remains [HEADLESS_OPERATIONS.md](../../operations/HEADLESS_OPERATIONS.md).

---

## 1. Why migrate

Today Neon is already the **job-state authority**. Upstash Streams is a **wake and delivery broker** on top:

1. Web/control-plane persists a canonical `queued` job (and a pending dispatch-outbox row).
2. An outbox worker `XADD`s a render or verify delivery to Upstash.
3. A Fly worker `XREADGROUP`s (block ≈ 5s), then `claimQueuedJob` on Neon, then `XACK`.
4. Crash recovery is dual-lease: Redis idle reclaim (`XAUTOCLAIM`) for pre-ACK deliveries; Neon `recoverExpiredClaim` for post-ACK execution.

That design works, but it keeps a second durable system, a blocking consumer loop while idle, and a dispatch path whose only purpose is to copy an identity Neon already stores.

The migration keeps Neon as the single durable queue. Fly starts **after** a queued job commits. Idle workers do not poll. Workers that are awake drain every eligible Neon job, then stop.

---

## 2. Guarantees that must not change

| Guarantee | Current authority | Neon-queue authority |
| --- | --- | --- |
| Job lifecycle | `HeadlessRenderJobV1` states + `applyHeadlessJobTransition` | Unchanged |
| Ownership | `owner_id` + `headless_project_ownership` first-claim | Every read/cancel/retry/download still requires authenticated owner |
| Idempotency | Unique `(owner_id, project_id, idempotency_authority_key)` | Unchanged; repeated Export returns the existing job |
| Cancellation | Owner-scoped CAS; clears `claim_token` | Unchanged; in-flight worker progress/complete must lose the CAS race |
| Retry | New attempt + new stable `deliveryId` after retryable failure | Same identities; no stream `XADD` when provider=`neon` |
| Artifact identity | R2 keys scoped to owner/project/job/attempt | Unchanged |
| Dual-lease | Redis delivery lease **and** Neon execution claim | Neon execution claim remains; Redis delivery lease exists only while provider=`upstash` |
| At-most-one live render claim | `claim_token IS NULL` CAS | Same, plus `FOR UPDATE SKIP LOCKED` claim-next |
| Verify vs render isolation | Separate streams/groups | Separate claim domains: job `claim_token` vs owned-object `verification_claim_token` |

Do not change Chromium/ffmpeg rendering, Master Timeline timing, captions, mixer, or artifact probe rules.

---

## 3. Upstash inventory (producers, consumers, commands, env, tests)

### 3.1 Runtime producers (web / control plane)

| File | Role | Commands |
| --- | --- | --- |
| `control-plane/adapters/upstash-rest-queue-producer.adapter.ts` | Staging/web REST producer | `XADD`, `XTRIM` only |
| `control-plane/adapters/unavailable-upstash-rest-queue-producer.adapter.ts` | Fail-closed stand-in | none |
| `control-plane/runtime/compose-production-control-plane.ts` | Wires REST producer when Clerk+Neon+Upstash classify `configured` and the queue-provider flag is valid | none |
| `control-plane/services/staging-owned-upload.service.ts` | After upload complete: REST `enqueueVerify` when provider=`upstash`; Neon records observation + verify wake only | via REST producer or Neon wake |
| `control-plane/services/dispatch-render-outbox.ts` | Claim outbox → `enqueueRender` or Neon wake → `markDispatched` | via stream port or wake |
| `control-plane/services/ensure-dispatch-intent-for-queued-job.ts` | Idempotent pending outbox row | none |
| `control-plane/services/recover-queued-render-dispatches.ts` | Sweep queued jobs missing a dispatched intent | via stream port |
| `control-plane/services/execute-trusted-verify-promotion.ts` | Promote + outbox + render enqueue | via stream port |
| `control-plane/services/dual-lease-recovery.ts` | Expired Neon claim → new attempt + enqueue | via stream port |

### 3.2 Runtime consumers (worker only)

| File | Role | Commands |
| --- | --- | --- |
| `worker/queue/upstash-tcp-stream-consumer.adapter.ts` | TCP consumer | `XADD`, `XGROUP CREATE`, `XREADGROUP`, `XACK`, `XAUTOCLAIM`, QA `XPENDING` / `XINFO` / `XDEL` / `XGROUP DESTROY` |
| `worker/hosted/hosted-worker-loop.ts` | Blocking consume loop (`blockMs` default 5000) | `readGroup` while accepting |
| `control-plane/services/dual-lease-render-consume.ts` | Validate → Neon `claimQueuedJob` → `XACK` | ack / DLQ |
| `control-plane/services/dual-lease-verify-consume.ts` | Same for verify claims | ack / DLQ |

### 3.3 Provider-neutral ports (keep)

| Port | Path | Keep? |
| --- | --- | --- |
| `HeadlessStreamQueuePort` | `ports/stream-queue.port.ts` | Yes, while provider=`upstash` |
| `HeadlessQueuePort` | `ports/queue.port.ts` | Yes (QA/fake drain) |
| `HeadlessJobStorePort` | `ports/job-store.port.ts` | Yes; **extend** with claim-next / renew / expired-claim list |
| `HeadlessRenderDispatchOutboxPort` | `ports/render-dispatch-outbox.port.ts` | Yes; Neon provider reuses it as **wake intent**, not `XADD` |

### 3.4 Test / memory stand-ins

- `control-plane/adapters/memory-stream-queue.adapter.ts`
- `control-plane/adapters/memory-queue.adapter.ts`
- `control-plane/testing/fake-redis-streams.ts`
- `src/verification/headless-renderer/upstash-live/**`
- `src/verification/headless-renderer/queue/headlessUpstash*.verify.ts`
- `src/verification/headless-renderer/platform/headlessUpstash*.verify.ts`

### 3.5 Stream names (trusted env only)

From `deriveHeadlessQueueStreamNames(HEADLESS_ENV_NAME)`:

- `hfq:render:{env}` / `hfq:render-dlq:{env}` / group `hfq:render-workers`
- `hfq:verify:{env}` / `hfq:verify-dlq:{env}` / group `hfq:verify-workers`

### 3.6 Environment variables (names only)

**Upstash (keep until Prompt 6):**

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `UPSTASH_REDIS_TCP_URL`
- `HEADLESS_ENV_NAME` (`local` \| `staging` \| `production`) — also used by Neon stream-name-free paths
- Optional lease knobs: delivery idle / render claim / verify idle / verify claim milliseconds
- QA gates: `HEADLESS_UPSTASH_QA`, `HEADLESS_UPSTASH_QA_PRESERVE`, enqueue/terminal/claim-ack/dlq/concurrency/progressive probe gates

**New (Prompt 5):**

- `HEADLESS_QUEUE_PROVIDER` = `upstash` \| `neon`
- Production and staging: missing or invalid → fail closed
- `HEADLESS_QUEUE_PROVIDER=neon` has **no Upstash runtime dependency** (verify and render both use Neon)
- Never dual-enqueue verify or render
- Optional `HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID` (falls back to the render Machine id)

**Fly wake (Prompt 3, server/worker only, never `NEXT_PUBLIC_*`):**

- Existing Fly secret names stay as documented in `ENV_AND_FEATURE_FLAGS.md`
- Wake adapter must not log tokens, machine API URLs with credentials, or client payloads

### 3.7 npm scripts that protect Upstash behavior

All `test:headless-upstash-*` scripts, plus dual-lease and dispatch-outbox suites that still mention `XADD`. Provider-neutral suites (`test:headless-control-plane`, `test:headless-neon-job-store`, `test:headless-dual-lease-*`, `test:headless-queue-concurrency`) stay after Prompt 6.

---

## 4. Neon fields that are reused (do not invent a second job table)

### 4.1 `public.headless_jobs` (migration `002`)

| Column / index | Reuse |
| --- | --- |
| `state`, `stage` | Queue eligibility: canonical + `queued` |
| `claim_token`, `claimed_at_ms` | Live execution lease |
| `store_version` | CAS for progress / complete / fail / cancel |
| `owner_id`, `project_id` | Ownership |
| `idempotency_authority_key` | Repeated Export |
| `canonical_job` JSONB `progress` | User-visible progress |
| `idx_headless_jobs_canonical_queued_unclaimed` | **Already** `(created_at_ms, job_id) WHERE canonical queued AND claim_token IS NULL` |
| `idx_headless_jobs_render_claim_recovery` | Expired-lease scans |
| `claimQueuedJob` | Known-id CAS claim (stream consume + tests) |
| `recoverExpiredClaim` | Fail expired live claim with `CLAIM_LEASE_EXPIRED` / retryable |
| `listCanonicalQueuedDispatchCandidates` | Recovery / wake retry listing |

**New primitives (no second queue table):**

- `claimNextQueuedJob` — short transaction, `FOR UPDATE SKIP LOCKED`, at most one winner
- `renewRenderClaim` — slide `claimed_at_ms` while `claim_token` matches (lease clock)
- `updateClaimedProgress` — claim-token-gated progress write; does not overwrite a newer lease clock
- `listExpiredRenderClaims` — bounded scan for recovery

Lease renewal updates `claimed_at_ms` and does **not** bump `store_version`, so heartbeats cannot invalidate an in-flight progress CAS. Progress writes must not reset `claimed_at_ms` to a stale client copy.

### 4.2 `public.headless_render_dispatch_outbox` (migration `006`)

States `pending | claimed | dispatched | rejected` with `delivery_id`, `claim_token`, backoff.

| Provider | Meaning of `dispatched` |
| --- | --- |
| `upstash` | Confirmed `XADD` |
| `neon` | Confirmed Fly wake (or no-op wake if a worker is already running) |

Do not dual-write the same job to both meanings. One provider per process.

Wake failure → `releaseWithBackoff`; job stays `queued` and unclaimed. Status/recovery may retry a due pending intent.

### 4.3 Owned-object verify lease (Prompt 5.5)

`verification_claim_token` / `verification_claimed_at_ms` stay the verify execution lease. Durable “verification required” is the owned-object row itself: `stage='staging'`, `uploaded_observed_at_ms` set, `verification_state='unclaimed'`, `verification_claim_token IS NULL`. There is no second verify-outbox table.

| Provider | Upload complete | Verify consume |
| --- | --- | --- |
| `upstash` | REST `enqueueVerify` per object | TCP `XREADGROUP` + existing dual-lease claim |
| `neon` | Transactional `markUploadedObserved` + one verify wake | `claimNextVerification` (`FOR UPDATE SKIP LOCKED`) + lease renew/expiry |

Never enqueue the same verification into both providers. Successful verify still promotes the **same job identity** and then uses the Neon render wake (not `XADD`). Failed verify keeps the existing safe failure/cleanup path. Cancellation remains authoritative through upload, verification, and promotion.

`renewVerificationClaim` slides `verification_claimed_at_ms` and does **not** bump `store_version`.

### 4.4 Additive migration

Migration `009_headless_verify_queued_unclaimed.sql` adds only `idx_headless_owned_objects_verify_queued_unclaimed`. Do not rewrite `002` or `004`. Remote apply is a separate authorized operator action. Rollback-bridge schema mode still treats `008`/`009` as additive and does not require them for core 000–007.

---

## 5. Event-driven runtime (no idle poll)

```text
upload complete → COMMIT observed staging objects
        ↓
  if provider=neon: wake verify Fly once (idempotent)
  if provider=upstash: XADD verify once (existing)
        ↓
verify worker → claimNextVerification until empty → grace → stop
        ↓
promote same jobId → COMMIT queued canonical (+ pending render outbox)
        ↓
  if provider=neon: wake render Fly once (idempotent)
  if provider=upstash: XADD render once (existing)
        ↓
render worker → claimNextQueuedJob until empty → grace → stop
```

Rules:

- Wake only **after** the queued-job transaction commits.
- Concurrent wakes are safe (Machines start is idempotent; outbox CAS is idempotent).
- Fly start failure leaves the job queued; outbox retries with backoff.
- Status/recovery can re-wake if the job is still queued/unclaimed and the wake intent is due or missing.
- Worker heartbeats lease ≈ every 10–15s.
- Persist user-visible progress ≈ every 3–5s or on a meaningful percent change.
- After the queue is empty for a bounded grace period, the worker **explicitly stops**. Do not rely on Fly Proxy autostop while a claim is live.
- Render concurrency per worker remains 1.

---

## 6. Atomic claim-next

Preferred SQL shape (one statement; fixture can apply it atomically):

```sql
UPDATE public.headless_jobs
SET claim_token = $1,
    claimed_at_ms = $2,
    store_version = store_version + 1
WHERE job_id = (
  SELECT job_id
  FROM public.headless_jobs
  WHERE stage = 'canonical'
    AND state = 'queued'
    AND claim_token IS NULL
    -- Prompt 4: AND owner not at active-render capacity
  ORDER BY created_at_ms ASC, job_id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
AND stage = 'canonical'
AND state = 'queued'
AND claim_token IS NULL
RETURNING /* explicit job columns */;
```

Two workers cannot both receive the same `job_id`. Empty result is a valid idle drain, not an error.

---

## 7. Crash, lease, wake, and shutdown races

| Race | Handling |
| --- | --- |
| Worker dies after claim | `recoverExpiredClaim` when `claimed_at_ms + leaseMs < now`; retryable `CLAIM_LEASE_EXPIRED`; new attempt identity |
| Worker dies before claim | Job stays queued/unclaimed; wake retry or next worker claim-next |
| Duplicate wake | Outbox already-dispatched / Machines start of a running machine → no second job |
| Fly start fails | Outbox `releaseWithBackoff`; job remains queued |
| Job arrives during shutdown | Worker stops intake, drains the current claim, then stops; leftover queued jobs stay durable; a later status/recovery wake starts another worker |
| Cancel vs complete | Owner CAS vs claim-token CAS; one winner; no invented success |
| Retry vs live claim | Rejected while lease is live |
| Duplicate Export | `createIfAbsent` / idempotency unique index → `existing` |

---

## 8. Multi-user fairness (Prompt 4)

- Default: one **active** (claimed, non-terminal) headless render per `owner_id`, configurable.
- Global worker count remains configurable; each worker still claims at most one render at a time.
- Claim-next skips owners at capacity, then FIFO by `created_at_ms` among the rest (`SKIP LOCKED`).
- A noisy user with many queued jobs cannot occupy every worker.
- Starvation test: owner A with N queued + owner B with one queued + two workers → B still claims.
- R2 object identities stay owner/project/job/attempt scoped.

---

## 9. File-by-file implementation plan

### Prompt 2 — Neon queue foundation (no Fly, no poll loop)

| File | Change |
| --- | --- |
| `docs/architecture/headless/HEADLESS_NEON_QUEUE_MIGRATION.md` | This design |
| `control-plane/ports/job-store.port.ts` | Add `claimNextQueuedJob`, `renewRenderClaim`, `updateClaimedProgress`, `listExpiredRenderClaims` |
| `control-plane/adapters/neon-job-store.adapter.ts` | Implement SQL |
| `control-plane/adapters/memory-job-store.adapter.ts` | Parity |
| `control-plane/testing/fake-sql-executor.ts` | Atomic claim-next / renew / progress / expired-list shapes |
| `control-plane/services/durable-neon-queue.ts` | Provider-neutral orchestration over the job store (enqueue = existing create/promote) |
| `control-plane/index.ts` | Export new types/service |
| `src/verification/headless-renderer/control-plane/headlessNeonDurableQueue.verify.ts` | Concurrent claim, stale worker, lease expiry, cancel race, retry |
| `package.json` | `test:headless-neon-durable-queue` |

Upstash adapters stay compiled and selected by the existing compose path.

### Prompt 3 — On-demand Fly wake and idle shutdown

| File | Change |
| --- | --- |
| `control-plane/ports/worker-wake.port.ts` | `wake()`, `stop()`, idempotent results |
| `control-plane/adapters/fly-machine-wake.adapter.ts` | Server-only Machines start/stop; never log secrets |
| `control-plane/adapters/memory-worker-wake.adapter.ts` | Tests |
| `control-plane/services/dispatch-worker-wake.ts` | After commit: claim due outbox → wake → `markDispatched` or backoff |
| `worker/hosted/neon-worker-loop.ts` | claim-next drain, heartbeat, progress throttle, idle grace, explicit stop |
| Verification | Duplicate wake, start failure, job-during-shutdown, idle-stop race |

Do not deploy.

### Prompt 4 — Fairness and capacity

| File | Change |
| --- | --- |
| `control-plane/runtime/queue-fairness.ts` | Per-owner active limit + global worker concurrency classifiers |
| `claimNextQueuedJob` | Capacity predicate + FIFO among eligible owners |
| Control-plane read/cancel/retry/download | Confirm owner checks (already present; add regression tests) |
| Verification | Multi-user, multi-project, repeated Export, two workers, starvation, noisy user |

### Prompt 5 — Staging cutover flag

| File | Change |
| --- | --- |
| `control-plane/runtime/queue-provider.ts` | `HEADLESS_QUEUE_PROVIDER`; fail closed when env is staging/production and value is missing/invalid |
| `compose-production-control-plane.ts` | Single provider; never both XADD and wake for one job |
| Safe diagnostics | Provider id + configured/unconfigured/invalid only |
| `docs/operations/ENV_AND_FEATURE_FLAGS.md` | Flag + fail-closed rules |
| `docs/operations/HEADLESS_OPERATIONS.md` | Staging cutover runbook |
| Evidence | `docs/evidence/headless/current/HEADLESS_NEON_QUEUE_STAGING_EVIDENCE.md` template; fill only after a gated staging run |

### Prompt 5.5 — Neon trusted verification (local)

Upload-complete and the verify worker use Neon when `HEADLESS_QUEUE_PROVIDER=neon`. Upstash REST/TCP stay compiled and selected only for `upstash`. Prompt 6 remains unauthorized.

### Prompt 6 — Remove Upstash (not authorized yet)

Only after Neon staging **and** production observation, and only after no recoverable Upstash jobs remain. Do not delete the Upstash account or remote stream data without an explicit later approval. Prompt 5.5 does not authorize Prompt 6.

---

## 10. Tests

| Suite | Proves |
| --- | --- |
| `test:headless-neon-durable-queue` | Claim-next exclusion, lease renew vs expiry, cancel race, retry, idempotent enqueue |
| Existing `test:headless-neon-job-store` | Create/claim-by-id/recovery still pass |
| Existing `test:headless-control-plane` | Routes still configuration-blocked; ownership unchanged |
| Existing Upstash suites | Still pass while provider=`upstash` |
| Prompt 3 suite | Wake idempotency, start failure, shutdown races |
| Prompt 4 suite | Fairness / starvation / two workers |
| Prompt 5 | Invalid provider fail-closed; no dual-enqueue |
| `test:headless-neon-verify-queue` | Neon upload-complete zero Upstash; exclusive verify claim; lease recover; cancel; idle stop |

Typecheck the touched packages. Do not apply remote Neon migrations or contact Fly/Upstash unless a later prompt with an explicit gate says so.

---

## 11. Migration strategy

1. **Foundation (local):** Neon claim-next + renew + tests. Upstash remains default in compose.
2. **Wake (local):** Fly wake adapter + neon worker loop. No deploy.
3. **Fairness (local):** Per-owner cap + tests.
4. **Staging flag:** `HEADLESS_QUEUE_PROVIDER=neon` on staging web + worker only after the suites above pass. One provider. Record evidence (render duration, queue delay, Neon query/write counts, Fly running time, artifact validation).
5. **Observe production** with the flag still `upstash` until explicitly approved.
6. **Remove Upstash runtime** only after Prompt 6 approval.

Rollback at any flagged stage: set `HEADLESS_QUEUE_PROVIDER=upstash` (requires Upstash still configured). Jobs that were only ever queued in Neon remain in Neon; do not replay them into Upstash automatically.

---

## 12. Rollback plan

| Stage | Rollback |
| --- | --- |
| Local foundation only | Revert the branch; no remote schema change |
| Additive `009` applied later | Leave the migration; it is additive. Do not rewrite checksums |
| Staging `neon` | Set provider back to `upstash`; drain in-flight Neon claims via existing recovery; do not dual-enqueue |
| Production `neon` (if ever approved) | Same flag rollback; keep Neon rows; do not delete Upstash data |
| Prompt 6 completed | Restore the previous release; Upstash env names listed in the removal note |

---

## 13. What this document forbids

- Dual-enqueue of one production job into Upstash and Neon
- Continuous `XREADGROUP` / SQL poll while no worker is supposed to be running
- Fly credentials in logs, docs, or `NEXT_PUBLIC_*`
- Changing render quality or timing
- Remote migrate, Fly deploy, or Upstash account deletion without explicit approval
