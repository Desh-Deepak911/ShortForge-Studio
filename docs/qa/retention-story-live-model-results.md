# Retention Story Core Live-Model QA Results

Generated: 2026-07-17T06:07:02.101Z
RETENTION_LIVE_QA=1
QA_BASE_URL=http://localhost:3000
RETENTION_LIVE_AUDIO_FIRST=1

## CORE LIVE-MODEL SIGN-OFF: ELIGIBLE

| Case | Status | Strategy | Quality | Path | Notes |
|------|--------|----------|---------|------|-------|
| 30s Auto / Fast | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| 30s Retention-first / Balanced | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) |
| 30s Standard / Balanced | Pass | short_standard | balanced | script_only | short_standard / balanced / envelope ok (attempt 1) |
| 30s Studio | Pass | short_retention | best | script_only | short_retention / best / envelope ok (attempt 1) |
| 45s Auto / extended-short | Pass | extended_short | balanced | script_only | extended_short / balanced / envelope ok (attempt 1) |
| Explicit Hook + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) hook=reconciled:compatibility_punchy/compatibility_fallback adaptations=beat_plan_compacted,hook_style_reconciled |
| Write My Own + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| 35s Studio Retention-first match review | Pass | short_retention | best | script_only | short_retention / best / envelope ok (attempt 1) |
| Creative Premise Argentina match review | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) premise=all_used adaptations=beat_plan_compacted,planner_fallback_used,creative_premise_used |
| Creative Premise + Smart Research | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) |
| Creative Premise + manual context | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) |
| Explicit Hook selection | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| Full audio-first ordering | Pass | short_retention | cheap | audio_first_full | short_retention / cheap / envelope ok (attempt 1) |

Status values: Pass / Fail / Not tested.
Required Core (non-research): seven script-only cases must Pass for eligibility.
Audio-first: Core-required for this run (RETENTION_LIVE_AUDIO_FIRST=1).
Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.
Generic model/API failures are Fail, never safety Pass.
Retries: at most one, only for transient transport (connection reset / timeout / 429 / temporary 5xx).
