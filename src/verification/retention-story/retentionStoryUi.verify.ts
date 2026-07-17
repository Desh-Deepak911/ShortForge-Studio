/**
 * Sprint 10G / 10G.1 — Story Strategy UI + explainability authority (network-free).
 * Run: npm run test:retention-story-ui
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

import {
  isCreatorStoryStrategyCoherentWithPlan,
  normalizeStoryContract,
  sanitizeCreationBriefRetentionPersistence,
  validateRetentionExplainabilityEnvelope,
  validateRetentionStoryPlanSnapshot,
  validateRetentionValidationSummary,
  type RetentionStoryPlanSnapshot,
  type RetentionValidationSummary,
} from "@/features/retention-story";
import {
  STORY_STRATEGY_CATALOG,
  STORY_STRATEGY_INCOMPATIBLE_RESET_NOTICE,
  STORY_STRATEGY_NON_SELECTABLE_IDS,
  assertStoryStrategyAllowed,
  buildRetentionExplainabilityModel,
  explainabilityTextContainsForbiddenScoreLanguage,
  formatStrategyIdFromStoryStrategy,
  isStoryStrategyCompatibleWithDuration,
  isStoryStrategySelection,
  parseStoryStrategySelection,
  predictAutoStoryStrategy,
  reconcileStoryStrategySelection,
  storyStrategyLabel,
  type StoryStrategySelection,
} from "@/features/retention-story/presentation";
import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  normalizeDraft,
} from "@/features/drafts";
import type { StoryCreationBrief } from "@/features/drafts/types";
import type { FootieScript } from "@/features/story/types";

function buildScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Test Story",
    totalDuration: 30,
    narration: "Default narration.",
    scenes: [],
    ...overrides,
  };
}

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function baseContractInput(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Arsenal title race",
    durationSec: 30,
    generationPath: "script_only" as const,
    scriptMode: "story" as const,
    tone: "dramatic" as const,
    ...overrides,
  };
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

function explainInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    retentionPlan: samplePlan(),
    retentionValidation: sampleValidation(),
    formatStrategyId: "auto",
    duration: 30,
    ...overrides,
  };
}

async function main() {
  console.log("retention-story-ui (Sprint 10G / 10G.1 / 10G.1A)\n");

  await test("catalog — Auto default + Retention-first + Standard; long-form excluded", () => {
    const selections = STORY_STRATEGY_CATALOG.map((e) => e.selection);
    assert.equal(selections[0], "auto");
    assert.ok(selections.includes("short_retention"));
    assert.ok(selections.includes("short_standard"));
    assert.equal(selections.length, 3);
    for (const id of STORY_STRATEGY_NON_SELECTABLE_IDS) {
      assert.ok(!selections.includes(id as StoryStrategySelection));
    }
    assert.equal(
      STORY_STRATEGY_CATALOG.find((e) => e.selection === "auto")?.label,
      "Auto — Recommended",
    );
    assert.equal(storyStrategyLabel("short_retention"), "Retention-first");
    assert.equal(storyStrategyLabel("short_standard"), "Standard");
  });

  await test("duration compatibility + Auto mapping positives", () => {
    assert.equal(isStoryStrategyCompatibleWithDuration("short_retention", 30), true);
    assert.equal(isStoryStrategyCompatibleWithDuration("short_retention", 45), false);
    assert.equal(isStoryStrategyCompatibleWithDuration("short_standard", 30), true);
    assert.equal(isStoryStrategyCompatibleWithDuration("short_standard", 45), false);
    assert.equal(predictAutoStoryStrategy(30).resolvedId, "short_retention");
    assert.equal(predictAutoStoryStrategy(45).resolvedId, "extended_short");
    assert.equal(predictAutoStoryStrategy(60).resolvedId, "extended_short");
  });

  await test("reset-to-Auto on incompatible duration", () => {
    const reset = reconcileStoryStrategySelection("short_retention", 45);
    assert.equal(reset.selection, "auto");
    assert.equal(reset.compatibilityNotice, STORY_STRATEGY_INCOMPATIBLE_RESET_NOTICE);
    const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
    assert.match(flow, /reconcileStoryStrategySelection/);
  });

  await test("forged / unknown / long-form / duration-incompatible server inputs rejected", () => {
    assert.throws(() => assertStoryStrategyAllowed("extended_short", 45), /cannot be requested/);
    assert.throws(() => assertStoryStrategyAllowed("long_form_explainer", 90), /cannot be requested/);
    assert.throws(() => assertStoryStrategyAllowed("short_retention", 45), /incompatible/);
    assert.equal(parseStoryStrategySelection("extended_short"), undefined);
    assert.equal(isStoryStrategySelection("long_form_documentary"), false);
    const route = readSrc("src/app/api/generate-script/route.ts");
    assert.match(route, /assertStoryStrategyAllowed/);
  });

  await test("request fingerprint invalidation — explicit strategy changes contract fingerprint", () => {
    const auto = normalizeStoryContract(baseContractInput({ formatStrategyId: "auto" }));
    const omitted = normalizeStoryContract(baseContractInput({}));
    const standard = normalizeStoryContract(
      baseContractInput({ formatStrategyId: "short_standard" }),
    );
    assert.equal(auto.contractFingerprint, omitted.contractFingerprint);
    assert.notEqual(auto.contractFingerprint, standard.contractFingerprint);
    assert.equal(formatStrategyIdFromStoryStrategy("auto"), "auto");
  });

  await test("script-only / audio-first wiring + scenes-only isolation (source)", () => {
    const route = readSrc("src/app/api/generate-script/route.ts");
    assert.match(route, /formatStrategyIdFromStoryStrategy/);
    assert.match(route, /mode !== "scenes-only"/);
    const audio = readSrc(
      "src/features/story/services/audio-first-generation.service.ts",
    );
    assert.match(audio, /formatStrategyId: input\.formatStrategyId \?\? "auto"/);
  });

  await test("positive explainability — linked snapshots + Studio rewrite + warnings", () => {
    const model = buildRetentionExplainabilityModel(explainInput());
    assert.equal(model.available, true);
    assert.equal(
      model.rows.find((r) => r.id === "resolved_strategy")?.value,
      "Retention-first",
    );
    assert.equal(
      model.rows.find((r) => r.id === "studio_rewrite")?.value,
      "Not used",
    );
    assert.deepEqual(model.warningNotes, ["Opening could land sooner."]);

    const rewrite = buildRetentionExplainabilityModel(
      explainInput({
        retentionValidation: sampleValidation({
          terminalState: "pass_after_rewrite",
          rewriteUsed: true,
        }),
      }),
    );
    assert.equal(rewrite.available, true);
    assert.equal(
      rewrite.rows.find((r) => r.id === "studio_rewrite")?.value,
      "Used — Studio polish pass applied",
    );

    const standard = buildRetentionExplainabilityModel(
      explainInput({
        formatStrategyId: "short_standard",
        retentionPlan: samplePlan({ formatStrategyId: "short_standard" }),
        retentionValidation: sampleValidation(),
      }),
    );
    assert.equal(standard.available, true);
    assert.equal(
      standard.rows.find((r) => r.id === "resolved_strategy")?.value,
      "Standard",
    );

    const auto45 = buildRetentionExplainabilityModel(
      explainInput({
        formatStrategyId: "auto",
        duration: 45,
        retentionPlan: samplePlan({ formatStrategyId: "extended_short" }),
        retentionValidation: sampleValidation(),
      }),
    );
    assert.equal(auto45.available, true);
    assert.equal(
      auto45.rows.find((r) => r.id === "resolved_strategy")?.value,
      "Extended short",
    );

    for (const row of model.rows) {
      assert.equal(
        explainabilityTextContainsForbiddenScoreLanguage(
          `${row.label} ${row.value} ${row.description ?? ""}`,
        ),
        false,
      );
    }
    const panelText = JSON.stringify(model);
    assert.doesNotMatch(panelText, /rsc:|rsp:|rv:|rnc:/);
  });

  await test("negative — null/array/string/wrong version/missing/unknown keys", () => {
    for (const bad of [null, undefined, "x", [], 12, true]) {
      assert.equal(validateRetentionStoryPlanSnapshot(bad).ok, false);
      assert.equal(validateRetentionValidationSummary(bad).ok, false);
      assert.equal(buildRetentionExplainabilityModel(bad).available, false);
    }

    assert.equal(
      validateRetentionStoryPlanSnapshot(samplePlan({ version: 2 as never })).ok,
      false,
    );
    const missing = { ...samplePlan() } as Record<string, unknown>;
    delete missing.controllingIdea;
    assert.equal(validateRetentionStoryPlanSnapshot(missing).ok, false);

    for (const forbidden of [
      "promptBlock",
      "claimRefs",
      "terminalHookAuthority",
      "ledgerEvents",
    ]) {
      assert.equal(
        validateRetentionStoryPlanSnapshot({
          ...samplePlan(),
          [forbidden]: "secret",
        }).ok,
        false,
        forbidden,
      );
      assert.equal(
        validateRetentionValidationSummary({
          ...sampleValidation(),
          [forbidden]: "secret",
        }).ok,
        false,
        forbidden,
      );
    }
  });

  await test("negative — bad primitives / scores / enums / oversized strings", () => {
    assert.equal(
      validateRetentionStoryPlanSnapshot(
        samplePlan({ controllingIdea: 12 as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionStoryPlanSnapshot(
        samplePlan({ primaryEmotion: { x: 1 } as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionValidationSummary(
        sampleValidation({ warningNotes: undefined as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionValidationSummary(
        sampleValidation({ warningNotes: "note" as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionValidationSummary(
        sampleValidation({ warningNotes: [{} as never] }),
      ).ok,
      false,
    );

    for (const score of [NaN, Infinity, -0.1, 1.1, "0.5" as never]) {
      assert.equal(
        validateRetentionValidationSummary(
          sampleValidation({ retentionReadiness: score as never }),
        ).ok,
        false,
        String(score),
      );
    }
    for (const count of [-1, 1.5, NaN, 999]) {
      assert.equal(
        validateRetentionStoryPlanSnapshot(
          samplePlan({ beatCount: count as never }),
        ).ok,
        false,
        String(count),
      );
    }
    assert.equal(
      validateRetentionStoryPlanSnapshot(
        samplePlan({ pacingProfile: "mystery" as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionStoryPlanSnapshot(
        samplePlan({ formatStrategyId: "long_form_explainer" as never }),
      ).ok,
      false,
    );
    assert.equal(
      validateRetentionStoryPlanSnapshot(
        samplePlan({ controllingIdea: `idea\u0000${"x".repeat(400)}` }),
      ).ok,
      true,
    );
    const sanitized = validateRetentionStoryPlanSnapshot(
      samplePlan({ controllingIdea: `idea\u0000${"x".repeat(400)}` }),
    );
    assert.equal(sanitized.ok, true);
    if (sanitized.ok) {
      assert.ok(!sanitized.value.controllingIdea.includes("\u0000"));
      assert.ok(sanitized.value.controllingIdea.length <= 280);
    }
  });

  await test("negative — plan/validation mismatch + partial pairs + forged rewrite", () => {
    assert.equal(
      validateRetentionExplainabilityEnvelope({
        retentionPlan: samplePlan(),
        retentionValidation: sampleValidation({
          planFingerprint: "rsp:other999",
        }),
      }).ok,
      false,
    );
    assert.equal(
      validateRetentionExplainabilityEnvelope({
        retentionPlan: samplePlan(),
      }).ok,
      false,
    );
    assert.equal(
      validateRetentionExplainabilityEnvelope({
        retentionValidation: sampleValidation(),
      }).ok,
      false,
    );

    // Legacy unlinked summary (no linkage fields).
    const legacyValidation = {
      version: 1,
      ok: true,
      retentionReadiness: 0.9,
      storyQualityConfidence: 0.9,
      frameworkCompliance: 0.9,
      failedHardGateIds: [],
      warningNotes: [],
      validationFingerprint: FP.validation,
      candidateFingerprint: FP.candidate,
    };
    assert.equal(
      validateRetentionValidationSummary(legacyValidation).reason,
      "legacy_unlinked",
    );
    assert.equal(
      buildRetentionExplainabilityModel({
        retentionPlan: samplePlan(),
        retentionValidation: legacyValidation,
        duration: 30,
      }).available,
      false,
    );

    // Selection / resolved plan mismatch hides explainability.
    const mismatch = buildRetentionExplainabilityModel(
      explainInput({ formatStrategyId: "short_standard" }),
    );
    assert.equal(mismatch.available, false);

    // Forged standalone rewriteUsed ignored — linked validation wins.
    const forged = buildRetentionExplainabilityModel(
      explainInput({ retentionRewriteUsed: true }),
    );
    assert.equal(forged.available, true);
    assert.equal(
      forged.rows.find((r) => r.id === "studio_rewrite")?.value,
      "Not used",
    );

    // Incoherent rewriteUsed vs terminalState rejected.
    assert.equal(
      validateRetentionValidationSummary(
        sampleValidation({
          terminalState: "pass_after_rewrite",
          rewriteUsed: false,
        }),
      ).ok,
      false,
    );
  });

  await test("negative — total exception boundary (getters / Proxy / hostile briefs)", () => {
    const throwingVersion = Object.defineProperty({}, "version", {
      enumerable: true,
      get() {
        throw new Error("getter");
      },
    });
    const planThrow = validateRetentionStoryPlanSnapshot(throwingVersion);
    const validationThrow = validateRetentionValidationSummary(throwingVersion);
    assert.equal(planThrow.ok, false);
    assert.equal(planThrow.ok === false && planThrow.reason, "malformed");
    assert.equal(validationThrow.ok, false);
    assert.equal(
      validationThrow.ok === false && validationThrow.reason,
      "malformed",
    );

    const throwingFieldPlan = Object.defineProperty(
      { ...samplePlan() },
      "controllingIdea",
      {
        enumerable: true,
        configurable: true,
        get() {
          throw new Error("plan-field");
        },
      },
    );
    assert.equal(validateRetentionStoryPlanSnapshot(throwingFieldPlan).ok, false);

    const throwingFieldValidation = Object.defineProperty(
      { ...sampleValidation() },
      "retentionReadiness",
      {
        enumerable: true,
        configurable: true,
        get() {
          throw new Error("validation-field");
        },
      },
    );
    assert.equal(
      validateRetentionValidationSummary(throwingFieldValidation).ok,
      false,
    );

    const proxyGet = new Proxy(
      {},
      {
        get() {
          throw new Error("proxy-get");
        },
        ownKeys() {
          return ["version"];
        },
        getOwnPropertyDescriptor() {
          return { enumerable: true, configurable: true };
        },
      },
    );
    assert.equal(validateRetentionStoryPlanSnapshot(proxyGet).ok, false);
    assert.equal(validateRetentionValidationSummary(proxyGet).ok, false);

    const proxyOwnKeys = new Proxy(
      { version: 1 },
      {
        ownKeys() {
          throw new Error("proxy-ownKeys");
        },
        getOwnPropertyDescriptor() {
          return { enumerable: true, configurable: true };
        },
      },
    );
    assert.equal(validateRetentionStoryPlanSnapshot(proxyOwnKeys).ok, false);
    assert.equal(validateRetentionValidationSummary(proxyOwnKeys).ok, false);

    const proxyHas = new Proxy(
      { ...sampleValidation() },
      {
        has() {
          throw new Error("proxy-has");
        },
      },
    );
    assert.equal(validateRetentionValidationSummary(proxyHas).ok, false);

    const nullProto = Object.assign(Object.create(null), samplePlan());
    assert.equal(validateRetentionStoryPlanSnapshot(nullProto).ok, true);

    const cyclic: Record<string, unknown> = { version: 1 };
    cyclic.self = cyclic;
    assert.equal(validateRetentionStoryPlanSnapshot(cyclic).ok, false);
    assert.equal(validateRetentionValidationSummary(cyclic).ok, false);

    const hostileEnvelope = {
      get retentionPlan() {
        throw new Error("envelope-plan");
      },
      get retentionValidation() {
        throw new Error("envelope-validation");
      },
    };
    assert.equal(
      validateRetentionExplainabilityEnvelope(hostileEnvelope).ok,
      false,
    );

    const hostileBrief = {
      topic: "Hostile",
      tone: "dramatic",
      duration: 30,
      qualityMode: "cheap",
      sceneCount: 3,
      get retentionPlan() {
        throw new Error("brief-plan");
      },
      get retentionValidation() {
        throw new Error("brief-validation");
      },
      get formatStrategyId() {
        throw new Error("brief-strategy");
      },
      get retentionRewriteUsed() {
        throw new Error("brief-rewrite");
      },
    };
    const sanitized = sanitizeCreationBriefRetentionPersistence(
      hostileBrief as never,
    );
    assert.deepEqual(sanitized, {});

    const narration = "Hostile brief must not alter narration.";
    const normalized = normalizeDraft({
      id: "hostile-retention-brief",
      script: buildScript({ narration }),
      creationBrief: hostileBrief as never,
    });
    assert.equal(normalized.script.narration, narration);
    assert.equal(normalized.creationBrief?.retentionPlan, undefined);
    assert.equal(normalized.creationBrief?.retentionValidation, undefined);

    const explainHostile = buildRetentionExplainabilityModel(hostileBrief);
    assert.equal(explainHostile.available, false);
    assert.ok(explainHostile.unavailableMessage);
    assert.deepEqual(explainHostile.rows, []);
    assert.deepEqual(explainHostile.warningNotes, []);

    assert.equal(
      isCreatorStoryStrategyCoherentWithPlan({
        get formatStrategyId() {
          throw new Error("cohere");
        },
        durationSec: 30,
        resolvedFormatStrategyId: "short_retention",
      }),
      false,
    );
  });

  await test("persistence / reload / legacy absence + narration unchanged", async () => {
    const storage = createMemoryDraftStorageAdapter();
    const narration = "Keep this narration byte-for-byte.";
    const briefWithStrategy: StoryCreationBrief = {
      topic: "Title race",
      tone: "dramatic",
      duration: 30,
      qualityMode: "cheap",
      sceneCount: 4,
      formatStrategyId: "short_retention",
      retentionPlan: samplePlan(),
      retentionValidation: sampleValidation(),
    };
    const draft = createDraft(
      {
        script: buildScript({ narration }),
        creationBrief: briefWithStrategy,
        pipelineStage: "script_review",
      },
      { adapter: storage },
    );
    const loaded = getDraft(draft.id, { adapter: storage });
    assert.equal(loaded?.script.narration, narration);
    assert.equal(loaded?.creationBrief?.formatStrategyId, "short_retention");
    assert.equal(loaded?.creationBrief?.retentionPlan?.formatStrategyId, "short_retention");
    assert.equal(loaded?.creationBrief?.retentionValidation?.rewriteUsed, false);
    assert.equal(loaded?.creationBrief?.retentionRewriteUsed, undefined);

    const legacy = createDraft(
      {
        script: buildScript({ narration: "Legacy narration stays." }),
        creationBrief: {
          topic: "Legacy",
          tone: "dramatic",
          duration: 30,
          qualityMode: "cheap",
          sceneCount: 3,
        },
        pipelineStage: "script_review",
      },
      { adapter: storage },
    );
    assert.equal(getDraft(legacy.id, { adapter: storage })?.creationBrief?.retentionPlan, undefined);
    assert.equal(
      buildRetentionExplainabilityModel(
        getDraft(legacy.id, { adapter: storage })?.creationBrief,
      ).available,
      false,
    );
  });

  await test("malformed drafts survive reload without Review crash; narration preserved", () => {
    const narration = "Untouched spoken authority.";
    const malformed = normalizeDraft({
      id: "malformed-retention",
      script: buildScript({ narration }),
      creationBrief: {
        topic: "Bad",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 3,
        formatStrategyId: "short_retention",
        retentionPlan: {
          ...samplePlan(),
          promptBlock: "SECRET PROMPT",
        } as never,
        retentionValidation: sampleValidation(),
        retentionRewriteUsed: true,
      },
    });
    assert.equal(malformed.script.narration, narration);
    assert.equal(malformed.creationBrief?.retentionPlan, undefined);
    assert.equal(malformed.creationBrief?.retentionValidation, undefined);
    assert.equal(malformed.creationBrief?.retentionRewriteUsed, undefined);
    assert.equal(malformed.creationBrief?.formatStrategyId, "short_retention");

    const model = buildRetentionExplainabilityModel(malformed.creationBrief);
    assert.equal(model.available, false);
    assert.ok(model.unavailableMessage);

    // Plan-only rejected at sanitize.
    const planOnly = sanitizeCreationBriefRetentionPersistence({
      retentionPlan: samplePlan(),
      formatStrategyId: "short_retention",
    });
    assert.equal(planOnly.retentionPlan, undefined);
    assert.equal(planOnly.formatStrategyId, "short_retention");
  });

  await test("privacy + accessibility source boundaries", () => {
    const explain = readSrc(
      "src/features/retention-story/presentation/retention-explainability.ts",
    );
    assert.doesNotMatch(explain, /terminalHookAuthority|promptBlock|claimRefs/);
    assert.match(explain, /validateRetentionExplainabilityEnvelope/);

    const strategyPanel = readSrc(
      "src/features/create/components/StoryStrategyPanel.tsx",
    );
    assert.match(strategyPanel, /aria-labelledby="story-strategy-heading"/);
    assert.match(strategyPanel, /aria-live="polite"/);

    const brief = readSrc("src/features/create/components/BriefCanvas.tsx");
    assert.match(brief, /StoryStrategyPanel/);
    assert.doesNotMatch(brief, /overflow-hidden[\s\S]{0,80}StoryStrategyPanel/);

    const create = readSrc("src/features/create/components/CreateStoryFlow.tsx");
    assert.doesNotMatch(
      create,
      /retentionRewriteUsed:\s*data\.retentionDiagnostics/,
    );
  });

  await test("JSON/NDJSON parity helpers still strip private Retention fields", () => {
    const envelope = readSrc(
      "src/features/retention-story/production/build-retention-safe-response-envelope.ts",
    );
    assert.match(envelope, /assertNoPrivateRetentionFieldsSerialized/);
    const commit = readSrc(
      "src/features/retention-story/production/commit-retention-approved-narration.ts",
    );
    assert.match(commit, /buildRetentionValidationSummary\(validation,/);
    assert.match(commit, /terminalState: terminal\.status/);
  });

  console.log("\nAll retention story UI checks passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
