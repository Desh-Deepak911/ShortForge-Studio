/**
 * Sprint 10H.1 / 10H.1A — Negative Retention live-assertion fixtures (no live mode).
 * Proves Pass is rejected for incoherent/forged success envelopes.
 * Run: npm run test:retention-story-live-assertion-qa
 */
import assert from "node:assert/strict";

import type { HookDiagnostics, HookPlanSnapshot } from "@/features/hook-engine";
import type {
  RetentionProductionSafeDiagnostics,
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
} from "@/features/retention-story";

import { assertRetentionLiveSuccessEnvelope } from "./assertRetentionLiveSuccessEnvelope";
import {
  assertFlexibleCreativePremiseLiveSemantics,
  assertFlexibleExplicitHookLiveSemantics,
  assertRetentionLiveGenerationDisposition,
} from "./assertRetentionLiveGenerationDisposition";
import {
  assertSafeRetentionLiveFailureSummaryScrubbed,
  formatSafeRetentionLiveFailureSummary,
  scrubRetentionOperatorNotes,
} from "./formatSafeRetentionLiveFailureSummary";

let passed = 0;

function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function expectReject(
  label: string,
  json: Record<string, unknown>,
  expectOverrides: Partial<{
    expectedQualityMode: "cheap" | "balanced" | "best";
    expectedFormatStrategyId: string;
    requestedDurationSec: number;
    narrationStartsWith: string;
  }> = {},
): void {
  check(label, () => {
    assert.throws(
      () =>
        assertRetentionLiveSuccessEnvelope(json, {
          expectedGenerationPath: "script_only",
          expectedFormatStrategyId: "short_retention",
          expectedQualityMode: "cheap",
          requestedDurationSec: 30,
          ...expectOverrides,
        }),
      (err: unknown) =>
        err instanceof assert.AssertionError || err instanceof Error,
    );
  });
}

const HOOK_PLAN: HookPlanSnapshot = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  requestFingerprint: "hr:live-assert-1",
  planFingerprint: "hp:live-assert-1",
  resolvedConstraints: {
    maxOpeningWords: 5,
    maxOpeningSpokenSecondsHint: 3,
    mustPreserveSubject: true,
    allowQuestionForm: true,
    allowStatisticClaim: false,
    forbidUnverifiedSuperlatives: true,
    minProvocativeness: 0.5,
    minClarity: 0.5,
  },
};

const HOOK_DIAG: HookDiagnostics = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  generationPath: "script_only",
  requestFingerprint: "hr:live-assert-1",
  planFingerprint: "hp:live-assert-1",
  groundingStatus: "user_context_only",
  validationOutcome: "pass",
  repairAttempts: 0,
  lengthEnforcement: "none",
  templateInfluenced: false,
  promptIntelligenceInfluenced: false,
  adapterRan: true,
};

const PLAN: RetentionStoryPlanSnapshot = {
  version: 1,
  formatStrategyId: "short_retention",
  controllingIdea: "Pressure decides the preview",
  primaryEmotion: "tension",
  secondaryEmotion: "hope",
  beatCount: 5,
  pacingProfile: "front_loaded",
  endingStrategy: "payoff_reveal",
  informationDensity: "dense",
  visualDensity: "high",
  claimIdCount: 0,
  contractFingerprint: "rsc:liveassert1",
  planFingerprint: "rsp:liveassert1",
  strategyRegistryVersion: "retention-format-strategy/1",
};

const VALIDATION: RetentionValidationSummary = {
  version: 1,
  ok: true,
  retentionReadiness: 0.9,
  storyQualityConfidence: 0.85,
  frameworkCompliance: 0.95,
  failedHardGateIds: [],
  warningNotes: [],
  validationFingerprint: "rv:liveassert1",
  candidateFingerprint: "rnc:liveassert1",
  contractFingerprint: "rsc:liveassert1",
  planFingerprint: "rsp:liveassert1",
  terminalState: "pass_without_rewrite",
  rewriteUsed: false,
};

const BUDGET_FAST: NonNullable<RetentionProductionSafeDiagnostics["budget"]> = {
  total: 1,
  totalCeiling: 5,
  planner: 0,
  initialNarration: 1,
  lengthCompression: 0,
  hookRepair: 0,
  hookFallback: 0,
  retentionBodyRewrite: 0,
};

const BUDGET_BALANCED: NonNullable<RetentionProductionSafeDiagnostics["budget"]> =
  {
    total: 2,
    totalCeiling: 6,
    planner: 1,
    initialNarration: 1,
    lengthCompression: 0,
    hookRepair: 0,
    hookFallback: 0,
    retentionBodyRewrite: 0,
  };

const BUDGET_STUDIO: NonNullable<RetentionProductionSafeDiagnostics["budget"]> =
  {
    total: 2,
    totalCeiling: 7,
    planner: 1,
    initialNarration: 1,
    lengthCompression: 0,
    hookRepair: 0,
    hookFallback: 0,
    retentionBodyRewrite: 0,
  };

const DIAG: RetentionProductionSafeDiagnostics = {
  version: 1,
  terminalState: "pass_without_rewrite",
  qualityMode: "cheap",
  contractFingerprint: "rsc:liveassert1",
  planFingerprint: "rsp:liveassert1",
  candidateFingerprint: "rnc:liveassert1",
  validationFingerprint: "rv:liveassert1",
  rewriteUsed: false,
  safeReasonIds: Object.freeze(["pass_without_rewrite"]),
  budget: BUDGET_FAST,
};

const NARRATION =
  "Why does Spain pressure matter? Spain tactical focus reshapes this France preview tonight with rising stakes and a decisive payoff.";

const WMO_OPENING = "Spain never saw this coming";

const DISPOSITION_OPTIMAL = Object.freeze({
  disposition: "optimal" as const,
  adaptations: Object.freeze([] as const),
  factHandlingMode: "verified_facts_only" as const,
  qualityBelowTarget: false,
  approximateWordCount: 20,
  targetWordBudget: 72,
  resolvedBeatCount: 5,
  creatorFacingNotes: Object.freeze([
    "Generated with the preferred settings for this brief.",
  ]),
});

function coherentSuccess(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    success: true,
    data: {
      id: "s1",
      title: "Spain pressure",
      narration: NARRATION,
      totalDuration: 30,
      scenes: [],
    },
    hookPlan: { ...HOOK_PLAN },
    hookDiagnostics: { ...HOOK_DIAG },
    retentionPlan: { ...PLAN },
    retentionValidation: { ...VALIDATION },
    retentionDiagnostics: {
      ...DIAG,
      budget: { ...BUDGET_FAST },
      safeReasonIds: [...DIAG.safeReasonIds],
    },
    generationDisposition: {
      ...DISPOSITION_OPTIMAL,
      adaptations: [...DISPOSITION_OPTIMAL.adaptations],
      creatorFacingNotes: [...DISPOSITION_OPTIMAL.creatorFacingNotes],
    },
    ...patch,
  };
}

function withBudget(
  budget: RetentionProductionSafeDiagnostics["budget"],
  extras: Partial<RetentionProductionSafeDiagnostics> = {},
): Record<string, unknown> {
  return coherentSuccess({
    retentionDiagnostics: {
      ...DIAG,
      ...extras,
      budget: { ...budget! },
      safeReasonIds: [...(extras.safeReasonIds ?? DIAG.safeReasonIds)],
    },
  });
}

function main(): void {
  console.log("\nretention-story-live-assertion-qa (Sprint 10H.1A)\n");

  check("positive Fast envelope Passes", () => {
    const result = assertRetentionLiveSuccessEnvelope(coherentSuccess(), {
      expectedGenerationPath: "script_only",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "cheap",
      requestedDurationSec: 30,
    });
    assert.ok(result.narration.length > 0);
  });

  check("positive Balanced envelope Passes", () => {
    assertRetentionLiveSuccessEnvelope(
      withBudget(BUDGET_BALANCED, { qualityMode: "balanced" }),
      {
        expectedGenerationPath: "script_only",
        expectedFormatStrategyId: "short_retention",
        expectedQualityMode: "balanced",
        requestedDurationSec: 30,
      },
    );
  });

  check("positive Studio envelope Passes", () => {
    assertRetentionLiveSuccessEnvelope(
      withBudget(BUDGET_STUDIO, { qualityMode: "best" }),
      {
        expectedGenerationPath: "script_only",
        expectedFormatStrategyId: "short_retention",
        expectedQualityMode: "best",
        requestedDurationSec: 30,
      },
    );
  });

  check("Write My Own punctuation-normalized opening Passes", () => {
    const json = coherentSuccess({
      data: {
        id: "s1",
        title: "Spain pressure",
        narration: `${WMO_OPENING}. Spain tactical focus reshapes this France preview tonight.`,
        totalDuration: 30,
        scenes: [],
      },
    });
    assertRetentionLiveSuccessEnvelope(json, {
      expectedGenerationPath: "script_only",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "cheap",
      requestedDurationSec: 30,
      narrationStartsWith: WMO_OPENING,
    });
  });

  check("Write My Own expected-with-period vs span-with-bang Passes", () => {
    const json = coherentSuccess({
      data: {
        id: "s1",
        title: "Spain pressure",
        narration: `${WMO_OPENING}! Spain tactical focus reshapes this France preview tonight.`,
        totalDuration: 30,
        scenes: [],
      },
    });
    assertRetentionLiveSuccessEnvelope(json, {
      expectedGenerationPath: "script_only",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "cheap",
      requestedDurationSec: 30,
      narrationStartsWith: `${WMO_OPENING}.`,
    });
  });

  expectReject(
    "missing retentionDiagnostics rejected",
    (() => {
      const json = coherentSuccess();
      delete json.retentionDiagnostics;
      return json;
    })(),
  );

  expectReject(
    "wrong qualityMode rejected",
    withBudget(BUDGET_FAST, { qualityMode: "balanced" }),
  );

  expectReject(
    "mismatched terminalState rejected",
    withBudget(BUDGET_FAST, { terminalState: "pass_after_rewrite" }),
  );

  expectReject(
    "mismatched rewriteUsed rejected",
    withBudget(BUDGET_FAST, { rewriteUsed: true }),
  );

  expectReject(
    "mismatched contract fingerprint rejected",
    withBudget(BUDGET_FAST, { contractFingerprint: "rsc:other" }),
  );

  expectReject(
    "mismatched plan fingerprint rejected",
    coherentSuccess({
      retentionValidation: { ...VALIDATION, planFingerprint: "rsp:other" },
      retentionDiagnostics: {
        ...DIAG,
        planFingerprint: "rsp:other",
        budget: { ...BUDGET_FAST },
        safeReasonIds: [...DIAG.safeReasonIds],
      },
    }),
  );

  expectReject(
    "mismatched candidate fingerprint rejected",
    withBudget(BUDGET_FAST, { candidateFingerprint: "rnc:other" }),
  );

  expectReject(
    "mismatched validation fingerprint rejected",
    withBudget(BUDGET_FAST, { validationFingerprint: "rv:other" }),
  );

  expectReject(
    "wrong budget ceiling rejected",
    withBudget({ ...BUDGET_FAST, totalCeiling: 99 }),
  );

  expectReject(
    "total larger than category sum rejected",
    withBudget({ ...BUDGET_FAST, total: 3 }),
  );

  expectReject(
    "total smaller than category sum rejected",
    withBudget({
      ...BUDGET_FAST,
      lengthCompression: 1,
      total: 1,
    }),
  );

  expectReject(
    "excessive total above policy ceiling rejected",
    withBudget({
      total: 5,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 1,
      lengthCompression: 1,
      hookRepair: 1,
      hookFallback: 1,
      retentionBodyRewrite: 1,
    }),
  );

  expectReject(
    "initialNarration 0 rejected",
    withBudget({
      total: 0,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 0,
      lengthCompression: 0,
      hookRepair: 0,
      hookFallback: 0,
      retentionBodyRewrite: 0,
    }),
  );

  expectReject(
    "initialNarration >2 rejected",
    withBudget({
      total: 3,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 3,
      lengthCompression: 0,
      hookRepair: 0,
      hookFallback: 0,
      retentionBodyRewrite: 0,
    }),
  );

  expectReject(
    "lengthCompression exceeds policy max rejected",
    withBudget({
      total: 3,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 1,
      lengthCompression: 2,
      hookRepair: 0,
      hookFallback: 0,
      retentionBodyRewrite: 0,
    }),
  );

  expectReject(
    "hookRepair exceeds policy max rejected",
    withBudget({
      total: 3,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 1,
      lengthCompression: 0,
      hookRepair: 2,
      hookFallback: 0,
      retentionBodyRewrite: 0,
    }),
  );

  expectReject(
    "hookFallback exceeds policy max rejected",
    withBudget({
      total: 3,
      totalCeiling: 5,
      planner: 0,
      initialNarration: 1,
      lengthCompression: 0,
      hookRepair: 0,
      hookFallback: 2,
      retentionBodyRewrite: 0,
    }),
  );

  expectReject(
    "Fast planner exceeds policy max rejected",
    withBudget({ ...BUDGET_FAST, planner: 1, total: 2 }),
  );

  expectReject(
    "Studio retentionBodyRewrite exceeds max without pass_after_rewrite",
    withBudget(
      {
        total: 3,
        totalCeiling: 7,
        planner: 1,
        initialNarration: 1,
        lengthCompression: 0,
        hookRepair: 0,
        hookFallback: 0,
        retentionBodyRewrite: 1,
      },
      { qualityMode: "best" },
    ),
    { expectedQualityMode: "best" },
  );

  expectReject(
    "Balanced planner count >1 rejected",
    withBudget(
      {
        total: 3,
        totalCeiling: 6,
        planner: 2,
        initialNarration: 1,
        lengthCompression: 0,
        hookRepair: 0,
        hookFallback: 0,
        retentionBodyRewrite: 0,
      },
      { qualityMode: "balanced" },
    ),
    { expectedQualityMode: "balanced" },
  );

  expectReject(
    "pass_after_rewrite without rewrite call rejected",
    coherentSuccess({
      retentionValidation: {
        ...VALIDATION,
        terminalState: "pass_after_rewrite",
        rewriteUsed: true,
      },
      retentionDiagnostics: {
        ...DIAG,
        qualityMode: "best",
        terminalState: "pass_after_rewrite",
        rewriteUsed: true,
        safeReasonIds: ["pass_after_rewrite"],
        budget: {
          total: 2,
          totalCeiling: 7,
          planner: 1,
          initialNarration: 1,
          lengthCompression: 0,
          hookRepair: 0,
          hookFallback: 0,
          retentionBodyRewrite: 0,
        },
      },
    }),
    { expectedQualityMode: "best" },
  );

  expectReject(
    "missing safeReasonIds rejected",
    (() => {
      const json = coherentSuccess();
      const diag = {
        ...(json.retentionDiagnostics as Record<string, unknown>),
      };
      delete diag.safeReasonIds;
      return { ...json, retentionDiagnostics: diag };
    })(),
  );

  expectReject(
    "non-array safeReasonIds rejected",
    withBudget(BUDGET_FAST, { safeReasonIds: "pass_without_rewrite" as never }),
  );

  expectReject(
    "unsafe safeReasonIds rejected",
    withBudget(BUDGET_FAST, {
      safeReasonIds: ["has spaces", "http://evil.example/x"],
    }),
  );

  expectReject(
    "oversized safeReasonIds rejected",
    withBudget(BUDGET_FAST, {
      safeReasonIds: Array.from({ length: 13 }, (_, i) => `reason_${i}`),
    }),
  );

  expectReject(
    "missing budget field rejected",
    (() => {
      const budget = { ...BUDGET_FAST } as Record<string, unknown>;
      delete budget.hookRepair;
      return withBudget(budget as never);
    })(),
  );

  expectReject(
    "missing budget object rejected",
    (() => {
      const json = coherentSuccess();
      const diag = {
        ...(json.retentionDiagnostics as Record<string, unknown>),
      };
      delete diag.budget;
      return { ...json, retentionDiagnostics: diag };
    })(),
  );

  expectReject(
    "Write My Own opening with appended words rejected",
    coherentSuccess({
      data: {
        id: "s1",
        title: "Spain pressure",
        narration: `${WMO_OPENING} tonight. Spain tactical focus reshapes this France preview.`,
        totalDuration: 30,
        scenes: [],
      },
    }),
    { narrationStartsWith: WMO_OPENING },
  );

  expectReject(
    "Write My Own opening moved later rejected",
    coherentSuccess({
      data: {
        id: "s1",
        title: "Spain pressure",
        narration: `Pressure rises first. ${WMO_OPENING}. Spain tactical focus reshapes this France preview.`,
        totalDuration: 30,
        scenes: [],
      },
    }),
    { narrationStartsWith: WMO_OPENING },
  );

  expectReject(
    "Write My Own opening duplicated rejected",
    coherentSuccess({
      data: {
        id: "s1",
        title: "Spain pressure",
        narration: `${WMO_OPENING}. Body continues. ${WMO_OPENING}.`,
        totalDuration: 30,
        scenes: [],
      },
    }),
    { narrationStartsWith: WMO_OPENING },
  );

  expectReject(
    "unexpected failureCategory rejected",
    coherentSuccess({
      retentionDiagnostics: {
        ...DIAG,
        failureCategory: "quality_failure",
        budget: { ...BUDGET_FAST },
        safeReasonIds: [...DIAG.safeReasonIds],
      },
    }),
  );

  expectReject(
    "malformed / unknown diagnostic field rejected",
    coherentSuccess({
      retentionDiagnostics: {
        ...DIAG,
        promptBlock: "SECRET",
        budget: { ...BUDGET_FAST },
        safeReasonIds: [...DIAG.safeReasonIds],
      },
    }),
  );

  expectReject(
    "narration over requested duration budget rejected",
    coherentSuccess({
      data: {
        id: "s1",
        title: "Long",
        narration: Array.from({ length: 200 }, () => "word").join(" "),
        totalDuration: 30,
        scenes: [],
      },
    }),
  );

  expectReject(
    "wrong strategy rejected",
    coherentSuccess({
      retentionPlan: { ...PLAN, formatStrategyId: "short_standard" },
    }),
  );

  expectReject(
    "wrong path (Hook generationPath) rejected",
    coherentSuccess({
      hookDiagnostics: {
        ...HOOK_DIAG,
        generationPath: "audio_first_full",
      },
    }),
  );

  expectReject(
    "incomplete Hook envelope rejected",
    (() => {
      const json = coherentSuccess();
      delete json.hookDiagnostics;
      return json;
    })(),
  );

  check("word budget uses requested duration, not returned totalDuration", () => {
    const words = Array.from({ length: 50 }, () => "word").join(" ");
    assert.throws(() =>
      assertRetentionLiveSuccessEnvelope(
        coherentSuccess({
          data: {
            id: "s1",
            title: "t",
            narration: `Why now? ${words}`,
            totalDuration: 60,
            scenes: [],
          },
        }),
        {
          expectedGenerationPath: "script_only",
          expectedFormatStrategyId: "short_retention",
          expectedQualityMode: "cheap",
          requestedDurationSec: 15,
        },
      ),
    );
  });

  check("safe failure formatter scrubs secrets and omits narration", () => {
    const summary = formatSafeRetentionLiveFailureSummary({
      caseId: "live-30-auto-fast",
      httpStatus: 500,
      category: "model_or_api_failure",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "cheap",
      expectedGenerationPath: "script_only",
      terminalState: "hard_gate_failed",
      contractFingerprint: "rsc:abcdefghijklmnop",
      attemptCount: 2,
      retryOccurred: true,
      retryCategory: "temporary_5xx",
    });
    assert.match(summary, /case=live-30-auto-fast/);
    assert.match(summary, /category=model_or_api_failure/);
    assert.match(summary, /retry=yes\(temporary_5xx\)/);
    assert.doesNotMatch(summary, /Why does Spain/);
    assert.doesNotMatch(summary, /sk-/);
    assertSafeRetentionLiveFailureSummaryScrubbed(summary);

    const scrubbed = scrubRetentionOperatorNotes(
      "note https://x.test/?token=secret sk-abcdefghijklmnopqrst Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb " +
        "a".repeat(64),
    );
    assert.doesNotMatch(scrubbed, /sk-abc/);
    assert.doesNotMatch(scrubbed, /token=secret/);
    assert.doesNotMatch(scrubbed, /Bearer eyJ/);
  });

  check("safe failure formatter retains bounded production diagnostics", () => {
    const summary = formatSafeRetentionLiveFailureSummary({
      caseId: "live-30-auto-fast",
      httpStatus: 500,
      category: "success_false",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "cheap",
      expectedGenerationPath: "script_only",
      retryOccurred: false,
      retentionDiagnostics: {
        version: 1,
        terminalState: "rewrite_not_allowed",
        qualityMode: "cheap",
        failureCategory: "quality_failure",
        contractFingerprint: "rsc:abcdefghijklmnopqr",
        planFingerprint: "rsp:planfingerprint01",
        candidateFingerprint: "rc:candidatefp0001",
        validationFingerprint: "rv:validationfp0001",
        rewriteUsed: false,
        safeReasonIds: ["quality_mode_not_studio"],
        budget: {
          total: 1,
          totalCeiling: 5,
          planner: 0,
          initialNarration: 1,
          lengthCompression: 0,
          hookRepair: 0,
          hookFallback: 0,
          retentionBodyRewrite: 0,
        },
        validationFailureSummary: {
          failureClass: "quality_threshold",
          readinessScore: 0.51,
          activeThreshold: 0.62,
          failedHardGateIds: [],
          editorialScores: { curiosity: 0.25, clarity: 0.8 },
          qualityDiagnosticIds: ["curiosity"],
        },
      },
    });
    assert.match(summary, /productionFailureCategory=quality_failure/);
    assert.match(summary, /safeReasonIds=quality_mode_not_studio/);
    assert.match(summary, /failureStage=retention_validation/);
    assert.match(summary, /qualityMode=cheap/);
    assert.match(summary, /failureClass=quality_threshold/);
    assert.match(summary, /readiness=0\.51/);
    assert.match(summary, /threshold=0\.62/);
    assert.match(summary, /qualityDiagIds=curiosity/);
    assert.match(summary, /budget=total:1\/5/);
    assert.match(summary, /contractFp=rsc:abcdefghijkl/);
    assert.match(summary, /planFp=rsp:planfingerpr/);
    assertSafeRetentionLiveFailureSummaryScrubbed(summary);
  });

  check("10H.4A authority mismatch diagnostics stay private-data-free", () => {
    const summary = formatSafeRetentionLiveFailureSummary({
      caseId: "diag-35-studio-retention-match-review",
      httpStatus: 200,
      category: "grounding_or_validation_failure",
      expectedFormatStrategyId: "short_retention",
      expectedQualityMode: "best",
      expectedGenerationPath: "script_only",
      retryOccurred: false,
      retentionDiagnostics: {
        version: 1,
        terminalState: "rewrite_not_allowed",
        qualityMode: "best",
        failureCategory: "validation_authority_mismatch",
        contractFingerprint: "rsc:authorityfp00001",
        planFingerprint: "rsp:authorityplan001",
        candidateFingerprint: "rc:authoritycand001",
        validationFingerprint: null,
        rewriteUsed: false,
        safeReasonIds: ["creator_context_identity_mismatch"],
        budget: {
          total: 2,
          totalCeiling: 7,
          planner: 1,
          initialNarration: 1,
          lengthCompression: 0,
          hookRepair: 0,
          hookFallback: 0,
          retentionBodyRewrite: 0,
        },
      },
    });
    assert.match(summary, /productionFailureCategory=validation_authority_mismatch/);
    assert.match(summary, /safeReasonIds=creator_context_identity_mismatch/);
    assert.match(summary, /failureStage=retention_validation/);
    assert.doesNotMatch(summary, /Focus on the emotional swing/i);
    assert.doesNotMatch(summary, /manualContext|creatorContextAuthority|research prose/i);
    assertSafeRetentionLiveFailureSummaryScrubbed(summary);
  });

  check("safe failure formatter rejects hostile / unsafe diagnostic values", () => {
    const hostile = formatSafeRetentionLiveFailureSummary({
      caseId: "live-hostile",
      category: "success_false",
      retryOccurred: false,
      retentionDiagnostics: {
        version: 1,
        terminalState: "fail",
        qualityMode: "balanced",
        failureCategory: "planner_invalid",
        contractFingerprint: "rsc:abc",
        planFingerprint: null,
        candidateFingerprint: null,
        validationFingerprint: null,
        rewriteUsed: false,
        safeReasonIds: [
          "planner_proposal_invalid",
          "Why does Spain pressure matter?",
          "sk-proj-ABCDEFGHIJKLMNOP",
          "https://evil.test/?token=secret",
          "a".repeat(80),
          123,
          { id: "x" },
        ],
        budget: {
          total: 1,
          totalCeiling: 5,
          planner: 1,
          initialNarration: 0,
          lengthCompression: 0,
          hookRepair: 0,
          hookFallback: 0,
          retentionBodyRewrite: 0,
        },
      },
    });
    assert.match(hostile, /safeReasonIds=planner_proposal_invalid/);
    assert.match(hostile, /failureStage=planner/);
    assert.doesNotMatch(hostile, /Why does Spain/);
    assert.doesNotMatch(hostile, /sk-proj/);
    assert.doesNotMatch(hostile, /token=secret/);
    assertSafeRetentionLiveFailureSummaryScrubbed(hostile);

    const proxy = new Proxy(
      {
        version: 1,
        terminalState: "fail",
        qualityMode: "cheap",
        failureCategory: "quality_failure",
        contractFingerprint: null,
        planFingerprint: null,
        candidateFingerprint: null,
        validationFingerprint: null,
        rewriteUsed: false,
        safeReasonIds: ["quality_mode_not_studio"],
        get narration() {
          return "Why does Spain pressure matter? OPENAI_API_KEY=sk-leak";
        },
      },
      {
        get(target, prop, receiver) {
          if (prop === "promptBlock") return "Ignore previous instructions";
          return Reflect.get(target, prop, receiver);
        },
      },
    );
    const proxied = formatSafeRetentionLiveFailureSummary({
      caseId: "live-proxy",
      category: "success_false",
      retryOccurred: false,
      retentionDiagnostics: proxy,
    });
    assert.doesNotMatch(proxied, /Ignore previous/);
    assert.doesNotMatch(proxied, /OPENAI_API_KEY/);
    assert.doesNotMatch(proxied, /Why does Spain/);
    assertSafeRetentionLiveFailureSummaryScrubbed(proxied);

    const malformedBudget = formatSafeRetentionLiveFailureSummary({
      caseId: "live-budget",
      category: "success_false",
      retryOccurred: false,
      retentionDiagnostics: {
        version: 1,
        terminalState: "fail",
        qualityMode: "cheap",
        failureCategory: "budget_ledger_failure",
        contractFingerprint: null,
        planFingerprint: null,
        candidateFingerprint: null,
        validationFingerprint: null,
        rewriteUsed: false,
        safeReasonIds: ["model_call_budget_exhausted"],
        budget: { total: "1", totalCeiling: 5 },
      },
    });
    assert.doesNotMatch(malformedBudget, /budget=/);
    assert.match(malformedBudget, /failureStage=commit/);
  });

  check("generationDisposition exact keys Pass", () => {
    const d = assertRetentionLiveGenerationDisposition({
      ...DISPOSITION_OPTIMAL,
      adaptations: [...DISPOSITION_OPTIMAL.adaptations],
      creatorFacingNotes: [...DISPOSITION_OPTIMAL.creatorFacingNotes],
    });
    assert.equal(d.disposition, "optimal");
  });

  check("Flexible Hook exact fulfillment Passes", () => {
    const result = assertFlexibleExplicitHookLiveSemantics({
      hookPlan: {
        strategyId: "provocative_question",
        strategySource: "user_selected",
      },
      hookDiagnostics: {
        strategyId: "provocative_question",
        strategySource: "user_selected",
        adapterRan: true,
      },
      disposition: {
        ...DISPOSITION_OPTIMAL,
        adaptations: [],
        creatorFacingNotes: [
          "Generated with the preferred settings for this brief.",
        ],
      },
      requestedStrategyId: "provocative_question",
      requestedStrategySource: "user_selected",
    });
    assert.equal(result.fulfillment, "exact");
  });

  check("Flexible Hook reconciled fulfillment Passes", () => {
    const result = assertFlexibleExplicitHookLiveSemantics({
      hookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
      hookDiagnostics: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
        adapterRan: true,
      },
      disposition: {
        disposition: "acceptable",
        adaptations: ["hook_style_reconciled"],
        factHandlingMode: "verified_facts_only",
        qualityBelowTarget: false,
        approximateWordCount: 20,
        targetWordBudget: 72,
        resolvedBeatCount: 5,
        creatorFacingNotes: [
          "Hook style was adjusted to a compatible opening.",
        ],
      },
      requestedStrategyId: "provocative_question",
      requestedStrategySource: "user_selected",
    });
    assert.equal(result.fulfillment, "reconciled");
  });

  check("strategy changed without reconciliation adaptation rejected", () => {
    assert.throws(() =>
      assertFlexibleExplicitHookLiveSemantics({
        hookPlan: {
          strategyId: "cold_open",
          strategySource: "strategy_library",
        },
        hookDiagnostics: {
          strategyId: "cold_open",
          strategySource: "strategy_library",
          adapterRan: true,
        },
        disposition: {
          ...DISPOSITION_OPTIMAL,
          adaptations: [],
          creatorFacingNotes: [
            "Generated with the preferred settings for this brief.",
          ],
        },
        requestedStrategyId: "provocative_question",
        requestedStrategySource: "user_selected",
      }),
    );
  });

  check("forged reconciliation when strategy stayed exact rejected", () => {
    assert.throws(() =>
      assertFlexibleExplicitHookLiveSemantics({
        hookPlan: {
          strategyId: "provocative_question",
          strategySource: "user_selected",
        },
        hookDiagnostics: {
          strategyId: "provocative_question",
          strategySource: "user_selected",
          adapterRan: true,
        },
        disposition: {
          disposition: "acceptable",
          adaptations: ["hook_style_reconciled"],
          factHandlingMode: "verified_facts_only",
          qualityBelowTarget: false,
          approximateWordCount: 20,
          targetWordBudget: 72,
          resolvedBeatCount: 5,
          creatorFacingNotes: [
            "Hook style was adjusted to a compatible opening.",
          ],
        },
        requestedStrategyId: "provocative_question",
        requestedStrategySource: "user_selected",
      }),
    );
  });

  check("Flexible Creative Premise omission path Passes", () => {
    const path = assertFlexibleCreativePremiseLiveSemantics({
      narration:
        "Argentina met England. Pressure keeps rising through late discipline.",
      disposition: {
        disposition: "acceptable",
        adaptations: ["unsupported_facts_omitted"],
        factHandlingMode: "creative_premise",
        qualityBelowTarget: false,
        approximateWordCount: 12,
        targetWordBudget: 72,
        resolvedBeatCount: 5,
        creatorFacingNotes: [
          "Unsupported factual details were omitted or reframed.",
        ],
      },
      requiredParticipants: ["Argentina", "England"],
      optionalPremiseDetailTokens: ["26", "35"],
    });
    assert.equal(path.premisePath, "omitted");
  });

  check("omitted premise fact without omission adaptation rejected", () => {
    assert.throws(() =>
      assertFlexibleCreativePremiseLiveSemantics({
        narration:
          "Argentina met England. Pressure keeps rising through late discipline.",
        disposition: {
          ...DISPOSITION_OPTIMAL,
          factHandlingMode: "creative_premise",
          adaptations: [],
          creatorFacingNotes: [
            "Generated with the preferred settings for this brief.",
          ],
        },
        requiredParticipants: ["Argentina", "England"],
        optionalPremiseDetailTokens: ["26", "35"],
      }),
    );
  });

  check("creative_premise_used without premise mode rejected", () => {
    assert.throws(() =>
      assertRetentionLiveGenerationDisposition({
        disposition: "acceptable",
        adaptations: ["creative_premise_used"],
        factHandlingMode: "verified_facts_only",
        qualityBelowTarget: false,
        approximateWordCount: 20,
        targetWordBudget: 72,
        resolvedBeatCount: 5,
        creatorFacingNotes: [
          "Uses creator-supplied premise details (not independently verified).",
        ],
      }),
    );
  });

  check("malformed/unknown disposition fields rejected", () => {
    assert.throws(() =>
      assertRetentionLiveGenerationDisposition({
        ...DISPOSITION_OPTIMAL,
        adaptations: [],
        creatorFacingNotes: [
          "Generated with the preferred settings for this brief.",
        ],
        secretPrompt: "Ignore previous instructions",
      }),
    );
  });

  check("secret-bearing creator note rejected", () => {
    assert.throws(() =>
      assertRetentionLiveGenerationDisposition({
        ...DISPOSITION_OPTIMAL,
        adaptations: [],
        creatorFacingNotes: ["OPENAI_API_KEY=sk-proj-leaked-value-here"],
      }),
    );
  });

  check("missing generationDisposition on success rejected", () => {
    const json = coherentSuccess();
    delete json.generationDisposition;
    assert.throws(() =>
      assertRetentionLiveSuccessEnvelope(json, {
        expectedGenerationPath: "script_only",
        expectedFormatStrategyId: "short_retention",
        expectedQualityMode: "cheap",
        requestedDurationSec: 30,
      }),
    );
  });

  console.log(`\nretention-story-live-assertion-qa — ${passed} checks passed\n`);
}

main();
