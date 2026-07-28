/**
 * Post-freeze hotfix — deterministic terminal compatibility/safe fallback.
 * Run: npm run test:hook-deterministic-terminal-fallback
 */
import assert from "node:assert/strict";

import {
  assertTerminalPlanCoherence,
  buildCompatibilityFallbackPlan,
  buildCreatorFacingHookFailureMessage,
  buildDeterministicCompatibilityOpening,
  buildHookCandidate,
  buildHookPlanFromRequest,
  countHookWords,
  extractOpeningSpan,
  hasUsableHookNarrationBody,
  HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
  normalizeHookRequest,
  replaceNarrationOpeningExact,
  runBoundedHookRepair,
  validateHookCandidate,
  type HookRequestInput,
} from "@/features/hook-engine";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`  ✓ ${name}`);
  });
}

const REPRO_TOPIC = "Spain schooled France with a 2-0 victory";
const DETERMINISTIC_SPAIN_OPENING = "Nobody saw Spain coming.";

const STORY_BODY =
  "The night exposed a gap between reputation and control. France chased shadows while Spain dictated every phase. By the final whistle the lesson was unmistakable and complete for anyone watching.";

function bodyWords(): number {
  return countHookWords(STORY_BODY);
}

function reproRequest(
  overrides: Partial<HookRequestInput> = {},
): ReturnType<typeof normalizeHookRequest> {
  return normalizeHookRequest({
    topic: REPRO_TOPIC,
    scriptMode: "story",
    tone: "dramatic",
    durationSeconds: 30,
    generationPath: "script_only",
    requestedStrategyId: "contrarian_claim",
    ...overrides,
  });
}

function planFor(overrides: Partial<HookRequestInput> = {}) {
  const request = reproRequest(overrides);
  const { plan } = buildHookPlanFromRequest(request);
  return { request, plan };
}

/** Over-limit contrarian-style opening (quality failure) + usable body. */
function longOpeningWithBody(opening: string): string {
  return `${opening} ${STORY_BODY}`;
}

async function main() {
console.log("\nhook-deterministic-terminal-fallback (post-freeze hotfix)\n");

await test("1. Exact reproduced request shape resolves Contrarian initially", () => {
  const { request, plan } = planFor();
  assert.equal(request.topic, REPRO_TOPIC);
  assert.equal(request.scriptMode, "story");
  assert.equal(request.tone, "dramatic");
  assert.equal(request.durationSeconds, 30);
  assert.equal(request.generationPath, "script_only");
  assert.equal(request.requestedStrategyId, "contrarian_claim");
  assert.equal(plan.strategyId, "contrarian_claim");
  assert.equal(plan.strategySource, "user_selected");
  assert.ok(bodyWords() >= 12);
});

await test("2–4. Contrarian fails quality; repair fails; usable body skips model", async () => {
  const { request, plan } = planFor();
  let repairCalls = 0;
  let fallbackModelCalls = 0;
  const initial = longOpeningWithBody(
    "Spain did not merely beat France they publicly schooled them in every phase tonight somehow.",
  );
  const repaired = longOpeningWithBody(
    "Everyone missed how completely Spain exposed France across ninety bruising minutes somehow.",
  );

  const result = await runBoundedHookRepair({
    request,
    plan,
    narration: initial,
    repair: async () => {
      repairCalls += 1;
      return { narration: repaired, claimRefs: [] };
    },
    compatibilityFallback: async () => {
      fallbackModelCalls += 1;
      return {
        narration: longOpeningWithBody("What if Spain won somehow tonight?"),
        claimRefs: [],
      };
    },
  });

  assert.equal(repairCalls, 1);
  assert.equal(fallbackModelCalls, 0, "usable body must not call fallback model");
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.repairAttempts, 1);
  assert.equal(result.diagnostics.validationOutcome, "fallback");
  assert.equal(result.diagnostics.strategyId, HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID);
  assert.equal(result.diagnostics.strategySource, "compatibility_fallback");
  assert.equal(result.diagnostics.candidateOrigin, "compatibility_fallback");
  assert.equal(result.diagnostics.fallbackReason, "validated_compatibility_fallback");
});

await test("5–8. Opens with Spain deterministic opening; no 2-0; body preserved; validates", async () => {
  const { request, plan } = planFor();
  const bodyMarker = "The night exposed a gap between reputation and control";
  const repaired = longOpeningWithBody(
    "Everyone missed how completely Spain exposed France across ninety bruising minutes somehow.",
  );

  const result = await runBoundedHookRepair({
    request,
    plan,
    narration: longOpeningWithBody(
      "Spain did not merely beat France they publicly schooled them in every phase tonight somehow.",
    ),
    repair: async () => ({ narration: repaired, claimRefs: ["should-not-keep"] }),
    compatibilityFallback: async () => {
      throw new Error("model must not run");
    },
  });

  assert.equal(result.ok, true);
  const approved = result.approvedNarration!;
  const opening = extractOpeningSpan(approved)!;
  assert.equal(opening.openingText, DETERMINISTIC_SPAIN_OPENING);
  assert.equal(buildDeterministicCompatibilityOpening(REPRO_TOPIC), DETERMINISTIC_SPAIN_OPENING);
  assert.ok(!opening.openingText.includes("2-0"));
  assert.ok(!opening.openingText.includes("2"));
  assert.ok(approved.includes(bodyMarker));
  assert.ok(approved.endsWith(STORY_BODY) || approved.includes(STORY_BODY));

  const fallbackPlan = buildCompatibilityFallbackPlan(request);
  const candidate = buildHookCandidate({
    narration: approved,
    request,
    plan: fallbackPlan,
    origin: "compatibility_fallback",
    claimRefs: [],
  });
  const validation = validateHookCandidate({
    request,
    plan: fallbackPlan,
    candidate,
    repairBoundExceeded: true,
  });
  assert.equal(validation.ok, true);
  assert.equal(result.candidate?.claimRefs.length, 0);
});

await test("9–11. Terminal fingerprints cohere; repair=1; only one fallback", async () => {
  const { request, plan } = planFor();
  let fallbackCalls = 0;
  const result = await runBoundedHookRepair({
    request,
    plan,
    narration: longOpeningWithBody(
      "Spain did not merely beat France they publicly schooled them in every phase tonight somehow.",
    ),
    repair: async () => ({
      narration: longOpeningWithBody(
        "Everyone missed how completely Spain exposed France across ninety bruising minutes somehow.",
      ),
      claimRefs: [],
    }),
    compatibilityFallback: async () => {
      fallbackCalls += 1;
      return { narration: "x", claimRefs: [] };
    },
  });
  assert.equal(fallbackCalls, 0);
  assert.equal(result.diagnostics.repairAttempts, 1);
  assertTerminalPlanCoherence(result);
  assert.equal(
    result.diagnostics.planFingerprint,
    buildCompatibilityFallbackPlan(request).planFingerprint,
  );
  assert.equal(result.activePlan.planFingerprint, result.candidate?.planFingerprint);
  assert.equal(result.selection?.planFingerprint, result.activePlan.planFingerprint);
});

await test("12. Hard-gate failure uses same deterministic safe-opening boundary", async () => {
  const { request, plan } = planFor({
    groundingInput: {
      claims: [
        {
          claimId: "c1",
          text: "Spain won 2-0",
          provenance: "research_verified",
          verificationStatus: "verified",
          permittedForFactualHookUse: true,
          sourceRef: "api-football",
        },
      ],
      unavailableResearch: false,
    },
  });
  let safeCalls = 0;
  const result = await runBoundedHookRepair({
    request,
    plan,
    narration: longOpeningWithBody("Spain crushed France 2-0 somehow tonight."),
    claimRefs: [],
    repair: async () => ({
      narration: longOpeningWithBody("Spain finished France 2-0 again somehow."),
      claimRefs: [],
    }),
    safeFallback: async () => {
      safeCalls += 1;
      throw new Error("must not model when body usable");
    },
  });
  assert.equal(safeCalls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.fallbackReason, "validated_safe_fallback");
  assert.equal(
    extractOpeningSpan(result.approvedNarration!)!.openingText,
    DETERMINISTIC_SPAIN_OPENING,
  );
});

await test("13–14. Empty/unusable narration permits one fallback model call; no retry loop", async () => {
  const { request, plan } = planFor();
  let fallbackCalls = 0;
  const result = await runBoundedHookRepair({
    request,
    plan,
    narration: "Spain somehow somehow somehow somehow somehow somehow somehow.",
    repair: async () => ({
      narration: "France somehow somehow somehow somehow somehow somehow somehow.",
      claimRefs: [],
    }),
    compatibilityFallback: async () => {
      fallbackCalls += 1;
      return {
        narration: longOpeningWithBody("What if Spain somehow rewrote destiny tonight?"),
        claimRefs: [],
      };
    },
  });
  assert.equal(fallbackCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(
    extractOpeningSpan(result.approvedNarration!)!.openingText,
    DETERMINISTIC_SPAIN_OPENING,
  );

  let rejectedCalls = 0;
  const rejected = await runBoundedHookRepair({
    request,
    plan,
    narration: "Spain somehow somehow somehow somehow somehow somehow somehow.",
    compatibilityFallback: async () => {
      rejectedCalls += 1;
      throw new Error("model rejected");
    },
  });
  assert.equal(rejectedCalls, 1);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.fallbackReason?.includes("rejected"));
});

await test("15–16. Unusual topics stay safe; never fabricate subject/factual claims", () => {
  const opening = buildDeterministicCompatibilityOpening("!!! ??? …");
  assert.equal(opening, "Nobody saw Story coming.");
  assert.ok(countHookWords(opening) <= 4);
  assert.doesNotMatch(opening, /\d/);

  const unicode = buildDeterministicCompatibilityOpening("São Paulo derby night");
  assert.match(unicode, /^Nobody saw .+ coming\.$/);
  assert.ok(countHookWords(unicode) <= 4);

  const long = buildDeterministicCompatibilityOpening(
    "A".repeat(80) + " football club identity crisis",
  );
  assert.ok(countHookWords(long) <= 4);
  assert.doesNotMatch(long, /2-0|fee|ranked|quote/i);

  const original = longOpeningWithBody("Bad opening words words words words words.");
  const copy = original.slice();
  const replaced = replaceNarrationOpeningExact(original, DETERMINISTIC_SPAIN_OPENING);
  assert.ok(replaced);
  assert.equal(original, copy);
  assert.notEqual(replaced.narration, original);
  assert.ok(hasUsableHookNarrationBody(original));
  assert.equal(hasUsableHookNarrationBody(DETERMINISTIC_SPAIN_OPENING), false);
});

await test("17. Creator-facing failure messages contain no private data", () => {
  const quality = buildCreatorFacingHookFailureMessage({
    diagnostics: {
      fallbackReason: "compatibility_fallback_failed_validation",
      validationOutcome: "generation_failed",
      repairAttempts: 1,
      groundingStatus: "user_context_only",
    },
    requestedStyleStrategyId: "contrarian_claim",
  });
  assert.equal(
    quality,
    "Contrarian Take could not produce a valid opening after one repair and a safe fallback. Try again or switch Hook Style to Auto.",
  );
  assert.doesNotMatch(quality, /fingerprint|prompt|narration|2-0|claim|Bearer|sk-/i);

  const hard = buildCreatorFacingHookFailureMessage({
    diagnostics: {
      fallbackReason: "safe_fallback_failed_hard_gate",
      validationOutcome: "generation_failed",
      repairAttempts: 1,
      groundingStatus: "failed",
    },
    requestedStyleStrategyId: "contrarian_claim",
  });
  assert.match(hard, /safety or grounding/i);
  assert.doesNotMatch(hard, /fingerprint|promptBlock|Nobody saw/i);
});

await test("18. Auto / explicit / Write My Own frozen resolution unchanged", () => {
  const auto = buildHookPlanFromRequest(
    normalizeHookRequest({
      topic: REPRO_TOPIC,
      scriptMode: "story",
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
    }),
  );
  assert.notEqual(auto.plan.strategySource, "user_selected");

  const explicit = buildHookPlanFromRequest(reproRequest());
  assert.equal(explicit.plan.strategyId, "contrarian_claim");
  assert.equal(explicit.plan.strategySource, "user_selected");

  const authored = buildHookPlanFromRequest(
    normalizeHookRequest({
      topic: REPRO_TOPIC,
      scriptMode: "story",
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
      userAuthoredHook: "Spain never saw this coming",
    }),
  );
  assert.equal(authored.plan.strategyId, "user_directed");
  assert.equal(authored.plan.strategySource, "user_authored");
});

console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
