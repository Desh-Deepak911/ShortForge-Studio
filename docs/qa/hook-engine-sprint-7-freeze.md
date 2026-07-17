# Hook Engine Sprint 7 Freeze Evidence

**Sprint:** 7E / 7E.1–7E.6A — Golden QA, evidence truth, live safety, research coherence, Hook Style selector, Core freeze
**Generated:** 2026-07-15
**Authoritative status:** 7A–7D **accepted**; **7E complete — Core Hook system frozen**; Evidence Surprise live provider path remains capability-gated.

## Freeze verdict

```
HOOK ENGINE CORE: FROZEN

SPRINT 7E: COMPLETE — CORE HOOK SYSTEM FROZEN

EVIDENCE_SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED — LIVE SIGN-OFF PENDING
```

This is a **bounded, honest freeze**:

- Deterministic contract QA is green (including 7E.6A hardening).
- Core non-research live sign-off is **ELIGIBLE** (see [hook-core-live-model-results.md](./hook-core-live-model-results.md)).
- Deterministic Evidence Surprise safety remains frozen with the Core.
- Only the **external live-provider Evidence Surprise path** remains capability-gated pending structured eligible statistic preflight + a future research-dependent live run.
- First research-dependent live attempt evidence is **preserved** ([hook-live-model-results.md](./hook-live-model-results.md) — **NOT ELIGIBLE**; not overwritten).

---

## Evidence-class matrix

| Area | Evidence class | Result |
|------|----------------|--------|
| Strategy library (7B) | automated-semantic | Pass |
| Validator / repair (7C) | automated-semantic | Pass |
| Integration (7D–7D.3 / 7E.3) | automated-semantic + mocked-integration | Pass |
| Golden matrix | mocked-integration | Pass |
| Prompt / adversarial safety | mocked-integration | Pass |
| Evidence-surprise semantic (deterministic) | automated-semantic | Pass |
| Persistence / reload | mocked-integration | Pass |
| JSON/NDJSON streaming | mocked-integration | Pass |
| Hook Style selector (7E.6 / 7E.6A) | automated-semantic | Pass |
| Core live-model (non-research, 7E.6A) | live-model | **ELIGIBLE** |
| Research-dependent live (7E.2 first attempt) | live-model | **NOT ELIGIBLE** (preserved) |
| Evidence Surprise live provider path | live-model | **Capability-gated — pending** |
| Manual product review | manual-review | Not tested |

---

## Core live-model sign-off (Sprint 7E.6A)

Gate: `HOOK_CORE_LIVE_QA=1` (no API-Football preflight). Evidence: [hook-core-live-model-results.md](./hook-core-live-model-results.md).

| Case | Status | Strategy | Source | Path |
|------|--------|----------|--------|------|
| Auto | Pass | `cold_open` | `strategy_library` | `script_only` |
| Explicit Provocative Question | Pass | `provocative_question` | `user_selected` | `script_only` |
| Write My Own | Pass | `user_directed` | `user_authored` | `script_only` |

Every case produced exactly one terminal JSON response. Approved Hook envelopes required (`hookPlan` + `hookDiagnostics`). Write My Own committed narration begins with the approved user opening.

---

## First research-dependent live attempt (Sprint 7E.2) — preserved

See [hook-live-model-results.md](./hook-live-model-results.md). Classifications were **not** rewritten. Status remains **NOT ELIGIBLE**. Does not block Core freeze.

---

## Hook Style selector (7E.6 / 7E.6A)

- Additive Create brief panel; **Auto** default
- Research-off Auto copy is absolute; research-on copy notes Evidence Surprise may apply
- Write My Own: 5-word + 200-char limits via shared `countHookWords` / `validateWriteMyOwnOpening`
- Pure `reconcileHookStyleSelection` (no nested React state setters)
- Client imports from `@/features/hook-engine/presentation` only
- Verify: `npm run test:hook-style-selector`

---

## Research execution coherence (7E.4A)

Query-scoped API-Football session; unambiguous Manchester City topic; preflight gates; preserved in this freeze ledger.

---

## Downstream engines

Unchanged ownership: Studio Intelligence, Story Sync, MasterTimeline, preview, export, publishing metadata, renderer, VO timing authority.
