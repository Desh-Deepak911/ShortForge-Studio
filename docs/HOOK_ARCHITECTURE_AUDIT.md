# Hook Architecture Audit (Sprint 7A)

**Status:** Audit complete — formal contract proposed in [`HOOK_CONTRACT.md`](./HOOK_CONTRACT.md)
**Date:** 2026-07-15
**Scope:** Documentation and architecture only
**Not claimed:** Hook Engine implementation, contract acceptance, or Sprint 7B–7E delivery

> Companion contract: [`HOOK_CONTRACT.md`](./HOOK_CONTRACT.md) — **Proposed — awaiting architecture acceptance before Sprint 7 implementation**.
> Navigation index: [`MASTER_ARCHITECTURE.md`](../MASTER_ARCHITECTURE.md).

---

## 1. Audit purpose and scope

### Purpose

Unify ownership understanding for every existing “hook” concept in ShortForge Studio and define the evidence base for a future Provocative Hook Engine — without replacing valid Prompt Intelligence, Studio Intelligence, creator-template, scene-planning, or downstream timing behavior.

### In scope

- Creation brief / draft persistence
- Generation modes (`script-only`, `scenes-only`, legacy/`full`, fallbacks)
- Narration prompts, word budgets, compression
- Prompt Intelligence opening beats
- Creator-template `openingStyle`
- Studio Intelligence hook beats / strategies / validators / blueprints
- Editing, Story Sync, and staleness when narration openings change
- Downstream invariant boundary (voiceover → timeline → preview → export)

### Out of scope (this phase)

- Creating `src/features/hook-engine/`
- Production types, prompts, UI, package scripts, or tests
- Renaming or consolidating existing hook-related types
- Changing generation, voiceover, Story Sync, MasterTimeline, preview, or export behavior

---

## 2. Evidence methodology and authority order

```text
1. Production types and runtime code
2. Verification suites
3. Accepted subsystem contracts
4. Current architecture documentation
5. README / ROADMAP / CHANGELOG
6. Historical or future-planning documents
```

Primary code evidence:

| Area | Paths |
|------|-------|
| Create / drafts | `src/features/create/components/CreateStoryFlow.tsx`, `src/features/drafts/types/draft.types.ts` |
| API | `src/app/api/generate-script/route.ts`, `src/types/footiebitz.ts` |
| Narration | `src/features/story/services/script-generation.service.ts`, `audio-first-generation.service.ts`, `story-generation.service.ts`, `src/lib/ai/prompts.ts` |
| Prompt Intelligence | `src/features/intelligence/prompts/` |
| Creator Templates | `src/features/creator-templates/` |
| Studio Intelligence | `src/features/studio-intelligence/` |
| Story Sync | `src/features/story-sync/` |
| Architecture | `MASTER_ARCHITECTURE.md` |

---

## 3. Current end-to-end narration-generation map

**There is no first-class Hook entity today.** The only canonical spoken opening is the **leading span of `FootieScript.narration`**.

### Live create path (primary production)

```text
CreateStoryFlow.generateScript()
  → POST /api/generate-script  mode: "script-only"
  → resolveScriptResearchContext()          (research → PI / graph / assembled context)
  → resolveCreatorTemplatePromptBlock()     (templateId + templatePromptHints)
  → generateScriptOnlyStory()
  → generateStoryScript()
  → buildStoryScriptPrompt() + OpenAI
  → enforceScriptLengthBudget()
       → compressStoryScript() (optional LLM rewrite)
       → enforceNarrationWordBudget / truncateNarrationToWordBudget
  → FootieScript { title, narration, scenes: [] }
  → createDraft({ script, creationBrief, pipelineStage: "script_review" })
  → /create/review/:id
```

### Review → scenes path

```text
ScriptReviewFlow.handleCreateScenes()
  → POST mode: "scenes-only"
  → generateScenesForReviewedScript()
  → generateScenesFromScriptAndAudio()
  → narration LOCKED (scenes map “opening hook to closing beat” as visual planning language)
  → FootieScript with scenes / timeline
```

Optional dual-gated Studio Intelligence scene planning may run on `scenes-only` when both env and request gates pass; default remains the AI scene planner. SI consumes narration; it does not rewrite it.

### Ownership today

| Artifact | Role |
|----------|------|
| `StoryCreationBrief` | Create inputs (topic, tone, duration, mode, template, research flags) — **not** spoken hook |
| `StoryScript.narration` | Generation intermediate |
| `FootieScript.narration` | **Canonical editable spoken text** (draft `script`) |
| Prompt / PI / template “hook” language | Advisory guidance into generation |
| SI `NarrativeBeatType = "hook"` / `hook_opener` | Downstream planning / visuals derived from narration |

---

## 4. Generation-mode matrix

| Request field | `script-only` | `scenes-only` | `full` (audio-first) | `full` fallback (`generateFootieScript`) |
|---|---|---|---|---|
| `topic` | Used | Used (scene plan) | Used | Used |
| `tone` | Used | Passed (not narration rewrite) | Used | Used |
| `duration` | Word budget + prompt | On brief; narration locked | Used | Used |
| `qualityMode` / model | Used | Used | Used | Used |
| `sceneCount` | Accepted; **no scenes** | Used | Used | Ignored (prompt hardcodes 5 scenes) |
| `scriptMode` | Used (`buildStoryScriptPrompt`) | Used for scene planning | **Dropped** at `generateAudioFirstStory` → `generateStoryScript` | **Dropped** |
| `context` / research | **Resolved then used** | **Dropped** | **Dropped** | **Dropped** |
| `enableResearch` / `researchPreview` | Used | **Dropped** | **Dropped** | **Dropped** |
| `templateId` / `templatePromptHints` | Resolved → `templatePromptBlock` | **Dropped** | **Dropped** (not passed into `generateAudioFirstStory`) | **Dropped** |
| `title` / `narration` / `voiceoverDurationMs` | N/A | **Required** | N/A | N/A |
| `useStudioIntelligenceScenes` | N/A | Used (dual-gated) | **Dropped** | N/A |

**Evidence notes:**

- Route always builds `templatePromptBlock`, but only `script-only` consumes it (`generate-script/route.ts`).
- Full path call site passes only topic/sceneCount/tone/duration/qualityMode/model into `generateAudioFirstStory` — mode, context, research, and templates are ignored.
- `scenes-only` must never generate, replace, or repair narration hooks (current behavior locks narration; Sprint 7 must preserve this).

---

## 5. Existing hook vocabulary and collision matrix

| Name | Type / function | File | Pipeline stage | Current owner | Affects | Canonical / derived | Sprint 7 disposition |
|------|-----------------|------|----------------|---------------|---------|---------------------|----------------------|
| `FootieScript.narration` | `string` | `story/types/story.types.ts` | Persist / edit / TTS / export | Story / Drafts | Spoken narration | **Canonical spoken text** (hook = opening span by convention) | Remain final spoken authority |
| `StoryScript.narration` | `string` | `story/types/audio-first.types.ts` | Generation intermediate | Script generation | Narration | Derived → copied into FootieScript | Intermediate only |
| `StoryCreationBrief` | interface | `drafts/types/draft.types.ts` | Create / persist | Drafts | Planning inputs | Brief metadata | Input to HookRequest; not spoken hook |
| Generic prompt “Open with a short, punchy first line…” | prompt text | `src/lib/ai/prompts.ts` (`buildStoryScriptPrompt`) | Narration gen | AI prompts | Narration guidance | Derived | Absorb into Hook directive / compatibility fallback |
| Generic prompt “Open narration with a strong hook…” | prompt text | `prompts.ts` (`buildFootieScriptPrompt`) | Legacy full fallback | AI prompts | Narration | Derived | Legacy-path handling in 7D |
| Scene plan “opening hook to closing beat” | prompt text | `prompts.ts` (`buildScenePlanPrompt`) | Scenes-only | Scene planning | **Visuals** | Derived; narration locked | Keep visual; not spoken authority |
| `STORY_STRUCTURE_NARRATION_RULES` | const | `intelligence/prompts/story-structure-intelligence.utils.ts` | Narration + PI | Prompt Intelligence | Narration guidance | Derived | Compatibility evidence for opening budget |
| `StoryStructureBeatTemplate.openingHook` | `boolean?` | same | Structure templates | Prompt Intelligence | Planning word allocation | Derived | Input to HookPlan constraints |
| `NarrativeBeat.openingHook` | `boolean?` | `narrative-plan.types.ts` | PI plan | Prompt Intelligence | Planning → research context | Derived — **not** final spoken hook | Grounded structural input only |
| `buildNarrativePlan` | fn | `build-narrative-plan.ts` | PI | Prompt Intelligence | Planning | Derived | Consume as HookGrounding / structure |
| `promptIntelligenceToPromptText` | fn | `prompt-intelligence-to-prompt.ts` | Research → context | Prompt Intelligence | Narration indirectly | Derived | Feed HookEngine via context, not as final text |
| `CreatorTemplatePromptHints.openingStyle` | `string` | `creator-template.types.ts` | Brief + prompt block | Creator Templates | Narration guidance (advisory) | Derived / advisory | Advisory input to HookRequest |
| `resolveCreatorTemplatePromptBlock` | fn | `creator-template-prompt.utils.ts` | Prompt assembly | Creator Templates | Narration (script-only) | Derived | One canonical adapter in 7D |
| `NarrativeBeatType = "hook"` | union member | `studio-intelligence.types.ts` | Beat detection | Studio Intelligence | Planning | Derived from narration | Downstream planning beat |
| `StoryStrategyHookStrategy` | interface | `story-strategy.types.ts` | Strategy resolve | SI strategy registry | Classification / timing / visual bias | Canonical **SI config** (not spoken) | **Remain SI-only** — must not inform or share Hook Engine 7B registry IDs |
| `hookStrategy.emphasis` etc. | fields | SI registry + `narrative-beat-detector.ts` | Beat classify | SI | Which early sentences become `"hook"` | Derived bias | Keep SI-owned for planning |
| `SceneBlueprintKind = "hook_opener"` | kind | `scene-blueprint.types.ts` | Scene plan | SI | Visual/scene planning | Derived | Visual/scene hook |
| Mode template slot `"hook"` | slotId | `mode-templates/mode-template.registry.ts` | Mode normalize | SI | Slot matching | Template preference | 7D awareness only |
| Validator rules `hook_opener`, `hook_strength` | rule IDs | `story-validator.*` | SI validation | SI | Planning scores / repair suggestions | Derived | Distinct from spoken Hook Validator (7C) |
| Publishing `buildStyleHook` | fn | publishing metadata utils | Post-generation packaging | Publishing | Social / packaging metadata | Derived from first sentence | **Publishing/social metadata hook** — outside Hook Engine; may read narration only |
| React `hooks/` / `use*` | React hooks | various | UI | Preview/editor | N/A | False friend | Ignore |

**Collision summary:** “Hook” currently means at least six different things — prompt guidance, PI opening-beat flag, template opening style, SI narrative beat, SI scene kind, and publishing metadata — none of which are a versioned narration-level Hook Contract.

---

## 6. Current prompt and word-budget behavior

### Prompt guidance (spoken opening)

- `buildStoryScriptPrompt`: “Open with a short, punchy first line (~1–2 spoken seconds when possible).”
- `buildFootieScriptPrompt`: “Open narration with a strong hook that pulls the viewer in immediately.”
- `STORY_STRUCTURE_NARRATION_RULES`: opening must land in roughly 1–2 spoken seconds; compress middle beats before cutting opening or ending (**guidance only**).

### Word budget

- Duration → hard word cap via narration duration budget utilities.
- `generateStoryScript` → `enforceScriptLengthBudget` → optional LLM `compressStoryScript` → hard truncate if still over.

### Opening budget note

The Prompt Intelligence “~1–2 spoken seconds” opening budget is **compatibility evidence**, not a universal permanent constant. Sprint 7B strategies may normalize opening constraints but cannot bypass the total narration hard cap.

---

## 7. Research and grounding flow

On `script-only`:

```text
enableResearch / researchPreview
  → resolveScriptResearchContext()
  → Prompt Intelligence / graph / assembled research text
  → context string into generateStoryScript / buildStoryScriptPrompt
```

PI contributes:

- Narrative structure and beats (including `openingHook` timing notes)
- Required / optional facts
- Forbidden claims
- Mode-specific rules

**Clarification:** Prompt Intelligence opening-beat planning is **not** currently the canonical final spoken hook. The model still emits free-form `narration`; no `openingHook` text field is stored.

On `full` / `scenes-only`: research context and template blocks are largely **dropped** (see matrix).

---

## 8. Template integration flow

```text
Template selection on /create
  → mergeCreationBriefWithTemplateSelection
  → StoryCreationBrief.templateId + templatePromptHints (includes openingStyle)
  → POST body.templatePromptHints
  → resolveCreatorTemplatePromptBlock()
  → templatePromptBlock string (Opening style: …)
  → buildStoryScriptPrompt (script-only only)
```

- Template block is labeled **advisory**; user content brief remains primary (`formatCreatorTemplatePromptBlock`).
- Hints are sanitized before assembly.
- Template module must not import prompt-intelligence / generate-script (verify constraint).

**Stale comments (drift):**

- `draft.types.ts`: “templatePromptHints — not consumed by generation yet” — **false** for script-only.
- `creator-template.types.ts`: “metadata only until wired” — **stale** for narration assembly; still true that PI does not consume templates directly.
- `footiebitz.ts` comments about PI consuming templates — **misleading**; templates are consumed by script prompt assembly.

---

## 9. Prompt Intelligence relationship

| Concern | Role today |
|---------|------------|
| `NarrativePlan` / `NarrativeBeat.openingHook` | Grounded structural planning |
| Fact assignments / forbidden claims | Safety and grounding for narration |
| Serialization into research context | Advisory input to narration model |
| Final spoken opening | **Not owned** — model output → `narration` |

Sprint 7 must treat PI as **grounded structural input** to the Hook Engine, not as a second spoken-text authority.

---

## 10. Studio Intelligence relationship

SI hook concepts are **downstream of completed narration**:

```text
StudioIntelligenceInput.narration
  → detectNarrativeBeats (type "hook" via window + patterns + StoryStrategyHookStrategy)
  → arcs → planSceneBlueprints (kind hook_opener)
  → visual / timing / caption biases
  → validateStoryCoherence (hook_opener, hook_strength)
  → optional blueprint adapter / materializer (excerpts — does not rewrite FootieScript.narration)
```

| SI concept | Meaning |
|------------|---------|
| `NarrativeBeatType = "hook"` | Planning label — never spoken aloud |
| `StoryStrategyHookStrategy` | Classification / timing / visual bias |
| `hook_opener` / `hook_strength` | Blueprint coherence, not linguistic provocativeness |

**Clarification:** SI must not become a second owner of final spoken hook text. Sprint 7 Hook Validator (spoken) is distinct from SI `hook_strength` (planning).

**Hardened boundary (Sprint 7A):** `StoryStrategyHookStrategy` remains **SI-only**. The Hook Engine and Sprint 7B Strategy Library must **not import** Studio Intelligence and must **not reuse SI IDs** as their registry. Similar vocabulary does not imply shared ownership. Any future one-way adapter must be downstream of committed narration and cannot create an upstream Hook Engine → SI dependency.

---

## 11. Compression risk

### Path

`enforceScriptLengthBudget` → `compressStoryScript` (LLM rewrite of whole script JSON) → `finalizeCompressedScript` → hard truncate from the **end** if still over.

### Risks

| Risk | Evidence |
|------|----------|
| Weaken / replace opening | Compression rules preserve facts/mode but **do not protect the opening/hook** (`script-generation.service.ts`) |
| Contradict earlier hook | Full narration rewrite can change first line while keeping “facts” |
| Fabricate | Prompt forbids inventing facts — **prompt-level only**, not a validator |
| PI “protect opening” rule | Exists in `STORY_STRUCTURE_NARRATION_RULES` but is **not enforced** in compression |
| Hard truncate | Cuts the end — partially protective of a surviving prefix **after** LLM rewrite |
| Compression failure | Original (possibly over-budget) kept with warning |

**Required future revalidation points:** after narration generation, after compression (re-extract + revalidate; compression is not the repair attempt), after hard truncate, before story-generation commit and voiceover.

**Hardened repair bound (Sprint 7A):** maximum **one** automated repair per narration-generation attempt. Quality failure after repair → validated compatibility fallback. Grounding/safety failure after repair → validated safe fallback or generation failure. A fallback that fails grounding/safety must never be committed.

---

## 12. Persistence and retry behavior

| Concern | Behavior |
|---------|----------|
| Brief | Built on create; template merged into `creationBrief` |
| Draft create | Only after successful script-only response |
| Retry generate | No draft on failure; user can resubmit |
| Canonical payload | `Draft.script: FootieScript`; `creationBrief` preserved |
| Review edit | User edits title/narration locally; **no** regenerate-narration API in review |
| Scenes retry | `scenes-only` with **current** (possibly edited) narration |
| Hook metadata | **None** persisted today |

Legacy briefs without template/hook metadata continue to load; omission is valid.

---

## 13. Editing / staleness behavior

There is no dedicated “edit hook” path — opening is the start of `script.narration`.

| When opening narration changes | Behavior |
|--------------------------------|----------|
| Before voiceover | Story Sync kind `"narration"`; no VO clear if no VO; SI/scenes **not** auto-replanned |
| After voiceover | `applyStoryUpdate` clears VO fields when narration text changes; Sync marks voice/preview/export dirty |
| After scenes exist | Global narration edit does **not** auto re-split scenes; asset planning may mark stale (`narration.global`) |
| Manual media/motion edits | Export dirty; not narration/hook regen |

**Implication:** Future hook regeneration after VO is an **ordinary narration change** and must use existing Story Sync / story-evolution rules. Hook Engine must not silently patch VO, scenes, MasterTimeline, preview, or ExportManifest.

---

## 14. Downstream invariant boundary

Confirmed by MASTER_ARCHITECTURE and code:

```text
Hook processing (future)
  → FootieScript.narration commit
  → Voiceover (timing authority)
  → Scene planning / SI (consumes narration)
  → Story Sync
  → MasterTimeline
  → Preview adapters / ExportManifest
  → Renderer
```

**Hook Engine must not directly patch:**

- Voiceover URLs / duration
- Scenes / timeline items
- MasterTimeline
- Preview runtime state
- ExportManifest / renderer / format adapters

Hook duration is part of the existing narration budget; it never adds project duration.

---

## 15. Identified gaps and risks

1. No narration-level Hook Contract, version, or diagnostics.
2. Multiple colliding “hook” vocabularies.
3. Template/research/mode guidance dropped on `full` and largely on `scenes-only`.
4. Compression can rewrite openings without revalidation.
5. PI opening protection is guidance-only.
6. SI `hook_strength` ≠ spoken provocativeness.
7. Opening edit dirties VO/planning but does not regenerate SI/scenes automatically.
8. Publishing `buildStyleHook` is a parallel packaging “hook”.
9. Stale comments claim templates are not consumed.
10. ROADMAP previously lacked Sprint 7 naming (being corrected in this phase).

---

## 16. Recommended canonical ownership

| Concern | Owner |
|---------|-------|
| Final spoken hook | Opening span of `FootieScript.narration` (committed by **story generation**) |
| Hook planning / strategy / validation (future) | Hook Engine (`src/features/hook-engine/` — not created until after acceptance) |
| Runtime plan vs snapshot | Ephemeral `HookPlan`; optional `HookPlanSnapshot` under `StoryCreationBrief.hookPlan` |
| Diagnostics | Optional generation-result/API envelope — not persisted by default |
| Grounded structure / facts / forbidden claims | Prompt Intelligence (input) |
| Advisory opening style | Creator Templates (input) |
| Scene/visual hook planning | Studio Intelligence (downstream consumer; SI-owned `StoryStrategyHookStrategy`) |
| Publishing/social metadata hook | Publishing (`buildStyleHook`) — outside Hook Engine |
| Dirty/stale after narration change | Story Sync / story-evolution |
| Timing / preview / export | MasterTimeline / Preview / Export (unchanged) |

---

## 17. Proposed Sprint 7B–7E integration seams

| Sprint | Seam |
|--------|------|
| **7B** | Immutable Hook Strategy Library; deterministic resolution on `NormalizedHookRequest`; opaque strategy IDs **independent of SI** |
| **7C** | Hook Validator (spoken quality + claim-trace grounding); deterministic opening-span fixtures; **one** repair attempt; distinct from SI planning validators |
| **7D** | Canonical Hook adapter on **every** narration-generating path (`generateStoryScript`, audio-first/`full`, `generateFootieScript` fallback); templates via one adapter; `scenes-only` never rewrites narration; no silent partial support |
| **7E** | Fixtures, regressions, prompt/safety/persistence QA, freeze decision |

Likely touch points (future implementation — not this phase): `script-generation.service.ts`, `prompts.ts`, `generate-script/route.ts`, `creator-templates` prompt block, intelligence context handoff, verification suites. SI remains consumer only (no Hook Engine → SI import).

---

## 18. Explicit non-goals

- Not creating Hook Engine code in 7A
- Not renaming SI / PI / template types
- Not making SI the spoken-hook owner
- Not adding duration outside narration budget
- Not unbounded model retry loops
- Not patching timeline/preview/export from Hook Engine
- Not requiring hook metadata for rendering
- Not fabricating facts to satisfy provocative strategies

---

## 19. Documentation drift discovered

| Location | Claim | Reality |
|----------|-------|---------|
| `draft.types.ts` | `templatePromptHints` not consumed | Consumed on script-only |
| `creator-template.types.ts` | Hints metadata only | Assembled into prompt block |
| `footiebitz.ts` comments | Optional until PI consumes | Templates consumed by script assembly, not PI |
| `docs/FEATURES.md` “Hybrid mode (static hook…)” | Caption hybrid wording | Not Sprint 7 Hook Engine |
| `docs/FUTURE.md` A/B openings | Speculative | Not shipped |
| React “hooks” in architecture docs | False friends | Ignore |
| ROADMAP (pre-7A) | No Sprint 7 Hook naming | MASTER already locked Sprint 7 |

---

## 20. Evidence-backed conclusions

1. The Hook Engine is a **story-generation subsystem** (not timeline/export).
2. It must run **before voiceover**.
3. Final spoken hook text lives in **canonical narration**.
4. Hook planning metadata is **not** a second story document.
5. Prompt Intelligence supplies **grounded structure**.
6. Creator Templates supply **advisory** opening preferences.
7. Studio Intelligence **consumes** completed narration for scene/visual hook planning; `StoryStrategyHookStrategy` remains **SI-only** (no Hook Engine → SI import; no shared strategy ID registry).
8. Compression must **preserve or revalidate** hook intent (re-extract; not counted as the one repair attempt).
9. `scenes-only` **never** rewrites narration.
10. Hook changes do **not** directly modify timeline or export contracts.
11. Grounding and safety **outrank** provocation.
12. All templates should eventually integrate through **one canonical hook adapter**.
13. Hook Engine returns an approved outcome; **story generation commits** `FootieScript.narration`.
14. Publishing `buildStyleHook` is a **publishing/social metadata hook** outside Hook Engine authority.
15. Every narration-generating path must use the Hook adapter before claiming Hook Engine guarantees; silent partial support is forbidden.
16. Repair bound is **one** automated attempt; grounding/safety-failed fallbacks must never be committed.

These conclusions are preserved in [`HOOK_CONTRACT.md`](./HOOK_CONTRACT.md) as proposed architecture pending **final** acceptance.

### Hardening addendum (Sprint 7A)

The Hook Architecture Audit is **approved**. Remaining architectural decisions (raw vs normalized request, source-type separation, grounding provenance, opening-span extraction, persistence, SI/publishing/legacy boundaries, repair bound, commit ownership) are frozen in the Hook Contract hardening pass. The contract remains **Proposed — awaiting architecture acceptance** and is **not** marked complete or accepted.

---

## Related documents

- [`HOOK_CONTRACT.md`](./HOOK_CONTRACT.md)
- [`MASTER_ARCHITECTURE.md`](../MASTER_ARCHITECTURE.md)
- [`STUDIO_INTELLIGENCE.md`](./STUDIO_INTELLIGENCE.md)
- [`GENERATION.md`](./GENERATION.md)
- [`DATA_MODEL.md`](./DATA_MODEL.md)
