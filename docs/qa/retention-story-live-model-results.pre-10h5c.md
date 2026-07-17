# Retention Story Core Live-Model QA Results

Generated: 2026-07-17T05:27:20.619Z
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
| Explicit Hook + Retention-first | Fail | — | — | — | case=live-explicit-hook-retention; http=200; category=wrong_strategy_quality_or_path; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=script_only; terminalState=pass_without_rewrite; qualityMode=cheap; safeReasonIds=pass_without_rewrite; failureStage=unknown; contractFp=rsc:13shp51; planFp=rsp:i29v79; candidateFp=rnc:166mtrd; validationFp=rv:1wzv100; budget=total:2/5\|planner:0\|initial:1\|compress:0\|hookRepair:1\|hookFallback:0\|rewrite:0; attempts=1; retry=no |
| Write My Own + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| 35s Studio Retention-first match review | Pass | short_retention | best | script_only | short_retention / best / envelope ok (attempt 1) |
| Creative Premise Argentina match review | Fail | — | — | — | case=live-creative-premise-argentina; http=200; category=retention_assertion_failure; expectedStrategy=short_retention; expectedQuality=balanced; expectedPath=script_only; terminalState=pass_without_rewrite; qualityMode=balanced; safeReasonIds=pass_without_rewrite; failureStage=unknown; contractFp=rsc:v94caz; planFp=rsp:1jc45zn; candidateFp=rnc:1szp0c1; validationFp=rv:us4oxb; budget=total:2/6\|planner:1\|initial:1\|compress:0\|hookRepair:0\|hookFallback:0\|rewrite:0; attempts=1; retry=no |
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
