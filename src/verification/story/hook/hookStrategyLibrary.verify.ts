/**
 * Sprint 7B.1 — Hook Strategy Library safety hardening verification.
 * Run: npm run test:hook-strategy-library
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import {
  buildHookPlan,
  buildHookPlanFingerprint,
  buildHookPlanFromRequest,
  buildHookPlanSnapshot,
  buildHookRequestFingerprint,
  getCompatibilityFallbackStrategy,
  getHookStrategy,
  hasEligibleVerifiedFactualClaim,
  HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
  HOOK_CONTRACT_VERSION,
  HOOK_EVIDENCE_SURPRISE_STRATEGY_ID,
  HOOK_MAX_DURATION_SECONDS,
  HOOK_MIN_DURATION_SECONDS,
  HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
  HOOK_PLAN_FINGERPRINT_PREFIX,
  HOOK_REQUEST_FINGERPRINT_PREFIX,
  HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES,
  HOOK_SPEAKING_WORDS_PER_SECOND,
  HOOK_STRATEGY_IDS,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
  HOOK_USER_DIRECTED_STRATEGY_ID,
  HookNormalizationError,
  isOpeningConstraintPairCoherent,
  listHookStrategies,
  normalizeHookRequest,
  resolveHookStrategy,
  type HookGroundingClaim,
  type HookRequestInput,
  type HookStrategyDefinition,
  type NormalizedHookRequest,
} from "@/features/hook-engine";
import { SCRIPT_MODES, type ScriptMode } from "@/types/footiebitz";

const HOOK_ENGINE_ROOT = join(process.cwd(), "src/features/hook-engine");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function baseInput(overrides: Partial<HookRequestInput> = {}): HookRequestInput {
  return {
    topic: "Arsenal title race",
    scriptMode: "story",
    tone: "dramatic",
    durationSeconds: 45,
    generationPath: "script_only",
    ...overrides,
  };
}

function verifiedClaim(overrides: Partial<HookGroundingClaim> = {}): HookGroundingClaim {
  return {
    claimId: "c1",
    text: "Player X scored 30 league goals",
    provenance: "research_verified",
    verificationStatus: "verified",
    permittedForFactualHookUse: true,
    sourceRef: "api-football",
    ...overrides,
  };
}

function collectSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectSources(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function assertFrozenDeep(value: unknown, path = "root") {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value), `expected frozen: ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFrozenDeep(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertFrozenDeep(child, `${path}.${key}`);
  }
}

function tamperRequestFingerprint(request: NormalizedHookRequest): NormalizedHookRequest {
  return Object.freeze({
    ...request,
    requestFingerprint: `${HOOK_REQUEST_FINGERPRINT_PREFIX}forged`,
  });
}

console.log("\nhook-strategy-library (Sprint 7B.1)\n");

console.log("registry");

test("expected strategy IDs exist and are unique", () => {
  const expected = [
    "user_directed",
    "compatibility_punchy",
    "curiosity_gap",
    "stakes_first",
    "provocative_question",
    "contrarian_claim",
    "myth_challenge",
    "countdown_tease",
    "headline_first",
    "cold_open",
    "evidence_surprise",
  ];
  assert.deepEqual([...HOOK_STRATEGY_IDS].sort(), [...expected].sort());
  assert.equal(new Set(HOOK_STRATEGY_IDS).size, HOOK_STRATEGY_IDS.length);
});

test("registry frozen; constraints coherent at speaking rate", () => {
  for (const strategy of listHookStrategies()) {
    assertFrozenDeep(strategy, strategy.id);
    const c = strategy.constraints;
    assert.ok(c.minProvocativeness >= 0 && c.minProvocativeness <= 1);
    assert.ok(c.minClarity >= 0 && c.minClarity <= 1);
    assert.equal(c.mustPreserveSubject, true);
    assert.equal(c.forbidUnverifiedSuperlatives, true);
    assert.ok(
      isOpeningConstraintPairCoherent(c),
      `${strategy.id}: ${c.maxOpeningWords} words in ${c.maxOpeningSpokenSecondsHint}s exceeds ${HOOK_SPEAKING_WORDS_PER_SECOND} wps`,
    );
  }
  const fallback = getCompatibilityFallbackStrategy();
  assert.equal(fallback.constraints.maxOpeningWords, 4);
  assert.equal(fallback.constraints.maxOpeningSpokenSecondsHint, 2);
});

test("hook-engine sources do not import Studio Intelligence", () => {
  for (const file of collectSources(HOOK_ENGINE_ROOT)) {
    const text = readFileSync(file, "utf8");
    assert.equal(/studio-intelligence/.test(text), false, file);
  }
});

console.log("evidence-intent");

test("top_5 + verified claims but no intent → countdown_tease", () => {
  const request = normalizeHookRequest(
    baseInput({
      scriptMode: "top_5",
      templateId: undefined,
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
    }),
  );
  const resolution = resolveHookStrategy(request);
  assert.equal(resolution.strategy.id, "countdown_tease");
  assert.equal(resolution.strategySource, "strategy_library");
});

test("match_preview + verified claims but no intent → stakes_first", () => {
  const request = normalizeHookRequest(
    baseInput({
      scriptMode: "match_preview",
      templateId: undefined,
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
    }),
  );
  const resolution = resolveHookStrategy(request);
  assert.equal(resolution.strategy.id, "stakes_first");
  assert.equal(resolution.strategySource, "strategy_library");
});

test("valid evidence intent + eligible referenced claim → evidence_surprise", () => {
  const request = normalizeHookRequest(
    baseInput({
      scriptMode: "story",
      templateId: undefined,
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["c1"],
      },
    }),
  );
  const resolution = resolveHookStrategy(request);
  assert.equal(resolution.strategy.id, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
  assert.equal(resolution.strategySource, "prompt_intelligence");
});

test("evidence intent with missing or ineligible claim → mode default", () => {
  const missing = normalizeHookRequest(
    baseInput({
      scriptMode: "top_5",
      templateId: undefined,
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["missing-id"],
      },
    }),
  );
  const missingResolution = resolveHookStrategy(missing);
  assert.equal(missingResolution.strategy.id, "countdown_tease");
  assert.ok(missingResolution.rejectedPreferenceReason);

  const ineligible = normalizeHookRequest(
    baseInput({
      scriptMode: "match_preview",
      templateId: undefined,
      groundingInput: {
        unavailableResearch: false,
        claims: [
          verifiedClaim({
            claimId: "u1",
            provenance: "user_provided_unverified",
            verificationStatus: "unverified",
            permittedForFactualHookUse: false,
          }),
        ],
      },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["u1"],
      },
    }),
  );
  const ineligibleResolution = resolveHookStrategy(ineligible);
  assert.equal(ineligibleResolution.strategy.id, "stakes_first");
  assert.ok(ineligibleResolution.rejectedPreferenceReason);
});

test("changing intent or claim refs changes request fingerprint", () => {
  const base = normalizeHookRequest(
    baseInput({
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
    }),
  );
  const withIntent = normalizeHookRequest(
    baseInput({
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["c1"],
      },
    }),
  );
  const otherRef = normalizeHookRequest(
    baseInput({
      groundingInput: {
        unavailableResearch: false,
        claims: [verifiedClaim(), verifiedClaim({ claimId: "c2", text: "Other fact" })],
      },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["c2"],
      },
    }),
  );
  assert.notEqual(base.requestFingerprint, withIntent.requestFingerprint);
  assert.notEqual(withIntent.requestFingerprint, otherRef.requestFingerprint);
});

test("template precedence still beats evidence intent", () => {
  const request = normalizeHookRequest(
    baseInput({
      scriptMode: "story",
      templateId: "documentary",
      groundingInput: { unavailableResearch: false, claims: [verifiedClaim()] },
      openingIntent: {
        kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
        claimRefs: ["c1"],
      },
    }),
  );
  const resolution = resolveHookStrategy(request);
  assert.equal(resolution.strategy.id, "cold_open");
  assert.equal(resolution.strategySource, "template_advisory");
});

console.log("resolution-baseline");

test("user-authored precedence", () => {
  const request = normalizeHookRequest(
    baseInput({
      userAuthoredHook: "What if the title was decided in March?",
      templateId: "documentary",
    }),
  );
  assert.equal(resolveHookStrategy(request).strategy.id, HOOK_USER_DIRECTED_STRATEGY_ID);
});

test("all nine creator-template mappings and eight mode defaults", () => {
  const cases: Array<[CreatorTemplateId, string]> = [
    ["educational_bullet_points", "curiosity_gap"],
    ["football_match_preview", "stakes_first"],
    ["player_analysis", "provocative_question"],
    ["top_10_countdown", "countdown_tease"],
    ["history_explained", "curiosity_gap"],
    ["transfer_news", "headline_first"],
    ["tactical_breakdown", "provocative_question"],
    ["documentary", "cold_open"],
    ["myth_vs_reality", "myth_challenge"],
  ];
  for (const [templateId, strategyId] of cases) {
    assert.equal(HOOK_TEMPLATE_STRATEGY_PREFERENCES[templateId], strategyId);
    const strategy = getHookStrategy(strategyId) as HookStrategyDefinition;
    const scriptMode = strategy.preferredScriptModes[0] ?? ("story" as ScriptMode);
    const resolution = resolveHookStrategy(
      normalizeHookRequest(baseInput({ templateId, scriptMode })),
    );
    assert.equal(resolution.strategy.id, strategyId, templateId);
  }
  for (const mode of SCRIPT_MODES) {
    const resolution = resolveHookStrategy(
      normalizeHookRequest(baseInput({ scriptMode: mode, templateId: undefined })),
    );
    assert.equal(resolution.strategy.id, HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES[mode], mode);
  }
});

console.log("normalization");

test("only hook-contract/1 accepted", () => {
  assert.throws(
    () => normalizeHookRequest(baseInput({ contractVersion: "hook-contract/2" as never })),
    HookNormalizationError,
  );
});

test("duplicate / empty / forbidden claim inputs rejected or normalized safely", () => {
  assert.throws(
    () =>
      normalizeHookRequest(
        baseInput({
          groundingInput: {
            claims: [verifiedClaim(), verifiedClaim({ text: "dup" })],
          },
        }),
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      normalizeHookRequest(
        baseInput({
          groundingInput: {
            claims: [verifiedClaim({ claimId: "  ", text: "x" })],
          },
        }),
      ),
    HookNormalizationError,
  );
  assert.throws(
    () =>
      normalizeHookRequest(
        baseInput({
          groundingInput: {
            claims: [
              verifiedClaim({
                provenance: "forbidden",
                verificationStatus: "forbidden",
                permittedForFactualHookUse: true,
              }),
            ],
          },
        }),
      ),
    /Forbidden/,
  );
  assert.throws(
    () =>
      normalizeHookRequest(
        baseInput({
          groundingInput: {
            unavailableResearch: true,
            claims: [verifiedClaim()],
          },
        }),
      ),
    /unavailableResearch cannot coexist/,
  );

  const coerced = normalizeHookRequest(
    baseInput({
      groundingInput: {
        claims: [
          {
            claimId: "u1",
            text: "Fan rumor",
            provenance: "user_provided_unverified",
            verificationStatus: "verified",
            permittedForFactualHookUse: true,
          },
        ],
      },
    }),
  );
  assert.equal(coerced.grounding.claims[0]!.verificationStatus, "unverified");
  assert.equal(coerced.grounding.claims[0]!.permittedForFactualHookUse, false);
  assert.equal(hasEligibleVerifiedFactualClaim(coerced.grounding), false);
});

test("duration clamped to supported range with rounding", () => {
  assert.equal(
    normalizeHookRequest(baseInput({ durationSeconds: 12.2 })).durationSeconds,
    HOOK_MIN_DURATION_SECONDS,
  );
  assert.equal(
    normalizeHookRequest(baseInput({ durationSeconds: 99 })).durationSeconds,
    HOOK_MAX_DURATION_SECONDS,
  );
  assert.equal(
    normalizeHookRequest(baseInput({ durationSeconds: 44.6 })).durationSeconds,
    45,
  );
});

console.log("tamper-resistance");

test("tampered request fingerprint rejected", () => {
  const request = normalizeHookRequest(baseInput());
  const forged = tamperRequestFingerprint(request);
  assert.throws(() => buildHookPlanFromRequest(forged), /requestFingerprint/);
});

test("mismatched caller resolution rejected", () => {
  const request = normalizeHookRequest(baseInput());
  const real = resolveHookStrategy(request);
  const other = getHookStrategy("contrarian_claim");
  assert.ok(other);
  assert.throws(
    () =>
      buildHookPlan(request, {
        ...real,
        strategy: other,
        strategySource: "strategy_library",
      }),
    /does not match deterministic/,
  );
});

test("forged plan fingerprint and stale snapshot rejected", () => {
  const { plan } = buildHookPlanFromRequest(normalizeHookRequest(baseInput()));
  const forgedPlan = Object.freeze({
    ...plan,
    planFingerprint: `${HOOK_PLAN_FINGERPRINT_PREFIX}forged`,
  });
  assert.throws(() => buildHookPlanSnapshot(forgedPlan), /planFingerprint/);

  const staleConstraints = Object.freeze({
    ...plan.constraints,
    maxOpeningWords: plan.constraints.maxOpeningWords + 1,
  });
  const stalePlan = Object.freeze({
    ...plan,
    constraints: staleConstraints,
    // fingerprint not updated → stale
  });
  assert.throws(() => buildHookPlanSnapshot(stalePlan), /planFingerprint/);
});

test("normal deterministic construction succeeds", () => {
  const a = buildHookPlanFromRequest(normalizeHookRequest(baseInput()));
  const b = buildHookPlanFromRequest(normalizeHookRequest(baseInput()));
  assert.equal(a.plan.requestFingerprint, b.plan.requestFingerprint);
  assert.equal(a.plan.planFingerprint, b.plan.planFingerprint);
  assert.ok(a.plan.requestFingerprint.startsWith(HOOK_REQUEST_FINGERPRINT_PREFIX));
  assert.ok(a.plan.planFingerprint.startsWith(HOOK_PLAN_FINGERPRINT_PREFIX));
  assert.equal(
    a.plan.planFingerprint,
    buildHookPlanFingerprint({
      requestFingerprint: a.plan.requestFingerprint,
      strategyId: a.plan.strategyId,
      strategyVersion: a.plan.strategyVersion,
      constraints: a.plan.constraints,
    }),
  );
});

console.log("fingerprints");

test("claim order stable; strategy change does not alter request fingerprint", () => {
  const c1 = verifiedClaim({ claimId: "a", text: "Alpha" });
  const c2 = verifiedClaim({ claimId: "b", text: "Beta" });
  const first = normalizeHookRequest(
    baseInput({ groundingInput: { claims: [c1, c2], unavailableResearch: false } }),
  );
  const second = normalizeHookRequest(
    baseInput({ groundingInput: { claims: [c2, c1], unavailableResearch: false } }),
  );
  assert.equal(first.requestFingerprint, second.requestFingerprint);

  const { plan } = buildHookPlanFromRequest(first);
  const other = getHookStrategy("contrarian_claim");
  assert.ok(other);
  assert.notEqual(
    buildHookPlanFingerprint({
      requestFingerprint: first.requestFingerprint,
      strategyId: other.id,
      strategyVersion: other.version,
      constraints: other.constraints,
    }),
    plan.planFingerprint,
  );
  assert.equal(
    buildHookRequestFingerprint({
      contractVersion: first.contractVersion,
      topic: first.topic,
      scriptMode: first.scriptMode,
      tone: first.tone,
      durationSeconds: first.durationSeconds,
      templateId: first.templateId,
      openingStyleAdvisory: first.openingStyleAdvisory,
      userAuthoredHook: first.userAuthoredHook,
      openingIntent: first.openingIntent,
      grounding: first.grounding,
      generationPath: first.generationPath,
    }),
    first.requestFingerprint,
  );
});

console.log(`\nContract ${HOOK_CONTRACT_VERSION}; compatibility ${HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID}.`);
console.log("All hook-strategy-library checks passed.\n");
