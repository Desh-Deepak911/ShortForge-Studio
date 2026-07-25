# Sprint 11E Phase 2E.2B.3 — Render-Dispatch Outbox CAS Truthfulness

**Status:** IMPLEMENTED LOCALLY  
**Branch:** `feature/sprint-11-headless-renderer`  
**Migrations 005/006:** unchanged; **not** applied remotely  
**Fly deployment:** NOT RUN  
**Packaging:** NOT STARTED  
**Commit/push:** NOT DONE (this phase)

## Correction

`dispatchRenderOutboxIntentOnce` now exhaustively checks every outbox CAS result:

| Path | Truthful outcome |
|------|------------------|
| XADD failure + confirmed `releaseWithBackoff` | `dispatch_pending` |
| XADD failure + release stale/error/rejected | `dispatch_unconfirmed` |
| Abort + confirmed release | `aborted_released` |
| Abort + unconfirmed release | `aborted_unconfirmed` |
| Job reread outage | `job_reread_failed_released` / `_unconfirmed` + safe code |
| Permanent reject | `rejected` only after confirmed reject CAS (+ exact reason) |
| XADD success + markDispatched | `dispatched` / `already_dispatched` |
| XADD success + markDispatched CAS fail | `dispatch_unconfirmed` (never release) |

Promotion + outbox insert remains atomic: SQL errors inside the outbox helper rethrow so the interactive transaction rolls back; fake executor snapshots prove durable provisional reread with zero outbox rows.

## Suite

`npm run test:headless-render-dispatch-outbox-cas-2e2b3`
