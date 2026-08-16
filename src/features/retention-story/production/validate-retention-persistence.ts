/**
 * Total, non-throwing Retention persistence validators — Sprint 10G.1 / 10G.1A.
 * Never echo raw malformed values. Unknown / hostile input → ok: false.
 * Property-access failures (getters, Proxy traps) must not escape.
 */

import { RETENTION_CONTRACT_FINGERPRINT_PREFIX } from "../domain/retention-story-contract.constants";
import { RETENTION_CANDIDATE_FINGERPRINT_PREFIX } from "../composition/retention-narration-candidate.constants";
import { RETENTION_STORY_PLAN_FINGERPRINT_PREFIX } from "../planning/retention-story-plan.constants";
import { RETENTION_VALIDATION_FINGERPRINT_PREFIX } from "../validation/retention-validation.constants";
import type {
  RetentionPersistedTerminalState,
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
} from "./retention-persistence.types";

const PLAN_KEYS = Object.freeze([
  "version",
  "formatStrategyId",
  "controllingIdea",
  "primaryEmotion",
  "secondaryEmotion",
  "beatCount",
  "pacingProfile",
  "endingStrategy",
  "informationDensity",
  "visualDensity",
  "claimIdCount",
  "contractFingerprint",
  "planFingerprint",
  "strategyRegistryVersion",
] as const);

const PLAN_REQUIRED = Object.freeze([
  "version",
  "formatStrategyId",
  "controllingIdea",
  "primaryEmotion",
  "beatCount",
  "pacingProfile",
  "endingStrategy",
  "informationDensity",
  "visualDensity",
  "claimIdCount",
  "contractFingerprint",
  "planFingerprint",
  "strategyRegistryVersion",
] as const);

const VALIDATION_KEYS = Object.freeze([
  "version",
  "ok",
  "retentionReadiness",
  "storyQualityConfidence",
  "frameworkCompliance",
  "failedHardGateIds",
  "warningNotes",
  "validationFingerprint",
  "candidateFingerprint",
  "contractFingerprint",
  "planFingerprint",
  "terminalState",
  "rewriteUsed",
] as const);

const VALIDATION_REQUIRED = VALIDATION_KEYS;

const FORBIDDEN_PERSISTENCE_KEYS = Object.freeze([
  "promptBlock",
  "claimRefs",
  "terminalHookAuthority",
  "postRewriteHookEvidence",
  "terminalEvidence",
  "assembledNarration",
  "eligibleClaims",
  "avoidanceClaims",
  "contentAuthority",
  "orderedEssentialUnits",
  "orderedOptionalUnits",
  "compositionBrief",
  "orderedEssentialUnitIds",
  "usedContentIds",
  "hookDirectiveBlock",
  "OPENAI_API_KEY",
  "ledgerEvents",
  "ledger",
  "providerError",
  "rawResearch",
  "candidateNarration",
  "claimText",
  "diagnosticsDump",
] as const);

const FORMAT_STRATEGY_IDS = Object.freeze([
  "short_retention",
  "short_standard",
  "extended_short",
] as const);

const PACING = Object.freeze([
  "front_loaded",
  "escalating",
  "reveal_late",
] as const);

const ENDING = Object.freeze([
  "payoff_reveal",
  "challenge",
  "resolution",
  "open_loop",
] as const);

const INFO_DENSITY = Object.freeze(["sparse", "balanced", "dense"] as const);
const VISUAL_DENSITY = Object.freeze(["low", "medium", "high"] as const);
const TERMINAL_STATES = Object.freeze([
  "pass_without_rewrite",
  "pass_after_rewrite",
] as const satisfies readonly RetentionPersistedTerminalState[]);

const MAX_CONTROLLING_IDEA_CHARS = 280;
const MAX_EMOTION_CHARS = 48;
const MAX_WARNING_NOTES = 8;
const MAX_WARNING_CHARS = 160;
const MAX_BEAT_COUNT = 24;
const MAX_CLAIM_ID_COUNT = 64;
const MAX_FINGERPRINT_CHARS = 96;
const MAX_STRATEGY_REGISTRY_VERSION_CHARS = 160;
const STRATEGY_REGISTRY_VERSION_PATTERN = /^[a-z0-9][a-z0-9_./+-]{0,159}$/;

/** Sentinel — property access failed (getter / Proxy trap). */
const ACCESS_FAILED = Symbol("retention.persistence.access_failed");

export type RetentionPersistenceRejectReason =
  | "absent"
  | "legacy_unlinked"
  | "malformed"
  | "mismatch";

export type RetentionPersistenceValidateResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RetentionPersistenceRejectReason };

export type RetentionExplainabilityEnvelopeResult =
  | {
      readonly ok: true;
      readonly plan: RetentionStoryPlanSnapshot;
      readonly validation: RetentionValidationSummary;
    }
  | {
      readonly ok: false;
      readonly reason: RetentionPersistenceRejectReason;
    };

const MALFORMED: RetentionPersistenceValidateResult<never> = Object.freeze({
  ok: false,
  reason: "malformed",
});

function isPlainObject(value: unknown): value is object {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeGet(record: object, key: string): unknown {
  try {
    return Reflect.get(record, key);
  } catch {
    return ACCESS_FAILED;
  }
}

function safeHas(record: object, key: string): boolean | typeof ACCESS_FAILED {
  try {
    return Reflect.has(record, key);
  } catch {
    return ACCESS_FAILED;
  }
}

function safeOwnKeys(record: object): string[] | typeof ACCESS_FAILED {
  try {
    const keys = Reflect.ownKeys(record);
    const out: string[] = [];
    for (const key of keys) {
      if (typeof key !== "string") continue;
      out.push(key);
    }
    return out;
  } catch {
    return ACCESS_FAILED;
  }
}

function hasForbiddenKeys(keys: readonly string[]): boolean {
  for (const key of keys) {
    if ((FORBIDDEN_PERSISTENCE_KEYS as readonly string[]).includes(key)) {
      return true;
    }
  }
  return false;
}

function assertExactKeys(
  keys: readonly string[],
  allowed: readonly string[],
  required: readonly string[],
  record: object,
): boolean | typeof ACCESS_FAILED {
  if (hasForbiddenKeys(keys)) return false;
  const allowedSet = new Set(allowed);
  for (const key of keys) {
    if (!allowedSet.has(key)) return false;
  }
  for (const key of required) {
    const present = safeHas(record, key);
    if (present === ACCESS_FAILED) return ACCESS_FAILED;
    if (!present) return false;
  }
  return true;
}

function isFingerprint(value: unknown, prefix: string): value is string {
  if (typeof value !== "string") return false;
  if (value.length < prefix.length + 1 || value.length > MAX_FINGERPRINT_CHARS) {
    return false;
  }
  if (!value.startsWith(prefix)) return false;
  const digest = value.slice(prefix.length);
  return /^[0-9a-z]+$/.test(digest);
}

function isUnitScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegInt(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function sanitizeCreatorString(
  value: unknown,
  maxChars: number,
): string | null {
  if (typeof value !== "string") return null;
  try {
    const cleaned = value
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxChars);
  } catch {
    return null;
  }
}

function sanitizeWarningNotes(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const notes: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") return null;
      const cleaned = sanitizeCreatorString(item, MAX_WARNING_CHARS);
      if (cleaned) notes.push(cleaned);
      if (notes.length > MAX_WARNING_NOTES) return null;
    }
    return Object.freeze(notes.slice(0, MAX_WARNING_NOTES));
  } catch {
    return null;
  }
}

function readField(
  record: object,
  key: string,
): unknown | typeof ACCESS_FAILED {
  return safeGet(record, key);
}

/**
 * Validate a RetentionStoryPlanSnapshot. Total / non-throwing.
 */
export function validateRetentionStoryPlanSnapshot(
  input: unknown,
): RetentionPersistenceValidateResult<RetentionStoryPlanSnapshot> {
  try {
    if (input == null) return { ok: false, reason: "absent" };
    if (!isPlainObject(input)) return MALFORMED;

    const keys = safeOwnKeys(input);
    if (keys === ACCESS_FAILED) return MALFORMED;

    const keyCheck = assertExactKeys(keys, PLAN_KEYS, PLAN_REQUIRED, input);
    if (keyCheck === ACCESS_FAILED || keyCheck === false) return MALFORMED;

    const version = readField(input, "version");
    if (version === ACCESS_FAILED || version !== 1) return MALFORMED;

    const formatStrategyId = readField(input, "formatStrategyId");
    if (
      formatStrategyId === ACCESS_FAILED ||
      typeof formatStrategyId !== "string" ||
      !(FORMAT_STRATEGY_IDS as readonly string[]).includes(formatStrategyId)
    ) {
      return MALFORMED;
    }

    const pacingProfile = readField(input, "pacingProfile");
    if (
      pacingProfile === ACCESS_FAILED ||
      typeof pacingProfile !== "string" ||
      !(PACING as readonly string[]).includes(pacingProfile)
    ) {
      return MALFORMED;
    }

    const endingStrategy = readField(input, "endingStrategy");
    if (
      endingStrategy === ACCESS_FAILED ||
      typeof endingStrategy !== "string" ||
      !(ENDING as readonly string[]).includes(endingStrategy)
    ) {
      return MALFORMED;
    }

    const informationDensity = readField(input, "informationDensity");
    if (
      informationDensity === ACCESS_FAILED ||
      typeof informationDensity !== "string" ||
      !(INFO_DENSITY as readonly string[]).includes(informationDensity)
    ) {
      return MALFORMED;
    }

    const visualDensity = readField(input, "visualDensity");
    if (
      visualDensity === ACCESS_FAILED ||
      typeof visualDensity !== "string" ||
      !(VISUAL_DENSITY as readonly string[]).includes(visualDensity)
    ) {
      return MALFORMED;
    }

    const controllingIdeaRaw = readField(input, "controllingIdea");
    const primaryEmotionRaw = readField(input, "primaryEmotion");
    if (
      controllingIdeaRaw === ACCESS_FAILED ||
      primaryEmotionRaw === ACCESS_FAILED
    ) {
      return MALFORMED;
    }

    const controllingIdea = sanitizeCreatorString(
      controllingIdeaRaw,
      MAX_CONTROLLING_IDEA_CHARS,
    );
    const primaryEmotion = sanitizeCreatorString(
      primaryEmotionRaw,
      MAX_EMOTION_CHARS,
    );
    if (!controllingIdea || !primaryEmotion) return MALFORMED;

    let secondaryEmotion: string | undefined;
    const hasSecondary = safeHas(input, "secondaryEmotion");
    if (hasSecondary === ACCESS_FAILED) return MALFORMED;
    if (hasSecondary) {
      const secondaryRaw = readField(input, "secondaryEmotion");
      if (secondaryRaw === ACCESS_FAILED) return MALFORMED;
      const secondary = sanitizeCreatorString(secondaryRaw, MAX_EMOTION_CHARS);
      if (!secondary) return MALFORMED;
      secondaryEmotion = secondary;
    }

    const beatCount = readField(input, "beatCount");
    const claimIdCount = readField(input, "claimIdCount");
    if (
      beatCount === ACCESS_FAILED ||
      claimIdCount === ACCESS_FAILED ||
      !isNonNegInt(beatCount, MAX_BEAT_COUNT) ||
      !isNonNegInt(claimIdCount, MAX_CLAIM_ID_COUNT)
    ) {
      return MALFORMED;
    }

    const contractFingerprint = readField(input, "contractFingerprint");
    const planFingerprint = readField(input, "planFingerprint");
    const strategyRegistryVersion = readField(input, "strategyRegistryVersion");
    if (
      contractFingerprint === ACCESS_FAILED ||
      planFingerprint === ACCESS_FAILED ||
      strategyRegistryVersion === ACCESS_FAILED
    ) {
      return MALFORMED;
    }
    if (
      !isFingerprint(contractFingerprint, RETENTION_CONTRACT_FINGERPRINT_PREFIX) ||
      !isFingerprint(planFingerprint, RETENTION_STORY_PLAN_FINGERPRINT_PREFIX)
    ) {
      return MALFORMED;
    }
    if (
      typeof strategyRegistryVersion !== "string" ||
      strategyRegistryVersion.length === 0 ||
      strategyRegistryVersion.length > MAX_STRATEGY_REGISTRY_VERSION_CHARS ||
      !STRATEGY_REGISTRY_VERSION_PATTERN.test(strategyRegistryVersion)
    ) {
      return MALFORMED;
    }

    return {
      ok: true,
      value: Object.freeze({
        version: 1 as const,
        formatStrategyId:
          formatStrategyId as RetentionStoryPlanSnapshot["formatStrategyId"],
        controllingIdea,
        primaryEmotion,
        ...(secondaryEmotion ? { secondaryEmotion } : {}),
        beatCount,
        pacingProfile:
          pacingProfile as RetentionStoryPlanSnapshot["pacingProfile"],
        endingStrategy:
          endingStrategy as RetentionStoryPlanSnapshot["endingStrategy"],
        informationDensity:
          informationDensity as RetentionStoryPlanSnapshot["informationDensity"],
        visualDensity:
          visualDensity as RetentionStoryPlanSnapshot["visualDensity"],
        claimIdCount,
        contractFingerprint,
        planFingerprint,
        strategyRegistryVersion,
      }),
    };
  } catch {
    return MALFORMED;
  }
}

/**
 * Detect older validation summaries that lack 10G.1 linkage fields.
 * Uses already-materialized field values (never re-reads hostile getters).
 */
function isLegacyUnlinkedValidation(fields: {
  readonly version: unknown;
  readonly ok: unknown;
  readonly validationFingerprint: unknown;
  readonly candidateFingerprint: unknown;
  readonly hasContractFingerprint: boolean;
  readonly hasPlanFingerprint: boolean;
  readonly hasTerminalState: boolean;
  readonly hasRewriteUsed: boolean;
}): boolean {
  const hasCore =
    fields.version === 1 &&
    fields.ok === true &&
    typeof fields.validationFingerprint === "string" &&
    typeof fields.candidateFingerprint === "string";
  if (!hasCore) return false;
  return (
    !fields.hasContractFingerprint ||
    !fields.hasPlanFingerprint ||
    !fields.hasTerminalState ||
    !fields.hasRewriteUsed
  );
}

/**
 * Validate a RetentionValidationSummary. Total / non-throwing.
 */
export function validateRetentionValidationSummary(
  input: unknown,
): RetentionPersistenceValidateResult<RetentionValidationSummary> {
  try {
    if (input == null) return { ok: false, reason: "absent" };
    if (!isPlainObject(input)) return MALFORMED;

    const keys = safeOwnKeys(input);
    if (keys === ACCESS_FAILED) return MALFORMED;
    if (hasForbiddenKeys(keys)) return MALFORMED;

    const version = readField(input, "version");
    const okField = readField(input, "ok");
    const validationFingerprint = readField(input, "validationFingerprint");
    const candidateFingerprint = readField(input, "candidateFingerprint");
    if (
      version === ACCESS_FAILED ||
      okField === ACCESS_FAILED ||
      validationFingerprint === ACCESS_FAILED ||
      candidateFingerprint === ACCESS_FAILED
    ) {
      return MALFORMED;
    }

    const hasContractFingerprint = safeHas(input, "contractFingerprint");
    const hasPlanFingerprint = safeHas(input, "planFingerprint");
    const hasTerminalState = safeHas(input, "terminalState");
    const hasRewriteUsed = safeHas(input, "rewriteUsed");
    if (
      hasContractFingerprint === ACCESS_FAILED ||
      hasPlanFingerprint === ACCESS_FAILED ||
      hasTerminalState === ACCESS_FAILED ||
      hasRewriteUsed === ACCESS_FAILED
    ) {
      return MALFORMED;
    }

    if (
      isLegacyUnlinkedValidation({
        version,
        ok: okField,
        validationFingerprint,
        candidateFingerprint,
        hasContractFingerprint,
        hasPlanFingerprint,
        hasTerminalState,
        hasRewriteUsed,
      })
    ) {
      return { ok: false, reason: "legacy_unlinked" };
    }

    const keyCheck = assertExactKeys(
      keys,
      VALIDATION_KEYS,
      VALIDATION_REQUIRED,
      input,
    );
    if (keyCheck === ACCESS_FAILED || keyCheck === false) return MALFORMED;

    if (version !== 1 || okField !== true) return MALFORMED;

    const retentionReadiness = readField(input, "retentionReadiness");
    const storyQualityConfidence = readField(input, "storyQualityConfidence");
    const frameworkCompliance = readField(input, "frameworkCompliance");
    const failedHardGateIds = readField(input, "failedHardGateIds");
    const warningNotesRaw = readField(input, "warningNotes");
    const contractFingerprint = readField(input, "contractFingerprint");
    const planFingerprint = readField(input, "planFingerprint");
    const terminalStateRaw = readField(input, "terminalState");
    const rewriteUsedRaw = readField(input, "rewriteUsed");

    if (
      retentionReadiness === ACCESS_FAILED ||
      storyQualityConfidence === ACCESS_FAILED ||
      frameworkCompliance === ACCESS_FAILED ||
      failedHardGateIds === ACCESS_FAILED ||
      warningNotesRaw === ACCESS_FAILED ||
      contractFingerprint === ACCESS_FAILED ||
      planFingerprint === ACCESS_FAILED ||
      terminalStateRaw === ACCESS_FAILED ||
      rewriteUsedRaw === ACCESS_FAILED
    ) {
      return MALFORMED;
    }

    if (
      !isUnitScore(retentionReadiness) ||
      !isUnitScore(storyQualityConfidence) ||
      !isUnitScore(frameworkCompliance)
    ) {
      return MALFORMED;
    }

    if (
      !Array.isArray(failedHardGateIds) ||
      failedHardGateIds.length !== 0
    ) {
      return MALFORMED;
    }

    const warningNotes = sanitizeWarningNotes(warningNotesRaw);
    if (!warningNotes) return MALFORMED;

    if (
      !isFingerprint(
        validationFingerprint,
        RETENTION_VALIDATION_FINGERPRINT_PREFIX,
      ) ||
      !isFingerprint(
        candidateFingerprint,
        RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
      ) ||
      !isFingerprint(contractFingerprint, RETENTION_CONTRACT_FINGERPRINT_PREFIX) ||
      !isFingerprint(planFingerprint, RETENTION_STORY_PLAN_FINGERPRINT_PREFIX)
    ) {
      return MALFORMED;
    }

    if (
      typeof terminalStateRaw !== "string" ||
      !(TERMINAL_STATES as readonly string[]).includes(terminalStateRaw)
    ) {
      return MALFORMED;
    }
    if (typeof rewriteUsedRaw !== "boolean") return MALFORMED;

    const terminalState = terminalStateRaw as RetentionPersistedTerminalState;
    const rewriteUsed = rewriteUsedRaw;
    if (terminalState === "pass_after_rewrite" && rewriteUsed !== true) {
      return MALFORMED;
    }
    if (terminalState === "pass_without_rewrite" && rewriteUsed !== false) {
      return MALFORMED;
    }

    return {
      ok: true,
      value: Object.freeze({
        version: 1 as const,
        ok: true as const,
        retentionReadiness,
        storyQualityConfidence,
        frameworkCompliance,
        failedHardGateIds: Object.freeze([]) as readonly [],
        warningNotes,
        validationFingerprint,
        candidateFingerprint,
        contractFingerprint,
        planFingerprint,
        terminalState,
        rewriteUsed,
      }),
    };
  } catch {
    return MALFORMED;
  }
}

/**
 * Validate the paired plan + validation explainability envelope.
 * Requires matching contract/plan fingerprints. Does not invent authority.
 */
export function validateRetentionExplainabilityEnvelope(
  input: unknown,
): RetentionExplainabilityEnvelopeResult {
  try {
    if (input == null || typeof input !== "object") {
      return { ok: false, reason: "malformed" };
    }

    const retentionPlan = safeGet(input as object, "retentionPlan");
    const retentionValidation = safeGet(input as object, "retentionValidation");
    if (
      retentionPlan === ACCESS_FAILED ||
      retentionValidation === ACCESS_FAILED
    ) {
      return { ok: false, reason: "malformed" };
    }

    const planPresent = retentionPlan != null;
    const validationPresent = retentionValidation != null;

    if (!planPresent && !validationPresent) {
      return { ok: false, reason: "absent" };
    }
    if (planPresent !== validationPresent) {
      return { ok: false, reason: "malformed" };
    }

    const planResult = validateRetentionStoryPlanSnapshot(retentionPlan);
    const validationResult = validateRetentionValidationSummary(
      retentionValidation,
    );

    if (!planResult.ok && planResult.reason === "legacy_unlinked") {
      return { ok: false, reason: "legacy_unlinked" };
    }
    if (!validationResult.ok && validationResult.reason === "legacy_unlinked") {
      return { ok: false, reason: "legacy_unlinked" };
    }
    if (!planResult.ok || !validationResult.ok) {
      return { ok: false, reason: "malformed" };
    }

    const plan = planResult.value;
    const validation = validationResult.value;

    if (
      plan.contractFingerprint !== validation.contractFingerprint ||
      plan.planFingerprint !== validation.planFingerprint
    ) {
      return { ok: false, reason: "mismatch" };
    }

    return { ok: true, plan, validation };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/**
 * Whether a creator Story Strategy selection coheres with the resolved plan.
 * Auto/absence uses duration → Auto mapping. Never mutates narration.
 * Total / non-throwing over hostile input bags.
 */
export function isCreatorStoryStrategyCoherentWithPlan(
  input: unknown,
): boolean {
  try {
    if (input == null || typeof input !== "object") return false;
    const record = input as object;

    const durationSec = safeGet(record, "durationSec");
    const formatStrategyId = safeGet(record, "formatStrategyId");
    const resolvedFormatStrategyId = safeGet(record, "resolvedFormatStrategyId");
    if (
      durationSec === ACCESS_FAILED ||
      formatStrategyId === ACCESS_FAILED ||
      resolvedFormatStrategyId === ACCESS_FAILED
    ) {
      return false;
    }

    const duration =
      typeof durationSec === "number" && Number.isFinite(durationSec)
        ? Math.round(durationSec)
        : null;
    if (duration == null) return false;

    const selection =
      formatStrategyId == null || formatStrategyId === ""
        ? "auto"
        : formatStrategyId;

    if (selection === "auto") {
      if (duration >= 15 && duration <= 35) {
        return resolvedFormatStrategyId === "short_retention";
      }
      if (duration >= 36 && duration <= 60) {
        return resolvedFormatStrategyId === "extended_short";
      }
      return false;
    }

    if (selection === "short_retention") {
      return resolvedFormatStrategyId === "short_retention";
    }
    if (selection === "short_standard") {
      return resolvedFormatStrategyId === "short_standard";
    }
    return false;
  } catch {
    return false;
  }
}
