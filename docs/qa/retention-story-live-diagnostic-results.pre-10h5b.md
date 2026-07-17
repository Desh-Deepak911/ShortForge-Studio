# Retention Story Live Diagnostic Results (Sprint 10H.5A)

Generated: 2026-07-17T05:40:16.554Z
RETENTION_LIVE_QA=1
QA_BASE_URL=http://localhost:3000

## TARGETED FLEXIBLE LIVE SEMANTICS: FAIL — full core matrix NOT authorized

| Case | Status | Strategy | Quality | Path | Notes |
|------|--------|----------|---------|------|-------|
| Explicit Hook + Retention-first | Fail | — | — | — | case=diag-explicit-hook-retention-flexible; http=200; category=hook_assertion_failure; expectedStrategy=short_retention; expectedQuality=cheap; expectedPath=script_only; terminalState=pass_without_rewrite; qualityMode=cheap; safeReasonIds=pass_without_rewrite; failureStage=unknown; contractFp=rsc:13shp51; planFp=rsp:i29v79; candidateFp=rnc:cyt8bj; validationFp=rv:1egqylc; budget=total:2/5/planner:0/initial:1/compress:0/hookRepair:1/hookFallback:0/rewrite:0; attempts=1; retry=no |
| Creative Premise Argentina match review | Pass | short_retention | balanced | script_only | short_retention / balanced / premise=all_used adaptations=beat_plan_compacted,planner_fallback_used,creative_premise_used |

Official + archived live-results documents are NOT modified by this harness.
Official path checksum (sha256): 12df0ce51f44e4885a97c9842622b5b2eb8cafda6ce5265cdaf9667d808376a8
Pre-10H.5 archive checksum (sha256): fd5a2ab2d13afc9f33cce5fe63dcf2c67542c05830d44cf0708d04529b278f3d
First-attempt archive checksum (sha256): 7f1b24299ba7d3c93a3c558c73af22db92686435e0a45a647cdb4075867c0cef
Last-approved archive checksum (sha256): dca1d4749d759e8e129e7ad9dc40e512c6498a8d0c3740b0ccc1b2e9c6bdf39a
Pre-10H.4 archive checksum (sha256): dca1d4749d759e8e129e7ad9dc40e512c6498a8d0c3740b0ccc1b2e9c6bdf39a
