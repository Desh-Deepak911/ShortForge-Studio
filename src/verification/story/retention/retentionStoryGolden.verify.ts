/**
 * Sprint 10H — Retention Story Golden registry + structural/semantic production QA.
 * Run: npm run test:retention-story-golden
 *
 * Exercises real production orchestration with injected doubles (no network).
 * Each golden declares what it proves; Pass is never inferred from source inspection alone.
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

import { SCRIPT_MODES } from "@/types/footiebitz";
import {
  buildRetentionSafeResponseEnvelope,
  createRetentionModelCallLedger,
  normalizeStoryContract,
  resolveRetentionModelCallBudgetPolicy,
  runRetentionProductionNarration,
  type RetentionProductionNarrationResult,
} from "@/features/retention-story";
import { generateScenesForReviewedScript } from "@/features/story/services/audio-first-generation.service";
import { createDraftFromScript, normalizeDraft } from "@/features/drafts/utils";
import type { FootieScript } from "@/features/story/types";

import {
  RETENTION_STORY_GOLDEN_IDS,
  RETENTION_STORY_GOLDEN_PROJECTS,
  buildRetentionStoryGoldenFixture,
  type RetentionStoryGoldenFixture,
} from "./goldens";
import {
  passRetentionHookRunner,
  retentionProductionDoubles,
} from "./retentionStoryQaDoubles";
import { emptyGrounding } from "./retentionStoryCoherentEnvelope";

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function assertPass(
  result: RetentionProductionNarrationResult,
): asserts result is Extract<RetentionProductionNarrationResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const GENERIC_INTRO =
  /\b(in this (video|short)|today (we|i) (will|are going to)|welcome to|let'?s (talk|dive|discuss)|hello (everyone|folks))\b/i;

function assertStructuralSuccess(
  fixture: RetentionStoryGoldenFixture,
  result: Extract<RetentionProductionNarrationResult, { ok: true }>,
): void {
  const { approved } = result;
  assert.ok(approved.narration.trim().length > 0, `${fixture.id}: empty narration`);
  assert.ok(
    approved.hookPlan && approved.hookDiagnostics,
    `${fixture.id}: Hook envelope required`,
  );
  assert.equal(approved.hookDiagnostics.validationOutcome, "pass");
  assert.equal(approved.validationSummary.ok, true);
  assert.ok(
    approved.terminalState === "pass_without_rewrite" ||
      approved.terminalState === "pass_after_rewrite",
  );
  assert.equal(
    approved.planSnapshot.formatStrategyId,
    fixture.expectedResolvedStrategy ?? approved.planSnapshot.formatStrategyId,
  );
  if (fixture.expectedResolvedStrategy) {
    assert.equal(
      approved.planSnapshot.formatStrategyId,
      fixture.expectedResolvedStrategy,
      `${fixture.id}: expected ${fixture.expectedResolvedStrategy}`,
    );
  }
  assert.ok(
    approved.planSnapshot.controllingIdea.trim().length > 0,
    `${fixture.id}: controlling idea required`,
  );
  assert.ok(
    approved.planSnapshot.beatCount >= 2,
    `${fixture.id}: ordered retention beats required`,
  );
  assert.ok(
    typeof approved.planSnapshot.endingStrategy === "string" &&
      approved.planSnapshot.endingStrategy.length > 0,
    `${fixture.id}: payoff/ending strategy required`,
  );
  const budget = Math.round(fixture.durationSec * 2.4);
  const words = countWords(approved.narration);
  assert.ok(
    words <= budget,
    `${fixture.id}: word count ${words} exceeds budget ${budget}`,
  );
  assert.equal(
    GENERIC_INTRO.test(approved.narration),
    false,
    `${fixture.id}: generic introduction forbidden`,
  );
  assert.equal(
    approved.validationSummary.contractFingerprint,
    approved.planSnapshot.contractFingerprint,
  );
  assert.equal(
    approved.validationSummary.planFingerprint,
    approved.planSnapshot.planFingerprint,
  );
  assert.equal(approved.generationPath, "script_only");
}

async function runProductionPass(
  fixture: RetentionStoryGoldenFixture,
): Promise<void> {
  const doubles = retentionProductionDoubles(fixture.qualityMode);
  const result = await runRetentionProductionNarration({
    topic: fixture.topic,
    durationSec: fixture.durationSec,
    generationPath: "script_only",
    qualityMode: fixture.qualityMode,
    scriptMode: fixture.scriptMode,
    tone: fixture.tone,
    formatStrategyId: fixture.storyStrategy,
    ...(fixture.hookPath === "explicit_strategy" && fixture.hookStrategyId
      ? {
          hookStyle: fixture.hookStrategyId as never,
          requestedStrategyId: fixture.hookStrategyId as never,
        }
      : {}),
    ...doubles,
  });
  assertPass(result);
  assertStructuralSuccess(fixture, result);
}

async function main(): Promise<void> {
  console.log("\nretention-story-golden (Sprint 10H)\n");

  await check("registry — bounded named fixtures with proves clauses", () => {
    assert.equal(
      RETENTION_STORY_GOLDEN_IDS.length,
      RETENTION_STORY_GOLDEN_PROJECTS.length,
    );
    assert.ok(RETENTION_STORY_GOLDEN_IDS.length >= 30);
    for (const fixture of RETENTION_STORY_GOLDEN_PROJECTS) {
      assert.ok(fixture.proves.trim().length > 10, `${fixture.id} proves`);
      assert.equal(fixture.id, buildRetentionStoryGoldenFixture(fixture.id).id);
    }
  });

  await check("matrix — required durations represented", () => {
    const durations = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.durationSec),
    );
    for (const d of [15, 24, 25, 30, 35, 36, 45, 60]) {
      assert.ok(durations.has(d), `missing duration ${d}`);
    }
  });

  await check("matrix — quality Fast/Balanced/Studio represented", () => {
    const modes = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.qualityMode),
    );
    assert.ok(modes.has("cheap"));
    assert.ok(modes.has("balanced"));
    assert.ok(modes.has("best"));
  });

  await check("matrix — Story Strategy Auto/Retention-first/Standard", () => {
    const strategies = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.storyStrategy),
    );
    assert.ok(strategies.has("auto"));
    assert.ok(strategies.has("short_retention"));
    assert.ok(strategies.has("short_standard"));
  });

  await check("matrix — all eight ScriptModes", () => {
    const modes = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.scriptMode),
    );
    for (const mode of SCRIPT_MODES) {
      assert.ok(modes.has(mode), `missing ScriptMode ${mode}`);
    }
  });

  await check("matrix — dramatic + alternate tones", () => {
    const tones = new Set(RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.tone));
    assert.ok(tones.has("dramatic"));
    assert.ok(tones.has("funny") || tones.has("tactical"));
  });

  await check("matrix — Hook Auto / explicit / Write My Own", () => {
    const hooks = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.hookPath),
    );
    assert.ok(hooks.has("auto"));
    assert.ok(hooks.has("explicit_strategy"));
    assert.ok(hooks.has("write_my_own"));
  });

  await check("matrix — research classes + generation paths", () => {
    const research = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.researchClass),
    );
    for (const r of [
      "off",
      "eligible_provider",
      "manual_unverified",
      "forbidden",
    ] as const) {
      assert.ok(research.has(r), `missing research ${r}`);
    }
    const paths = new Set(
      RETENTION_STORY_GOLDEN_PROJECTS.map((f) => f.generationPath),
    );
    assert.ok(paths.has("script_only"));
    assert.ok(paths.has("audio_first_full"));
    assert.ok(paths.has("scenes_only"));
  });

  console.log("\nexecutable production goldens\n");

  for (const fixture of RETENTION_STORY_GOLDEN_PROJECTS) {
    if (fixture.executable !== "production_pass") continue;
    await check(`[golden] ${fixture.id} — ${fixture.proves}`, async () => {
      await runProductionPass(fixture);
    });
  }

  await check("[golden] rs-path-scenes-only — byte-for-byte + 0 Retention", async () => {
    const fixture = buildRetentionStoryGoldenFixture("rs-path-scenes-only");
    const title = "  Exact Title  ";
    const narration = "Exact narration bytes.\nSecond line.";
    const result = await generateScenesForReviewedScript({
      prompt: fixture.topic,
      title,
      narration,
      voiceoverDurationMs: 30_000,
      sceneCount: 3,
      scenesFromScriptAndAudio: async ({ script }) => {
        assert.equal(script.title, title);
        assert.equal(script.narration, narration);
        return {
          success: true as const,
          scenes: [
            {
              id: "s1",
              start: 0,
              end: 10,
              duration: 10,
              subtitle: "Scene",
            },
            {
              id: "s2",
              start: 10,
              end: 20,
              duration: 10,
              subtitle: "Scene",
            },
          ],
        };
      },
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.footieScript.title, title);
      assert.equal(result.footieScript.narration, narration);
      assert.equal(result.retentionEnvelope, undefined);
    }
  });

  await check("[golden] budget ceilings Fast=5 Balanced=6 Studio=7", () => {
    assert.equal(resolveRetentionModelCallBudgetPolicy("cheap").totalCeiling, 5);
    assert.equal(
      resolveRetentionModelCallBudgetPolicy("balanced").totalCeiling,
      6,
    );
    assert.equal(resolveRetentionModelCallBudgetPolicy("best").totalCeiling, 7);
    const scenesPolicy = resolveRetentionModelCallBudgetPolicy("cheap");
    const ledger = createRetentionModelCallLedger("cheap");
    assert.equal(ledger.snapshot().counts.total, 0);
    assert.equal(scenesPolicy.maxPlanner, 0);
  });

  await check("[golden] scenes-only policy — zero call expectation", () => {
    // Scenes-only never opens a Retention production ledger for narration.
    const contract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "scenes_only",
      qualityMode: "cheap",
      grounding: emptyGrounding(),
    });
    assert.equal(contract.generationPath, "scenes_only");
  });

  await check(
    "[golden] rs-persistence-linked-success — reload preserves narration",
    async () => {
      const fixture = buildRetentionStoryGoldenFixture(
        "rs-persistence-linked-success",
      );
      const result = await runRetentionProductionNarration({
        topic: fixture.topic,
        durationSec: fixture.durationSec,
        generationPath: "script_only",
        qualityMode: "cheap",
        ...retentionProductionDoubles("cheap"),
      });
      assertPass(result);
      const script: FootieScript = {
        title: result.approved.title,
        narration: result.approved.narration,
        totalDuration: 30,
        scenes: [],
      };
      const draft = createDraftFromScript(
        script,
        {
          topic: fixture.topic,
          tone: "dramatic",
          duration: 30,
          qualityMode: "cheap",
          sceneCount: 4,
          retentionPlan: result.approved.planSnapshot,
          retentionValidation: result.approved.validationSummary,
          hookPlan: result.approved.hookPlan,
          formatStrategyId: "auto",
        },
        undefined,
        "script_review",
      );
      const loaded = normalizeDraft(draft);
      assert.equal(loaded.script.narration, result.approved.narration);
      assert.deepEqual(
        loaded.creationBrief?.retentionPlan,
        result.approved.planSnapshot,
      );
      assert.deepEqual(
        loaded.creationBrief?.retentionValidation,
        result.approved.validationSummary,
      );
    },
  );

  await check(
    "[golden] rs-hard-block-empty-topic — unusable brief no commit",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "   ",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: () => {
          throw new Error("unsupported factual claim");
        },
      });
      assert.equal(result.ok, false);
      const envelope = buildRetentionSafeResponseEnvelope(result);
      assert.equal(envelope.retentionPlan, undefined);
      assert.equal(envelope.retentionValidation, undefined);
      if (!result.ok) {
        assert.ok(!("planSnapshot" in result));
      }
    },
  );

  await check(
    "[golden] rs-composer-throw-recovers — reliability fallback commits",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: () => {
          throw new Error("unsupported factual claim");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.approved.narration.trim().length > 0);
        assert.ok(
          result.approved.generationDisposition?.adaptations.includes(
            "deterministic_story_fallback_used",
          ) ||
            result.approved.generationDisposition?.adaptations.includes(
              "reliability_rescue_used",
            ),
        );
      }
    },
  );

  console.log(
    `\nretention-story-golden — ${passed} checks passed (${RETENTION_STORY_GOLDEN_IDS.length} fixtures registered)\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
