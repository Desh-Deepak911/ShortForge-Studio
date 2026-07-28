/**
 * Sprint 10H — Retention Story persistence + explainability QA.
 * Run: npm run test:retention-story-persistence-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

import {
  buildRetentionSafeResponseEnvelope,
  runRetentionProductionNarration,
  sanitizeCreationBriefRetentionPersistence,
  validateRetentionExplainabilityEnvelope,
  validateRetentionStoryPlanSnapshot,
  validateRetentionValidationSummary,
  type RetentionStoryPlanSnapshot,
  type RetentionValidationSummary,
} from "@/features/retention-story";
import {
  buildRetentionExplainabilityModel,
} from "@/features/retention-story/presentation";
import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  normalizeDraft,
} from "@/features/drafts";
import type { FootieScript } from "@/features/story/types";

import { retentionProductionDoubles } from "./retentionStoryQaDoubles";

function buildScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Test Story",
    totalDuration: 30,
    narration: "Default narration.",
    scenes: [],
    ...overrides,
  };
}

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const FP = Object.freeze({
  contract: "rsc:abc1234",
  plan: "rsp:def5678",
  validation: "rv:ghi9012",
  candidate: "rnc:jkl3456",
});

function samplePlan(
  overrides: Partial<RetentionStoryPlanSnapshot> = {},
): RetentionStoryPlanSnapshot {
  return {
    version: 1,
    formatStrategyId: "short_retention",
    controllingIdea: "Late drama decides titles",
    primaryEmotion: "tension",
    secondaryEmotion: "hope",
    beatCount: 5,
    pacingProfile: "front_loaded",
    endingStrategy: "payoff_reveal",
    informationDensity: "dense",
    visualDensity: "high",
    claimIdCount: 0,
    contractFingerprint: FP.contract,
    planFingerprint: FP.plan,
    strategyRegistryVersion: "retention-format-strategy/1",
    ...overrides,
  };
}

function sampleValidation(
  overrides: Partial<RetentionValidationSummary> = {},
): RetentionValidationSummary {
  return {
    version: 1,
    ok: true,
    retentionReadiness: 0.91,
    storyQualityConfidence: 0.84,
    frameworkCompliance: 0.95,
    failedHardGateIds: [],
    warningNotes: ["Opening could land sooner."],
    validationFingerprint: FP.validation,
    candidateFingerprint: FP.candidate,
    contractFingerprint: FP.contract,
    planFingerprint: FP.plan,
    terminalState: "pass_without_rewrite",
    rewriteUsed: false,
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log("\nretention-story-persistence-qa (Sprint 10H)\n");

  await check("successful generation persists only linked safe snapshots", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const storage = createMemoryDraftStorageAdapter();
    const draft = createDraft(
      {
        script: buildScript({
          title: result.approved.title,
          narration: result.approved.narration,
        }),
        creationBrief: {
          topic: "Spain versus France tactical preview",
          tone: "dramatic",
          duration: 30,
          qualityMode: "cheap",
          sceneCount: 4,
          retentionPlan: result.approved.planSnapshot,
          retentionValidation: result.approved.validationSummary,
          hookPlan: result.approved.hookPlan,
          formatStrategyId: "short_retention",
        },
        pipelineStage: "script_review",
      },
      { adapter: storage },
    );
    const loaded = getDraft(draft.id, { adapter: storage });
    assert.ok(loaded);
    assert.equal(loaded!.script.narration, result.approved.narration);
    assert.deepEqual(
      loaded!.creationBrief?.retentionPlan,
      result.approved.planSnapshot,
    );
    assert.deepEqual(
      loaded!.creationBrief?.retentionValidation,
      result.approved.validationSummary,
    );
    const blob = JSON.stringify(loaded!.creationBrief);
    assert.equal(blob.includes("terminalHookAuthority"), false);
    assert.equal(blob.includes("promptBlock"), false);
    assert.equal(blob.includes("sk-"), false);
  });

  await check("failed generation persists no Retention plan/validation", async () => {
    const result = await runRetentionProductionNarration({
      topic: "   ",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: () => {
        throw new Error("fail");
      },
    });
    assert.equal(result.ok, false);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    assert.equal(envelope.retentionPlan, undefined);
    assert.equal(envelope.retentionValidation, undefined);
  });

  await check("Auto omission and explicit strategy persistence", () => {
    const autoOmitted = sanitizeCreationBriefRetentionPersistence({
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation(),
    });
    assert.equal(autoOmitted.formatStrategyId, undefined);
    assert.ok(autoOmitted.retentionPlan);

    const explicit = sanitizeCreationBriefRetentionPersistence({
      formatStrategyId: "short_standard",
      retentionPlan: samplePlan({ formatStrategyId: "short_standard" }),
      retentionValidation: sampleValidation(),
    });
    assert.equal(explicit.formatStrategyId, "short_standard");
    assert.ok(explicit.retentionPlan);
  });

  await check("legacy drafts load without migration", () => {
    const loaded = normalizeDraft({
      id: "legacy-retention",
      script: buildScript({ narration: "Legacy narration unchanged." }),
      creationBrief: {
        topic: "Legacy topic",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 4,
      },
    });
    assert.equal(loaded.script.narration, "Legacy narration unchanged.");
    assert.equal(loaded.creationBrief?.retentionPlan, undefined);
    assert.equal(loaded.creationBrief?.retentionValidation, undefined);
  });

  await check("malformed / partial / mismatched evidence fails closed", () => {
    assert.equal(validateRetentionStoryPlanSnapshot({ version: 1 }).ok, false);
    assert.equal(
      validateRetentionValidationSummary({
        version: 1,
        ok: true,
      }).ok,
      false,
    );
    const mismatched = sanitizeCreationBriefRetentionPersistence({
      formatStrategyId: "short_retention",
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation({
        planFingerprint: "rsp:mismatch",
      }),
    });
    assert.equal(mismatched.retentionPlan, undefined);
    assert.equal(mismatched.retentionValidation, undefined);
    assert.equal(mismatched.formatStrategyId, "short_retention");
  });

  await check("hostile getter / Proxy evidence fails closed (no throw)", () => {
    const hostilePlan = Object.defineProperty({}, "version", {
      enumerable: true,
      get() {
        throw new Error("getter");
      },
    });
    assert.equal(validateRetentionStoryPlanSnapshot(hostilePlan).ok, false);
    assert.equal(validateRetentionValidationSummary(hostilePlan).ok, false);
    assert.equal(
      validateRetentionExplainabilityEnvelope({
        retentionPlan: hostilePlan,
        retentionValidation: sampleValidation(),
        formatStrategyId: "auto",
        duration: 30,
      }).ok,
      false,
    );
    assert.doesNotThrow(() =>
      sanitizeCreationBriefRetentionPersistence({
        get retentionPlan() {
          throw new Error("getter");
        },
      } as never),
    );
  });

  await check("standalone retentionRewriteUsed remains non-authoritative", () => {
    const sanitized = sanitizeCreationBriefRetentionPersistence({
      retentionRewriteUsed: true,
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation({ rewriteUsed: false }),
    });
    assert.ok(sanitized.retentionPlan);
    assert.equal(
      (sanitized as { retentionRewriteUsed?: boolean }).retentionRewriteUsed,
      undefined,
    );
    const model = buildRetentionExplainabilityModel({
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation({ rewriteUsed: false }),
      formatStrategyId: "auto",
      duration: 30,
    });
    assert.equal(model.available, true);
    const rewriteRow = model.rows.find((r) => r.id === "studio_rewrite");
    assert.ok(rewriteRow?.value.includes("Not used"));
  });

  await check("explainability only for coherent linked envelope", () => {
    const ok = buildRetentionExplainabilityModel({
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation(),
      formatStrategyId: "auto",
      duration: 30,
    });
    assert.equal(ok.available, true);
    assert.ok(ok.rows.some((r) => r.id === "controlling_idea"));

    const broken = buildRetentionExplainabilityModel({
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation({
        planFingerprint: "rsp:mismatch",
      }),
      formatStrategyId: "auto",
      duration: 30,
    });
    assert.equal(broken.available, false);
  });

  await check("no prompts, claim dumps, ledger events, or credentials persist", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const brief = {
      topic: "Spain versus France tactical preview",
      tone: "dramatic" as const,
      duration: 30,
      qualityMode: "cheap" as const,
      sceneCount: 4,
      retentionPlan: result.approved.planSnapshot,
      retentionValidation: result.approved.validationSummary,
      hookPlan: result.approved.hookPlan,
    };
    const blob = JSON.stringify(brief);
    assert.doesNotMatch(blob, /promptBlock/i);
    assert.doesNotMatch(blob, /"claims"\s*:/);
    assert.doesNotMatch(blob, /ledger/i);
    assert.doesNotMatch(blob, /terminalHookAuthority/);
    assert.doesNotMatch(blob, /OPENAI_API_KEY/);
    assert.doesNotMatch(blob, /sk-[A-Za-z0-9]/);
  });

  console.log(`\nretention-story-persistence-qa — ${passed} checks passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
