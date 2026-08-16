# Story generation

Current production narration for `POST /api/generate-script` goes through Retention Story (`runRetentionProductionNarration` in `src/features/retention-story/`). Voiceover and scene planning still follow an audio-first timing model: spoken duration drives scenes.

This page is the living quality-contract overview. The frozen Sprint 10 module contract remains [RETENTION_STORY_CONTRACT.md](RETENTION_STORY_CONTRACT.md). Hook catalog and safety remain [HOOK_CONTRACT.md](HOOK_CONTRACT.md).

## What is implemented

1. Normalize a story contract from the brief (mode, tone, duration, creator notes).
2. Plan beats, pacing, and compression goals before the Hook opening is locked.
3. Compose continuous narration with claim support.
4. Canonical acceptance checks grounding, Hook/body/payoff relationship, ranking identity, and duration fit.
5. Bounded repair may promote a grounded opening or repair a ranking closer. That is `model_after_rewrite`.
6. After canonical accept, editorial Hook rejection must not discard the accepted narration. Mapping and serialization may still fail as a mapping-specific error.
7. Unsupported inventions, wrong number-one rankings, and incoherent speech still enter coherent deterministic rescue. Rescue is labeled; it is not a model-quality Pass.
8. Public responses expose safe diagnostics only.

Authorities:

| Value | Meaning |
| --- | --- |
| `model_direct` | Accepted model narration, no rewrite |
| `model_after_rewrite` | Accepted after a bounded rewrite (opening promotion, opening repair, ranking closer) |
| `deterministic_rescue` | Grounded fallback speech after rejection |

Honest quality warnings (soft Hook style, slight duration miss) do not change authority and do not block export.

## Modes and models

Script modes and quality models are listed in [CREATOR_WORKFLOW.md](../product/CREATOR_WORKFLOW.md). Examples in tests and evidence use fictional names. Do not treat club-specific anecdotes as architecture rules.

Default models: Fast `gpt-4.1-mini`, Balanced/Studio `gpt-4.1`. `OPENAI_SCRIPT_MODEL` overrides both when set and should stay unset for certification.

## Duration

Spoken duration uses a Retention-owned **2.4 words/second** model. A 30-second story has a 72-word composition target. Small misses become warnings (`duration_slightly_under_target`, `duration_slightly_over_target`, `duration_target_not_fully_met`). A coherent grounded ranking is not discarded for a small overrun. Compression may drop optional connectives; it must keep essential members, order, and the explicit number-one payoff.

## Fallback behavior

| Situation | Outcome |
| --- | --- |
| Unsupported opening, grounded body | Deterministic `supported_opening_promotion` when the remainder qualifies |
| Wrong final ranking winner | Rescue; not a closer-only patch |
| Unsupported later-body invention | Repair if eligible, otherwise rescue |
| Meaningless or unrelated opening | Repair or rescue |
| Mapping cannot preserve accepted bytes | Mapping failure, not a Hook reject |
| Provider or compose failure | Safe failure envelope; no plan/validation leak |

## Release status

Current evidence: [STORY_GENERATION_RELEASE_READINESS.md](../evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md).

**Verdict: not_ready.** Provider-free Prompt 1–12 gates pass on this tree. Live recert accepted Fast preview and Balanced narration; a correct-number-one ranking still reached coherent rescue after an unsupported closer. Ready requires an accepted live correct-number-one ranking.

Do not describe story generation as production-certified.

## Verification

```bash
npm run test:retention-story-quality-release-gate
npm run test:retention-prompt12-certification-fixes
npm run test:retention-universal-reliability
```

Live `cert:story-quality-*` scripts consume OpenAI and are not part of ordinary development.
