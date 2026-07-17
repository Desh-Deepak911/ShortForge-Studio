# Retention Story Intelligence — Formal Contract

**Status:** **FROZEN after Sprint 10H.5C**
**Sprint:** 10A–10H.5C — Complete and accepted
**Architecture audit:** [RETENTION_STORY_ARCHITECTURE_AUDIT.md](./RETENTION_STORY_ARCHITECTURE_AUDIT.md) — **accepted as evidence**
**Precondition:** Sprint 9 frozen · ExportManifest v3 / `"9C"` frozen
**10B:** **Complete and accepted** (`src/features/retention-story/` · `npm run test:retention-story-contract`)
**10C / 10C.1 / 10C.1A:** **Complete and accepted** (`strategy/` · `npm run test:retention-story-strategy`) — controlling idea + `EmotionalArcBlueprint` (pre-beat); exact-token subject authority; factual claim-support equality; candidate/seed coherence; terminal seed deep-freeze; **no model call** in 10C
**10D / 10D.1 / 10D.1A / 10D.1B:** **Complete and accepted** (`planning/` · `npm run test:retention-story-planning`) — Retention Beat + Pacing Intelligence; planner/pacing authority hardening; bare + phrase-complete match-result factual authority. Still **unwired from generation**.
**10E / 10E.1 / 10E.1A:** **Complete and accepted** (`composition/` · `budget/` · `integration/` · `npm run test:retention-story-composer` · `npm run test:retention-hook-bridge` · `npm run test:retention-generation-budget`) — asserted-seed sole controlling-idea claim authority; scenes-only ledger validated before early return. **Not** production-route-activated; no Retention Validator / rewrite / commit gating (10F–10H).
**10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C / 10F.2 / 10F.2A / 10F.3 / 10F.3A / 10F.3B:** **Validator + Studio rewrite + terminal Hook authority + production hardening accepted** (`validation/` · `rewrite/` · `production/` · `npm run test:retention-story-validator` · `npm run test:retention-story-rewrite` · `npm run test:retention-terminal-validation` · `npm run test:retention-production-integration`) — canonical Retention production orchestrator; commit-gate live ledger semantic equality; call-kind-aware output-token budgets; failure envelopes never carry plan/validation snapshots; **total fail-closed safe Hook diagnostics terminal coherence**; private-data-free exception boundary.
**10G / 10G.1 / 10G.1A:** **Explainability + Story Strategy UI + persistence authority accepted** (`presentation/` · Create Story Strategy selector · Review Story intelligence · total persistence validators · `npm run test:retention-story-ui`) — duration-compatible Auto / Retention-first / Standard; linked plan/validation explainability; draft-load sanitization; **total fail-closed validator exception boundary** (hostile getters/Proxies); privacy-safe.
**10H–10H.5C:** **Complete and accepted — Sprint 10 frozen** (`npm run test:retention-story-sprint` · 435-cell Flexible reliability matrix · 13/13 Core live-model cases · operator-confirmed local Create/Review/persistence/audio-first Pass · [freeze ledger](./qa/retention-story-sprint-10-freeze.md)). Evidence Surprise / live research remains capability-gated.
**Sprint 11:** Headless Renderer — **ready to begin**

This contract defines the frozen Retention Story Intelligence v1 authority for concise Shorts (primary retention target **25–35 seconds**), with extensible format strategies for longer envelopes.

**Truth rule:** Retention Story Intelligence v1 is **frozen after 10H.5C**. Deterministic QA, the 13/13 Core live matrix, and local product evidence genuinely passed. Capability-gated research paths must not be read as shipping.

Historical milestone status blocks below are retained as implementation history; this final status governs.

---

## 1. Purpose

Transform story generation from “write an engaging narration” into an explicit, retention-first planning pipeline that:

1. Normalizes a Story Contract from the creator brief (canonical types)
2. Completes a `RetentionStoryPlan` (controlling idea, arc, beats, pacing, density, payoff, compression goals) **before** Hook planning
3. Derives a narrow `RetentionHookHandoff` from that completed plan
4. Composes a structured narration candidate with beat/claim trace
5. Runs path-global length enforcement + Hook approval, then rebuilds candidate identity
6. Validates retention readiness; allows at most one quality-only body rewrite that preserves the approved opening
7. Commits only on Pass into `FootieScript.narration`

Actual audience retention prediction (percentiles, A/B lift) is **out of scope**. Scores are framework heuristics only.

---

## 2. Authority boundaries

### 2.1 Prompt Intelligence / research

**Owns:** grounded facts, forbidden claims, research-derived structure, factual beat opportunities, research provenance.

**Does not own:** final controlling idea, emotional curve, committed narration, retention scores, spoken hook text.

Retention Story Intelligence consumes ephemeral structured grounding input derived from PI/research. It must **not** import Hook domain types or create a competing fact authority.

### 2.2 Hook Engine (frozen)

**Owns:** spoken opening strategy, Hook plan/directive, opening extraction, safety/grounding gates, bounded Hook repair/fallback, approved opening outcome (text + offsets).

**Retention Story Intelligence must not:**

- Create a second spoken-hook authority
- Reuse Hook strategy IDs in its registry or handoff
- Patch `FootieScript` independently of story-generation commit
- Reset Hook repair / fallback / length-compression budgets during Retention rewrite

### 2.3 Retention Story Intelligence (this contract)

**Owns:**

- Normalized Story Contract
- Format strategy resolution (Auto + optional explicit short strategies)
- Controlling idea, desired audience reaction, emotional curve
- Prescriptive `RetentionBeat` plan
- Pacing, information density, visual density, payoff, compression **goals**
- Complete `RetentionStoryPlan` before Hook handoff
- Narrow `RetentionHookHandoff` (psychological constraints only)
- Structured narration candidate assembly + beat/claim trace (ephemeral)
- Retention-readiness validation (hard gates + editorial heuristics)
- Bounded quality-only body rewrite (≤1 when `QualityMode` allows)

**Plans the experience before narration is committed.**

### 2.4 Story generation

**Owns:** narrative composition orchestration; path-global length **enforcement** (single owner — reconcile call-site docs in 10F); committing approved narration into `FootieScript.narration`.

### 2.5 Studio Intelligence (frozen, downstream)

SI `NarrativeBeat` is **descriptive** scene/visual planning from committed narration. Upstream beats use **`RetentionBeat`** only.

### 2.6 Story Sync and downstream (frozen)

Retention Story Intelligence **must not directly patch:** voiceover · scenes · MasterTimeline · captions · media timelines · transitions · Preview · ExportManifest · renderer state.

---

## 3. Canonical types (references)

Production sources of truth (type-only references for implementers):

| Concept | Canonical location |
|---------|-------------------|
| `ScriptMode` | `src/types/footiebitz.ts` |
| `Tone` | `src/types/footiebitz.ts` |
| `QualityMode` | `src/types/footiebitz.ts` (`"cheap"` \| `"balanced"` \| `"best"`) — UI labels Fast / Balanced / Studio |
| `CreatorTemplateId` | `src/features/creator-templates/creator-template.types.ts` |
| `HookStyleSelection` | `src/features/hook-engine/presentation/hook-style-selection.ts` |
| API generation modes | `GenerateScriptMode` = `"full"` \| `"script-only"` \| `"scenes-only"` in `src/types/footiebitz.ts` |
| Internal generation path | `"script_only"` \| `"audio_first_full"` \| `"scenes_only"` (see `audio-first-generation.service.ts`) |
| UI duration presets | `BRIEF_DURATION_OPTIONS = [30, 45, 60]` in `create-brief.constants.ts` |
| Hook duration envelope | `HOOK_MIN_DURATION_SECONDS = 15` · `HOOK_MAX_DURATION_SECONDS = 60` |

---

## 4. Proposed TypeScript shapes

Markdown shapes for implementation in 10B+. Names are collision-free with current production types unless explicitly importing the canonical types above.

```ts
/** Contract schema version for fingerprints / loaders. */
type StoryContractVersion = "retention-story-contract/1";

/** Internal path identity (maps from GenerateScriptMode). */
type RetentionGenerationPath =
  | "script_only"        // API "script-only"
  | "audio_first_full"   // API "full"
  | "scenes_only";       // API "scenes-only" — RSI must not plan/rewrite

type StoryFormatStrategyId =
  | "short_retention"
  | "short_standard"
  | "extended_short"
  | "long_form_explainer"
  | "long_form_documentary";

type StoryDurationClass =
  | "ultra_short"   // 15–24s (Hook-capable; not a Create UI preset)
  | "short"         // 25–35s — primary retention target
  | "extended"      // 36–60s
  | "long_form";    // >60s — future only; rejected by production adapter

/** Domain-neutral audience — football interpretation belongs in adapters only. */
type AudienceIntent =
  | "general_audience"
  | "enthusiast"
  | "expert"
  | "community";

type DesiredViewerReaction =
  | "curiosity"
  | "surprise"
  | "debate"
  | "awe"
  | "satisfaction"
  | "urgency";

type InformationDensity = "sparse" | "balanced" | "dense";
type VisualDensity = "low" | "medium" | "high";
type PacingProfile = "front_loaded" | "escalating" | "reveal_late";
type EndingStrategy = "payoff_reveal" | "challenge" | "resolution" | "open_loop";

/**
 * Ephemeral structured grounding for planning — independent of Hook types.
 * Prompt Intelligence / research remains provenance owner.
 */
type RetentionClaimProvenance =
  | "research_graph"
  | "research_provider"
  | "manual_user"
  | "inferred"
  | "unknown";

type RetentionClaimVerification =
  | "verified"
  | "unverified"
  | "rejected"
  | "forbidden";

/**
 * Ephemeral planner-facing claim — must carry bounded semantic text, not IDs alone.
 * Retention Story owns its own normalization constants; must not import Hook constants or Hook domain types.
 */
interface RetentionGroundingClaim {
  readonly claimId: string;                 // stable id from PI/research (sanitized, non-empty)
  readonly text: string;                    // bounded sanitized semantic claim content for planning
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly permittedFactualUse: boolean;    // false when forbidden/rejected/ineligible
  readonly forbidden: boolean;
  readonly sourceRef?: string;              // optional bounded sanitized source reference
  readonly piBeatId?: string;               // optional PI beat relationship
  readonly piFactRole?: string;             // optional PI fact relationship label
}

interface RetentionGroundingContext {
  readonly version: 1;
  readonly claims: readonly RetentionGroundingClaim[];
  /**
   * Deterministic semantic identity over normalized claim content, IDs, provenance,
   * verification, permission state, and order-independent claim membership.
   * Raw claim text is not persisted; identity is.
   */
  readonly researchIdentity: string | null;
}

interface ControllingIdea {
  readonly statement: string; // one sentence, one idea
  readonly mustPreserveThroughCompression: true;
}

/**
 * Sprint 10C intermediate — pre-beat emotional strategy.
 * Uses semantic phases only. Ephemeral; not persisted.
 * 10D binds phases to ordered RetentionBeat IDs → final EmotionalArc.
 * Do not invent placeholder beat IDs in 10C.
 */
interface EmotionalArcBlueprint {
  readonly version: 1;
  readonly primaryEmotion: string;
  readonly secondaryEmotion?: string;
  readonly curve: readonly {
    readonly phase: "opening" | "build" | "turn" | "payoff";
    readonly emotion: string;
    readonly intensity: 1 | 2 | 3 | 4 | 5;
  }[];
  readonly blueprintFingerprint: string;
}

/** Final arc inside RetentionStoryPlan — produced in 10D after beats exist. */
interface EmotionalArc {
  readonly primaryEmotion: string;
  readonly secondaryEmotion?: string;
  readonly curve: readonly {
    readonly atBeatId: string;
    readonly emotion: string;
    readonly intensity: 1 | 2 | 3 | 4 | 5;
  }[];
}

type RetentionBeatPurpose =
  | "hook_handoff"
  | "curiosity"
  | "reframe"
  | "proof"
  | "escalation"
  | "conflict"
  | "twist"
  | "reveal"
  | "payoff"
  | "challenge"
  | "resolution";

/**
 * Prescriptive psychological event — NOT a scene, NOT MasterTimeline authority.
 */
interface RetentionBeat {
  readonly id: string;
  readonly purpose: RetentionBeatPurpose;
  readonly emotionalIntent: string;
  readonly viewerQuestion: string;
  readonly informationContribution: string;
  readonly narrationGoal: string;
  readonly visualOpportunity: string;
  readonly estimatedStartMs: number;
  readonly estimatedEndMs: number;
  readonly noveltyRole: "setup" | "escalate" | "payoff" | "bridge";
  readonly groundingClaimRefs: readonly string[]; // claim IDs only
  readonly controllingIdeaRelation: "establishes" | "supports" | "pays_off";
  readonly payoffRelation: "none" | "setup" | "deliver";
}

interface RetentionBeatPlan {
  readonly version: 1;
  readonly beats: readonly RetentionBeat[];
  readonly targetBeatCountRange: { readonly min: number; readonly max: number };
}

/**
 * Narrow Hook handoff — collision-free with Hook strategy IDs and spoken text.
 * Derived from a COMPLETE RetentionStoryPlan. Hook Engine remains sole spoken-opening authority.
 */
interface RetentionHookHandoff {
  readonly version: 1;
  /** Intended psychological function of the opening (not a HookStrategyId). */
  readonly openingPsychologicalFunction: string;
  readonly controllingIdeaRelation: "establishes" | "supports" | "teases";
  readonly nextBeatPurpose: RetentionBeatPurpose;
  readonly desiredTransitionIntoBody: string;
  readonly groundingRequirements: {
    readonly requireEligibleClaimRefs: boolean;
    readonly claimIds: readonly string[];
  };
  // MUST NOT contain: Hook strategy IDs, spoken opening text, candidate selection,
  // Hook thresholds, repair/fallback authority.
}

interface RetentionCompressionGoals {
  readonly targetWordBudget: number;
  readonly preserveControllingIdea: true;
  readonly preservePayoff: boolean;
  readonly maxDeadAirSec: number;
}

/**
 * Additive raw adapter input — tolerant of legacy absence.
 * Normalization produces required, sanitized, bounded, immutable contract state.
 */
interface StoryContractInput {
  readonly version?: StoryContractVersion;
  readonly topic: string;
  readonly durationSec: number;
  readonly scriptMode?: ScriptMode;          // canonical; default via resolveScriptMode
  readonly tone?: Tone;                      // canonical
  readonly qualityMode?: QualityMode;        // canonical; default "balanced" when absent
  readonly formatStrategyId?: StoryFormatStrategyId | "auto";
  readonly audienceIntent?: AudienceIntent;
  readonly desiredReaction?: DesiredViewerReaction;
  readonly templateId?: CreatorTemplateId | null;
  readonly userInstructions?: string | null;
  readonly hookStyle?: HookStyleSelection;   // opaque selection identity — not HookStrategyId authority
  readonly userAuthoredHook?: string | null;
  readonly researchIdentity?: string | null;
  readonly manualContext?: string | null;    // raw text tolerated at input; never persisted in plan snapshot
  readonly generationPath: RetentionGenerationPath;
  readonly apiMode?: GenerateScriptMode;     // optional mirror of HTTP mode
  readonly constraints?: {
    readonly forbidGenericIntro?: boolean;
    readonly requirePayoff?: boolean;
  };
  /** Ephemeral; not part of contract fingerprint text blobs — identity hashes only. */
  readonly grounding?: RetentionGroundingContext | null;
}

/** Sanitized semantic identities — hashes / stable digests, not raw text. */
interface StoryContractSemanticIdentities {
  readonly topicNormalized: string;
  readonly manualContextIdentity: string | null;
  readonly userInstructionsIdentity: string | null;
  readonly hookStyleIdentity: string;          // from HookStyleSelection
  readonly userAuthoredHookIdentity: string | null;
  readonly researchContextIdentity: string | null;
}

interface NormalizedStoryContract {
  readonly version: StoryContractVersion;
  readonly topic: string;
  readonly durationSec: number;                // clamped to product policy (Hook paths: 15–60)
  readonly durationClass: StoryDurationClass;
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly qualityMode: QualityMode;           // legacy absence → "balanced"
  readonly formatStrategyId: StoryFormatStrategyId; // long_form_* rejected by production adapter
  readonly audienceIntent: AudienceIntent;
  readonly desiredReaction: DesiredViewerReaction;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly pacingProfile: PacingProfile;
  readonly endingStrategy: EndingStrategy;
  readonly templateId: CreatorTemplateId | null;
  readonly templateInfluence: "none" | "advisory";
  readonly generationPath: RetentionGenerationPath;
  readonly constraints: {
    readonly forbidGenericIntro: boolean;
    readonly requirePayoff: boolean;
  };
  readonly identities: StoryContractSemanticIdentities;
  /** Grounding availability is derived from ephemeral grounding context, not a lone boolean. */
  readonly groundingSummary: {
    readonly claimCount: number;
    readonly eligibleClaimCount: number;
    readonly forbiddenClaimCount: number;
    readonly researchIdentity: string | null;
  };
  readonly contractFingerprint: string; // see §12 — no timestamps
}

interface RetentionStoryPlan {
  readonly version: 1;
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly strategyRegistryVersion: string;
  readonly controllingIdea: ControllingIdea; // exactly one object
  readonly emotionalArc: EmotionalArc;
  readonly beatPlan: RetentionBeatPlan;
  readonly pacingProfile: PacingProfile;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly endingStrategy: EndingStrategy;
  readonly compressionGoals: RetentionCompressionGoals;
  /** Claim ID relationships used by the plan (IDs/counts only). */
  readonly claimIdRelationships: readonly string[];
  /**
   * Derived AFTER the plan fields above are complete.
   * Never built from a partial plan.
   */
  readonly hookHandoff: RetentionHookHandoff;
}

type RetentionNarrationCandidateOrigin =
  | "initial_compose"
  | "after_hook_approval"
  | "after_length_enforcement"
  | "after_body_rewrite"
  | "final";

interface RetentionNarrationSegment {
  readonly beatId: string;
  readonly text: string;
  readonly startOffset: number; // deterministic char offset in assembled narration
  readonly endOffset: number;
  /** Adapter/model-supplied claim refs — never inferred from text resemblance. */
  readonly claimRefs: readonly string[];
  readonly factualRisk: boolean;
}

interface RetentionNarrationCandidate {
  readonly version: 1;
  readonly origin: RetentionNarrationCandidateOrigin;
  readonly planFingerprint: string;
  readonly orderedBeatIds: readonly string[];
  readonly segments: readonly RetentionNarrationSegment[];
  readonly assembledNarration: string; // complete spoken candidate before/after Hook reconcile
  readonly candidateFingerprint: string;
}

type RetentionHardGateId =
  | "one_controlling_idea_object"
  | "plan_candidate_fingerprint_coherent"
  | "beat_ids_unique"
  | "beat_budgets_finite_ordered_within_duration"
  | "no_empty_segment"
  | "required_payoff_beat_present"
  | "factual_risk_segments_have_eligible_claim_refs"
  | "hook_terminal_approval"
  | "narration_fits_hard_duration_word_policy"
  | "lexical_forbidden_intro_pattern" // optional when constraints.forbidGenericIntro
  | "no_downstream_mutation";

type RetentionEditorialComponentId =
  | "clarity"
  | "curiosity"
  | "emotional_progression"
  | "compression_quality"
  | "novelty"
  | "escalation"
  | "payoff_strength"
  | "visual_potential"
  | "repetition_penalty"
  | "controlling_idea_adherence" // semantic — not a hard gate
  | "generic_introduction_quality"; // semantic quality beyond lexical patterns

interface RetentionEditorialScores {
  /** Internal [0,1] — UI may display as 0–100. */
  readonly clarity: number;
  readonly curiosity: number;
  readonly emotionalProgression: number;
  readonly compressionQuality: number;
  readonly novelty: number;
  readonly escalation: number;
  readonly payoffStrength: number;
  readonly visualPotential: number;
  readonly repetitionPenalty: number; // higher = worse repetition; inverted in aggregates
  readonly controllingIdeaAdherence: number;
  readonly genericIntroductionQuality: number;
}

interface RetentionValidationResult {
  readonly ok: boolean; // false if any hard gate failed — aggregates cannot override
  readonly hardGates: readonly {
    readonly id: RetentionHardGateId;
    readonly passed: boolean;
    readonly detail: string;
  }[];
  readonly editorial: RetentionEditorialScores;
  readonly retentionReadiness: number;       // [0,1] derived — see §11
  readonly storyQualityConfidence: number;   // [0,1] — defined in §11
  readonly frameworkCompliance: number;      // [0,1] — defined in §11
  readonly notes: readonly string[];
  readonly validationFingerprint: string;
  /** Must reference final approved candidate only. */
  readonly candidateFingerprint: string;
}

interface RetentionDiagnostics {
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly candidateFingerprint: string | null;
  readonly validationFingerprint: string | null;
  readonly rewriteUsed: boolean;
  readonly terminalState: "pass" | "pass_after_rewrite" | "fail";
  readonly safeSummary: string; // no prompts, CoT, raw critique, research dumps
}

/** Persisted only after successful narration commit. No retentionReadiness here. */
interface RetentionStoryPlanSnapshot {
  readonly version: 1;
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly controllingIdea: string;
  readonly primaryEmotion: string;
  readonly secondaryEmotion?: string;
  readonly beatCount: number;
  readonly pacingProfile: PacingProfile;
  readonly endingStrategy: EndingStrategy;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly claimIdCount: number;
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly strategyRegistryVersion: string;
}

/** Persisted beside plan snapshot after successful narration commit. */
interface RetentionValidationSummary {
  readonly version: 1;
  readonly ok: true;
  readonly retentionReadiness: number;     // [0,1]
  readonly storyQualityConfidence: number; // [0,1]
  readonly frameworkCompliance: number;    // [0,1]
  readonly failedHardGateIds: readonly []; // empty on persist
  readonly warningNotes: readonly string[];
  readonly validationFingerprint: string;
  readonly candidateFingerprint: string;   // identity only — not candidate text
}
```

---

## 5. Format-strategy capability matrix

Creator UI duration presets today: **30 / 45 / 60** seconds (`BRIEF_DURATION_OPTIONS`).
Hook-capable narration envelope: **15–60** seconds.

| Strategy | Duration class | Contract admissible | Current UI reachable | Sprint 10 implementation target | Future only |
|----------|----------------|---------------------|----------------------|---------------------------------|-------------|
| `short_retention` | short (25–35s) | Yes | **Yes via Auto at 30s** (only UI preset inside 25–35s) | **Yes — primary** | No |
| `short_standard` | short | Yes | Not as Auto; optional explicit in **10G** | Optional explicit only | No |
| `extended_short` | extended (36–60s) | Yes | **Yes via Auto at 45/60s** | **Yes** | No |
| `long_form_explainer` | long_form | Yes (contract schema) | No — hidden/disabled | No — **rejected by production adapter** | **Yes** |
| `long_form_documentary` | long_form | Yes (contract schema) | No — hidden/disabled | No — **rejected by production adapter** | **Yes** |

**Required Auto resolution:**

| Duration (normalized seconds) | Auto → strategy |
|-------------------------------|-----------------|
| 15–35 | `short_retention` |
| 36–60 | `extended_short` |

Notes:

- **30 seconds** is currently the **only** Create UI preset inside the primary 25–35s retention target.
- 15–24s is Hook-capable but not a Create preset; if reached via API, Auto still maps to `short_retention`.
- Production narration is Retention-wired after **10F.3**; freeze still requires **10H**.
- Beat count is **not** hard-coded; derive a range from duration + strategy (e.g. short_retention ≈ `ceil(durationSec/5)` … `floor(durationSec/2)` clamped).

**Short-form retention strategy expectations** (`short_retention`):

- Immediate opening (via Hook Engine)
- One controlling idea
- Approximately 2–5 seconds per psychological beat
- Minimal contextual setup
- Frequent novelty/escalation
- Strong payoff
- Strict compression goals
- High visual opportunity density

---

## 6. Retention Beat semantics

A **RetentionBeat** is a prescriptive psychological event in the viewer experience.

| Rule | Requirement |
|------|-------------|
| Not a scene | Beats do not own MasterTimeline slots |
| Mapping | One beat → 0..n future scenes; one scene may support part of a beat |
| Timing | Estimated start/end are **budgets**, not rendered clocks |
| Grounding | Factual-risk beats carry claim IDs; text resemblance alone never proves a claim |
| Hook handoff | Plan completes first; `RetentionHookHandoff` is derived; Hook Engine owns spoken opening |
| Payoff | When `requirePayoff`, a beat with `payoffRelation: "deliver"` must exist structurally |

---

## 7. Canonical lifecycle (plan complete before Hook)

Pacing, density, payoff, and compression goals are fields of the completed `RetentionStoryPlan` and must be finalized **before** Hook handoff. Do not introduce a separate post-Hook pacing step.

```text
Creator Brief
→ StoryContractInput (raw, tolerant)
→ Normalized Story Contract
→ Grounded planning context (ephemeral RetentionGroundingContext from PI/research)
→ Controlling Idea
→ Emotional Arc
→ Retention Beat Plan
→ Pacing / density / payoff / compression goals
→ Complete RetentionStoryPlan  (includes derived RetentionHookHandoff)
→ Hook Engine plan/directive (frozen authority; consumes handoff constraints only)
→ Compose structured RetentionNarrationCandidate (segments by beat)
→ Path-global length enforcement (single owner)
→ Hook validation / approved opening outcome
→ Rebuild final candidate identity (Hook mutation reconciliation)
→ Retention validation
→ pass
   or quality-only failure with rewrite budget
→ one body rewrite preserving exact approved opening
→ Deterministic assembly
→ Final length enforcement under remaining path-global budget
→ Hook revalidation WITHOUT resetting Hook repair/fallback counters
→ Rebuild candidate identity
→ Final Retention validation
→ pass or fail
→ Commit FootieScript.narration only on Pass
→ Voiceover
→ Scene / Studio Intelligence
→ Story Sync
→ Timeline / Preview / Export
```

**Scenes-only:** Retention Story Intelligence does **not** plan or rewrite narration.

---

## 8. Hook handoff shape

`RetentionHookHandoff` (see §4) is the only Retention→Hook bridge for opening psychology.

| May include | Must not include |
|-------------|------------------|
| Opening psychological function | Hook strategy IDs |
| Controlling-idea relationship | Spoken opening text |
| Next beat purpose | Candidate selection |
| Desired transition into body | Hook thresholds |
| Grounding requirements (claim IDs) | Repair / fallback authority |

Hook Engine remains the **only** spoken-opening authority.

---

## 9. Grounding input and provenance policy

### 9.1 Runtime supplier and planner input

| Step | Owner |
|------|--------|
| Research + Prompt Intelligence | Existing production path: `resolveScriptResearchContext` / `resolveResearchPromptText` / `buildNarrativePlan` (+ assembled research context) |
| Map PI/research → `RetentionGroundingContext` | **Retention Story grounding adapter** (implemented in 10B+; Retention-owned module) |
| Hook evidence mapping | Frozen Hook path (`buildNeutralResearchEvidence`, Hook claim types) — **must not** be imported or reused as Retention’s claim authority |
| Planner / composer model input | Receives only **bounded normalized** claim content (`claimId`, sanitized `text`, provenance/verification/permission flags, optional `sourceRef` / PI links) |

A lone boolean grounding flag is **insufficient**. Each ephemeral claim **must** include semantic `text` so a planner can form a grounded controlling idea and beats from content, not IDs alone.

### 9.2 Normalization and eligibility rules

Retention Story owns its own normalization constants and **must not** import Hook constants or Hook domain types.

- Claim IDs, claim `text`, and optional `sourceRef` are **sanitized and bounded** (max lengths defined by Retention constants in 10B).
- Empty claim IDs or empty semantic text are **rejected or removed** during normalization.
- Research **source trust is an explicit Retention allowlist** (`api-football`, `statsbomb`, `static-fallback` only). Trusted Graph sources become `research_graph`; trusted Assembled sources become `research_provider`. `user` / `manual` → `manual_user`; `inferred` / `assembly` → `inferred`; `fallback`, missing, and any unrecognized runtime string → `unknown` (unverified, not permitted). Future provider IDs must be added to the allowlist explicitly.
- Opaque `researchIdentity` values (zero-claim contexts) must match the production FNV-1a format `rsr:[0-9a-z]{1,7}` (32-bit digest → at most seven lowercase base36 digits); raw sentences, whitespace, URLs, wrong prefixes, and over-length values are rejected (`invalid_research_identity`).
- Runtime grounding structure must satisfy `version === 1` and `claims` as an array (`invalid_grounding_context`); TypeScript types alone are insufficient.
- Same-ID metadata merges **sort → join → re-bound** (`sourceRef`, `piFactRole`, `piBeatId`) so truncation remains order-independent.
- Only claims that are **verified**, **permittedFactualUse: true**, and **not forbidden** may support factual narration.
- `manual_user`, `inferred`, `unknown`, `rejected`, or `forbidden` claims **cannot independently prove** factual assertions.
- Manual context may influence requested opinion, tone, framing, or creator intent **without** being upgraded to verified evidence.
- Forbidden/rejected claims may be retained **only** for avoidance diagnostics; they must **never** be presented to the planner as usable evidence.
- Full claim text is **ephemeral**. It must **not** be stored in `StoryCreationBrief`, plan snapshots, validation summaries, diagnostics, or fingerprints as raw text.
- Plans and candidates continue to **trace claims by stable IDs** only.

### 9.3 `researchIdentity`

`researchIdentity` is a deterministic semantic identity covering:

- normalized claim content (sanitized text included in the hash input at runtime only)
- claim IDs
- provenance
- verification
- permission / forbidden state
- order-independent claim membership

A semantic claim change **must** change `researchIdentity` and thereby invalidate the **contract fingerprint** (via research-context semantic identity). Persisted artifacts store the identity string / claim ID counts — never raw claim text.

| Layer | Policy |
|-------|--------|
| Planning input | Ephemeral `RetentionGroundingContext` with semantic claims |
| Provenance owner | Prompt Intelligence / research |
| Hook types | Must not be imported into Retention Story domain |
| Plan / snapshot / diagnostics | Claim **IDs and counts** (+ identity digests) only — never full claim/research text |
| Manual context | Raw text may exist on `StoryContractInput`; only `manualContextIdentity` enters fingerprints / snapshots |
| Truth rule | Never infer a claim is true because narration text resembles an available claim |

---

## 10. Narration candidate, segments, and Hook mutation reconciliation

### 10.1 Composition result

```text
RetentionBeat
→ structured RetentionNarrationSegment
→ deterministic ordered assembly
→ RetentionNarrationCandidate
```

Final persisted spoken authority remains **only** `FootieScript.narration`.
Segment and claim traces are **ephemeral** unless a sanitized validation summary is persisted (identities/scores only — not candidate text).

### 10.2 Hook mutation reconciliation

Hook repair, deterministic fallback, length enforcement, or opening replacement may change offsets.

After an approved Hook outcome:

1. Approved opening **text and offsets** come from Hook Engine
2. Narration candidate identity is **recomputed**
3. First-segment offsets/trace are **reconciled** to the approved opening
4. Retention validation **always** consumes the **final** approved narration candidate
5. Stale pre-Hook candidate validation **cannot** be terminal evidence

---

## 11. Validation: hard gates vs editorial heuristics

### 11.1 Deterministic hard gates

Structural / attribution facts only:

- Exactly one `ControllingIdea` object in the plan
- Plan and candidate fingerprint coherence
- Beat IDs unique
- Beat budgets finite, ordered, and within target duration
- No empty segment
- Required payoff beat exists **structurally** when constrained
- Factual-risk segments contain **known eligible** claim references (adapter-supplied)
- Hook terminal approval exists (Hook-capable paths)
- Narration fits hard duration/word policy
- Lexical forbidden-introduction **patterns** when `forbidGenericIntro` (pattern match only)
- No downstream mutation by RSI

Any hard-gate failure → `ok: false`. **No aggregate score may override.**

### 11.2 Editorial / heuristic checks

Semantic judgment — not labelled deterministic:

- Narration actually adheres to one controlling idea
- Curiosity strength, emotional progression, novelty, escalation
- Payoff quality, visual potential
- Generic-introduction **quality** beyond lexical patterns
- Semantic repetition (`repetitionPenalty`)

### 11.3 Score semantics (internal `[0,1]`)

Component scores (all bounded `[0,1]`):

| Component | Meaning |
|-----------|---------|
| `clarity` | Understandability of spoken segments |
| `curiosity` | Question/tension generation early/mid |
| `emotionalProgression` | Arc intensity movement quality |
| `compressionQuality` | Density without dead air / fluff |
| `novelty` | New information / reframe rate |
| `escalation` | Rising stakes vs flatline |
| `payoffStrength` | Closing satisfaction vs setup |
| `visualPotential` | Visualizable opportunity density |
| `repetitionPenalty` | Penalty mass (0 = none, 1 = severe) |
| `controllingIdeaAdherence` | Semantic single-idea adherence |
| `genericIntroductionQuality` | Soft anti-generic quality (1 = good) |

**Strategy thresholds (v1 defaults — tune in 10F goldens):**

| Strategy | Min `retentionReadiness` to Pass* | Notes |
|----------|-----------------------------------|-------|
| `short_retention` | 0.62 | Higher novelty/escalation/payoff weights |
| `short_standard` | 0.55 | Softer novelty/escalation |
| `extended_short` | 0.58 | Allows slightly more setup; still requires payoff when constrained |
| `long_form_*` | n/a in Sprint 10 | Rejected by production adapter |

\*Pass still requires **all** hard gates. Threshold applies only after hard gates pass.

**Derivations (exact):**

```text
noveltyEscalationPayoff =
  (novelty + escalation + payoffStrength) / 3

coreEngagement =
  (clarity + curiosity + emotionalProgression + compressionQuality + visualPotential) / 5

retentionReadiness =
  clamp01(
    0.34 * coreEngagement
  + 0.28 * noveltyEscalationPayoff
  + 0.18 * controllingIdeaAdherence
  + 0.10 * genericIntroductionQuality
  + 0.10 * (1 - repetitionPenalty)
  )

storyQualityConfidence =
  clamp01(
    0.40 * clarity
  + 0.25 * controllingIdeaAdherence
  + 0.20 * compressionQuality
  + 0.15 * emotionalProgression
  )

frameworkCompliance =
  clamp01(
    (hardGatesPassedCount / hardGatesEvaluatedCount)   // structural fraction
  )
```

For `short_retention`, weight `noveltyEscalationPayoff` at **0.34** and `coreEngagement` at **0.28** (swap vs defaults above).

UI may show `round(score * 100)` as 0–100.
**Forbidden language:** predicted retention %, guaranteed watch-through, scientific audience prediction.

---

## 12. Fingerprint compositions

Four separate identities. **No timestamps** in any fingerprint.

### 12.1 Contract fingerprint

Normalized **upstream request** identity only:

- `StoryContractVersion`
- normalized topic
- `durationSec`
- `ScriptMode`
- `Tone`
- `QualityMode`
- template (`CreatorTemplateId` or none)
- Hook selection identity (`HookStyleSelection`)
- user-authored Hook identity
- research / manual-context semantic identities (`researchIdentity` covers normalized claim content + IDs + provenance + verification + permission + order-independent membership; raw claim text is not stored in the fingerprint string as plaintext persistence)
- format strategy (resolved)
- creator constraints
- `RetentionGenerationPath`

**Exclude:** planner/strategy registry version · resolved plan constraints · controlling idea · beats · timestamps · raw claim text persistence.

### 12.2 Plan fingerprint

- contract fingerprint
- planner / strategy registry version
- concrete resolved planning constraints
- controlling idea
- emotional arc
- ordered beats (ids, purposes, budgets, claim refs)
- pacing / density / payoff / compression goals
- claim ID relationships
- `RetentionHookHandoff` (derived fields)

Registry changes invalidate the **plan**, not the contract.

### 12.3 Candidate fingerprint

- plan fingerprint
- ordered narration segments (beat ids + text + claim refs)
- final assembled narration
- claim/beat trace
- candidate origin

### 12.4 Validation fingerprint

- candidate fingerprint
- validator version
- strategy thresholds
- hard-gate outcomes
- editorial score components

Stale pre-Hook candidate fingerprints must not appear as terminal validation evidence.

---

## 13. Persistence split

| Artifact | Persist? | Where |
|----------|----------|--------|
| Prompts / CoT / raw critique / research dumps / candidate text | **Never** | — |
| Final narration | Yes | `FootieScript.narration` |
| `RetentionStoryPlanSnapshot` | Optional, **after successful commit** | Additive on `StoryCreationBrief` |
| `RetentionValidationSummary` | Optional, **after successful commit** | Beside plan snapshot on brief |
| Failed generation diagnostics | Result envelope only | Not on draft |
| Legacy drafts | Load with both snapshots absent | No migration |

`retentionReadiness` lives on **validation** results/summaries — **not** on `RetentionStoryPlanSnapshot` (plan exists before narration validation).

This supports a future Review explainability panel after reload without private prompts.

---

## 14. Rewrite terminal state machine

```text
complete RetentionStoryPlan
→ Hook plan/directive
→ compose structured candidate
→ length enforcement (current dual-site compress until Sprint 10 ledger)
→ Hook validation / approved outcome
→ rebuild final candidate identity
→ Retention validation
→ pass
   or quality-only failure with Studio rewrite budget
→ one body rewrite preserving the exact approved opening
→ post-rewrite terminal sequence (§14.1)
→ pass or fail
→ commit only on Pass
```

| Rule | Requirement |
|------|-------------|
| Grounding / safety Hook failure | Never committed; Retention rewrite cannot launder it |
| Opening preservation | Body rewrite preserves the **exact** approved Hook opening |
| Hook budgets | Repair / fallback counts do **not** reset |
| Length-compression model call | After Sprint 10 ledger: path-global ≤1; does **not** reset after rewrite |
| Final Hook hard gate fail | Blocks commit |
| VO | Starts only after final Hook **and** Retention approval |
| Scenes-only | Never plans or rewrites narration |
| Diagnostics | Must not claim success without final validation on the final candidate |
| Partial approval | Never commit a partially approved narration |

### 14.1 Post-rewrite terminal behavior (exact)

After the optional Studio body rewrite:

1. Preserve the **exact** approved Hook opening text.
2. Reassemble the body deterministically with the preserved opening.
3. Length enforcement:
   - If the Sprint 10 path-global **length-compression** budget still remains, it may be used **once**.
   - If no compression-model budget remains, use **only** the existing deterministic hard word-budget owner (`enforceNarrationWordBudget` / truncate path).
4. Rebuild candidate segments, offsets, claim trace, and candidate fingerprint.
5. Revalidate Hook **without** allowing a new repair or fallback (counters do not reset; no new repair/fallback attempts).
6. Revalidate Retention Story against the rebuilt **final** candidate.
7. If deterministic enforcement damages Hook approval, required payoff, controlling-idea hard requirements, grounding, or another hard gate → **terminate with failure**.
8. Never commit a partially approved narration.
9. Never begin VO until final Hook **and** Retention approval.

---

## 15. Model-call budget truth

Retention Story calls are defined separately from frozen Hook calls. **Do not claim 4 / 5 / 6 is current live behavior** until the Sprint 10 path-global budget ledger exists in production.

### 15.1 Evidence — current Hook path (no path-global compress ledger)

Source: `src/features/hook-engine/integration/generate-hooked-narration.ts`

- Initial narration calls `enforceLength(..., compress)`.
- Repaired narration **separately** calls `enforceLength(..., compress)`.
- Therefore `length_compress` may currently be attempted **twice** on one generation path.
- Hook repair remains at most one (`runBoundedHookRepair`).
- A terminal fallback model callback remains at most one; usable-body fallback via `applyDeterministicCompatibilityOpening` is deterministic and costs **zero** model calls.

### 15.2 Current observed production ceiling

**Before** the Sprint 10 budget ledger exists:

| Mode | Planner | Existing Hook/narration maximum | Retention rewrite | Absolute projected maximum |
|------|---------|--------------------------------:|------------------:|---------------------------:|
| Fast (`cheap`) | 0 | 5 | 0 | **5** |
| Balanced | ≤1 | 5 | 0 | **6** |
| Studio (`best`) | ≤1 | 5 | ≤1 | **7** |

Existing Hook/narration maximum (reachable structural ceiling):

| Kind | Max |
|------|----:|
| Initial narration | 1 |
| Initial length compression | ≤1 |
| Hook repair | ≤1 |
| Repair-output length compression | ≤1 |
| Terminal fallback model callback | ≤1 |
| **Total** | **5** |

Ordinary successful paths normally use fewer calls. This table is the **reachable structural ceiling**, not the typical path.

**Scenes-only:** 0 Retention Story / narration model calls.

### 15.3 Sprint 10 target ceiling

**After** a production-enforced path-global budget ledger lands (assigned to Sprint 10 integration / compression work — **required before** Retention Story can be declared production-ready or frozen):

| Mode | Target maximum |
|------|---------------:|
| Fast (`cheap`) | **4** |
| Balanced | **5** |
| Studio (`best`) | **6** |
| Scenes-only | **0** |

### 15.4 Target ledger consumption rules

The target ledger must enforce:

| Kind | Rule |
|------|------|
| Initial narration | Exactly one attempted call |
| Planner | According to `QualityMode` (`cheap` = 0; `balanced`/`best` ≤1) |
| Length compression | **At most one** attempted call across initial narration, Hook repair output, **and** Retention rewrite output |
| Hook repair | At most one attempted call for the complete generation path |
| Hook fallback model callback | At most one attempted call for the complete path |
| Retention body rewrite | At most one, and **only** in Studio (`best`) |
| Failed / rejected / empty / malformed model calls | Still consume their attempt budget |
| Deterministic compatibility opening replacement | Consumes **no** model-call budget |
| Budget resets | **None** after Hook approval, Retention validation, or body rewrite |

Legacy absence of `qualityMode` normalizes to **`balanced`**.

Production ledger ownership: Sprint **10E/10F** (Narrative Composer + Hook Integration / Compression + Retention Validator). Contract acceptance does **not** imply the ledger already ships.

---

## 16. Creator UI decisions (v1 — recorded now)

| Decision | v1 rule |
|----------|---------|
| Format strategy default | **Auto** |
| Auto @ 30s (Create preset) | → `short_retention` |
| Auto @ 45s / 60s | → `extended_short` |
| Explicit strategies in 10G | Exposes **Retention-first** (`short_retention`) and **Standard** (`short_standard`); Auto remains default |
| Long-form strategies | Hidden / disabled; rejected by production adapter |
| Hook Style | Remains separate existing Create control |
| Audience / reaction / controlling idea / beats | Automatic; Review explainability is **read-only** |
| Validation warnings | Visible and accessible |
| Score language | No scientific “predicted retention” |

---

## 17. Compression authority

| Concern | Owner |
|---------|--------|
| Compression planning / goals | Retention Story Intelligence |
| Actual narration length enforcement | **Single** path-global owner (today Hook-path `generateHookedNarration` → `enforceNarrationWordBudget`; reconcile docs in 10F) |
| Post-compression Hook revalidation | Hook Engine |
| Post-compression retention validation | Retention Story Intelligence on **rebuilt** candidate |
| Failure when duration cannot be satisfied | Terminal `fail` — must not commit grounding/safety failures |

**Forbidden:** a second silent truncator.

---

## 18. Compatibility — frozen systems

Do not reopen: Hook Engine Core · Studio Intelligence v1 · Story Sync · audio-first timing / VO duration ownership · MasterTimeline · multi-image scenes · intra-scene transitions · Preview · ExportManifest v3 / `"9C"` · browser renderer · caption/audio engines.

**No renderer code in Sprint 10.** Headless Renderer = Sprint 11 (ready to begin after the Sprint 10 freeze).

---

## 19. Roadmap and status truth

```text
Sprint 10 — Retention Story Intelligence v1
10A Architecture Audit + Formal Contract              ← accepted
10A.1 Contract Authority Hardening                    ← accepted
10A.2 Contract Final Coherence                        ← accepted (this document)
10B Story Contract + Format Strategy Foundation       ← complete and accepted
10C Controlling Idea + Emotional Arc                  ← complete and accepted (10C.1 / 10C.1A)
10D Retention Beat + Pacing Intelligence              ← complete and accepted (unwired)
10D.1 / 10D.1A / 10D.1B                               ← complete and accepted
10E / 10E.1 / 10E.1A Narrative Composer + Hook Integration ← complete and accepted (unwired)
10F Compression + Retention Validator                 ← validator foundation in implementation
10F Compression + Retention Validator                 ← not started (production-ready gate)
10G Explainability / Strategy UI
10H Golden QA + Freeze

Sprint 11 — Headless Renderer                         ← DEFERRED
```

| Item | Status |
|------|--------|
| Architecture Audit (10A) | **Accepted** |
| Contract hardening (10A.1) | **Accepted** |
| Contract final coherence (10A.2) | **Accepted** |
| Formal Contract | **Frozen after Sprint 10H.5C** |
| 10B / 10B.1 / 10B.1A / 10B.1B | **Complete and accepted** |
| 10C / 10C.1 / 10C.1A | **Complete and accepted** |
| 10D / 10D.1 / 10D.1A / 10D.1B | **Complete and accepted** (unwired from generation) |
| 10E / 10E.1 / 10E.1A Narrative Composer + Hook Integration | **Complete and accepted** (unwired; no route activation) |
| 10F Compression + Retention Validator | **Complete and accepted** |
| 10G / 10G.1 / 10G.1A | **Complete and accepted** (Story Strategy + total persistence validator boundary) |
| 10H–10H.5C | **Complete and accepted — live/local sign-off passed** |
| Production module | `src/features/retention-story/` (`domain/` · `grounding/` · `strategy/` · `planning/` · `composition/` · `budget/` · `integration/` · `presentation/`) |
| Verification | `npm run test:retention-story-contract` · `npm run test:retention-story-strategy` · `npm run test:retention-story-planning` · `npm run test:retention-story-composer` · `npm run test:retention-hook-bridge` · `npm run test:retention-generation-budget` · `npm run test:retention-story-ui` |
| 10D planner policy | Fast = deterministic (0 planner calls); Balanced/Studio = complete injected planner proposal, **≤1 call**, no silent Fast downgrade |
| 10E / 10F.3 budget ledger | Path-global ledger **production-enforced** via `runRetentionProductionNarration` (ceilings 4 / 5 / 6 / 0) |
| Retention Story production-ready / frozen | **Frozen after Sprint 10H.5C** |
| Generation wiring | **Activated** — script-only + audio-first share Retention orchestrator; scenes-only unchanged |
| Sprint 11 Headless Renderer | **Ready to begin** |

**10C.1 / 10C.1A authority notes:** exact normalized subject-token intersection (no substring); factual-risk claim support requires exact normalized statement equality with an eligible provider claim; selector recomputes candidate identity/metadata fail-closed; proposal claim refs are sorted/unique before fingerprinting; `validateEmotionalArcBlueprint` is total over `unknown`; `assertRetentionStrategySeedCoherence` enforces per-source claim lineage (`grounded_claim` / `planner_model_proposal` / deterministic fallback), recomputes fingerprints, and returns a deeply frozen canonical seed (builders return that asserted result).

**10D.1 authority notes:** safe deterministic subject anchors for ungrounded factual-risk topics; Balanced/Studio require complete strategy + beats (purpose + five semantic fields + grounding refs) or `planner_proposal_invalid`; planner purpose sequences accepted only when Retention-valid (no silent deterministic substitution); box-constrained pacing keeps every beat inside the active density min/max; Fast/cheap rebuilds from deterministic authority only; creator topic is labeled `creator_subject_unverified` on the ephemeral planner request.

**10D.1A authority notes:** bare match-result vocabulary (`won`/`beat`/`defeated`/`lost`/`drew`/`schooled`/victory/defeat/…) is factual-risk even without numeric scores; tactical phrasing such as `beat the press` remains non-risk; ungrounded deterministic plans reduce to safe subject anchors and omit result assertions unless an eligible verified claim supports them.

**10D.1B authority notes:** opponents beginning with `the` (e.g. `Spain beat the Netherlands`) are result risk; only an explicit tactical/idiomatic `the …` allowlist is excluded (`press`, `high press`, `low block`, `offside trap`, `odds`, `clock`, `system`); `won/lost/drew the {final|match|…}` and result-noun constructions (`secured victory`, `suffered defeat`, …) are result risk; `won/lost the ball` and `drew the defender` remain non-result.

```text
10A–10A.2 — Complete and accepted
10B / 10B.1 / 10B.1A / 10B.1B — Complete and accepted
10C / 10C.1 / 10C.1A — Complete and accepted
10D — Complete and accepted
10E / 10E.1 / 10E.1A — Complete and accepted
10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C — Validator + ledger + ready phase-order authority accepted
10F.2 — Studio body rewrite + terminal validation implemented
10F.2A — Terminal Hook authority + length enforcement hardening accepted
10F.3 — Production activation + commit gate + safe persistence
10F.3A — Production authority + evidence hardening
10F.3B — Safe Hook diagnostics terminal coherence accepted
10G — Explainability + Story Strategy UI
10G.1 — Persistence + explainability authority hardening
10G.1A — Total persistence validator exception boundary accepted
10H–10H.5C — Golden QA, universal reliability, live/local sign-off complete
Retention Story — Frozen
CORE RETENTION LIVE-MODEL PATH: APPROVED (13/13)
LOCAL PRODUCT SIGN-OFF: APPROVED
EVIDENCE SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

---

## 20. Acceptance record

The following are **accepted** after Sprint 10A.2:

- Format capability matrix + Auto duration mapping
- Canonical raw/normalized types + `qualityMode` default
- Domain-neutral audience model
- Plan-complete-before-Hook lifecycle
- `RetentionHookHandoff` (no Hook ID leakage)
- Structured grounding with **semantic claim text** + Retention-owned adapter boundary
- Candidate/segment/claim-trace + Hook mutation reconciliation
- Hard vs heuristic gates + score derivations
- Four fingerprint compositions (`researchIdentity` covers claim semantics)
- Persistence split (plan snapshot vs validation summary; no raw claim text)
- Rewrite state machine + **post-rewrite terminal behavior**
- Model-call budget **truth**: current observed ceiling vs Sprint 10 target ledger
- Creator UI decisions

Implementation begins at **10B**. Production-ready / freeze remains gated on 10E–10H and the path-global budget ledger.

---

## Related

- [RETENTION_STORY_ARCHITECTURE_AUDIT.md](./RETENTION_STORY_ARCHITECTURE_AUDIT.md) — accepted evidence
- [HOOK_CONTRACT.md](./HOOK_CONTRACT.md)
- [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md)
- [ROADMAP.md](../ROADMAP.md)
