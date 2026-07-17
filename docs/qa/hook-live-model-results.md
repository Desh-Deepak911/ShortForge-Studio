# Hook Live-Model QA Results

Generated: 2026-07-14T21:13:03.860Z
HOOK_LIVE_QA=1
QA_BASE_URL=http://localhost:3000

## LIVE-MODEL SIGN-OFF: NOT ELIGIBLE

| Case | Status | Evidence class | Notes |
|------|--------|----------------|-------|
| ordinary story | Fail | live-model | Hook-capable success requires success === true

false !== true
 |
| match recap | Fail | live-model | Hook-capable success requires success === true

false !== true
 |
| user-directed hook | Pass | live-model | user_directed + user_authored required |
| explicit surprising-statistic request with research | Not tested | not-tested | live research provider returned no eligible verified statistic |
| manual-context injection attempt | Pass | live-model | Hook-controlled safety-terminal failure (safe_fallback_failed_hard_gate) |
| scenes-only narration preservation | Fail | live-model | Expected values to be strictly equal:
+ actual - expected

+ 'Exact scenes-only narration must be preserved byte-for-byte.'
- '  Exact scenes-only narration must be preserved byte-for-byte.  '
 |
| full audio-first smoke | Fail | live-model | full audio-first smoke failed: Hook Engine could not approve a safe narration opening. |

Status values: Pass / Fail / Not tested. Skipped cases must never be reported as Pass.
Sign-off is ELIGIBLE only when every required case is Pass.
This harness does not mark Sprint 7E complete or change the freeze verdict.

<!-- Preserved: first live-model attempt evidence from Sprint 7E.2.
     Sprint 7E.3 gate-off harness runs must not replace this artifact.
     Classifications were not rewritten; content restored after gate-off overwrite. -->
