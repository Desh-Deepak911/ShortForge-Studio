# Retention Story Core Live-Model QA Results

Generated: 2026-07-16T14:03:23.537Z
RETENTION_LIVE_QA=1
QA_BASE_URL=http://localhost:3000
RETENTION_LIVE_AUDIO_FIRST=1

## CORE LIVE-MODEL SIGN-OFF: NOT ELIGIBLE

| Case | Status | Strategy | Quality | Path | Notes |
|------|--------|----------|---------|------|-------|
| 30s Auto / Fast | Fail | — | — | — | case=live-30-auto-fast; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=script_only; terminalState=rewrite_not_allowed; contractFp=rsc:1efpaec; planFp=rsp:ur9tn2; attempts=1; retry=no |
| 30s Retention-first / Balanced | Fail | — | — | — | case=live-30-retention-balanced; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=balanced; expectedPath=script_only; terminalState=fail; contractFp=rsc:15am767; attempts=1; retry=no |
| 30s Standard / Balanced | Fail | — | — | — | case=live-30-standard-balanced; http=500; category=success_false; expectedStrategy=short_standard; expectedQuality=balanced; expectedPath=script_only; terminalState=fail; contractFp=rsc:1vmg6n0; attempts=1; retry=no |
| 30s Studio | Fail | — | — | — | case=live-30-studio; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=best; expectedPath=script_only; terminalState=fail; contractFp=rsc:1e44k1; attempts=1; retry=no |
| 45s Auto / extended-short | Fail | — | — | — | case=live-45-auto-extended; http=500; category=success_false; expectedStrategy=extended_short; expectedQuality=balanced; expectedPath=script_only; terminalState=fail; contractFp=rsc:1ky7opu; attempts=1; retry=no |
| Explicit Hook + Retention-first | Fail | — | — | — | case=live-explicit-hook-retention; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=script_only; terminalState=fail; contractFp=rsc:14gcwc0; planFp=rsp:4kcv2t; attempts=1; retry=no |
| Write My Own + Retention-first | Fail | — | — | — | case=live-wmo-retention; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=script_only; terminalState=rewrite_not_allowed; contractFp=rsc:nvtip1; planFp=rsp:q3pa3d; attempts=1; retry=no |
| Full audio-first ordering | Fail | — | — | — | case=live-audio-first; http=500; category=success_false; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=audio_first_full; terminalState=rewrite_not_allowed; contractFp=rsc:whh60x; planFp=rsp:9lvejn; attempts=1; retry=no |

Status values: Pass / Fail / Not tested.
Required Core (non-research): seven script-only cases must Pass for eligibility.
Audio-first: Core-required for this run (RETENTION_LIVE_AUDIO_FIRST=1).
Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.
Generic model/API failures are Fail, never safety Pass.
Retries: at most one, only for transient transport (connection reset / timeout / 429 / temporary 5xx).
