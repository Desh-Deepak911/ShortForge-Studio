# Sprint 11E Phase 2E.2B.2 — Durable Render-Dispatch Outbox

**Status:** IMPLEMENTED LOCALLY  
**Branch:** `feature/sprint-11-headless-renderer`  
**Remote migration 006:** NOT APPLIED  
**Migration 005 checksum (unchanged):**  
`59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d`  
**Migration 006 SHA-256:**  
`960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1`  
**Fly deployment:** NOT RUN  
**Commit/push:** NOT DONE (this phase)

## Corrections

1. **Durable dispatch outbox** — migration `006_headless_render_dispatch_outbox.sql` adds `public.headless_render_dispatch_outbox` with immutable `(jobId, attempt)` / `deliveryId` identity and private states `pending | claimed | dispatched | rejected`. No URLs, secrets, payload bodies, or storage locators.
2. **Atomic promotion boundary** — provisional→canonical promotion persists the queued job and a pending dispatch intent in one transaction (memory + Neon). Failed promotion creates no outbox row; exact replay converges; forged replay cannot alter intent.
3. **Outbox dispatch worker** — replaces periodic raw queued-job XADD sweeps. Claim due → authoritative job reread → validate → XADD → durable `dispatched`. Once dispatched, periodic sweeps never XADD again. Post-XADD / pre-CAS → `dispatch_unconfirmed`.
4. **Unified busy / shutdown** — graceful deadline arms if claimed verify/render execution **or** dispatch-outbox sweep / startup dispatch is active. First signal stops intake and new dispatch claims; both drain under one deadline; provider hang cannot block forever (bounded drain).
5. **PostgreSQL authority** — schema-qualified `public.*`; BIGINT via `parseHeadlessPgSafeInteger` / `…OrNull` (not `Number(...)`).

## Authority verdict

| Item | Status |
|------|--------|
| Functional render / cleanup / verify / promotion / dispatch-recovery seams | CLOSED locally |
| `canStartConsumerLoop` | false (packaging) |
| Image | `foundation_image`, `deployable=false` |
| Migration 006 | NOT applied remotely |
| Fly deploy | FORBIDDEN this phase |

## Suites

- `npm run test:headless-render-dispatch-outbox-sql-schema`
- `npm run test:headless-render-dispatch-outbox-2e2b2` (26 fixtures)
