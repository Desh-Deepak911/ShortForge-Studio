# Sprint 11E Phase 2D.1D — Upstash live matrix delivery audit

**Branch:** `feature/sprint-11-headless-renderer`  
**Status:** AUDIT + CASE-LOCAL LIFECYCLE (2D.1E) / CLAIM-ACK PROBE NOT RUN / PROGRESSIVE NOT RERUN / OFFICIAL NOT RERUN  


**Date basis:** 2026-07-21  

Inventory of every delivery-touching operation across the canonical 22-case registry.
**PASS authority (2D.1D):** operation must prove identity on the run-minted expected delivery
(`deliveryId` / `jobId|ownedObjectId` / `ownerId` / `attempt` / `streamId` / kind) after a
provider-backed next-unread precondition and a single count=1 group read.
**Never** scan unrelated deliveries; **never** register foreign IDs for cleanup.
QA-group pending clear does **not** prove production-group pending removal.

## Legend

| Field | Meaning |
|-------|---------|
| Group authority | `qa` = case-scoped `hfq:qa:{kind}:{digest(runId,caseId,kind)}` created at `$`; `production` = worker group with isolation precondition; `n/a` = no delivery acquire |
| Uncorrelated risk (pre-2D.1D) | Prior `read.value[0]` / multi-count find without expected streamId match |

## Case inventory

| caseId | Run-minted delivery | Expected streamId | deliveryId | owner/job | attempt | Consumer group | Expected pending owner | Allowed terminal action | Cleanup ownership | Pre-2D.1D uncorrelated first-item? |
|--------|---------------------|-------------------|------------|-----------|---------|----------------|------------------------|-------------------------|-------------------|-------------------------------------|
| `env.producer.config` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `env.consumer.config` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `env.lease.settings` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `stream.names` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `protocol.version` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `enqueue.render` | yes (XADD) | attributed streamId | seeded | owner+job | attempt | n/a (enqueue only) | n/a | n/a | run-owned streamId | no |
| `enqueue.verify` | yes (XADD) | verify streamId | seeded | owner+object | attempt | n/a | n/a | n/a | run-owned streamId | no |
| `group.create` | no | n/a | n/a | n/a | n/a | production ensure | n/a | n/a | never DESTROY production | no |
| `read.group` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | QA pending after read | identity match only | run-owned + QA group | **YES** (`read.value[0]`) |
| `consume.claim.ack` | yes | mint streamId | seeded | owner+job | attempt | **production** `hfq:render-workers` | production pending cleared | `claimed_and_acked` | run-owned; production ACK proven | **YES** |
| `consume.terminal.noop` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | QA pending cleared | `acked_noop_terminal` | run-owned + QA; **not** prod pending proof | fixed in 2D.1C.x |
| `consume.duplicate.live` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | QA pending cleared | `acked_duplicate_live` | run-owned + QA | **YES** (accidentally-pass risk) |
| `consume.leave.pending` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | QA still pending | `left_pending` | run-owned (pending ACK in cleanup) | **YES** |
| `autoclaim.idle` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | QA pending reassigned via XAUTOCLAIM-in-group | claimed streamId match | run-owned + QA | **YES** |
| `recover.render.expired` | yes (+ recovery XADD) | mint then recovery | seeded / new | owner+job | attempt | **QA** for pre-ACK; Neon recovery post-ACK | QA pending cleared; XAUTOCLAIM must miss ACK’d id | `acked_duplicate_live` then Neon `requeued` | run-owned (+ recovery job/stream) | **YES** |
| `recover.verify.expired` | yes (+ recovery) | mint then recovery | seeded / new | owner+object | attempt | **QA** verify case group | QA ACK then Neon requeue | ACK then `requeued` | run-owned verify | **YES** (`read.value[0]`) |
| `dlq.malformed` | yes (qaXaddRaw) | forged streamId | coherent missing-job dlv | owner+missing job | 1 | **QA** case group | QA then DLQ path | `dlq` | run-owned + DLQ track | **YES** (count=10 find) |
| `trim.maxlen` | yes (multi XADD) | tracked ids | seeded | owner+job | attempt | n/a (trim only) | n/a | n/a | run-owned | no |
| `concurrency.no.steal` | yes | mint streamId | seeded | owner+job | attempt | **QA** case group | one winner ACK path | exactly one `claimed_and_acked` | run-owned + QA | **YES** |
| `compose.blocked` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `neon.fingerprint` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |
| `evidence.privacy` | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no |

## Operation surface map (post-2D.1D.1)

| Operation | Cases | Bound to |
|-----------|-------|----------|
| `readGroup` / `XREADGROUP` | env cases do not; delivery acquire via `qaXreadGroupInGroup` count=1; consume port via `createGroupBoundStreamQueue` | session group only (`production` → production workers; `qa` → case QA group — never cross) |
| `autoClaimIdle` / `XAUTOCLAIM` | `autoclaim.idle`, `recover.render.expired` (negative) | session-bound: QA → `qaAutoClaimIdleInGroup`; production → production `autoClaimIdle` |
| `consumeRender` | claim/terminal/duplicate/leave/dlq/concurrency/recover.render | bound streamQueue ACK clears **session group only**; zero XACK → fail closed |
| `consumeVerify` | not a separate live case; verify recovery ACKs via QA group | QA verify group |
| pending / ACK | claim.ack (production), terminal/duplicate/leave/autoclaim/recover/dlq (QA) | exact `qaProbePending*` (`XPENDING id id 1`); `qaXackInGroup` / production `ack` by authority |
| DLQ | `dlq.malformed` | stream-level `moveToDlq`; subsequent ACK session-group-bound |

## Production vs QA evidence map

| Proof | Case | Notes |
|-------|------|-------|
| Production worker ACK + pending clear | `consume.claim.ack` | `groupAuthority: "production"`; evidence must name `hfq:render-workers` |
| QA-isolated ACK / pending clear | terminal, duplicate, leave, recover.*, dlq, concurrency, read, autoclaim | Does **not** independently prove production pending removal |
| Production groups existence | `group.create` | Never SETID/DESTROY |

## Uncorrelated first-item flags (pre-2D.1D)

All of the following assumed `read.value[0]` (or multi-count find) without proving expected identity against run-minted `streamId`. Cases that could **accidentally PASS** on a foreign undelivered entry are marked **YES** above — especially `consume.duplicate.live`.

## 2D.1D / 2D.1D.1 / 2D.1D.2 / 2D.1E remediation

- Universal `acquireIsolatedCaseDelivery` + `qaCaseGroupName(runId, caseId, kind)`
- `runAttributedDuplicateLiveConsume` stage/reason attribution
- Stub boundary rejects `read.value[0]` in `DEFAULT_UPSTASH_LIVE_CASE_RUNNERS`
- `createGroupBoundStreamQueue` — QA never mutates production PEL; production never mutates QA PEL
- Exact pending probe (`XPENDING streamId streamId 1`) for ACK / left_pending / cleanup evidence
- **2D.1E:** `finalizeIsolatedCaseDelivery` / immediate finalize on minting PASS cases; active vs finalized tracking; exact `XRANGE id id COUNT 1` stream presence; attributed `consume.claim.ack` stages; no cross-case unread/pending handoff
- Progressive FAIL SHA `1f42f396…` preserved (root cause: harness self-obstruction); official evidence not rewritten

```text
SPRINT 11E PHASE 2D.1E CASE-LOCAL STREAM LIFECYCLE: READY FOR REVIEW
TARGETED CLAIM/ACK PROBE: NOT RUN
UPSTASH PROGRESSIVE DIAGNOSTIC: NOT ELIGIBLE / NOT RERUN
OFFICIAL UPSTASH LIVE MATRIX: NOT RERUN
NO COMMIT / NO PUSH
```
