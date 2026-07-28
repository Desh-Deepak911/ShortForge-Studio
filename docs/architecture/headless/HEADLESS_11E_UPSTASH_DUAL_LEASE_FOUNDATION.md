# Sprint 11E Phase 2D.1 — Upstash Dual-Lease Queue Foundation

**Branch:** `feature/sprint-11-headless-renderer`  
**Status:** IMPLEMENTED / CONFIGURATION-GATED / LIVE HARNESS REAL / OFFICIAL LIVE FAIL ARCHIVED / 2D.1H.1 BOUNDED CONCURRENCY LOCK SCOPES IMPLEMENTATION ONLY / TARGETED CONCURRENCY PROBE NOT RERUN / PROGRESSIVE PASS PRESERVED / OFFICIAL FAIL PRESERVED / CLAIM-ACK PROBE PASS / DLQ PROBE PASS  
**Date basis:** 2026-07-21  

## Verdict

Provider-neutral dual-lease Streams protocol is implemented with:

- Upstash REST producer (web enqueue: `XADD` + `XTRIM` only)
- Upstash TCP consumer (worker-only: `XREADGROUP` / `XAUTOCLAIM` / `XACK` / DLQ)
- Neon post-`XACK` execution claim recovery (new delivery identity)
- Deterministic FakeRedis + memory stream adapter suites
- Gated live harness (`HEADLESS_UPSTASH_QA=1`) — **REAL runners** (no stub `pass()` matrix)
- Progressive diagnostic harness (`HEADLESS_UPSTASH_QA_PROGRESSIVE=1`) — PASS preserved (`de133fb2…`); **NOT RERUN** in 2D.1H.1

### Phase 2D.1H.1 — bounded concurrency lock scopes (current)

**2D.1H.1 (implementation only — no provider contact; evidence files not rewritten):** Official FAIL at `concurrency.no.steal` with opaque `queue_lock_lost` is attributed to the prior single long-held QA lock spanning Neon remote work under the fixed 20s local safe deadline (accepted local mechanism; Redis ownership may still be valid). Fix: Scope A holds the lock only for cursor snapshot + two REST XADDs + two exact production reads, then compare-token release; Neon concurrent consume runs unlocked on bound deliveries; FinA/FinB each acquire a fresh lock. Finer lock reason IDs (deadline vs ownership vs release lost/failed) scoped by stage. TTL/deadline constants unchanged. Deterministic: `test:headless-upstash-concurrency-lock-scope-authority`. Preserved: progressive PASS `de133fb2…`; concurrency PASS `de2801d3…`; official FAIL `1d760fce…`.

### Phase 2D.1H — real duplicate-delivery concurrency authority (prior)

**2D.1H (preserved):** Two distinct REST XADD entries; concurrent Neon claim race; one `claimed_and_acked` + peer `acked_duplicate_live`. Targeted concurrency probe PASS `de2801d3…`.

### Phase 2D.1G.1 — DLQ ACK truthfulness (prior)

**2D.1G.1 (preserved):** Malformed consume must not return complete DLQ success when source ACK is unconfirmed. Outcomes: `dlq_acked` vs `dlq_written_ack_pending`. Attribution marks `source_ack` only from ACK success + exact pending=false.

### Phase 2D.1G — run-scoped DLQ routing + attribution (prior)

**2D.1G (preserved):** Root cause of progressive `dlq.malformed` FAIL: group-bound `moveToDlq` delegated to `tcpConsumer.moveToDlq` (shared staging DLQ) while lookup used run-scoped DLQ. Fix: QA-only `createQaRunScopedTcpDlqWriter` + explicit `dlqAuthority`. Malformed source enqueue via REST XADD. Targeted probe `HEADLESS_UPSTASH_QA_DLQ_PROBE=1` (**NOT RUN**).

### Phase 2D.1F.1 — REST transport + exact cleanup authority (prior)

**2D.1F.1 (preserved):** Run-scoped enqueue uses QA-only REST XADD (+ best-effort XTRIM) on validated bindings — never TCP `qaXaddRaw`. Evidence splits `enqueueTransport=rest_xadd` vs `consumeTransport=tcp_production_protocol`. Exact `EXISTS` key probe; cleanup requires authoritative DEL + EXISTS false. Deterministic: `npm run test:headless-upstash-run-scoped-rest-cleanup-authority` (12/12).

### Phase 2D.1F — run-scoped remote queue isolation (prior)

**2D.1F (preserved):** QA-only run-scoped remote streams `hfq:qa-run:v1:{kind}:{env}:{runDigest}` with production-protocol worker groups (`hfq:render-workers` / `hfq:verify-workers`). Evidence: `streamAuthority=qa_run_scoped`, `groupAuthority=production_protocol`. Harness wrappers only — production barrels closed. Cleanup deletes exact run-owned keys/groups; never mutates shared `hfq:render:staging`. Deterministic: `npm run test:headless-upstash-run-scoped-remote-queue-isolation` (11/11).

### Phase 2D.1E.3 — exact group-presence authority (prior)

**2D.1E.3 (preserved):** Result-bearing `qaXinfoGroups` returns `{ ok:true, groups }` or `{ ok:false, reasonId:"group_probe_failed" }`. Never encodes provider/malformed/unconfigured failure as `[]`. `interpretXinfoGroupsResponse` / `interpretGroupPresence` validate bounded names, stream IDs, pending/consumer counts. Migrated: finalize replay/destroy, QA group create + cursor snapshot, isolation preconditions, cleanup. Deterministic: `npm run test:headless-upstash-exact-group-presence-authority` (12/12); finalize-commit suite remains 28/28 (stream+pending+group probe failures covered).

### Phase 2D.1E.2 — atomic tracking + replay authority (prior)

**2D.1E.2 (preserved):** Single synchronous `commitCaseFinalizationTracking` moves stream + QA group active→finalized together (or neither); preflight before lock release + revalidate after `deleted`; no await between validation and mutation; DLQ untrack only after combined commit. Exact replay validates authority shape without a live lock (`none`/`qa`/`production` group rules) then requires exact-once finalized tracking, remote stream/pending/QA absence, and QA finalized-exactly-once. Deterministic: `npm run test:headless-upstash-finalize-commit-authority` (28/28).

### Phase 2D.1E.1 — finalization commit authority (prior)

**2D.1E.1 (preserved):** Fail-closed commit for `finalizeIsolatedCaseDelivery`: ownership confirm before session ACK / XDEL / QA-group destroy; compare-token release at final boundary — only `deleted` authorizes tracking commit; `lost` → `queue_lock_lost`; `error` → `queue_lock_release_failed`. Coherence: `qa`/`production` require sessionGroup+lockHandle; `none` requires sessionGroup null.

### Phase 2D.1E — case-local stream lifecycle authority (prior)

**2D.1E (preserved):** Harness self-obstruction root cause: PASSING cases left run-owned unread/pending entries that blocked later production-group preconditions. Fix: `finalizeIsolatedCaseDelivery` / `finalizeUnreadRunOwnedEntry` — case-local ACK disposition, exact pending probe, XDEL + exact `XRANGE id id COUNT 1` presence probe, QA-group destroy (never production), lock release, monotonic active→finalized tracking. Immediate finalization on every minting DEFAULT case (no cross-case handoff). Tracking split: `runOwnedActiveStreamIds` / `caseFinalizedStreamIds` / `observedForeignStreamIds` / `activeQaGroups` / `finalizedQaGroups`. Production `consume.claim.ack` uses attributed stages + `prior_run_entry_not_finalized` / `queue_precondition_not_isolated`. Global cleanup clears **active** only and verifies finalized remain absent. Deterministic: `npm run test:headless-upstash-case-local-lifecycle-authority` (13/13). Targeted probe (gated, blocked on review): `HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE=1` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_CLAIM_ACK_PROBE.md`.

### Phase 2D.1D.2 — exact pending-entry authority (prior)

**2D.1D.2 (preserved):** Result-bearing `qaProbePending` / `qaProbePendingInGroup` use exact Redis `XPENDING <stream> <group> <streamId> <streamId> 1`. Distinguishes confirmed absent (`ok: true, pending: false`) from probe failure (`ok: false, reasonId: "pending_probe_failed"`). Never maps exceptions to absent. ACK PASS requires exact pre-probe pending true → XACK count > 0 → exact post-probe pending false. `left_pending` requires confirmed pending true. Cleanup fails when any exact probe cannot complete; never infers clean from XDEL alone. Legacy `qaIsPending*` remain deprecated fail-closed booleans and are not used by official evidence authority. Deterministic suite: `npm run test:headless-upstash-exact-pending-authority` (15/15).

### Phase 2D.1D.1 — group-bound queue mutation authority (prior)

**2D.1D.1 (preserved):** `bindStreamQueue()` / terminal consume wrappers use `createGroupBoundStreamQueue`. Session `groupAuthority` fully owns read/ack/autoClaimIdle/pending:

| Authority | Allowed ops | Forbidden |
|-----------|-------------|-----------|
| `production` | production `readGroup` / `ack` / `autoClaimIdle`; pending on production worker group | QA-only helpers for mutation |
| `qa` | `qaXreadGroupInGroup` / `qaXackInGroup` / `qaAutoClaimIdleInGroup`; pending on case QA group | production `readGroup` / `ack` / `autoClaimIdle` / `qaXack` |

`moveToDlq` remains stream-level; subsequent ACK is session-group-bound. XACK count/result → `cpOk` only when the expected entry was actually acknowledged; zero ACK fails closed. Deterministic suite: `npm run test:headless-upstash-group-bound-queue-authority` (11/11).

### Phase 2D.1D — universal live delivery isolation (prior)

**2D.1D (preserved):** Every delivery-acquiring DEFAULT matrix case uses case-scoped delivery authority (`acquireIsolatedCaseDelivery` / attributed helpers). QA consumer groups are named `hfq:qa:{kind}:{sha256(runId||caseId||kind)[:32]}` (full run + case identity; not 8-char prefix). BUSYGROUP fails closed. Successful XADD → `trackRunOwnedStreamId` only. Exact expected `streamId` + identity validation after provider-backed next-unread precondition and single count=1 group read. Compare-token lock release. Observed foreign IDs never cleaned.

**Production vs QA evidence map:**

| Proof | Case / path |
|-------|-------------|
| Production worker-group ACK + pending clear | `consume.claim.ack` (`groupAuthority: "production"`, group `hfq:render-workers`) |
| QA-isolated ACK / pending / autoclaim | `read.group`, terminal, duplicate, leave, autoclaim, recover.*, dlq, concurrency |
| Do **not** claim QA ACK proves production pending removal | terminal / duplicate / leave / progressive notes |

**Duplicate-live attribution:** `runAttributedDuplicateLiveConsume` stages (`queued_job_seed` … `cleanup`) with allowlisted reason IDs; maps to `CONSUME_DUPLICATE_FAILED` + `failureReasonId`.

**Audit:** `docs/architecture/headless/HEADLESS_11E_UPSTASH_MATRIX_DELIVERY_AUDIT.md`  
**Progressive evidence:** `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_PROGRESSIVE_DIAGNOSTIC.md` (initialized NOT_TESTED)  
**Official LIVE_EVIDENCE SHA (byte-preserved):** `f2f38dc16218868853c4f1d64c49a0981307790bd3e3762cf0c5ab30137d11f4`  
**Terminal probe SHA (byte-preserved):** `efb229552e1e40b4aa1f5c2511860633694682d220e53753842a228788b993fc`  
**Enqueue probe SHA (byte-preserved):** `645aa426d0dc23e029cafa2fb8e56f3a33291efde9dd8791f40dfe98e96a7285`

### Phase 2D.1C.3 — live deadline clock authority (prior)

**2D.1C.3 clock authority (preserved):** Local safe deadline (20s) uses an injected `QaLockClock`. Live/production default is monotonic `performance.now()` elapsed time — never frozen `ctx.nowMs`. Redis TTL remains server-side. Deterministic suites inject `createFakeQaLockClock`. Targeted terminal probe remains **BLOCKED ON REVIEW**.

### Phase 2D.1C.2 — QA lock ownership authority (prior)

Official remote matrix prefix-FAIL preserved at:

- `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md` SHA-256 `f2f38dc16218868853c4f1d64c49a0981307790bd3e3762cf0c5ab30137d11f4`
- Prior archives retained under `docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.*.md`
- Targeted enqueue probe PASS (unchanged): `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_ENQUEUE_PROBE.md` SHA-256 `645aa426d0dc23e029cafa2fb8e56f3a33291efde9dd8791f40dfe98e96a7285`
- Targeted terminal probe (unchanged bytes): `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_TERMINAL_PROBE.md` SHA-256 `efb229552e1e40b4aa1f5c2511860633694682d220e53753842a228788b993fc`

**Official FAIL boundary (archived; not rerun in 2D.1D):** prefix-FAIL evidence preserved byte-for-byte; do not overwrite during deterministic/progressive work.

**Corrected root-cause wording:** `XREADGROUP … >` does **not** return previously pending entries. The original defect was an **uncorrelated first-item read** of an undelivered shared-stream entry (or concurrent delivery) without matching `deliveryId` / `jobId` / `ownerId` / `attempt` / enqueue `streamId`. Remote evidence did **not** prove which source produced the unrelated item. The 2D.1C scan-loop remediation was itself unsafe: it assigned undelivered foreign entries to the QA consumer via repeated `XREADGROUP >` and cleanup deleted those foreign IDs.

**2D.1C.1 isolation (preserved / generalized in 2D.1D):** QA-only isolated consumer group on the **same** staging stream (created with `$`); fail-closed next-unread precondition before a single count=1 `XREADGROUP`; run-owned stream ID tracking only; cleanup never XACK/XDEL foreign IDs; may DESTROY only QA-owned groups. Production worker groups are never SETID/DESTROY’d. 2D.1D names groups from full `runId` + `caseId` + kind.

**2D.1C.2 lock authority (preserved):** Exclusivity lock `hfq:qa-lock:render:{env}` uses an unguessable ownership token (`randomUUID`) with Redis lease TTL 30s and local safe deadline 20s. Acquire via `SET NX PX`. Renew and release are atomic Lua `EVAL` compare-and-renew / compare-and-delete only — never unconditional `DEL`, never GET-then-DEL/PEXPIRE. Checkpoints renew/confirm ownership before queue precondition, before `XREADGROUP`, and before terminal ACK; lock loss fails closed with `queue_lock_lost` and never reads/ACKs/deletes/mutates shared queue state. Release via compare-and-delete; provider release failure cannot yield overall PASS (`queue_lock_release_failed`). Successor safety: expired lease + successor acquire → original finally cannot delete successor’s lock.

**Terminal ACK wording:** Terminal probe reads/clears delivery through the QA-isolated consumer group. `consume.claim.ack` already proves production consumer-group ACK. Do **not** claim the terminal probe independently proves production-group pending removal. Terminal ACK semantics remain `acked_noop_terminal` with zero `claimQueuedJob`. Targeted terminal probe **PASS** (SHA `efb22955…`); progressive diagnostic is the next authorized remote step — not another official matrix yet.

### Phase 2D.1B — enqueue attribution + fixture identity (prior)

Prior official FAIL at `enqueue.render` archived at SHA `5fd9030…e82f77` (fixture `projectId`/fingerprint mismatch). Fixed in 2D.1B; subsequent authorized rerun advanced the official FAIL to `consume.terminal.noop` (SHA `83ec48b…` above).

`productionAvailable` / `canCreateJob` remain **false**. Production routes stay **CONFIGURATION-BLOCKED**. Browser Export remains the production default.

## Protocol stamp

`HEADLESS_QUEUE_PROTOCOL_VERSION = "hfq-dual-lease-v1"`

## Dual leases (frozen)

| Lease | Scope | Default | Recovery |
|-------|-------|---------|----------|
| `deliveryIdleMs` | Pre-`XACK` Redis pending | 90s | `XPENDING` + `XAUTOCLAIM` |
| `renderClaimMs` | Post-Neon `claimQueuedJob` | 30 min | `recoverExpiredClaim` → new job/delivery → `enqueueRender` |
| `verifyDeliveryIdleMs` | Pre-`XACK` verify pending | 90s | `XAUTOCLAIM` on verify stream |
| `verifyClaimMs` | Post verify claim | 10 min | release + new `dlv:verify:…` → `enqueueVerify` |

**Forbidden:** treating `XAUTOCLAIM` as recovery for already-`XACK`ed execution.

**Consume rules (frozen):**

- Live Neon claim within lease → `XACK` duplicate (no steal).
- Expired Neon render claim (token present, lease elapsed) → leave Redis pending; recovery is `recoverExpiredClaimAndRequeue` (new delivery), never reclaim via `claimQueuedJob`.
- Expired verify claim → `acquireVerificationClaim` may reclaim under verify lease authority.
- Durable claim success + Redis `XACK` failure → winner still executes; peer may duplicate-`XACK` the pending entry.

## Stream names (server-derived only)

From `HEADLESS_ENV_NAME` ∈ `{local,staging,production}`:

- `hfq:render:{env}` / `hfq:render-dlq:{env}` / group `hfq:render-workers`
- `hfq:verify:{env}` / `hfq:verify-dlq:{env}` / group `hfq:verify-workers`

## Env classification (no network)

| Role | Keys | Status |
|------|------|--------|
| Producer (web) | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` + `HEADLESS_ENV_NAME` | HTTPS REST only; partial → invalid |
| Consumer (worker) | `UPSTASH_REDIS_TCP_URL` + `HEADLESS_ENV_NAME` | `rediss://` only |
| Leases (optional) | `HEADLESS_REDIS_DELIVERY_IDLE_MS`, `HEADLESS_RENDER_CLAIM_LEASE_MS`, `HEADLESS_VERIFY_DELIVERY_IDLE_MS`, `HEADLESS_VERIFY_CLAIM_LEASE_MS` | safe-integer bounds |

Secrets are never logged or returned from classifiers.

## Composition

`composeProductionHeadlessControlPlane`:

- Classifies Upstash producer; exposes `upstashProducerConfigured` / `upstashProducerEnvironmentStatus`
- Optionally constructs REST producer when Clerk + Neon + Upstash producer are configured
- **Never** constructs TCP consumer in web compose
- Overall availability remains blocked

## Import boundary

| Package | Allowed |
|---------|---------|
| `@upstash/redis` | `control-plane/adapters/*` only |
| `ioredis` | `worker/**` only |
| FakeRedis / REST / TCP adapters | Not in production barrel |

Production barrel exports: classifiers, stream names, validators, delivery IDs, protocol types, dual-lease pure functions, `UnavailableUpstashRestQueueProducerAdapter`.

## Live harness (Phase 2D.1A)

- Gate: `HEADLESS_UPSTASH_QA=1`
- Requires: `DATABASE_URL` + Upstash REST+TCP + `HEADLESS_ENV_NAME=staging`
- Never migrates; never uses `DATABASE_URL_UNPOOLED`
- Stub refusal: `assertDefaultUpstashLiveRunnersAreNotStubs()` runs **before** Neon/Upstash contact; does **not** overwrite existing evidence on local refusal
- Schema preflight required before Upstash adapter construction
- Matrix **stops on first FAIL**; remaining required cases recorded as `NOT_TESTED`
- Cleanup: tracked Redis (`XACK`/`XDEL`/`DELCONSUMER`) + Neon rows; PASS requires `cleanupStatus` ∈ `{ok,preserved}` (rejects `skipped` / `failed` / `not_run`)
- Evidence: `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md` — **official FAIL archived** (SHA `f2f38dc…`). Do not overwrite during deterministic/progressive/probe work (use temp paths).
- PASS authority: actual preflight fingerprint for Neon `000/001/002/004` + protocol `hfq-dual-lease-v1` + exact 22-case membership + cleanup + privacy scan
- QA autoclaim timing: harness uses `minIdleMs: 0` or `qaIdleMs` / FakeRedis `testingSetPendingIdleMs` only; **production** `deliveryIdleMs` defaults unchanged
- Targeted enqueue probe: `HEADLESS_UPSTASH_QA_ENQUEUE_PROBE=1` → `npm run test:headless-upstash-enqueue-probe` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_ENQUEUE_PROBE.md` (PASS SHA `645aa426…`)
- Targeted terminal probe: `HEADLESS_UPSTASH_QA_TERMINAL_PROBE=1` → `npm run test:headless-upstash-terminal-probe` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_TERMINAL_PROBE.md` (PASS SHA `efb22955…`)
- Targeted claim/ACK probe: `HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE=1` → `npm run test:headless-upstash-claim-ack-probe` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_CLAIM_ACK_PROBE.md` (PASS SHA `74fc6c23…` preserved)
- Targeted DLQ probe: `HEADLESS_UPSTASH_QA_DLQ_PROBE=1` → `npm run test:headless-upstash-dlq-probe` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_DLQ_PROBE.md` (PASS SHA `c448d9e2…` preserved)
- Targeted concurrency probe: `HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE=1` → `npm run test:headless-upstash-concurrency-probe` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_CONCURRENCY_PROBE.md` (**NOT RUN** in 2D.1H)
- Progressive diagnostic: `HEADLESS_UPSTASH_QA_PROGRESSIVE=1` → `npm run test:headless-upstash-progressive` → `docs/evidence/headless/current/HEADLESS_11E_UPSTASH_PROGRESSIVE_DIAGNOSTIC.md` (FAIL SHA `482dfb11…` preserved; **NOT RERUN** in 2D.1H)
- Deterministic isolation suites: `npm run test:headless-upstash-delivery-isolation`, `npm run test:headless-upstash-matrix-delivery-isolation`
- Deterministic group-bound queue authority: `npm run test:headless-upstash-group-bound-queue-authority`
- Deterministic exact pending authority: `npm run test:headless-upstash-exact-pending-authority`
- Deterministic case-local lifecycle authority: `npm run test:headless-upstash-case-local-lifecycle-authority`
- Deterministic finalization commit authority: `npm run test:headless-upstash-finalize-commit-authority`
- Deterministic exact group-presence authority: `npm run test:headless-upstash-exact-group-presence-authority`
- Deterministic run-scoped remote queue isolation: `npm run test:headless-upstash-run-scoped-remote-queue-isolation`
- Deterministic run-scoped REST + cleanup authority: `npm run test:headless-upstash-run-scoped-rest-cleanup-authority`
- Deterministic duplicate-delivery concurrency authority: `npm run test:headless-upstash-duplicate-delivery-concurrency-authority`
- Deterministic concurrency probe authority: `npm run test:headless-upstash-concurrency-probe-authority`
- Deterministic lock authority suite: `npm run test:headless-upstash-qa-lock-authority`

## Prior accepted evidence (unchanged)

| Suite | Result |
|-------|--------|
| Neon live | **29/29 accepted** |
| R2 live registry | **21/21 accepted** |
| R2 targeted | **8/8 accepted** |

## Non-goals (this phase)

- No commit / push
- No `.env.local` edits
- No remote Upstash / Neon contact
- No Fly worker composition
- No production route activation

```text
SPRINT 11E PHASE 2D.1G.1 DLQ ACK TRUTHFULNESS: READY FOR REVIEW
TARGETED DLQ PROBE: NOT RUN
UPSTASH PROGRESSIVE DIAGNOSTIC: NOT RERUN
OFFICIAL UPSTASH LIVE MATRIX: NOT RERUN
NEON + R2 AUTHORITY: ACCEPTED
HOSTED FLY WORKER: NOT DEPLOYED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: PRODUCTION DEFAULT
NO COMMIT / NO PUSH
```
