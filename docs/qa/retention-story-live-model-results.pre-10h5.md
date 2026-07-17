# Retention Story Core Live-Model QA Results

Generated: 2026-07-17T01:50:47.165Z
RETENTION_LIVE_QA=1
QA_BASE_URL=http://localhost:3000
RETENTION_LIVE_AUDIO_FIRST=1

## CORE LIVE-MODEL SIGN-OFF: NOT ELIGIBLE

| Case | Status | Strategy | Quality | Path | Notes |
|------|--------|----------|---------|------|-------|
| 30s Auto / Fast | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| 30s Retention-first / Balanced | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) |
| 30s Standard / Balanced | Pass | short_standard | balanced | script_only | short_standard / balanced / envelope ok (attempt 1) |
| 30s Studio | Pass | short_retention | best | script_only | short_retention / best / envelope ok (attempt 1) |
| 45s Auto / extended-short | Pass | extended_short | balanced | script_only | extended_short / balanced / envelope ok (attempt 1) |
| Explicit Hook + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| Write My Own + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| 35s Studio Retention-first match review | Fail | — | — | — | case=live-35-studio-retention-match-review; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=best; expectedPath=script_only; productionFailureCategory=quality_failure; terminalState=rewrite_not_allowed; qualityMode=best; safeReasonIds=validation_input_invalid; failureStage=retention_validation; contractFp=rsc:oxvs0x; planFp=rsp:c6k5m6; budget=total:5/7\|planner:1\|initial:1\|compress:1\|hookRepair:1\|hookFallback:1\|rewrite:0; attempts=1; retry=no |
| Creative Premise Argentina match review | Pass | short_retention | balanced | script_only | short_retention / balanced / envelope ok (attempt 1) |
| Creative Premise + Smart Research | Fail | — | — | — | case=live-creative-premise-with-research; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=balanced; expectedPath=script_only; productionFailureCategory=quality_failure; terminalState=rewrite_not_allowed; qualityMode=balanced; safeReasonIds=validation_input_invalid; failureStage=retention_validation; contractFp=rsc:v7uvpu; planFp=rsp:m9kijp; budget=total:2/6\|planner:1\|initial:1\|compress:0\|hookRepair:0\|hookFallback:0\|rewrite:0; attempts=1; retry=no |
| Creative Premise + manual context | Fail | — | — | — | case=live-creative-premise-with-manual-context; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=balanced; expectedPath=script_only; productionFailureCategory=quality_failure; terminalState=rewrite_not_allowed; qualityMode=balanced; safeReasonIds=validation_input_invalid; failureStage=retention_validation; contractFp=rsc:7dwxgk; planFp=rsp:1hd8x9p; budget=total:2/6\|planner:1\|initial:1\|compress:0\|hookRepair:0\|hookFallback:0\|rewrite:0; attempts=1; retry=no |
| Explicit Hook selection | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| Full audio-first ordering | Pass | short_retention | cheap | audio_first_full | short_retention / cheap / envelope ok (attempt 1) |

Status values: Pass / Fail / Not tested.
Required Core (non-research): seven script-only cases must Pass for eligibility.
Audio-first: Core-required for this run (RETENTION_LIVE_AUDIO_FIRST=1).
Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.
Generic model/API failures are Fail, never safety Pass.
Retries: at most one, only for transient transport (connection reset / timeout / 429 / temporary 5xx).
