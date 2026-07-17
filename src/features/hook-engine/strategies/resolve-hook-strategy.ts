/**
 * Deterministic Hook Strategy resolution — Sprint 7B.1.
 * No Date.now, randomness, model calls, network, or env-dependent selection.
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";

import { HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE } from "../domain/hook-contract.constants";
import {
  hasEligibleVerifiedFactualClaim,
  isEligibleVerifiedFactualClaim,
} from "../domain/normalize-hook-request";
import type {
  HookStrategySource,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import {
  getCompatibilityFallbackStrategy,
  getHookStrategy,
  HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
} from "./hook-strategy.registry";
import type {
  HookStrategyDefinition,
  HookStrategyResolution,
} from "./hook-strategy.types";

function isStrategyCompatibleWithMode(
  strategy: HookStrategyDefinition,
  request: NormalizedHookRequest,
): boolean {
  if (strategy.preferredScriptModes.length === 0) {
    return true;
  }
  return strategy.preferredScriptModes.includes(request.scriptMode);
}

function meetsGroundingRequirement(
  strategy: HookStrategyDefinition,
  request: NormalizedHookRequest,
): boolean {
  if (!strategy.requiresVerifiedFactualClaim) {
    return true;
  }
  return hasEligibleVerifiedFactualClaim(request.grounding);
}

function canSelectStrategy(
  strategy: HookStrategyDefinition,
  request: NormalizedHookRequest,
): { ok: true } | { ok: false; reason: string } {
  if (!isStrategyCompatibleWithMode(strategy, request)) {
    return {
      ok: false,
      reason: `strategy ${strategy.id} incompatible with scriptMode ${request.scriptMode}`,
    };
  }
  if (!meetsGroundingRequirement(strategy, request)) {
    return {
      ok: false,
      reason: `strategy ${strategy.id} requires verified permitted research claims`,
    };
  }
  return { ok: true };
}

function resolve(
  strategy: HookStrategyDefinition,
  strategySource: HookStrategySource,
  selectionReason: string,
  extras: {
    rejectedPreferenceReason?: string;
    fallbackReason?: string;
  } = {},
): HookStrategyResolution {
  return Object.freeze({
    strategy,
    strategySource,
    selectionReason,
    ...(extras.rejectedPreferenceReason
      ? { rejectedPreferenceReason: extras.rejectedPreferenceReason }
      : {}),
    ...(extras.fallbackReason ? { fallbackReason: extras.fallbackReason } : {}),
  });
}

/**
 * evidence_surprise requires explicit openingIntent.evidence_led_surprise and
 * at least one referenced claim that is research_verified + verified + permitted.
 */
export function evaluateEvidenceSurpriseEligibility(
  request: NormalizedHookRequest,
): { ok: true } | { ok: false; reason: string } {
  const intent = request.openingIntent;
  if (!intent || intent.kind !== HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE) {
    return {
      ok: false,
      reason: "evidence_surprise requires openingIntent kind evidence_led_surprise",
    };
  }
  if (intent.claimRefs.length === 0) {
    return {
      ok: false,
      reason: "evidence_surprise requires at least one referenced grounding claim ID",
    };
  }
  if (request.grounding.unavailableResearch) {
    return {
      ok: false,
      reason: "evidence_surprise unavailable when research is unavailable",
    };
  }

  const claimById = new Map(
    request.grounding.claims.map((claim) => [claim.claimId, claim]),
  );
  const eligibleRef = intent.claimRefs.some((ref) => {
    const claim = claimById.get(ref);
    return claim ? isEligibleVerifiedFactualClaim(claim) : false;
  });

  if (!eligibleRef) {
    return {
      ok: false,
      reason:
        "evidence_surprise requires a referenced claim that is research_verified, verified, and permittedForFactualHookUse",
    };
  }

  return { ok: true };
}

/**
 * Deterministic precedence (Sprint 7E.6):
 * 1. user_directed (sanitized non-empty user-authored hook)
 * 2. valid explicit user-selected strategy (requestedStrategyId)
 * 3. compatible creator-template preference
 * 4. evidence_surprise when explicit opening intent + eligible referenced claim
 * 5. script-mode default
 * 6. compatibility_punchy
 */
export function resolveHookStrategy(
  request: NormalizedHookRequest,
): HookStrategyResolution {
  const fallback = getCompatibilityFallbackStrategy();
  let rejectedPreferenceReason: string | undefined;

  // 1. User-authored (Write My Own)
  if (request.userAuthoredHook) {
    const userDirected = getHookStrategy("user_directed");
    if (userDirected) {
      const gate = canSelectStrategy(userDirected, request);
      if (gate.ok) {
        return resolve(
          userDirected,
          "user_authored",
          "sanitized non-empty user-authored hook present",
        );
      }
      rejectedPreferenceReason = gate.reason;
    }
  }

  // 2. Explicit user Hook Style selection
  if (request.requestedStrategyId) {
    const selected = getHookStrategy(request.requestedStrategyId);
    if (!selected) {
      rejectedPreferenceReason = `unknown requested strategy ${request.requestedStrategyId}`;
    } else {
      const gate = canSelectStrategy(selected, request);
      if (gate.ok) {
        return resolve(
          selected,
          "user_selected",
          `explicit user Hook Style selection ${selected.id}`,
          rejectedPreferenceReason ? { rejectedPreferenceReason } : undefined,
        );
      }
      rejectedPreferenceReason = gate.reason;
    }
  }

  // 3. Template advisory preference
  if (request.templateId) {
    const preferredId =
      HOOK_TEMPLATE_STRATEGY_PREFERENCES[request.templateId as CreatorTemplateId];
    if (preferredId) {
      const preferred = getHookStrategy(preferredId);
      if (!preferred) {
        rejectedPreferenceReason = `unknown template preference strategy ${preferredId}`;
      } else {
        const gate = canSelectStrategy(preferred, request);
        if (gate.ok) {
          return resolve(
            preferred,
            "template_advisory",
            `creator template ${request.templateId} prefers ${preferred.id}`,
            rejectedPreferenceReason
              ? { rejectedPreferenceReason }
              : undefined,
          );
        }
        rejectedPreferenceReason = gate.reason;
      }
    }
  }

  // 4. Explicit evidence intent → evidence_surprise
  const evidence = getHookStrategy("evidence_surprise");
  if (evidence) {
    const evidenceGate = evaluateEvidenceSurpriseEligibility(request);
    if (evidenceGate.ok) {
      const gate = canSelectStrategy(evidence, request);
      if (gate.ok) {
        return resolve(
          evidence,
          "prompt_intelligence",
          "explicit evidence_led_surprise intent with eligible referenced claim",
          rejectedPreferenceReason ? { rejectedPreferenceReason } : undefined,
        );
      }
      rejectedPreferenceReason = rejectedPreferenceReason ?? gate.reason;
    } else if (request.openingIntent?.kind === HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE) {
      rejectedPreferenceReason =
        rejectedPreferenceReason ?? evidenceGate.reason;
    }
  }

  // 5. Script-mode default
  const modeDefaultId = HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES[request.scriptMode];
  const modeDefault = modeDefaultId ? getHookStrategy(modeDefaultId) : null;
  if (modeDefault) {
    const gate = canSelectStrategy(modeDefault, request);
    if (gate.ok) {
      return resolve(
        modeDefault,
        "strategy_library",
        `scriptMode ${request.scriptMode} default ${modeDefault.id}`,
        rejectedPreferenceReason ? { rejectedPreferenceReason } : undefined,
      );
    }
    rejectedPreferenceReason = rejectedPreferenceReason ?? gate.reason;
  }

  // 6. Compatibility fallback (always available)
  return resolve(
    fallback,
    "compatibility_fallback",
    "deterministic compatibility_punchy fallback",
    {
      ...(rejectedPreferenceReason ? { rejectedPreferenceReason } : {}),
      fallbackReason: rejectedPreferenceReason
        ? `preferences rejected; using ${fallback.id}`
        : `no higher-precedence strategy; using ${fallback.id}`,
    },
  );
}
