/**
 * Hooked narration generation — Sprint 7D.2.
 * Story-generation owns model calls; Hook Engine owns length enforcement on Hook paths.
 * Diagnostics report length enforcement for the committed narration only.
 */

import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";
import type { StoryScript } from "@/features/story/types";
import {
  enforceNarrationWordBudget,
  getNarrationWordBudget,
  isWithinNarrationScriptBudget,
  createStoryScriptId,
} from "@/features/story/utils";
import { countWords } from "@/features/story/utils/narration-duration-budget.utils";

/** Stricter token count aligned with Retention hard word-policy (unicode-aware). */
function countRetentionAlignedWords(text: string): number {
  if (typeof text !== "string" || !text.trim()) return 0;
  const normalized = text
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function exceedsHardCapWords(
  text: string,
  hardCapWords: number | undefined,
): boolean {
  if (hardCapWords == null) return false;
  return (
    countWords(text) > hardCapWords ||
    countRetentionAlignedWords(text) > hardCapWords
  );
}

import type {
  HookCandidate,
  HookDiagnostics,
  HookLengthEnforcementKind,
  HookPlan,
  HookPlanSnapshot,
  HookSelection,
  HookValidationResult,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { assertRequestPlanCoherence } from "../domain/assert-request-plan-coherence";
import { buildHookPlanSnapshot } from "../strategies/build-hook-plan";
import { runBoundedHookRepair } from "../repair/run-bounded-hook-repair";
import { applyDeterministicCompatibilityOpening } from "../repair/deterministic-compatibility-opening";
import type { HookGenerationContext } from "./build-hook-generation-context";
import { buildHookDirective } from "./build-hook-directive";
import { buildCreatorFacingHookFailureMessage } from "./creator-facing-hook-error";
import { normalizeClaimRefs } from "../validation/build-hook-candidate";

export interface HookedNarrationModelResult {
  readonly title: string;
  readonly narration: string;
  readonly hookClaimRefs: readonly string[];
}

export type HookedNarrationModelCall = (input: {
  readonly kind: "initial" | "repair" | "length_compress" | "compatibility_fallback" | "safe_fallback";
  readonly topic: string;
  readonly tone: Tone;
  readonly duration: number;
  readonly scriptMode: ScriptMode;
  readonly context?: string;
  readonly templatePromptBlock?: string;
  readonly hookDirectiveBlock: string;
  readonly permittedClaimIds: readonly string[];
  readonly previousNarration?: string;
  readonly validationReasons?: readonly string[];
  readonly qualityMode?: QualityMode;
  readonly model?: string;
}) => Promise<HookedNarrationModelResult>;

export interface GenerateHookedNarrationInput {
  readonly hookContext: HookGenerationContext;
  readonly topic: string;
  readonly tone: Tone;
  readonly duration: number;
  readonly scriptMode: ScriptMode;
  readonly context?: string;
  readonly templatePromptBlock?: string;
  readonly qualityMode?: QualityMode;
  readonly model?: string;
  readonly modelCall: HookedNarrationModelCall;
  /**
   * Optional stricter full-narration hard cap (words). When set, replaces the
   * default stretch hard-cap from getNarrationWordBudget. Used by Retention to
   * align Hook length enforcement with plan.compressionGoals.targetWordBudget.
   * Never loosens the default budget.
   */
  readonly narrationHardCapWords?: number;
}

/**
 * Ephemeral terminal Hook artifacts for Retention post-rewrite revalidation.
 * Never persist in briefs, diagnostics, or client API envelopes.
 */
export interface HookedNarrationTerminalEvidence {
  readonly request: NormalizedHookRequest;
  readonly activePlan: HookPlan;
  readonly candidate: HookCandidate;
  readonly validation: HookValidationResult;
  readonly openingClaimRefs: readonly string[];
}

export type GenerateHookedNarrationResult =
  | {
      readonly ok: true;
      readonly title: string;
      readonly approvedNarration: string;
      readonly selection: HookSelection;
      readonly diagnostics: HookDiagnostics;
      readonly snapshot: HookPlanSnapshot;
      readonly lengthWarning?: string;
      readonly compressionRevalidated: boolean;
      /** Runtime-only — not for persistence or client envelopes. */
      readonly terminalEvidence: HookedNarrationTerminalEvidence;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly diagnostics: HookDiagnostics;
      readonly snapshot?: HookPlanSnapshot;
    };

function sanitizeClaimRefs(
  refs: readonly string[] | undefined,
  request: NormalizedHookRequest,
): readonly string[] {
  return normalizeClaimRefs(refs).filter((id) =>
    request.grounding.claims.some((c) => c.claimId === id),
  );
}

function toLengthEnforcementKind(
  compressed: boolean,
  truncated: boolean,
): HookLengthEnforcementKind {
  if (compressed && truncated) return "compressed_then_truncated";
  if (compressed) return "compressed";
  if (truncated) return "truncated";
  return "none";
}

function warningForLengthEnforcement(
  kind: HookLengthEnforcementKind,
): string | undefined {
  switch (kind) {
    case "compressed":
      return "Script was compressed to fit the duration budget; opening revalidated after compression.";
    case "truncated":
      return "Script was hard-truncated to fit the duration budget; opening revalidated after truncation.";
    case "compressed_then_truncated":
      return "Script was compressed then hard-truncated; opening revalidated after length enforcement.";
    default:
      return undefined;
  }
}

async function enforceLength(input: {
  readonly narration: string;
  readonly claimRefs: readonly string[];
  readonly duration: number;
  readonly request: NormalizedHookRequest;
  readonly narrationHardCapWords?: number;
  readonly compress?: (
    narration: string,
  ) => Promise<{ narration: string; hookClaimRefs: readonly string[] } | null>;
}): Promise<{
  narration: string;
  claimRefs: readonly string[];
  lengthEnforcement: HookLengthEnforcementKind;
  warning?: string;
}> {
  const defaultBudget = getNarrationWordBudget(input.duration);
  const hardCap =
    typeof input.narrationHardCapWords === "number" &&
    Number.isFinite(input.narrationHardCapWords) &&
    input.narrationHardCapWords > 0
      ? Math.min(
          Math.floor(input.narrationHardCapWords),
          defaultBudget.hardCapWords,
        )
      : defaultBudget.hardCapWords;
  const wordBudget = {
    ...defaultBudget,
    hardCapWords: hardCap,
    idealMaxWords: Math.min(defaultBudget.idealMaxWords, hardCap),
  };
  let narration = input.narration;
  let claimRefs = sanitizeClaimRefs(input.claimRefs, input.request);
  let compressed = false;
  let truncated = false;

  const overBudget =
    !isWithinNarrationScriptBudget(narration, wordBudget) ||
    exceedsHardCapWords(narration, input.narrationHardCapWords);

  if (overBudget) {
    if (input.compress) {
      const rewritten = await input.compress(narration);
      if (rewritten?.narration?.trim()) {
        narration = rewritten.narration.trim();
        claimRefs = sanitizeClaimRefs(rewritten.hookClaimRefs, input.request);
        compressed = true;
      }
    }
    const stillOver =
      !isWithinNarrationScriptBudget(narration, wordBudget) ||
      exceedsHardCapWords(narration, input.narrationHardCapWords);
    if (stillOver) {
      // When Retention supplies a hard cap, do not flat-truncate the body:
      // Retention owns sentence-safe enforcement. Callers must fail closed
      // or repair when still over budget after structured compression.
      if (input.narrationHardCapWords == null) {
        const enforced = enforceNarrationWordBudget(narration, wordBudget);
        narration = enforced.narration;
        truncated = true;
      }
    }
  }

  const lengthEnforcement = toLengthEnforcementKind(compressed, truncated);
  return {
    narration,
    claimRefs,
    lengthEnforcement,
    warning: warningForLengthEnforcement(lengthEnforcement),
  };
}

/**
 * Full hooked narration path: raw model → length enforce → validate → ≤1 repair → fallback.
 * Sole length-enforcement owner on Hook-capable paths.
 * Reports lengthEnforcement / scriptLengthWarning for the committed narration only.
 */
export async function generateHookedNarration(
  input: GenerateHookedNarrationInput,
): Promise<GenerateHookedNarrationResult> {
  const { hookContext } = input;
  assertRequestPlanCoherence(hookContext.request, hookContext.plan);

  let title = "Untitled";
  /**
   * Length enforcement for the narration currently under consideration.
   * Overwritten per stage so discarded earlier compression cannot describe
   * a later committed candidate.
   */
  let candidateLengthEnforcement: HookLengthEnforcementKind = "none";
  let candidateLengthWarning: string | undefined;

  const compress = async (
    narration: string,
  ): Promise<{ narration: string; hookClaimRefs: readonly string[] } | null> => {
    try {
      const result = await input.modelCall({
        kind: "length_compress",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: hookContext.directive.promptBlock,
        permittedClaimIds: hookContext.permittedClaimIds,
        previousNarration: narration,
        validationReasons: ["quality.over_word_limit"],
        qualityMode: input.qualityMode,
        model: input.model,
      });
      return {
        narration: result.narration,
        hookClaimRefs: result.hookClaimRefs,
      };
    } catch {
      return null;
    }
  };

  let initial: HookedNarrationModelResult;
  try {
    initial = await input.modelCall({
      kind: "initial",
      topic: input.topic,
      tone: input.tone,
      duration: input.duration,
      scriptMode: input.scriptMode,
      context: input.context,
      templatePromptBlock: input.templatePromptBlock,
      hookDirectiveBlock: hookContext.directive.promptBlock,
      permittedClaimIds: hookContext.permittedClaimIds,
      qualityMode: input.qualityMode,
      model: input.model,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Hooked narration model call failed",
      diagnostics: {
        contractVersion: hookContext.request.contractVersion,
        strategyId: hookContext.plan.strategyId,
        strategyVersion: hookContext.plan.strategyVersion,
        strategySource: hookContext.plan.strategySource,
        generationPath: hookContext.generationPath,
        requestFingerprint: hookContext.request.requestFingerprint,
        planFingerprint: hookContext.plan.planFingerprint,
        groundingStatus: hookContext.request.grounding.normalizedGroundingStatus,
        validationOutcome: "generation_failed",
        repairAttempts: 0,
        lengthEnforcement: "none",
        templateInfluenced: Boolean(hookContext.request.templateId),
        promptIntelligenceInfluenced:
          hookContext.plan.strategySource === "prompt_intelligence",
        adapterRan: true,
        fallbackReason: "initial_model_call_failed",
      },
      snapshot: hookContext.snapshot,
    };
  }

  title = initial.title;
  const hardCapWords = input.narrationHardCapWords;
  const exceedsRetentionHardCap = (text: string): boolean =>
    exceedsHardCapWords(text, hardCapWords);

  const enforcedInitial = await enforceLength({
    narration: initial.narration,
    claimRefs: initial.hookClaimRefs,
    duration: input.duration,
    request: hookContext.request,
    ...(hardCapWords != null ? { narrationHardCapWords: hardCapWords } : {}),
    compress,
  });
  candidateLengthEnforcement = enforcedInitial.lengthEnforcement;
  candidateLengthWarning = enforcedInitial.warning;

  let narrationForWorkflow = enforcedInitial.narration;
  let claimRefsForWorkflow = enforcedInitial.claimRefs;
  let retentionLengthRepairUsed = false;

  // Hook opening validation does not enforce full-narration Retention hard caps.
  // When structured compression left the body over budget, spend the single
  // repair slot on a Retention-aware length rewrite before Hook approval.
  if (exceedsRetentionHardCap(narrationForWorkflow)) {
    try {
      const repaired = await input.modelCall({
        kind: "repair",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: hookContext.directive.promptBlock,
        permittedClaimIds: hookContext.permittedClaimIds,
        previousNarration: narrationForWorkflow,
        validationReasons: ["quality.over_word_limit"],
        qualityMode: input.qualityMode,
        model: input.model,
      });
      title = repaired.title || title;
      const enforced = await enforceLength({
        narration: repaired.narration,
        claimRefs: repaired.hookClaimRefs,
        duration: input.duration,
        request: hookContext.request,
        ...(hardCapWords != null ? { narrationHardCapWords: hardCapWords } : {}),
        compress,
      });
      narrationForWorkflow = enforced.narration;
      claimRefsForWorkflow = enforced.claimRefs;
      candidateLengthEnforcement = enforced.lengthEnforcement;
      candidateLengthWarning = enforced.warning;
      retentionLengthRepairUsed = true;
    } catch {
      retentionLengthRepairUsed = true;
    }
  }

  // Auto/default strategies may use Hook compatibility fallback for length fit.
  // Never force fallback for user-selected or Write My Own openings.
  const mayUseLengthFallback =
    hookContext.plan.strategySource !== "user_selected" &&
    hookContext.plan.strategySource !== "user_authored" &&
    hookContext.plan.strategyId !== "user_directed";

  if (
    exceedsRetentionHardCap(narrationForWorkflow) &&
    retentionLengthRepairUsed &&
    mayUseLengthFallback
  ) {
    try {
      const fallbackDirective = buildHookDirective({
        request: hookContext.request,
        plan: hookContext.plan,
      });
      const fb = await input.modelCall({
        kind: "compatibility_fallback",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: fallbackDirective.promptBlock,
        permittedClaimIds: [],
        previousNarration: narrationForWorkflow,
        validationReasons: ["compatibility_fallback", "quality.over_word_limit"],
        qualityMode: input.qualityMode,
        model: input.model,
      });
      title = fb.title || title;
      const withOpening = applyDeterministicCompatibilityOpening(
        fb.narration,
        input.topic,
      );
      const enforced = await enforceLength({
        narration: withOpening,
        claimRefs: [],
        duration: input.duration,
        request: hookContext.request,
        ...(hardCapWords != null ? { narrationHardCapWords: hardCapWords } : {}),
        compress,
      });
      if (!exceedsRetentionHardCap(enforced.narration)) {
        narrationForWorkflow = enforced.narration;
        claimRefsForWorkflow = [];
        candidateLengthEnforcement = enforced.lengthEnforcement;
        candidateLengthWarning = enforced.warning;
      }
    } catch {
      // Final hard-cap gate fails closed.
    }
  }

  const workflow = await runBoundedHookRepair({
    request: hookContext.request,
    plan: hookContext.plan,
    narration: narrationForWorkflow,
    claimRefs: claimRefsForWorkflow,
    compressionRevalidated: candidateLengthEnforcement !== "none",
    // If the repair slot was already spent on Retention length fit, do not
    // double-consume. Opening failures then route to Hook fallback as usual.
    repair: retentionLengthRepairUsed
      ? undefined
      : async ({ validation, narration }) => {
          const repaired = await input.modelCall({
            kind: "repair",
            topic: input.topic,
            tone: input.tone,
            duration: input.duration,
            scriptMode: input.scriptMode,
            context: input.context,
            templatePromptBlock: input.templatePromptBlock,
            hookDirectiveBlock: hookContext.directive.promptBlock,
            permittedClaimIds: hookContext.permittedClaimIds,
            previousNarration: narration,
            validationReasons: validation.reasons,
            qualityMode: input.qualityMode,
            model: input.model,
          });
          title = repaired.title || title;
          const enforced = await enforceLength({
            narration: repaired.narration,
            claimRefs: repaired.hookClaimRefs,
            duration: input.duration,
            request: hookContext.request,
            ...(hardCapWords != null
              ? { narrationHardCapWords: hardCapWords }
              : {}),
            compress,
          });
          candidateLengthEnforcement = enforced.lengthEnforcement;
          candidateLengthWarning = enforced.warning;
          return {
            narration: enforced.narration,
            claimRefs: enforced.claimRefs,
          };
        },
    compatibilityFallback: async ({ narration, plan }) => {
      // Active fallback plan owns the directive — never reuse the original Hook directive.
      // Invoked only when prior narration body is unusable (tryFallback skips model otherwise).
      const fallbackDirective = buildHookDirective({
        request: hookContext.request,
        plan,
      });
      const fb = await input.modelCall({
        kind: "compatibility_fallback",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: fallbackDirective.promptBlock,
        permittedClaimIds: [],
        previousNarration: narration,
        validationReasons: ["compatibility_fallback"],
        qualityMode: input.qualityMode,
        model: input.model,
      });
      title = fb.title || title;
      // Length-enforce the narration that will be committed after deterministic opening.
      const withOpening = applyDeterministicCompatibilityOpening(
        fb.narration,
        input.topic,
      );
      const enforced = await enforceLength({
        narration: withOpening,
        claimRefs: [],
        duration: input.duration,
        request: hookContext.request,
        ...(hardCapWords != null ? { narrationHardCapWords: hardCapWords } : {}),
      });
      candidateLengthEnforcement = enforced.lengthEnforcement;
      candidateLengthWarning = enforced.warning;
      return {
        narration: enforced.narration,
        claimRefs: [],
      };
    },
    safeFallback: async ({ narration, plan }) => {
      // Active fallback plan owns the directive — never reuse the original Hook directive.
      // Invoked only when prior narration body is unusable (tryFallback skips model otherwise).
      const fallbackDirective = buildHookDirective({
        request: hookContext.request,
        plan,
      });
      const fb = await input.modelCall({
        kind: "safe_fallback",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: fallbackDirective.promptBlock,
        permittedClaimIds: [],
        previousNarration: narration,
        validationReasons: ["safe_fallback"],
        qualityMode: input.qualityMode,
        model: input.model,
      });
      title = fb.title || title;
      const withOpening = applyDeterministicCompatibilityOpening(
        fb.narration,
        input.topic,
      );
      const enforced = await enforceLength({
        narration: withOpening,
        claimRefs: [],
        duration: input.duration,
        request: hookContext.request,
        ...(hardCapWords != null ? { narrationHardCapWords: hardCapWords } : {}),
      });
      candidateLengthEnforcement = enforced.lengthEnforcement;
      candidateLengthWarning = enforced.warning;
      return {
        narration: enforced.narration,
        claimRefs: [],
      };
    },
  });

  const snapshot = buildHookPlanSnapshot(workflow.activePlan);
  const committedLengthEnforcement = candidateLengthEnforcement;
  const committedLengthWarning = candidateLengthWarning;
  const compressionRevalidated = committedLengthEnforcement !== "none";

  const diagnostics = Object.freeze({
    ...workflow.diagnostics,
    lengthEnforcement: committedLengthEnforcement,
    ...(compressionRevalidated ? { compressionRevalidated: true } : {}),
  });

  if (!workflow.ok || !workflow.approvedNarration || !workflow.selection) {
    return {
      ok: false,
      error: buildCreatorFacingHookFailureMessage({
        diagnostics,
        requestedStyleStrategyId:
          hookContext.request.requestedStrategyId ?? hookContext.plan.strategyId,
      }),
      diagnostics,
      snapshot,
    };
  }

  if (exceedsRetentionHardCap(workflow.approvedNarration)) {
    return {
      ok: false,
      error: buildCreatorFacingHookFailureMessage({
        diagnostics: Object.freeze({
          ...diagnostics,
          validationOutcome: "generation_failed",
          fallbackReason: "retention_hard_cap_unmet",
        }),
        requestedStyleStrategyId:
          hookContext.request.requestedStrategyId ?? hookContext.plan.strategyId,
      }),
      diagnostics: Object.freeze({
        ...diagnostics,
        validationOutcome: "generation_failed",
        fallbackReason: "retention_hard_cap_unmet",
      }),
      snapshot,
    };
  }

  const approved = workflow.approvedNarration;
  const opening = workflow.selection.openingText;
  if (
    workflow.candidate &&
    approved.slice(
      workflow.candidate.openingStartOffset,
      workflow.candidate.openingEndOffset,
    ) !== opening
  ) {
    return {
      ok: false,
      error: "Approved narration opening span mismatch.",
      diagnostics,
      snapshot,
    };
  }

  if (!workflow.candidate || !workflow.validation) {
    return {
      ok: false,
      error: "Hook terminal candidate/validation missing after approval.",
      diagnostics,
      snapshot,
    };
  }

  return {
    ok: true,
    title,
    approvedNarration: approved,
    selection: workflow.selection,
    diagnostics,
    snapshot,
    ...(committedLengthWarning ? { lengthWarning: committedLengthWarning } : {}),
    compressionRevalidated,
    terminalEvidence: Object.freeze({
      request: hookContext.request,
      activePlan: workflow.activePlan,
      candidate: workflow.candidate,
      validation: workflow.validation,
      openingClaimRefs: Object.freeze([...workflow.candidate.claimRefs]),
    }),
  };
}

/** Helper to build a StoryScript from approved hooked narration. */
export function storyScriptFromHookedNarration(input: {
  readonly title: string;
  readonly approvedNarration: string;
  readonly id?: string;
  readonly lengthWarning?: string;
}): StoryScript {
  return {
    id: input.id ?? createStoryScriptId(),
    title: input.title,
    narration: input.approvedNarration,
    ...(input.lengthWarning ? { lengthWarning: input.lengthWarning } : {}),
  };
}
