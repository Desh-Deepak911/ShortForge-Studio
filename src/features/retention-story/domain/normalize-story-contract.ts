/**
 * Canonical Story Contract normalization — Sprint 10B.
 */

import { CREATOR_TEMPLATE_IDS } from "@/features/creator-templates/creator-template.registry";
import {
  isHookStyleCompatibleWithScriptMode,
  isHookStyleSelection,
  isInternalOnlyHookStrategyId,
  type HookStyleSelection,
} from "@/features/hook-engine/presentation/hook-style-selection";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import {
  resolveScriptMode,
  type QualityMode,
  type ScriptMode,
  type Tone,
} from "@/types/footiebitz";

import { normalizeRetentionGroundingContext } from "../grounding/retention-grounding-normalization";
import {
  RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  RETENTION_MAX_TOPIC_CHARS,
  RETENTION_MAX_USER_AUTHORED_HOOK_CHARS,
  RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
  RETENTION_STORY_CONTRACT_VERSION,
} from "./retention-story-contract.constants";
import { assertRetentionResearchIdentity } from "./retention-research-identity";
import { RetentionStoryError } from "./retention-story-errors";
import {
  buildContractFingerprint,
  buildRetentionSemanticIdentity,
} from "./retention-story-fingerprint";
import {
  normalizeRetentionDurationSec,
  resolveFormatStrategy,
} from "./resolve-format-strategy";
import { resolveRetentionGenerationPath } from "./resolve-retention-generation-path";
import type {
  AudienceIntent,
  DesiredViewerReaction,
  NormalizedStoryContract,
  StoryContractInput,
  StoryContractSemanticIdentities,
} from "./retention-story-contract.types";

const TONES = new Set<Tone>(["dramatic", "funny", "tactical", "news", "emotional"]);
const QUALITY_MODES = new Set<QualityMode>(["cheap", "balanced", "best"]);
const AUDIENCES = new Set<AudienceIntent>([
  "general_audience",
  "enthusiast",
  "expert",
  "community",
]);
const REACTIONS = new Set<DesiredViewerReaction>([
  "curiosity",
  "surprise",
  "debate",
  "awe",
  "satisfaction",
  "urgency",
]);
const TEMPLATE_IDS = new Set<string>(CREATOR_TEMPLATE_IDS);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

/** Collapse whitespace, trim, Unicode NFC. */
export function sanitizeRetentionText(
  raw: unknown,
  maxChars: number,
): string {
  if (raw == null) return "";
  const text = String(raw)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function resolveTone(raw: unknown): Tone {
  if (raw == null || raw === "") return "dramatic";
  if (typeof raw === "string" && TONES.has(raw as Tone)) return raw as Tone;
  throw new RetentionStoryError("invalid_tone", "Tone is not a supported value.");
}

function resolveQualityMode(raw: unknown): QualityMode {
  if (raw == null || raw === "") return "balanced";
  if (typeof raw === "string" && QUALITY_MODES.has(raw as QualityMode)) {
    return raw as QualityMode;
  }
  throw new RetentionStoryError(
    "invalid_quality_mode",
    "Quality mode is not a supported value.",
  );
}

function resolveAudience(raw: unknown): AudienceIntent {
  if (raw == null || raw === "") return "general_audience";
  if (typeof raw === "string" && AUDIENCES.has(raw as AudienceIntent)) {
    return raw as AudienceIntent;
  }
  throw new RetentionStoryError(
    "invalid_audience_intent",
    "Audience intent is not a supported value.",
  );
}

function resolveReaction(raw: unknown): DesiredViewerReaction {
  if (raw == null || raw === "") return "curiosity";
  if (typeof raw === "string" && REACTIONS.has(raw as DesiredViewerReaction)) {
    return raw as DesiredViewerReaction;
  }
  throw new RetentionStoryError(
    "invalid_desired_reaction",
    "Desired viewer reaction is not a supported value.",
  );
}

function resolveTemplateId(
  raw: unknown,
): CreatorTemplateId | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string" && TEMPLATE_IDS.has(raw)) {
    return raw as CreatorTemplateId;
  }
  throw new RetentionStoryError(
    "invalid_template_id",
    "Creator template is not recognized.",
  );
}

function resolveHookStyle(raw: unknown): HookStyleSelection {
  if (raw == null || raw === "") return "auto";
  if (typeof raw !== "string") {
    throw new RetentionStoryError(
      "invalid_hook_style",
      "Hook style selection is invalid.",
    );
  }
  if (isInternalOnlyHookStrategyId(raw)) {
    throw new RetentionStoryError(
      "invalid_hook_style",
      "Internal Hook strategy IDs cannot become Story Contract identities.",
    );
  }
  if (!isHookStyleSelection(raw)) {
    throw new RetentionStoryError(
      "invalid_hook_style",
      "Hook style is not in the selectable allowlist.",
    );
  }
  return raw;
}

function assertHookStyleCompatible(
  hookStyle: HookStyleSelection,
  scriptMode: ScriptMode,
): void {
  if (!isHookStyleCompatibleWithScriptMode(hookStyle, scriptMode)) {
    throw new RetentionStoryError(
      "incompatible_hook_style",
      "Hook style is not compatible with the selected script mode.",
    );
  }
}

function summarizeCanonicalGrounding(
  grounding: ReturnType<typeof normalizeRetentionGroundingContext>,
): NormalizedStoryContract["groundingSummary"] {
  let eligible = 0;
  let forbidden = 0;
  for (const claim of grounding.claims) {
    if (claim.forbidden || claim.verification === "forbidden" || claim.verification === "rejected") {
      forbidden += 1;
    }
    if (claim.permittedFactualUse && claim.verification === "verified" && !claim.forbidden) {
      eligible += 1;
    }
  }
  return Object.freeze({
    claimCount: grounding.claims.length,
    eligibleClaimCount: eligible,
    forbiddenClaimCount: forbidden,
    researchIdentity: grounding.researchIdentity,
  });
}

function defaultConstraints(formatStrategyId: NormalizedStoryContract["formatStrategyId"]): {
  forbidGenericIntro: boolean;
  requirePayoff: boolean;
} {
  return {
    forbidGenericIntro: formatStrategyId === "short_retention",
    requirePayoff:
      formatStrategyId === "short_retention" || formatStrategyId === "extended_short",
  };
}

/**
 * Normalize raw Story Contract input into immutable production contract state.
 * Does not plan narration, call models, or mutate input.
 */
export function normalizeStoryContract(
  input: StoryContractInput,
): NormalizedStoryContract {
  if (
    input.version != null &&
    input.version !== RETENTION_STORY_CONTRACT_VERSION
  ) {
    throw new RetentionStoryError(
      "unsupported_contract_version",
      "Story Contract version is not supported.",
    );
  }

  const generationPath = resolveRetentionGenerationPath({
    generationPath: input.generationPath,
    apiMode: input.apiMode,
  });

  const topic = sanitizeRetentionText(input.topic, RETENTION_MAX_TOPIC_CHARS);
  if (!topic) {
    throw new RetentionStoryError(
      "invalid_topic",
      "Topic is required after sanitization.",
    );
  }

  const durationSec = normalizeRetentionDurationSec(input.durationSec);
  const scriptMode = resolveScriptMode(input.scriptMode);
  const tone = resolveTone(input.tone);
  const qualityMode = resolveQualityMode(input.qualityMode);
  const factHandlingMode: import("./retention-story-contract.types").RetentionFactHandlingMode =
    input.factHandlingMode === "creative_premise"
      ? "creative_premise"
      : "verified_facts_only";
  const audienceIntent = resolveAudience(input.audienceIntent);
  const desiredReaction = resolveReaction(input.desiredReaction);
  const templateId = resolveTemplateId(input.templateId);
  const hookStyle = resolveHookStyle(input.hookStyle);
  assertHookStyleCompatible(hookStyle, scriptMode);

  const userAuthoredHook = sanitizeRetentionText(
    input.userAuthoredHook,
    RETENTION_MAX_USER_AUTHORED_HOOK_CHARS,
  );
  if (hookStyle === "user_written" && !userAuthoredHook) {
    throw new RetentionStoryError(
      "missing_user_authored_hook",
      "User-written Hook style requires a non-empty user-authored opening.",
    );
  }
  // Supplied user-authored Hook with another Hook Style must not become active intent.
  const activeUserAuthoredHook =
    hookStyle === "user_written" ? userAuthoredHook : "";

  const manualContext = sanitizeRetentionText(
    input.manualContext,
    RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  );
  const userInstructions = sanitizeRetentionText(
    input.userInstructions,
    RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
  );

  const { formatStrategyId, durationClass, profile } = resolveFormatStrategy({
    durationSec,
    selection: input.formatStrategyId,
  });

  const defaults = defaultConstraints(formatStrategyId);
  const constraints = Object.freeze({
    forbidGenericIntro:
      input.constraints?.forbidGenericIntro ?? defaults.forbidGenericIntro,
    requirePayoff: input.constraints?.requirePayoff ?? defaults.requirePayoff,
  });

  const hasGroundingClaims =
    input.grounding != null && (input.grounding.claims?.length ?? 0) > 0;
  const canonicalGrounding = normalizeRetentionGroundingContext(input.grounding);

  const topLevelOpaque =
    input.researchIdentity == null || input.researchIdentity === ""
      ? null
      : assertRetentionResearchIdentity(input.researchIdentity);

  if (hasGroundingClaims) {
    if (
      topLevelOpaque != null &&
      topLevelOpaque !== canonicalGrounding.researchIdentity
    ) {
      throw new RetentionStoryError(
        "grounding_identity_mismatch",
        "Supplied research identity does not match canonical grounding.",
      );
    }
  } else if (
    topLevelOpaque != null &&
    canonicalGrounding.researchIdentity != null &&
    topLevelOpaque !== canonicalGrounding.researchIdentity
  ) {
    throw new RetentionStoryError(
      "grounding_identity_mismatch",
      "Conflicting opaque research identities were supplied.",
    );
  }

  const groundingSummary = summarizeCanonicalGrounding(canonicalGrounding);

  // Opaque researchIdentity only when no claim context is supplied — zero eligible claims.
  let researchContextIdentity = groundingSummary.researchIdentity;
  if (!hasGroundingClaims) {
    researchContextIdentity =
      canonicalGrounding.researchIdentity ?? topLevelOpaque;
  }

  const identities: StoryContractSemanticIdentities = Object.freeze({
    topicNormalized: topic,
    manualContextIdentity: manualContext
      ? buildRetentionSemanticIdentity({ kind: "manual_context", text: manualContext })
      : null,
    userInstructionsIdentity: userInstructions
      ? buildRetentionSemanticIdentity({
          kind: "user_instructions",
          text: userInstructions,
        })
      : null,
    hookStyleIdentity: hookStyle,
    userAuthoredHookIdentity: activeUserAuthoredHook
      ? buildRetentionSemanticIdentity({
          kind: "user_authored_hook",
          text: activeUserAuthoredHook,
        })
      : null,
    researchContextIdentity,
  });

  const contractFingerprint = buildContractFingerprint({
    version: RETENTION_STORY_CONTRACT_VERSION,
    topic,
    durationSec,
    scriptMode,
    tone,
    qualityMode,
    factHandlingMode,
    templateId,
    hookStyleIdentity: identities.hookStyleIdentity,
    userAuthoredHookIdentity: identities.userAuthoredHookIdentity,
    manualContextIdentity: identities.manualContextIdentity,
    userInstructionsIdentity: identities.userInstructionsIdentity,
    researchContextIdentity,
    formatStrategyId,
    audienceIntent,
    desiredReaction,
    constraints,
    generationPath,
  });

  const normalized: NormalizedStoryContract = {
    version: RETENTION_STORY_CONTRACT_VERSION,
    topic,
    durationSec,
    durationClass,
    scriptMode,
    tone,
    qualityMode,
    formatStrategyId,
    factHandlingMode,
    audienceIntent,
    desiredReaction,
    informationDensity: profile.informationDensity,
    visualDensity: profile.visualDensity,
    pacingProfile: profile.pacingProfile,
    endingStrategy: profile.endingStrategy,
    templateId,
    templateInfluence: templateId ? "advisory" : "none",
    generationPath,
    constraints,
    identities: Object.freeze({
      ...identities,
      researchContextIdentity,
    }),
    groundingSummary: Object.freeze({
      claimCount: hasGroundingClaims ? groundingSummary.claimCount : 0,
      eligibleClaimCount: hasGroundingClaims ? groundingSummary.eligibleClaimCount : 0,
      forbiddenClaimCount: hasGroundingClaims
        ? groundingSummary.forbiddenClaimCount
        : 0,
      researchIdentity: researchContextIdentity,
    }),
    contractFingerprint,
  };

  return deepFreeze(normalized);
}
