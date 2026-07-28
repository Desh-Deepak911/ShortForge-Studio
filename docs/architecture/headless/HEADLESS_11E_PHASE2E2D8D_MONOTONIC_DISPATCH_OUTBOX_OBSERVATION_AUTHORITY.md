# Sprint 11E Phase 2E.2D.8D — Monotonic dispatch-outbox observation authority

## Problem

Hosted render live matrix case 7 (`dispatch_outbox.intent`) previously required a
**still-pending** outbox row. With active verify/render workers sweeping dispatch
every ~15s and a ~150s job-create fixture chain, promotion could create a coherent
intent that advanced to `claimed` or `dispatched` before case 7 ran — a live race,
not a production defect.

## Monotonic state contract

Intent **existence** may be observed in any coherent durable state:

- `pending`
- `claimed`
- `dispatched`

Accepted only when the row is exactly coherent with the promoted canonical job:

- same job / owner / project / attempt
- stable delivery identity (`dlv:<jobId>:<attempt>`)
- matching private operation lineage when supplied
- valid timestamp and claim-pair ordering
- monotonic storeVersion when state advances

**Rejected:**

- missing row
- unrelated / forged row
- `rejected` or unknown state
- mismatched job / owner / attempt / delivery identity
- malformed claim pairing
- impossible storeVersion / timestamp ordering
- state regression (`dispatched` → `pending`, etc.)
- dispatched inference from job state alone

## Case semantics

| Case | Authority |
|------|-----------|
| `job.create_queued` | Captures earliest authoritative outbox observation after atomic promotion (production result + authoritative reread; tolerates monotonic transition between reads) |
| `dispatch_outbox.intent` | Proves coherent durable intent in `pending \| claimed \| dispatched`; records safe observed-state attribution |
| `dispatch_outbox.completed` | Requires durable `dispatched`; if case 7 already observed `dispatched`, verifies same identity idempotently |

## Production invariants preserved

- Active worker dispatch sweeping unchanged
- No sweep interval changes
- No QA-only outbox rows
- Atomic promotion/outbox transaction unchanged
- No worker runtime changes

## Archive

Official render FAIL archived byte-identically:

- `33728fd3aeb5ebbbff2a0118423309dfabaeef84d0cad6dc38bd69510699d3a5`
- `docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.pre-8d-dispatch-race-fail-33728fd3….md`

## Verification

```bash
npm run test:headless-fly-render-monotonic-dispatch-outbox-observation-authority
```
