# Retention Story Core Live-Model QA Results

Generated: 2026-07-16T14:57:32.998Z
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
| Explicit Hook + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| Write My Own + Retention-first | Pass | short_retention | cheap | script_only | short_retention / cheap / envelope ok (attempt 1) |
| Full audio-first ordering | Pass | short_retention | cheap | audio_first_full | short_retention / cheap / envelope ok (attempt 1) |

Status values: Pass / Fail / Not tested.
Required Core (non-research): seven script-only cases must Pass for eligibility.
Audio-first: Core-required for this run (RETENTION_LIVE_AUDIO_FIRST=1).
Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.
Generic model/API failures are Fail, never safety Pass.
Retries: at most one, only for transient transport (connection reset / timeout / 429 / temporary 5xx).
