# ShortForge Studio Hook Contract

**Status: Accepted after Sprint 7A**

Applies to: Sprint 7B and all future Hook Engine work
Derived from: [`HOOK_ARCHITECTURE_AUDIT.md`](./HOOK_ARCHITECTURE_AUDIT.md)
Owner: Provocative Hook Architecture
Navigation: [`MASTER_ARCHITECTURE.md`](../MASTER_ARCHITECTURE.md)
Implementation: Sprint **7A**–**7D** complete and accepted (incl. 7D.1–7D.3); Sprint **7E** Hook Golden QA — **in progress**; Hook system **not frozen** until the final evidence-based decision

> This document defines the minimum correctness, ownership, precedence, lifecycle, safety, and fallback guarantees for the Provocative Hook Engine.
>
> Exact production TypeScript names live in `src/features/hook-engine/domain/`. Semantic boundaries must not regress.

---

## 1. Purpose

Unify every existing “hook” concept under one narration-level contract so ShortForge Studio can produce **provocative but grounded** openings without:

- inventing a second story document,
- replacing Prompt Intelligence, Studio Intelligence, or creator templates,
- rewriting narration on `scenes-only`,
- or patching voiceover, MasterTimeline, preview, or export state.

---

## 2. Canonical vocabulary

| Term | Meaning |
|------|---------|
| **Final spoken hook** | The opening span inside canonical `FootieScript.narration` that is spoken first. **Not** a second independent narration field. |
| **Hook request input** | Raw/additive adapter input (`HookRequestInput`). Legacy fields may be absent. |
| **Normalized hook request** | Validated engine input (`NormalizedHookRequest`) with required normalized domain fields and `requestFingerprint`. Strategy resolution operates **only** on this shape. |
| **Request fingerprint** | Semantic identity of **normalized upstream inputs only** — created **before** strategy resolution. Must not include strategy ID/version or resolved constraints. |
| **Plan fingerprint** | Semantic identity of the resolved plan: `requestFingerprint` + strategy ID/version + concrete `HookResolvedConstraints`. |
| **Hook strategy** | Immutable registry entry describing opening approach. Consumers treat `HookStrategyId` as an opaque key. |
| **Hook strategy source** | Why a strategy was selected (`HookStrategySource`). Alias: `HookSource` — **singular meaning: strategy-selection source only**. |
| **Hook candidate origin** | Where candidate opening text came from (`HookCandidateOrigin`). |
| **Hook generation path** | Which narration generation path executed (`HookGenerationPath`). |
| **Hook plan** | Ephemeral runtime planning artifact with **concrete** resolved constraints. Does **not** override narration. |
| **Hook plan snapshot** | Minimal serializable persistence of plan identity under optional `StoryCreationBrief.hookPlan`. |
| **Hook directive** | Prompt-facing instruction block derived from the plan. |
| **Hook candidate** | Proposed opening span with stable ID and grounding claim references — ephemeral until selected. |
| **Hook selection** | Transient pre-commit approved opening text. **Never** a second persisted spoken authority. |
| **Hook validation** | Derived, repeatable evidence. Not story truth. |
| **Visual / scene hook** | Studio Intelligence planning signals derived from committed narration. Downstream only. SI-owned; Hook Engine must not import SI. |
| **Publishing / social metadata hook** | Packaging copy derived from committed narration (e.g. `buildStyleHook`). Outside Hook Engine. |
| **Hook diagnostics** | Observability payload returned via optional generation-result/API envelope — not persisted by default. |

---

## 3. Proposed module ownership

### Reserved module layout

```text
src/features/hook-engine/
├── domain/
├── strategies/
├── validation/
├── repair/
├── integration/
└── index.ts
```

(`integration/` shipped in 7D; `validation/` and `repair/` shipped in 7C.)
### Responsibility map

| Subsystem | Owns | Must not own |
|-----------|------|--------------|
| **Hook Engine** | Normalization (`HookRequestInput` → `NormalizedHookRequest`), strategy resolution, ephemeral `HookPlan`, directive assembly, deterministic opening-span extraction, validation, bounded repair decision, approved outcome + diagnostics | Independent patch of persisted `FootieScript`; voiceover; scenes; MasterTimeline; preview; ExportManifest; renderer; SI imports |
| **Hook Strategy Library (7B)** | Immutable strategies, deterministic resolution, opaque IDs **independent of SI** | Spoken text; SI `StoryStrategyHookStrategy` registry reuse |
| **Hook Validator (7C)** | Quality / grounding / safety checks; one repair attempt; claim-trace validation | SI blueprint `hook_strength`; story truth; unbounded retries |
| **Prompt Intelligence** | Grounded structure, facts, forbidden claims, opening-beat budgets as input | Final spoken hook text |
| **Creator Templates** | Advisory `openingStyle` and related hints | Final spoken hook; scattered template-specific hook prompt fragments after 7D |
| **Studio Intelligence** | Downstream beat/scene/visual hook planning from **committed** narration; owns `StoryStrategyHookStrategy` | Final spoken hook; Hook Engine registry IDs |
| **Story generation** | Narration model call, length budget, compression; **commits** approved complete narration into `FootieScript.narration` | Treating HookSelection as persisted spoken authority |
| **Story Sync** | Dirty/stale signaling when narration (including opening) changes | Hook planning authority |
| **Publishing** | Derived social/packaging “hook” metadata from committed narration | Strategy selection; narration mutation; HookPlan as spoken authority |
| **Downstream scene / timeline / export** | Consume committed story state | Hook text authority |

---

## 4. Contract shapes (proposed — Markdown only)

Implementation-neutral TypeScript examples. Not production types.
Domain types `ScriptMode`, `Tone`, and `CreatorTemplateId` refer to existing production concepts (do not redefine here).

```ts
/** Contract version for plans, diagnostics, and stale-plan detection. */
type HookContractVersion = `hook-contract/${number}`;

/** Opaque registry key owned by Sprint 7B Hook Strategy Library (not SI IDs). */
type HookStrategyId = string;

/**
 * Why a strategy was selected.
 * Alias retained for continuity: HookSource ≡ HookStrategySource (singular meaning).
 */
type HookStrategySource =
  | "user_authored"
  | "user_selected"
  | "template_advisory"
  | "prompt_intelligence"
  | "strategy_library"
  | "compatibility_fallback";

type HookSource = HookStrategySource;

/** Where candidate opening text came from. */
type HookCandidateOrigin =
  | "model_narration_opening"
  | "user_authored"
  | "repair_rewrite"
  | "compatibility_fallback";

/** Which narration generation path executed. */
type HookGenerationPath =
  | "script_only"
  | "audio_first_full"
  | "generate_footie_script_fallback"
  | "scenes_only_non_hook"; // must never generate/rewrite hooks

type HookClaimProvenanceCategory =
  | "research_verified"
  | "user_provided_unverified"
  | "qualitative_context"
  | "forbidden";

type HookClaimVerificationStatus =
  | "verified"
  | "unverified"
  | "forbidden"
  | "unavailable";

/** Structured grounding claim — not a bare string list. */
interface HookGroundingClaim {
  readonly claimId: string; // stable within the request fingerprint scope
  readonly text: string; // normalized claim text
  readonly provenance: HookClaimProvenanceCategory;
  readonly verificationStatus: HookClaimVerificationStatus;
  readonly sourceRef?: string; // optional research/provider/doc reference — not full private payload
  readonly permittedForFactualHookUse: boolean;
  // user_provided_unverified and qualitative_context are never independently research-verified
}

interface HookGroundingContext {
  readonly claims: readonly HookGroundingClaim[];
  readonly unavailableResearch: boolean;
  readonly researchFingerprint?: string; // semantic identity helper — not a timestamp
  readonly normalizedGroundingStatus:
    | "research_verified_available"
    | "user_context_only"
    | "research_unavailable"
    | "mixed";
}

/**
 * Hook-owned opening intention from Prompt Intelligence (or equivalent adapter).
 * Independent of SI strategy IDs. Participates in requestFingerprint.
 * evidence_surprise requires kind evidence_led_surprise + eligible referenced claims.
 */
type HookOpeningIntentKind = "evidence_led_surprise";

interface HookOpeningIntent {
  readonly kind: HookOpeningIntentKind;
  readonly claimRefs: readonly string[];
}

/** Concrete constraints after strategy resolution — not optional in HookPlan. */
interface HookResolvedConstraints {
  readonly maxOpeningWords: number;
  readonly maxOpeningSpokenSecondsHint: number; // compatibility evidence; validates span, does not silently truncate
  readonly mustPreserveSubject: boolean;
  readonly allowQuestionForm: boolean;
  readonly allowStatisticClaim: boolean;
  readonly forbidUnverifiedSuperlatives: boolean;
  readonly minProvocativeness: number; // [0, 1]
  readonly minClarity: number; // [0, 1]
}

/** Raw / additive adapter input. Legacy fields may be absent. */
interface HookRequestInput {
  readonly contractVersion: HookContractVersion;
  readonly topic: string;
  readonly scriptMode?: ScriptMode;
  readonly tone?: Tone;
  readonly durationSeconds?: number;
  readonly templateId?: CreatorTemplateId;
  readonly openingStyleAdvisory?: string;
  readonly userAuthoredHook?: string;
  /** Hook-owned opening intention (e.g. evidence_led_surprise + claimRefs). Not SI strategy IDs. */
  readonly openingIntent?: HookOpeningIntent;
  readonly groundingInput?: {
    readonly claims?: readonly HookGroundingClaim[];
    readonly unavailableResearch?: boolean;
    readonly researchFingerprint?: string;
  };
  readonly generationPath: HookGenerationPath;
}

/**
 * Validated engine input. Strategy resolution must not run on HookRequestInput.
 * Reuses existing domain concepts; does not duplicate FootieScript.
 *
 * requestFingerprint is computed here from normalized upstream inputs only.
 * It must NOT include selected strategy ID/version or HookResolvedConstraints
 * (those do not exist yet — see planFingerprint on HookPlan).
 */
interface NormalizedHookRequest {
  readonly contractVersion: HookContractVersion;
  readonly topic: string;
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly durationSeconds: number;
  readonly templateId?: CreatorTemplateId;
  readonly openingStyleAdvisory?: string; // sanitized
  readonly userAuthoredHook?: string; // sanitized optional
  readonly openingIntent?: HookOpeningIntent; // participates in requestFingerprint
  readonly grounding: HookGroundingContext;
  readonly generationPath: HookGenerationPath;
  readonly requestFingerprint: string;
  // Semantic composition (hash algorithm is Sprint 7B detail):
  // contractVersion + normalized topic + ScriptMode + Tone + duration
  // + templateId + sanitized advisory + sanitized user-authored hook
  // + openingIntent (kind + claimRefs) + grounding/research semantic identity
  // + generationPath
  // Must NOT include: strategyId, strategyVersion, resolved constraints, timestamps
}

interface HookPlan {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource; // aka HookSource
  readonly requestFingerprint: string; // from NormalizedHookRequest
  readonly planFingerprint: string;
  // planFingerprint composition:
  // requestFingerprint + strategyId + strategyVersion + concrete HookResolvedConstraints
  // Detects strategy-registry or constraint changes when the creator request is unchanged.
  // Must NOT include timestamps.
  readonly grounding: HookGroundingContext;
  readonly constraints: HookResolvedConstraints; // concrete — not optional
  readonly intentSummary: string;
}

/**
 * Minimal serializable persistence under optional StoryCreationBrief.hookPlan.
 * Runtime HookPlan is ephemeral. Do not persist prompt blocks, full grounding text,
 * candidate opening text, or full diagnostics in the brief.
 */
interface HookPlanSnapshot {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly resolvedConstraints: HookResolvedConstraints; // non-sensitive concrete constraints only
}

interface HookDirective {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly planFingerprint: string;
  readonly promptBlock: string; // assembled instruction — not private system prompt dump
  readonly constraints: HookResolvedConstraints;
}

interface HookCandidate {
  readonly candidateId: string;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly origin: HookCandidateOrigin;
  readonly openingText: string; // original text for commit/diagnostics
  readonly openingTextNormalized?: string; // analysis-only if different
  readonly openingStartOffset: number; // into original narration string
  readonly openingEndOffset: number;
  readonly claimRefs: readonly string[]; // HookGroundingClaim.claimId — required when factual/stat/quote/ranking/result/fee/date/superlative claims are made
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
}

/**
 * Transient pre-commit data. Never a second persisted spoken authority.
 * Story generation commits the approved complete narration into FootieScript.narration.
 */
interface HookSelection {
  readonly candidateId: string;
  readonly strategyId: HookStrategyId;
  readonly strategySource: HookStrategySource;
  readonly candidateOrigin: HookCandidateOrigin;
  readonly openingText: string;
  readonly planFingerprint: string;
  readonly narrationCommitRule: "opening_span_of_narration";
}

interface HookValidationScores {
  readonly provocativeness: number; // [0, 1]
  readonly clarity: number; // [0, 1]
  readonly grounding: number; // [0, 1]
  readonly safety: number; // [0, 1]
}

interface HookValidationResult {
  readonly ok: boolean;
  // ok:true means all hard gates (grounding, safety) AND required strategy thresholds passed.
  // Aggregate score cannot override a grounding or safety failure.
  readonly candidateId: string;
  readonly planFingerprint: string;
  readonly scores: HookValidationScores;
  readonly hardGatesPassed: {
    readonly grounding: boolean;
    readonly safety: boolean;
  };
  readonly strategyThresholdsPassed: {
    readonly provocativeness: boolean;
    readonly clarity: boolean;
  };
  readonly reasons: readonly string[];
  readonly groundingStatus: HookGroundingContext["normalizedGroundingStatus"] | "failed";
  readonly repairRecommended: boolean;
  readonly repairBoundExceeded?: boolean;
}

interface HookDiagnostics {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource; // why strategy was selected
  readonly candidateOrigin?: HookCandidateOrigin; // where candidate text came from
  readonly generationPath: HookGenerationPath; // which path executed
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly fallbackReason?: string;
  readonly groundingStatus: HookValidationResult["groundingStatus"];
  readonly validationOutcome: "pass" | "fail" | "repaired" | "fallback" | "generation_failed";
  readonly repairAttempts: number; // 0 or 1 (max one automated repair)
  readonly compressionRevalidated?: boolean;
  readonly templateInfluenced: boolean;
  readonly promptIntelligenceInfluenced: boolean;
  readonly adapterRan: boolean; // false ⇒ must not claim successful Hook Engine guarantees
  // Must not include full private prompts or unnecessary user content.
  // Returned via optional generation-result/API envelope; not persisted by default.
}
```

### Fingerprint composition (frozen semantics)

```text
NormalizedHookRequest
→ requestFingerprint          (upstream inputs only)
→ strategy resolution
→ HookResolvedConstraints
→ planFingerprint             (requestFingerprint + strategyId + strategyVersion + concrete constraints)
```

| Fingerprint | Includes | Must not include |
|-------------|----------|------------------|
| **`requestFingerprint`** | contract version; normalized topic; `ScriptMode`; `Tone`; duration; template ID + sanitized advisory; sanitized user-authored hook; opening intent (kind + claim refs); grounding/research semantic identity; generation path | selected strategy ID; strategy version; resolved strategy constraints; timestamps |
| **`planFingerprint`** | `requestFingerprint` + `strategyId` + `strategyVersion` + concrete `HookResolvedConstraints` | timestamps |

Exact hashing algorithm remains a **Sprint 7B** implementation detail; semantic input composition is frozen here.

### Shape rules

1. Strategy IDs are owned by the Sprint 7B registry; consumers treat them as opaque; they do **not** reuse SI IDs.
2. Adapter builds `HookRequestInput`; engine normalizes to `NormalizedHookRequest` (including `requestFingerprint`) **before** strategy resolution.
3. Inputs use a **normalized subset** of brief/research data — do not duplicate `FootieScript`.
4. Grounding uses structured `HookGroundingClaim` with provenance; user-provided context is never independently research-verified.
5. Plans and diagnostics include contract/strategy versions; `HookPlan.constraints` are concrete; `HookPlan` carries both fingerprints.
6. Validation results are derived evidence, not story truth.
7. Timestamps are not part of semantic identity for either fingerprint.
8. `HookSource` means **strategy-selection source only** (`HookStrategySource`).
9. Resolved constraints participate in **`planFingerprint` only** — never in `requestFingerprint`.

### Stale-state rules

1. **Input changes** (topic, mode, tone, duration, template/advisory, user-authored hook, opening intent, grounding/research identity, generation path, contract version) invalidate `requestFingerprint` and require **renormalization and replanning**.
2. **Strategy version or resolved-constraint changes** (including strategy-registry updates that alter concrete constraints for the same request) invalidate `planFingerprint` and require **replanning and revalidation**. They do **not** by themselves change `requestFingerprint`.
3. Candidate, selection, validation, and diagnostics must match the **active `planFingerprint`**.
4. Neither fingerprint contains timestamps.
5. Stale `HookPlanSnapshot`: if stored `requestFingerprint` ≠ current request → renormalize/replan; if `requestFingerprint` matches but `planFingerprint` ≠ current plan → replan/revalidate.
---

## 5. Source-of-truth rules

1. **`FootieScript.narration` owns the final spoken hook** after story-generation commit (opening span inside narration).
2. **Hook planning metadata describes intent**; it does not override narration.
3. **Creator-template `openingStyle` is advisory input.**
4. **Prompt Intelligence opening beats** provide grounded structural input.
5. **Studio Intelligence hook types and `StoryStrategyHookStrategy`** remain SI-owned downstream planning signals. Hook Engine must not import Studio Intelligence. Similar vocabulary ≠ shared ownership.
6. **Hook validation is derived and repeatable.**
7. **Scene captions, scene types, motion, media, export metadata, and publishing social hooks never become hook-text authorities.**
8. **`HookSelection.openingText` is transient pre-commit data** — never a second persisted spoken authority.
9. **Runtime `HookPlan` is ephemeral**; only `HookPlanSnapshot` may persist under optional `StoryCreationBrief.hookPlan`.

---

## 6. Precedence model

Strict order (highest first):

1. **Safety, factual grounding, and forbidden-claim constraints**
2. **Explicit user intent or user-authored hook**, subject to validation
3. **Explicit user Hook Style selection** (`requestedStrategyId` → `user_selected`), subject to validation
4. **Research-backed facts and mode-specific factual rules**
5. **Script-mode structure**
6. **Selected creator-template guidance**
7. **Hook Strategy Library defaults**
8. **Generic compatibility fallback** (internal `compatibility_punchy` only)

**Invariant:** A provocative hook must never become a misleading hook. Grounding and safety outrank provocation. No explicit Hook Style selection may override a hard gate.

**Hook Style selection (7E.6):** Additive Create-brief control. **Auto** (default; omit `requestedStrategyId`) preserves prior template / evidence / ScriptMode resolution. Explicit allowlisted strategies resolve with source `user_selected` and outrank template advisory. **Write My Own** uses `userAuthoredHook` → `user_directed` / `user_authored`. Internal-only strategies (`evidence_surprise`, `compatibility_punchy`, `user_directed`) are not manually selectable. `requestedStrategyId` participates in `requestFingerprint`.

**`evidence_surprise` gate (7B.1 / 7D.3 / 7E):** Verified research availability alone must **not** select `evidence_surprise`. Remains research-gated and automatically selectable only when eligible. Production PI resolves a Hook-type-free typed preference (`evidence_fact` | `evidence_statistic`) from narrowly defined topic/context phrases. Hook selection still requires `openingIntent.kind = evidence_led_surprise` plus at least one referenced claim that is `research_verified`, `verified`, and `permittedForFactualHookUse`. Ordinary evidence-bearing openings retain mode/template strategies. Bare “surprise me” does not activate. Invalid evidence intent falls through to the applicable mode/template default. Explicit user Hook Style outranks template; template still outranks evidence intent when Auto.

---

## 7. Lifecycle

```text
Creator brief / generation path
→ HookRequestInput (raw adapter)
→ NormalizedHookRequest (validated + requestFingerprint)
→ strategy resolution (HookStrategySource)
→ ephemeral HookPlan (concrete constraints + planFingerprint)
→ HookDirective (planFingerprint)
→ narration generation (story generation owns model call)
→ length / compression enforcement
→ deterministic opening-span extraction
→ HookCandidate (requestFingerprint + planFingerprint; claimRefs when factual)
→ hook validation (candidateId + planFingerprint)
→ at most one bounded repair (then re-extract / revalidate against active planFingerprint)
→ approved outcome returned to story generation (HookSelection.planFingerprint)
→ story generation commits FootieScript.narration
→ optional HookPlanSnapshot (both fingerprints) on StoryCreationBrief.hookPlan
→ optional HookDiagnostics (both fingerprints) on generation-result envelope
→ voiceover
→ scene planning (Studio Intelligence visual/scene hooks from committed narration)
→ timeline / preview / export
```

### Lifecycle rules

| Rule | Requirement |
|------|-------------|
| Timing | Hook plan/validate happen **before voiceover** |
| Commit ownership | Hook Engine returns approved outcome; **story generation commits** narration |
| Consistency | Repaired opening must be checked for consistency with narration body |
| Persistence order | Persist only after length enforcement **and** final hook validation |
| Compression | Always re-extract and revalidate; compression is **not** the repair attempt |
| Repair bound | **Maximum one** automated repair per narration-generation attempt |
| `scenes-only` | `HookGenerationPath: scenes_only_non_hook` — never generate/replace/repair narration hooks |
| Post-VO hook change | Ordinary narration change → existing Story Sync / staleness rules |
| Duration | Hook processing consumes the **narration duration budget**; never adds project duration |
| Downstream | Hook Engine does not patch VO, scenes, MasterTimeline, preview, ExportManifest, or renderer |

---

## 8. Opening-span extraction invariant

Spoken-hook extraction is **text/sentence based** because voiceover does not exist yet.

| Rule | Decision |
|------|----------|
| Owner | Hook Engine owns a **deterministic sentence extractor** — must **not** import Studio Intelligence utilities |
| Primary rule | Candidate = **first non-empty linguistic sentence** of normalized narration |
| No terminator | Use the first non-empty line |
| Single unterminated line | That complete line is the candidate (may fail length/clarity validation) |
| Strategy limits | Word/time limits **validate** the extracted span; they do **not** silently truncate it |
| Offsets | Preserve original text offsets/text for commit and diagnostics even if normalized text is used for analysis |
| 7C fixtures required | Quotes, abbreviations, punctuation, multiline text, and unterminated narration |

---

## 9. Validation-score semantics

1. All normalized scores use **`[0, 1]`**.
2. **Grounding and safety are hard gates.**
3. Provocativeness and clarity thresholds come from the **resolved strategy/plan** (`HookResolvedConstraints.minProvocativeness` / `minClarity`).
4. An aggregate score **cannot** override a grounding or safety failure.
5. **`ok: true`** means all hard gates **and** required strategy thresholds passed.
6. Candidates that make factual, statistical, quotation, ranking, result, fee, date, or superlative claims **must** include `claimRefs` traceable to `HookGroundingClaim` IDs — validators must not rely on substring guessing alone.

---

## 10. Failure, repair, and fallback semantics

| Failure | Required behavior |
|---------|-------------------|
| Missing or unknown strategy | Compatibility strategy source + diagnostics |
| Malformed template guidance | Ignore invalid lines after sanitization; continue with higher-precedence inputs |
| Unavailable research | `normalizedGroundingStatus: research_unavailable`; disallow strategies requiring verified stats |
| Unsupported statistic-based strategy | Reject strategy or fall back; do not invent numbers |
| No valid candidate | Validated compatibility fallback; diagnostics |
| Candidate fails quality validation | At most **one** repair; if still failing → validated compatibility fallback |
| Candidate fails grounding or safety | At most **one** repair; if still failing → validated safe fallback **or** generation failure |
| Fallback fails grounding/safety | **Never commit** — generation failure |
| Compression invalidates hook | Re-extract + revalidate (not counted as repair); then repair/fallback rules apply |
| Stale `HookPlanSnapshot` | Compare stored vs current `requestFingerprint` / `planFingerprint` (see stale-state rules); replan / revalidate as required |
| Legacy briefs without `hookPlan` | Compatibility path; no migration |
| Path without adapter/validation | Must **not** emit successful Hook diagnostics (`adapterRan: false`) |

### Repair bound (frozen)

- Maximum automated hook repair attempts per narration-generation attempt: **one**.
- Compression is not counted as the repair attempt, but always triggers re-extraction and revalidation.
- After one failed repair:
  - quality failure → validated compatibility fallback;
  - grounding or safety failure → validated safe fallback or generation failure;
  - a fallback that fails grounding/safety must never be committed.
- No path may loop back into generation indefinitely.
- Record attempt count and terminal outcome in diagnostics.

**Compatibility fallback** must retain today’s safe generic opening behavior and emit diagnostics. It must **not** fabricate facts to satisfy a provocative strategy.

---

## 11. Persistence ownership (frozen)

| Artifact | Lifetime | Location |
|----------|----------|----------|
| Runtime `HookPlan` | Ephemeral | In-memory during generation |
| `HookPlanSnapshot` | Optional persist | `StoryCreationBrief.hookPlan` after successful narration generation |
| Final spoken text | Persisted | **Only** `FootieScript.narration` |
| `HookSelection.openingText` | Transient pre-commit | Never second spoken authority |
| `HookDiagnostics` | Optional API/generation-result envelope | Not persisted by default |
| Prompt block / full grounding / candidate text | Ephemeral | Not in brief |

Snapshot may contain: contract version, strategy ID/version, strategy source, **`requestFingerprint`**, **`planFingerprint`**, resolved non-sensitive constraints.

**Stale-state (persistence):**

- Topic, mode, tone, duration, template/advisory, user-authored hook, grounding/research identity, generation path, or contract-version changes invalidate **`requestFingerprint`** → renormalize and replan.
- Strategy version or concrete resolved-constraint changes invalidate **`planFingerprint`** (request may be unchanged) → replan and revalidate.
- Candidate, selection, validation, and diagnostics must match the active **`planFingerprint`**.
- Resolved constraints are **not** part of request identity.

Future product requirements may introduce separately versioned diagnostic persistence, but **not during 7B–7D** without a contract amendment.

Legacy briefs without `hookPlan` use the compatibility path without migration. Hook metadata is not required in `FootieScript` for downstream rendering. Fields remain additive and optional.

---

## 12. Studio Intelligence boundary (frozen)

1. `StoryStrategyHookStrategy` remains **Studio Intelligence-owned and SI-only**.
2. Hook Engine and Sprint 7B Strategy Library **must not import** Studio Intelligence.
3. Sprint 7B strategy IDs are **independent** and do not reuse SI IDs as their registry.
4. Similar vocabulary does **not** imply shared ownership.
5. SI continues deriving visual/scene hook planning from **committed** narration.
6. Any future one-way adapter must be **downstream of narration** and cannot create an upstream Hook Engine → SI dependency.

---

## 13. Publishing boundary (frozen)

1. Publishing `buildStyleHook` is **derived packaging / social metadata** and remains **outside** the Hook Engine.
2. It may read committed narration.
3. It must **not** select Hook Engine strategies, alter narration, consume `HookPlan` as authority, or become the canonical spoken-hook owner.
4. If publishing retains the word “hook,” documentation must qualify it as a **publishing/social metadata hook**.

---

## 14. Legacy / full generation handling (frozen for 7D)

1. Every production path that generates narration must pass through the **canonical Hook adapter** before claiming Hook Engine guarantees.
2. Includes `generateStoryScript`, the audio-first/`full` orchestration path, and the `generateFootieScript` fallback while that fallback remains reachable.
3. Legacy/`full` may use compatibility strategy defaults when template/research metadata is absent, but may **not** silently bypass validation.
4. Must **not** emit successful Hook diagnostics if no adapter/validation ran.
5. `scenes-only` remains outside hook generation and must **never** rewrite narration.
6. If a legacy path cannot satisfy the contract, it must be explicitly marked **non-hook-capable** or retired; **silent partial support is forbidden**.

---

## 15. Safety and grounding invariants

Prohibited:

- Invented statistics
- Fabricated quotes
- Invented certainty
- Unsupported superlatives presented as fact
- Rumor presented as confirmed news
- Prompt injection through template hints or manual context
- Harmful personal targeting
- Clickbait that contradicts the narration body
- Changing the user’s subject merely to create controversy
- Treating user-provided context as independently research-verified
- Committing a fallback that fails grounding or safety

---

## 16. Duration invariants

1. Hook duration is part of the existing **narration budget**.
2. **Voiceover measurement** remains timing authority after narration commit.
3. The existing Prompt Intelligence opening budget (~1–2 spoken seconds) is recorded as **compatibility evidence**, not a silent universal permanent constant.
4. Sprint 7B strategies may provide normalized constraints but **cannot bypass** the total narration hard cap.
5. Strategy word/time limits validate the extracted opening span; they do not silently truncate it.

---

## 17. Observability

Diagnostics must independently report:

- Why a strategy was selected (`strategySource` / `HookSource`)
- Where candidate text came from (`candidateOrigin`)
- Which generation path executed (`generationPath`)
- Whether the Hook adapter ran (`adapterRan`)
- **`requestFingerprint`** and **`planFingerprint`** (active plan must match candidate/selection/validation)
- Fallback reason, grounding status, validation outcome
- Repair attempts (0 or 1) and terminal outcome
- Compression revalidation
- Template / Prompt Intelligence influence
- Contract and strategy versions

Diagnostics must **not** leak full private prompts or unnecessary user content.

---

## 18. Sprint boundaries

| Sprint | Responsibility | Exit condition |
|--------|----------------|----------------|
| **7A** | Architecture audit + formal Hook Contract | **Complete — contract accepted** |
| **7B** | Immutable Hook Strategy Library + deterministic resolution on `NormalizedHookRequest` | **Complete — accepted** (incl. 7B.1; `test:hook-strategy-library`) |
| **7C** | Hook Validator, scores, claim-trace grounding, opening-span fixtures, one repair attempt | **Complete — accepted** (7C.1/7C.2; `validation/`, `repair/`, `test:hook-validator`) |
| **7D** | Canonical Hook adapter on all narration-generating paths; template integration; explicit legacy handling | **Complete — accepted** (7D.1–7D.3) |
| **7E** | Fixtures, regressions, prompt QA, safety QA, persistence QA, freeze decision | **Complete — Core Hook system frozen** |
| **7E.6 / 7E.6A** | Hook Style selector + Core non-research live sign-off | **Complete** |

```
HOOK ENGINE CORE: FROZEN
SPRINT 7E: COMPLETE — CORE HOOK SYSTEM FROZEN
EVIDENCE_SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED — LIVE SIGN-OFF PENDING
```

**Post-freeze production reliability hotfix (deterministic terminal fallback):** When compatibility/safe fallback runs and a usable narration body already exists, Hook Engine replaces only the rejected opening with a deterministic subject-preserving compatibility opening (`Nobody saw {anchor} coming.`) and does **not** make another model call. When the body is unusable, at most one fallback model call is allowed, after which the opening is still replaced deterministically before normal validation. Frozen contracts (validation thresholds, opening maxima, repair/fallback bounds, fingerprints, safety/grounding) are unchanged. Coverage: `npm run test:hook-deterministic-terminal-fallback`.

**Bounded freeze:** Deterministic Evidence Surprise safety is frozen with Core. Only the external live-provider Evidence Surprise path remains capability-gated pending structured eligible statistic preflight and a future research-dependent live run.

---

## 19. Integration with existing engines

```text
Creator Templates (advisory openingStyle)
        +
Prompt Intelligence (structure, facts, forbidden claims)
        +
Brief / research availability
        ↓
Hook adapter → HookRequestInput → NormalizedHookRequest
        ↓
Hook Engine (plan → directive → extract → validate → ≤1 repair)
        ↓
Approved outcome
        ↓
Story generation commits FootieScript.narration
        (+ optional HookPlanSnapshot on brief)
        ↓
Voiceover → Scene planning / Studio Intelligence (SI-only strategies)
        ↓
Story Sync → MasterTimeline → Preview / ExportManifest → Renderer
        ↓
Publishing social metadata hook (derived; outside Hook Engine)
```

All templates eventually integrate through **one canonical hook adapter**, not template-specific prompt fragments scattered across the codebase.

---

## 20. Non-goals

- Headless / export changes
- SI freeze reopening for spoken-hook ownership
- Hook Engine → SI imports or shared strategy ID registry
- Second narration field as story truth
- Persisting full diagnostics / prompt blocks / candidate text in the brief during 7B–7D
- Automatic scene/timeline rewrite when hook changes (use Sync / explicit regenerate flows)
- Claiming device or product freeze in 7B
- Marking 7E complete or claiming the Hook system frozen before 7E
- Silent partial Hook support or production narration bypass of the canonical adapter

---

## Related documents

- [`HOOK_ARCHITECTURE_AUDIT.md`](./HOOK_ARCHITECTURE_AUDIT.md) — evidence audit
- [`MASTER_ARCHITECTURE.md`](../MASTER_ARCHITECTURE.md) — project index
- [`STUDIO_INTELLIGENCE.md`](./STUDIO_INTELLIGENCE.md) — SI v1 (downstream visual/scene hooks; SI-owned strategies)
- [`GENERATION.md`](./GENERATION.md) — generation pipeline (supporting)
- [`EXPORT_CONTRACT.md`](./EXPORT_CONTRACT.md) — export remains downstream and untouched by Hook Engine
