/**
 * Shared production doubles for Retention Story Sprint 10H Golden QA.
 * Network-free; mirrors retentionProductionIntegration.verify.ts fixtures.
 */

import { extractOpeningSpan } from "@/features/hook-engine";
import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";
import type {
  RetentionComposerCallback,
  RetentionHookRunner,
  RetentionPlannerCallback,
} from "@/features/retention-story";
import {
  normalizeStoryContract,
} from "@/features/retention-story";

import {
  SECTION_WORDS,
  completePlannerProposal,
  emptyGrounding,
} from "./retentionStoryCoherentEnvelope";
import {
  buildTerminalHookAuthority,
  deriveSafeHookEnvelopeFromAuthority,
  toHookTerminalEvidence,
} from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";

function padWords(base: string, target: number): string {
  return padSpokenWords(base, target);
}

export const passRetentionHookRunner: RetentionHookRunner = async (input) => {
  const initial = await input.modelCall({
    kind: "initial",
    topic: input.topic,
    tone: input.tone,
    duration: input.duration,
    scriptMode: input.scriptMode,
    context: input.context,
    templatePromptBlock: input.templatePromptBlock,
    hookDirectiveBlock: input.hookContext.directive.promptBlock,
    permittedClaimIds: input.hookContext.permittedClaimIds,
    qualityMode: input.qualityMode,
    model: input.model,
  });
  const span = extractOpeningSpan(initial.narration);
  if (!span) {
    return {
      ok: false,
      error: "opening span missing",
      diagnostics: {
        contractVersion: input.hookContext.request.contractVersion,
        strategyId: input.hookContext.plan.strategyId,
        strategyVersion: input.hookContext.plan.strategyVersion,
        strategySource: input.hookContext.plan.strategySource,
        generationPath: input.hookContext.generationPath,
        requestFingerprint: input.hookContext.request.requestFingerprint,
        planFingerprint: input.hookContext.plan.planFingerprint,
        groundingStatus: "user_context_only",
        validationOutcome: "fail",
        repairAttempts: 0,
        templateInfluenced: false,
        promptIntelligenceInfluenced: false,
        adapterRan: true,
      },
      snapshot: input.hookContext.snapshot,
    };
  }
  const generationPath =
    input.hookContext.generationPath === "audio_first_full"
      ? "audio_first_full"
      : "script_only";
  // Prefer the live Hook context plan (Write My Own / explicit styles).
  // Fall back to Auto fixture authority only when context-bound validation fails.
  const origin = input.hookContext.request.userAuthoredHook
    ? ("user_authored" as const)
    : ("model_narration_opening" as const);
  const failDiagnostics = Object.freeze({
    contractVersion: input.hookContext.request.contractVersion,
    strategyId: input.hookContext.plan.strategyId,
    strategyVersion: input.hookContext.plan.strategyVersion,
    strategySource: input.hookContext.plan.strategySource,
    generationPath: input.hookContext.generationPath,
    requestFingerprint: input.hookContext.request.requestFingerprint,
    planFingerprint: input.hookContext.plan.planFingerprint,
    groundingStatus: "user_context_only" as const,
    validationOutcome: "fail" as const,
    repairAttempts: 0,
    templateInfluenced: false,
    promptIntelligenceInfluenced: false,
    adapterRan: true,
  });

  let authority;
  try {
    const hookCandidate = buildHookCandidate({
      narration: initial.narration,
      request: input.hookContext.request,
      plan: input.hookContext.plan,
      origin,
      claimRefs: [],
    });
    const validation = validateHookCandidate({
      request: input.hookContext.request,
      plan: input.hookContext.plan,
      candidate: hookCandidate,
      repairBoundExceeded: true,
    });
    if (!validation.ok) {
      throw new Error("context_bound_hook_validation_failed");
    }
    authority = Object.freeze({
      request: input.hookContext.request,
      activePlan: input.hookContext.plan,
      approvedCandidate: hookCandidate,
      openingClaimRefs: Object.freeze([...hookCandidate.claimRefs]),
      validation,
    });
  } catch {
    // Write My Own must not silently fall back to Auto fixture authority.
    if (input.hookContext.request.userAuthoredHook) {
      return {
        ok: false as const,
        error: "user_authored_hook_validation_failed",
        diagnostics: failDiagnostics,
        snapshot: input.hookContext.snapshot,
      };
    }
    try {
      authority = buildTerminalHookAuthority(initial.narration, {
        generationPath,
        topic: input.topic,
        scriptMode: input.scriptMode,
        tone: input.tone,
        durationSeconds: input.duration,
      });
    } catch {
      // Never throw out of the Hook runner double — production treats throws as
      // composer_call_failed. Soft-fail so Flexible rescue can run.
      return {
        ok: false as const,
        error: "hook_authority_fixture_failed",
        diagnostics: failDiagnostics,
        snapshot: input.hookContext.snapshot,
      };
    }
  }
  const { hookPlanSnapshot, hookDiagnostics } =
    deriveSafeHookEnvelopeFromAuthority(authority, generationPath);
  return {
    ok: true,
    title: initial.title,
    approvedNarration: initial.narration,
    selection: {
      candidateId: authority.approvedCandidate.candidateId,
      strategyId: authority.activePlan.strategyId,
      strategySource: authority.activePlan.strategySource,
      candidateOrigin: authority.approvedCandidate.origin,
      openingText: span.openingText,
      planFingerprint: authority.activePlan.planFingerprint,
      narrationCommitRule: "opening_span_of_narration",
    },
    diagnostics: hookDiagnostics,
    snapshot: hookPlanSnapshot,
    compressionRevalidated: false,
    terminalEvidence: toHookTerminalEvidence(authority),
  };
};

export function makeRetentionPlanner(
  qualityMode: "cheap" | "balanced" | "best",
): RetentionPlannerCallback | null {
  if (qualityMode === "cheap") return null;
  return (request) => {
    const selection =
      request.formatStrategyId === "short_standard" ||
      request.formatStrategyId === "short_retention" ||
      request.formatStrategyId === "auto"
        ? request.formatStrategyId
        : "auto";
    const contract = normalizeStoryContract({
      topic: request.topic,
      durationSec: request.durationSec,
      qualityMode: request.qualityMode,
      generationPath: "script_only",
      scriptMode: request.scriptMode as "story",
      tone: "dramatic",
      formatStrategyId: selection,
      grounding: emptyGrounding(),
    });
    return completePlannerProposal({
      contract,
      grounding: emptyGrounding(),
      planner: null,
    });
  };
}

export function makeRetentionComposer(): RetentionComposerCallback {
  return (request) => {
    const n = request.orderedBeatIds.length;
    const budget = Math.round(request.durationSec * 2.4);
    const minPer = 4;
    // Stay under Retention hard budget after never-truncate spoken pads.
    const targetTotal = Math.min(
      Math.max(n * minPer, budget - 8),
      Math.max(n * minPer, Math.floor(budget * 0.78)),
    );
    const base = Math.floor(targetTotal / n);
    let rem = targetTotal - base * n;
    const segments = request.orderedBeatIds.map((beatId, i) => {
      const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
      const section = SECTION_WORDS[i] ?? "next";
      if (i === 0) {
        const open = "Why does Spain pressure matter?";
        const openWords = open.trim().split(/\s+/).filter(Boolean).length;
        const body = padWords(
          "Spain tactical focus reshapes this France preview tonight",
          Math.max(3, target - openWords),
        );
        return {
          beatId,
          text: joinOpeningAndBody(open, body),
          claimRefs: [] as string[],
        };
      }
      const seed =
        i === n - 1
          ? "Spain pressure closes this preview decisively tonight"
          : `Spain ${section} pressure advances with clear focus`;
      return {
        beatId,
        text: padWords(seed, target),
        claimRefs: [] as string[],
      };
    });
    return {
      title: "Spain pressure story",
      hookClaimRefs: [] as string[],
      segments,
    };
  };
}

export function retentionProductionDoubles(
  qualityMode: "cheap" | "balanced" | "best",
) {
  return {
    planner: makeRetentionPlanner(qualityMode),
    composer: makeRetentionComposer(),
    hookRunner: passRetentionHookRunner,
  } as const;
}

export const SECRET_FIXTURES = Object.freeze([
  "sk-proj-ABC123SECRETKEY999",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret.payload",
  "OPENAI_API_KEY=sk-live-should-never-leak",
  'provider_payload={"choices":[{"text":"secret narration dump"}]}',
]);

export function assertNoSecrets(blob: string): void {
  for (const secret of SECRET_FIXTURES) {
    if (blob.includes(secret)) {
      throw new Error(`secret leaked: ${secret.slice(0, 24)}…`);
    }
  }
  if (/sk-[A-Za-z0-9_-]{10,}/.test(blob)) {
    throw new Error("sk- token leaked");
  }
  if (/Bearer\s+eyJ/.test(blob)) {
    throw new Error("Bearer JWT leaked");
  }
}
