# Hook Engine — Post-Freeze Deterministic Terminal Fallback Hotfix

**Status:** Ready for acceptance (deterministic suites).
**Does not reopen** Sprint 7 frozen contracts.
**Sprint 8:** Golden QA complete; local sign-off pending; not frozen.

## Defect

Compatibility fallback could still fail when the model ignored the four-word opening instruction (`fallbackReason: compatibility_fallback_failed_validation`), even though a usable narration body already existed.

## Fix (summary)

- Deterministic Hook-owned opening: `Nobody saw {anchor} coming.` via canonical subject-anchor utilities.
- Exact-offset opening replacement preserves the narration body.
- Usable body → no fallback model call; unusable body → at most one model call, then deterministic opening.
- Creator-facing failure copy is actionable and private-data-free.

## Safe reproduction envelope (no narration)

Local live request (2026-07-15) — exact reproduced shape; research off; Contrarian Take:

| Field | Observed |
|-------|----------|
| success | true |
| hasNarration | true |
| strategyId (terminal) | compatibility_punchy |
| strategySource (terminal) | compatibility_fallback |
| generationPath | script_only |
| validationOutcome | fallback |
| fallbackReason | validated_compatibility_fallback |
| repairAttempts | 1 |
| groundingStatus | user_context_only |
| candidateOrigin | compatibility_fallback |
| adapterRan | true |
| Opening (safe check only) | Starts with deterministic `Nobody saw Spain coming.` |
| Private fields in docs | none (full narration not recorded) |

Initial Contrarian resolution is covered by deterministic fixtures (`requestedStrategyId: contrarian_claim` → `user_selected`).

## Verification

`npm run test:hook-deterministic-terminal-fallback` plus Hook / Sprint 8 regression suites listed in the hotfix brief.
