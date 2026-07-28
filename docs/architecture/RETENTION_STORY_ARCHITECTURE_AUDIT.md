# Retention Story Intelligence — Architecture Audit (Sprint 10A)

**Status:** Audit **accepted** as evidence
**Date:** 2026-07-16
**Precondition:** Sprint 9 frozen (`SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN` · `EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN`)
**Companion contract:** [RETENTION_STORY_CONTRACT.md](./RETENTION_STORY_CONTRACT.md) — **Accepted after Sprint 10A.2** (10B ready to begin)

This document is evidence-backed. It creates **no** production Retention Story Intelligence engine code. Citations refer to paths under `footiebitz/`.

---

## 1. Precondition check

| Freeze marker | Location | Status |
|---------------|----------|--------|
| `SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN` | `docs/qa/intra-scene-transition-sprint-9-freeze.md`, `ROADMAP.md`, `MASTER_ARCHITECTURE.md` (§12 Sprint 9) | Present |
| `EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN` | Same | Present |

**Status conflict corrected in 10A:** `MASTER_ARCHITECTURE.md` §2 still contained a stale ledger line `SPRINT 9: NOT FROZEN` / `9C READY FOR REVIEW`. That ledger is updated to match the freeze (see roadmap updates). Audit proceeds.

---

## 2. Current generation-flow map

### 2.1 Primary UI path (staged create)

```text
CreateStoryFlow (brief)
  → POST /api/generate-script  mode: "script-only"
      → resolveScriptResearchContext / resolveResearchPromptText
      → buildNarrativePlan / buildPromptIntelligence (ephemeral)
      → buildNeutralResearchEvidence
      → buildHookGenerationContext
      → generateHookedNarration
            → generateRawStoryScript (model)
            → enforceLength (compress → enforceNarrationWordBudget)
            → validateHookCandidate / ≤1 repair / fallback
      → storyScriptFromHookedNarration → FootieScript.narration
  → createDraft({ script, creationBrief + hookPlan snapshot })
  → Review → POST /api/generate-voiceover
  → ScriptReviewFlow → POST /api/generate-script  mode: "scenes-only"
      → generateScenesForReviewedScript
            → optional runStudioIntelligence / AI scene planner
  → Story Sync / Editor / Preview / Export
```

### 2.2 Key production files and functions

| Step | Path | Export / symbol |
|------|------|-----------------|
| Create UI | `src/features/create/components/CreateStoryFlow.tsx` | `handleGenerate` |
| Script API | `src/app/api/generate-script/route.ts` | `POST` / `runGeneration` |
| Script-only | `src/features/story/services/audio-first-generation.service.ts` | `generateScriptOnlyStory` |
| Full audio-first | same | `generateAudioFirstStory` |
| Scenes-only | same | `generateScenesForReviewedScript` |
| Research resolve | `src/features/research/utils/script-research-context.server.utils.ts` | `resolveScriptResearchContext` |
| Research prompt | `src/features/intelligence/context/resolve-research-prompt-text.ts` | `resolveResearchPromptText` |
| PI plan | `src/features/intelligence/prompts/build-narrative-plan.ts` | `buildNarrativePlan` |
| PI aggregate | `src/features/intelligence/prompts/build-prompt-intelligence.ts` | `buildPromptIntelligence` |
| Hook adapter | `src/features/hook-engine/integration/build-hook-generation-context.ts` | `buildHookGenerationContext` |
| Hook orchestration | `src/features/hook-engine/integration/generate-hooked-narration.ts` | `generateHookedNarration` |
| Raw model | `src/features/story/services/script-generation.service.ts` | `generateRawStoryScript` |
| Prompt builder | `src/lib/ai/prompts.ts` | `buildStoryScriptPrompt` |
| Length hard truncate | `src/features/story/utils/narration-duration-budget.utils.ts` | `enforceNarrationWordBudget` |
| Hook repair | `src/features/hook-engine/repair/run-bounded-hook-repair.ts` | `runBoundedHookRepair` |
| Voiceover API | `src/app/api/generate-voiceover/route.ts` | TTS entry |
| Voiceover apply | `src/hooks/useStoryVoiceoverApply.ts` | client apply |
| Studio Intelligence | `src/features/studio-intelligence/studio-intelligence-runtime.ts` | `runStudioIntelligence` |
| Story Sync | `src/features/story-sync/` | dirty/version signaling |
| Script normalize | `src/lib/utils/voiceover.ts` | `syncFootieScript` |
| Draft brief | `src/features/drafts/types/draft.types.ts` | `StoryCreationBrief` |

### 2.3 Path variants

| Variant | API `mode` | Hook | Length owner | VO | Scenes |
|---------|------------|------|--------------|----|--------|
| Script-only (UI default) | `"script-only"` | Yes | `generateHookedNarration` → `enforceLength` | Separate | Later scenes-only |
| Full audio-first | `"full"` (API default) | Yes | Same | Inline after Hook ok | Inline after VO |
| Scenes-only | `"scenes-only"` | **Must not run** | N/A (no rewrite) | Prerequisite | Yes |

Legacy / non-production: `generateFootieScript`, self-enforcing `generateStoryScript` — not used by Hook bridge.

### 2.4 Where strategy lives today

| Concern | Locus |
|---------|--------|
| Topic / mode / tone / duration / template / Hook style | **explicit** (brief → request) |
| Research facts / forbidden claims / PI beats | **explicit** plan → **prompt-only** in narration |
| Hook opening strategy | **explicit** Hook registry |
| Full-story emotional curve / controlling idea | **absent** as typed authority (prompt-inferred only) |
| Cross-beat retention pacing | **absent** / **prompt-only** structure rules |
| Compression | **explicit** on Hook path (`enforceLength`) |
| SI beats / arcs / scene blueprints | **downstream-only** of committed narration |
| Story Sync | **absent** for planning (dirty/stale only) |

---

## 3. Existing intelligence concepts and collisions

| Concept | Module | Role | Collision risk |
|---------|--------|------|----------------|
| PI `NarrativePlan` / `NarrativeBeat` | `src/features/intelligence/prompts/narrative-plan.types.ts` | Research-grounded structure for prompts | **High** name clash with SI `NarrativeBeat` |
| SI `NarrativeBeat` | `src/features/studio-intelligence/studio-intelligence.types.ts` | Descriptive beats from committed narration | Downstream; distinct shape |
| Hook strategies | `src/features/hook-engine/strategies/hook-strategy.registry.ts` | Spoken opening strategies | Independent IDs; frozen |
| SI `StoryStrategy` | `src/features/studio-intelligence/story-strategy/` | Scene/visual planning bias | Must not merge with Hook |
| Creator templates | `src/features/creator-templates/` | Advisory prompt hints | Prompt-only |
| Story-structure rules | `story-structure-intelligence.utils.ts` + `lib/ai/prompts.ts` | Mode→arc templates | Duplicated as prompt guidance |
| Length enforcement | Hook `enforceLength` + `enforceNarrationWordBudget` | Word budget on Hook paths | Doc drift vs Hook Contract §3 |
| SI Story Validator | `studio-intelligence/story-validator/` | Planning coherence only | Does not gate narration commit |
| Hook Validator | `hook-engine/validation/` | Opening hard gates | Frozen |
| Dual PI packages | `intelligence/prompts/` (prod) vs `intelligence/prompt-intelligence/` | Parallel / stale risk | Import carefully |

**Names free for Retention Story Intelligence:** `RetentionBeat`, `StoryContract`, `FormatStrategy`, `RetentionStoryPlan` — none exist in production types today.

---

## 4. Authority map (audit conclusion)

| Authority | Owns | Must not own |
|-----------|------|--------------|
| **Prompt Intelligence** | Grounded facts, forbidden claims, research-derived structure, factual beat opportunities, research provenance | Final controlling idea, emotional curve, committed narration, retention score, spoken hook |
| **Hook Engine** | Spoken opening strategy, Hook plan/directive, opening extract, safety/grounding gates, ≤1 repair/fallback, approved opening outcome | Second narration field; SI imports; VO/scenes/timeline/export |
| **Retention Story Intelligence (proposed)** | Normalized Story Contract; format strategy; controlling idea; desired reaction; emotional curve; prescriptive Retention Beat plan; pacing/density; payoff; compression **goals**; retention-readiness validation; ≤1 bounded story rewrite recommendation | Spoken-hook registry reuse; MasterTimeline; direct VO/scene/media/transition/Preview/Export patches |
| **Story generation** | Complete narration composition; final length **enforcement** (current Hook-path owner until 10F reconciles); commit `FootieScript.narration` | Hook identity; SI scene planning |
| **Studio Intelligence** | Descriptive `NarrativeBeat`, arcs, scene blueprints, visual plan from **committed** narration | Upstream retention planning; Hook strategies |
| **Story Sync** | Dirty/stale signaling | Planning authority |

**Amendment note:** Production length enforcement on Hook paths is currently inside `generateHookedNarration`, while Hook Contract prose historically attributed length to story generation. 10A freezes the **boundary** (one enforcement owner; Compression Engine plans, does not silently compete) and requires 10F to reconcile docs + call sites without dual truncators.

---

## 5. Persistence points (today)

| Artifact | Persisted? | Where |
|----------|------------|--------|
| `StoryCreationBrief` | Yes | `Draft.creationBrief` |
| `HookPlanSnapshot` | Yes (optional) | `brief.hookPlan` |
| `HookDiagnostics` | No | API envelope only |
| PI `NarrativePlan` | No | In-memory during generate-script |
| `FootieScript.narration` | Yes | Draft script |
| Voiceover / scenes / timeline | Yes | After later stages |
| Story Sync state | Runtime | Not story truth |

---

## 6. Compression and length (audit)

**Current sole production owner on Hook-capable paths:**

1. Soft compress model call (`length_compress`) inside `generateHookedNarration`
2. Hard truncate: `enforceNarrationWordBudget` / `truncateNarrationToWordBudget`
3. Post-length Hook revalidation with `compressionRevalidated` (does **not** consume Hook repair budget)

**Retention Story Intelligence Compression Engine (proposed)** must own **planning/guidance** (targets, preservation of controlling idea/payoff) and must **not** become a second silent truncator. Actual hard enforcement remains a single owner (document reconciliation in 10F).

---

## 7. Hook relationship decision (audit recommendation)

**Recommended lifecycle order (no cycles) — superseded detail in 10A.1 contract:**

```text
Normalized Story Contract
→ Grounded planning context (PI / research)
→ Controlling Idea + Emotional Arc + Retention Beat Plan
→ Pacing / density / payoff / compression goals
→ Complete RetentionStoryPlan (includes RetentionHookHandoff)
→ Hook Engine plan/directive (existing authority)
→ Structured candidate → length enforcement → Hook approval
→ Rebuild candidate → Retention validation → ≤1 quality body rewrite (QualityMode)
→ Commit narration
```

`RetentionStoryPlan` is complete **before** Hook planning. Hook Engine remains the **only** spoken-opening authority. See hardened contract for candidate/trace, rewrite machine, and budgets.

---

## 8. Rewrite / model-call bounds (current vs proposed)

| System | Bound today |
|--------|-------------|
| Hook repair | ≤1 automated repair |
| Hook fallback model | ≤1 when body unusable; else deterministic opening |
| Length compress | Additional `length_compress` call when over budget |
| Story rewrite | **Absent** as typed terminal machine |

**10A.2 freezes** the terminal rewrite machine and budget **truth**: current observed Hook/narration ceiling = 5 (dual `length_compress`); projected with Retention planner/rewrite = Fast 5 / Balanced 6 / Studio 7 until the Sprint 10 path-global ledger; **target** after ledger = Fast 4 / Balanced 5 / Studio 6 (scenes-only = 0). See contract §14–§15.

---

## 9. Frozen downstream boundaries (must not reopen)

- Hook Engine Core (Sprint 7E)
- Studio Intelligence v1
- Story Sync authority
- Audio-first timing / voiceover duration ownership
- MasterTimeline
- Multi-image scenes (Sprint 8)
- Intra-scene transitions / ExportManifest v3 / `"9C"` (Sprint 9)
- Browser renderer / captions / audio engines
- Headless Renderer (Sprint 11 — deferred)

No renderer code belongs in Sprint 10.

---

## 10. QA evidence plan (future sprints)

| Category | Target milestone |
|----------|------------------|
| Contract normalization | 10B |
| Format-strategy matrix | 10B |
| Controlling-idea coherence | 10C |
| Beat timing/density | 10D |
| Hook compatibility | 10E |
| Grounding | 10E–10F |
| Compression preservation | 10F |
| Validation thresholds | 10F |
| Bounded rewrite | 10F |
| Persistence/reload | 10G |
| JSON/NDJSON parity | 10H |
| script-only / full / scenes-only | 10E–10H |
| Live-model smoke | 10H |
| Manual product review | 10H |

---

## 11. Remaining architecture decisions

**Resolved in 10A.1 / 10A.2** (see [RETENTION_STORY_CONTRACT.md](./RETENTION_STORY_CONTRACT.md) — Accepted after Sprint 10A.2):

1. Model-call budget **truth**: current observed Hook/narration ceiling = 5 (dual `length_compress`); projected Fast/Balanced/Studio = 5/6/7 until ledger; Sprint 10 **target** Fast/Balanced/Studio = 4/5/6 after path-global ledger.
2. Auto maps 15–35→`short_retention`, 36–60→`extended_short`; `short_standard` optional explicit in 10G; long-form rejected by adapter.
3. Persist optional sanitized plan snapshot + validation summary on `StoryCreationBrief` after successful commit only.
4. Plan completes before Hook; `RetentionHookHandoff` is narrow; candidate/segment/trace + Hook mutation reconciliation defined.
5. Grounding claims carry bounded semantic `text`; Retention-owned adapter; `researchIdentity` covers claim semantics.
6. Post-rewrite terminal behavior exact (preserve opening; remaining compress budget or hard truncate; no new Hook repair/fallback).

**Still open (implementation milestones):**

1. Doc reconciliation: Hook Contract length-ownership prose vs `generateHookedNarration` (10F).
2. Disposition of unused `intelligence/prompt-intelligence/` package (out of Retention SI scope unless it blocks imports).
3. Production path-global budget ledger (10E/10F) — required before production-ready / freeze.

---

## 12. Related documents

- [RETENTION_STORY_CONTRACT.md](./RETENTION_STORY_CONTRACT.md)
- [HOOK_CONTRACT.md](./HOOK_CONTRACT.md)
- [MASTER_ARCHITECTURE.md](../../MASTER_ARCHITECTURE.md)
- [ROADMAP.md](../../ROADMAP.md)
