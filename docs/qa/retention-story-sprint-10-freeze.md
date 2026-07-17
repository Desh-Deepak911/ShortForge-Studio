# Retention Story Intelligence Sprint 10 Freeze Evidence

## Final freeze — Sprint 10H.5C (2026-07-17)

```
SPRINT 10 RETENTION STORY INTELLIGENCE V1: FROZEN
CORE RETENTION LIVE-MODEL PATH: APPROVED
UNIVERSAL FLEXIBLE GENERATION: LIVE-VERIFIED
LOCAL PRODUCT SIGN-OFF: APPROVED
EVIDENCE-BASED RESEARCH PATH: CAPABILITY-GATED
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

- Deterministic Golden, safety, authority, and 435-cell Flexible reliability QA: **Pass**
- Final Core live matrix: **Pass — 13/13**, no retries; real exit 0
- Explicit Hook reconciliation and Creative Premise evidence: **Pass**
- 35s Studio match review and full audio-first ordering: **Pass**
- Local Create, generated story, Review, persistence, and audio-first: **Pass — operator-confirmed**
- Official live evidence: `docs/qa/retention-story-live-model-results.md` (SHA-256 `6c8cad6a846666e8ed3ccb003cd83f964344bfb740a5bb50d8861fda47c91e6f`)
- Local evidence: `docs/qa/retention-story-local-results.md`

The sections below preserve the pre-freeze evidence trail and are superseded by this final verdict.

**Sprint:** 10H.4 — Expanded Core Live-Model Sign-Off
**Precondition:** 10H.3B accepted; deterministic suite green
**Updated:** 2026-07-17

## Freeze verdict

```
SPRINT 10 CORE LIVE-MODEL PATH: NOT ELIGIBLE
RETENTION STORY INTELLIGENCE: PRODUCTION-WIRED / NOT FROZEN
LOCAL PRODUCT SIGN-OFF: BLOCKED
SPRINT 11 HEADLESS RENDERER: DEFERRED
```

### 10H.4 gate status

| Gate | Status |
|------|--------|
| Deterministic Hook reconciliation + ledger authority QA | **PASS** (10H.3B accepted) |
| Expanded live matrix (13 required cases) | **NOT ELIGIBLE** — 3 Fail (2026-07-17) |
| Local Create UX / Review / persistence / audio-first | **Blocked** until Core live eligible |

Prior Core live results in `docs/qa/retention-story-live-model-results.md` predate the 10H.3 required cases and are **not sufficient** for freeze until the expanded live matrix Passes.

First-attempt Core live evidence (immutable archive):
`docs/qa/retention-story-live-model-results.first-attempt.md`.

Diagnostic representative evidence (does not overwrite official results):
`docs/qa/retention-story-live-diagnostic-results.md`.

Full freeze wording (blocked until live + local Pass):

```
SPRINT 10 RETENTION STORY INTELLIGENCE V1: FROZEN
CORE RETENTION LIVE-MODEL PATH: APPROVED
EVIDENCE-BASED RESEARCH PATH: CAPABILITY-GATED
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

---

## 10H.1 / 10H.1A evidence-truth + terminal coherence

| Control | Behavior |
|---------|----------|
| Canonical live assertion | `assertRetentionLiveSuccessEnvelope` — Hook + Retention plan/validation/diagnostics linkage, budget ceilings, requested-duration word budget |
| Negative fixtures | `npm run test:retention-story-live-assertion-qa` (gate off) |
| Retry policy | At most one retry; only connection reset / timeout / HTTP 429 / temporary 5xx |
| Safe failure notes | Case ID, HTTP, safe category, expected strategy/quality/path, short fingerprints, attempts — no narration/secrets/raw errors |
| Results file | Gate off never overwrites an existing completed live-results document |
| Audio-first | Core-required when `RETENTION_LIVE_AUDIO_FIRST=1`; otherwise capability-gated Not tested |
| Local eligibility | Incomplete checklist → never eligible; structural checks never promote Pass |

---

## Evidence-class matrix

| Area | Evidence class | Result |
|------|----------------|--------|
| Golden / safety / persistence / streaming | mocked-integration | Pass |
| Live assertion negatives (10H.1 / 10H.1A) | automated-semantic | Pass |
| Local evidence eligibility harness | automated-semantic | Pass |
| Core live-model (pre-10H.3 matrix) | live-model | Stale — must re-run expanded 10H.3 matrix |
| Core live-model (10H.3 realistic + Creative Premise) | live-model | **Pending** |
| Local product Create/Review/audio-first | manual-editor-review | **Not tested** (blocks freeze) |
| Evidence Surprise / live research | live-model | Capability-gated (non-blocking) |

---

## Required Core live cases (non-research)

All nine must Pass for Core live eligibility (10H.3 expanded matrix):

1. 30s Auto/Fast
2. 30s Retention-first/Balanced
3. 30s Standard/Balanced
4. 30s Studio
5. 45s Auto/extended-short
6. Explicit Hook + Retention-first
7. Write My Own + Retention-first
8. **35s Studio Retention-first dramatic match review** (detailed qualitative context)
9. **Creative Premise Argentina** (2–1 / 26 fouls / 35 tackles; creator-supplied premise)

**Audio-first:** Core-required when voice/TTS is configured for Sprint 10 sign-off (`RETENTION_LIVE_AUDIO_FIRST=1`). Otherwise capability-gated Not tested with a narrow safe reason. Never optional-for-Pass.

Activation:

```bash
RETENTION_LIVE_QA=1 QA_BASE_URL=http://localhost:3000 npm run test:retention-story-live-qa
# when voice/TTS configured for sign-off:
RETENTION_LIVE_QA=1 RETENTION_LIVE_AUDIO_FIRST=1 QA_BASE_URL=http://localhost:3000 npm run test:retention-story-live-qa
```

---

## Environment / flags

| Variable | Role |
|----------|------|
| `RETENTION_LIVE_QA=1` | QA-only live gate (not a production feature flag; not required in `.env.local`) |
| `QA_BASE_URL` | Required when live gate is on |
| `RETENTION_LIVE_AUDIO_FIRST=1` | Makes audio-first Core-required |

**Production feature flags added:** none.
**Env vars added/changed/removed for 10H.3:** none.
**`.env.local` action:** none required for 10H.3 reliable generation / Guided Create / Creative Premise.
**Restart:** only if a long-lived `npm run dev` was already running when picking up these code changes.

---

## Downstream engines

Unchanged ownership: Studio Intelligence, Story Sync, MasterTimeline, preview, export, publishing metadata, renderer, VO timing authority, scene intelligence. No Retention generation thresholds/budgets/commit gates changed in 10H.1 / 10H.1A (QA assertion-only).
