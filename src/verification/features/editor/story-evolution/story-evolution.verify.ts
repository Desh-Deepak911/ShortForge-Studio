/**
 * Story evolution verification
 * (run: npm run test:story-evolution).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readPlanningCache,
  readPlanningData,
  resetPlanningCachesForTests,
  updatePlanningCache,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import {
  buildCreatorAssetPlanningCacheEntry,
  buildCreatorAssetPlanningFromAssetInput,
  buildScriptHash,
  cacheCreatorAssetPlanning,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { buildPlanningStaleBadge } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.staleness.utils";
import {
  buildIdentityMismatchStaleness,
  detectSceneIdentityIndexFallbacks,
  resolvePlanningItemBySceneIdentity,
  resolveSceneRecommendationByIdentity,
} from "@/features/editor/creator-asset-planning/creator-asset-scene-identity.utils";
import type { CreatorAssetStudioPlanningData } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";
import {
  selectSceneRecommendation,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.selectors";
import {
  applyStoryEvolutionOnEdit,
  computePlanningStaleness,
  detectStoryChanges,
  sceneIdsPreservedOnReorder,
  SCENE_IDENTITY_MISMATCH_REASON,
} from "@/features/editor/story-evolution";
import { reorderTimelineScene } from "@/features/timeline-editor/timeline-editor.commands";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { duplicateScene } from "@/features/story/utils/timeline.utils";
import { applySceneUpdate, syncFootieScript } from "@/lib/utils/voiceover";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFT_EDITOR_FLOW_PATH = join(process.cwd(), "src/features/drafts/components/DraftEditorFlow.tsx");
const CREATOR_ASSET_STUDIO_PATH = join(
  process.cwd(),
  "src/features/editor/components/creator-asset-studio/CreatorAssetStudio.tsx",
);

const CREATOR_ASSET_SELECTORS_PATH = join(
  process.cwd(),
  "src/features/editor/components/creator-asset-studio/creator-asset-studio.selectors.ts",
);

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function buildScene(partial: Partial<FootieScene> & Pick<FootieScene, "id">): FootieScene {
  const { id, ...rest } = partial;
  return {
    start: rest.start ?? 0,
    end: rest.end ?? 5,
    duration: rest.duration ?? 5,
    subtitle: rest.subtitle ?? "Scene subtitle",
    sceneType: rest.sceneType ?? "context",
    narration: rest.narration ?? "Scene narration excerpt.",
    ...rest,
    id,
  };
}

function buildScript(scenes: FootieScene[], partial: Partial<FootieScript> = {}): FootieScript {
  return syncFootieScript({
    title: partial.title ?? "Test story",
    narration: partial.narration ?? "Full story narration for testing.",
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    scenes,
    timelineItems: partial.timelineItems,
    voiceoverUrl: partial.voiceoverUrl,
    voiceoverDurationMs: partial.voiceoverDurationMs,
  });
}

function seedPlanningCache(storyId: string, script: FootieScript) {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const planning = buildCreatorAssetPlanningFromAssetInput(buildAssetIntelligenceFixtureInput(fixture));
  const entry = buildCreatorAssetPlanningCacheEntry({
    storyId,
    script,
    storyMode: "top_5",
    planning,
  });
  updatePlanningCache(storyId, entry);
  return entry;
}

function buildIdentityMockPlanning(
  scenes: Array<{ sceneId: string; sceneIndex: number; query: string }>,
): CreatorAssetStudioPlanningData {
  const generatedAt = new Date().toISOString();

  return {
    recommendation: {
      recommendationVersion: "0.1.0",
      sceneRecommendations: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        alternatives: [],
        rejectedCandidates: [],
        reasoning: [],
        confidence: "high",
        topRecommendation: {
          rank: 1,
          query: scene.query,
          entityIds: [],
          entityNames: [],
          entityTypes: [],
          score: 0.9,
          confidence: "high",
          reasons: [],
          reasonLabels: [],
          tags: [],
        },
      })),
      globalRecommendations: [],
      unusedEntities: [],
      coverageScore: 1,
      confidenceScore: 1,
      diagnostics: {
        scenesWithRecommendation: scenes.length,
        scenesWithoutRecommendation: 0,
        duplicateTopQueryCount: 0,
        averageScore: 0.9,
        genericRejectedCount: 0,
        diversityAdjustments: 0,
        entityReusePenaltyCount: 0,
        warnings: [],
      },
      generatedAt,
    },
    providerPlan: {
      version: "0.1.0",
      sceneResults: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        query: scene.query,
        rankedProviders: [],
        planningOnly: true,
      })),
      diagnostics: {
        providerCoverage: 1,
        recommendedProviderCounts: {},
        unsupportedRequests: [],
        providerReasoning: [],
      },
      generatedAt,
    },
    validationResult: {
      validatorVersion: "0.1.0",
      validationScore: 1,
      entityCoverageScore: 1,
      providerCoverageScore: 1,
      visualDiversityScore: 1,
      recommendationQualityScore: 1,
      providerQualityScore: 1,
      warnings: [],
      repairSuggestions: [],
      repairCandidates: [],
      ruleResults: [],
      diagnostics: {
        validatorVersion: "0.1.0",
        validationRulesExecuted: [],
        warningsByType: {},
        repairSuggestionCount: 0,
      },
      validatedAt: generatedAt,
    },
  };
}

function hasChangeType(events: ReturnType<typeof detectStoryChanges>, type: string): boolean {
  return events.some((event) => event.type === type);
}

console.log("storyEvolution");

test("reorder detection", () => {
  const baseScenes = [
    buildScene({ id: "1", subtitle: "Intro" }),
    buildScene({ id: "2", subtitle: "Middle" }),
    buildScene({ id: "3", subtitle: "Ending", sceneType: "ending" }),
  ];
  const prev = buildScript(baseScenes);
  const reorderResult = reorderTimelineScene(prev, "3", 0);
  assert.ok(reorderResult);
  const reordered = reorderResult.script;

  const events = detectStoryChanges(prev, reordered);
  assert.ok(hasChangeType(events, "scene.reorder"));
  assert.ok(sceneIdsPreservedOnReorder(prev, reordered));
});

test("subtitle-only edit", () => {
  const scenes = [
    buildScene({ id: "1", subtitleText: "Original subtitle" }),
    buildScene({ id: "2" }),
  ];
  const prev = buildScript(scenes);
  const next = applySceneUpdate(prev, "1", { subtitleText: "Updated subtitle" });

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.subtitle"));
  assert.equal(hasChangeType(events, "scene.reorder"), false);
});

test("add scene", () => {
  const prev = buildScript([
    buildScene({ id: "1" }),
    buildScene({ id: "2" }),
  ]);
  const next = buildScript([
    ...prev.scenes,
    buildScene({ id: "new-scene", subtitle: "Add subtitle..." }),
  ]);

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.add"));
});

test("delete scene", () => {
  const prev = buildScript([
    buildScene({ id: "1" }),
    buildScene({ id: "2" }),
    buildScene({ id: "3" }),
  ]);
  const next = buildScript(prev.scenes.filter((scene) => scene.id !== "2"));

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.delete"));
});

test("narration change", () => {
  const prev = buildScript([buildScene({ id: "1" }), buildScene({ id: "2" })]);
  const next = buildScript(prev.scenes, {
    narration: `${prev.narration} Updated ending.`,
  });

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "narration.global"));
});

test("duration change", () => {
  const prev = buildScript([buildScene({ id: "1", duration: 5 }), buildScene({ id: "2", duration: 5 })]);
  const next = applySceneUpdate(prev, "1", { duration: 8, durationMs: 8000, durationSource: "manual" });

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.duration"));
});

test("image change does not create asset planning staleness", () => {
  const prev = buildScript([
    buildScene({
      id: "1",
      image: { url: "blob:a", scale: 1, x: 0, y: 0 },
    }),
  ]);
  const next = applySceneUpdate(prev, "1", {
    image: { url: "blob:b", scale: 1, x: 0, y: 0 },
  });

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.image"));

  const cachedEntry = seedPlanningCache("story-image", prev);
  const staleness = computePlanningStaleness(events, cachedEntry, next);
  assert.equal(staleness.isStale, false);
  assert.equal(staleness.score, 0);
});

test("motion and transition changes do not create asset planning staleness", () => {
  const prev = buildScript([
    buildScene({
      id: "1",
      image: {
        url: "blob:a",
        scale: 1,
        x: 0,
        y: 0,
        imageMotion: { type: "none", intensity: "subtle" },
      },
    }),
    buildScene({ id: "2" }),
  ]);
  const next = applySceneUpdate(prev, "1", {
    image: {
      url: "blob:a",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "slow-zoom-in", intensity: "medium" },
    },
  });

  const motionEvents = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(motionEvents, "scene.motion"));
  const motionStaleness = computePlanningStaleness(
    motionEvents,
    seedPlanningCache("story-motion", prev),
    next,
  );
  assert.equal(motionStaleness.isStale, false);

  // Canonical media.motion edits must also emit scene.motion (Sprint 5 write path).
  const canonicalPrev = buildScript([
    buildScene({
      id: "1",
      media: {
        type: "image",
        url: "blob:a",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        motion: {
          version: 1,
          enabled: false,
          presetId: "static",
          intensity: 0,
        },
      },
    }),
  ]);
  const canonicalNext = applySceneUpdate(canonicalPrev, "1", {
    media: {
      type: "image",
      url: "blob:a",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
        easing: "ease-in-out",
      },
    },
  });
  const canonicalEvents = detectStoryChanges(canonicalPrev, canonicalNext);
  assert.ok(hasChangeType(canonicalEvents, "scene.motion"));

  const withTransition = syncFootieScript({
    ...prev,
    timelineItems: (prev.timelineItems ?? []).map((item) =>
      item.type === "transition"
        ? { ...item, effect: "fade" as const, durationMs: 700 }
        : item,
    ),
  });
  const transitionEvents = detectStoryChanges(prev, withTransition);
  assert.ok(hasChangeType(transitionEvents, "transition"));
  const transitionStaleness = computePlanningStaleness(
    transitionEvents,
    seedPlanningCache("story-transition", prev),
    withTransition,
  );
  assert.equal(transitionStaleness.isStale, false);
});

test("scene ID preservation on reorder", () => {
  const prev = buildScript([
    buildScene({ id: "alpha" }),
    buildScene({ id: "beta" }),
    buildScene({ id: "gamma" }),
  ]);
  const reorderResult = reorderTimelineScene(prev, "gamma", 0);
  assert.ok(reorderResult);
  const next = reorderResult.script;

  assert.ok(sceneIdsPreservedOnReorder(prev, next));
  assert.deepEqual(
    prev.scenes.map((scene) => scene.id).sort(),
    next.scenes.map((scene) => scene.id).sort(),
  );
});

test("planning cache can store staleness metadata", () => {
  resetPlanningCachesForTests();
  const storyId = "story-staleness";
  const prev = buildScript([buildScene({ id: "1" }), buildScene({ id: "2" })]);
  seedPlanningCache(storyId, prev);

  const next = applySceneUpdate(prev, "1", { subtitle: "Updated caption" });
  applyStoryEvolutionOnEdit({ storyId, prevScript: prev, nextScript: next });

  const cached = readPlanningCache(storyId);
  assert.ok(cached?.staleness);
  assert.equal(cached!.staleness!.isStale, true);
  assert.ok(cached!.staleness!.score >= 0.3);
  assert.ok(cached!.staleness!.reasons.includes("scene.caption"));
});

test("duplicate scene detection", () => {
  const source = buildScene({ id: "1", subtitle: "Shared beat", sceneType: "match" });
  const prev = buildScript([source, buildScene({ id: "2" })]);
  const duplicated = duplicateScene(source);
  const next = buildScript([prev.scenes[0], duplicated, prev.scenes[1]]);

  const events = detectStoryChanges(prev, next);
  assert.ok(hasChangeType(events, "scene.duplicate"));
});

test("editor wiring detects changes without intelligence execution", () => {
  const draftEditorFlow = readFileSync(DRAFT_EDITOR_FLOW_PATH, "utf8");
  const creatorAssetStudio = readFileSync(CREATOR_ASSET_STUDIO_PATH, "utf8");

  assert.match(draftEditorFlow, /applyStoryEvolutionOnEdit/);
  assert.doesNotMatch(creatorAssetStudio, /\brunStudioIntelligence\s*\(/);
  assert.doesNotMatch(creatorAssetStudio, /\brunAssetIntelligence\s*\(/);
  assert.doesNotMatch(draftEditorFlow, /\brunStudioIntelligence\s*\(/);
  assert.doesNotMatch(draftEditorFlow, /\brunAssetIntelligence\s*\(/);
});

test("hash drift contributes to staleness when metadata changes", () => {
  const prev = buildScript([buildScene({ id: "1", duration: 5 }), buildScene({ id: "2", duration: 5 })]);
  const cachedEntry = seedPlanningCache("story-hash", prev);
  const next = buildScript([
    buildScene({ id: "1", duration: 8 }),
    buildScene({ id: "2", duration: 5 }),
  ]);

  const events = detectStoryChanges(prev, next);
  const staleness = computePlanningStaleness(events, cachedEntry, next);
  assert.equal(staleness.isStale, true);
  assert.notEqual(staleness.lastPlanningHash, staleness.currentScriptHash);
  assert.equal(staleness.currentScriptHash, buildScriptHash(next));
});

test("reorder preserves recommendation by sceneId", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "alpha", sceneIndex: 0, query: "query-alpha" },
    { sceneId: "beta", sceneIndex: 1, query: "query-beta" },
    { sceneId: "gamma", sceneIndex: 2, query: "query-gamma" },
  ]);

  const prev = buildScript([
    buildScene({ id: "alpha", subtitle: "Alpha" }),
    buildScene({ id: "beta", subtitle: "Beta" }),
    buildScene({ id: "gamma", subtitle: "Gamma" }),
  ]);
  reorderTimelineScene(prev, "gamma", 0);

  const recommendation = selectSceneRecommendation(planning, 0, "gamma");
  assert.equal(recommendation?.topRecommendation?.query, "query-gamma");
  assert.notEqual(recommendation?.topRecommendation?.query, "query-alpha");

  const identity = resolveSceneRecommendationByIdentity(planning, "gamma", 0);
  assert.equal(identity.context.lookupMethod, "scene_id");
  assert.equal(identity.context.usedIndexFallback, false);
});

test("duplicate keeps original recommendation by sceneId", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "alpha", sceneIndex: 0, query: "query-alpha" },
    { sceneId: "beta", sceneIndex: 1, query: "query-beta" },
  ]);

  const beta = buildScene({ id: "beta", subtitle: "Beta beat" });
  const duplicated = duplicateScene(beta);
  buildScript([
    buildScene({ id: "alpha", subtitle: "Alpha" }),
    beta,
    duplicated,
  ]);

  const original = selectSceneRecommendation(planning, 1, "beta");
  assert.equal(original?.topRecommendation?.query, "query-beta");

  const copy = selectSceneRecommendation(planning, 2, duplicated.id);
  assert.equal(copy, undefined);
});

test("delete scene returns null recommendation for removed sceneId", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "alpha", sceneIndex: 0, query: "query-alpha" },
    { sceneId: "beta", sceneIndex: 1, query: "query-beta" },
  ]);

  const removed = resolveSceneRecommendationByIdentity(planning, "gamma", 99);
  assert.equal(removed.value, null);
  assert.equal(removed.context.lookupMethod, "none");

  const remaining = selectSceneRecommendation(planning, 1, "beta");
  assert.equal(remaining?.topRecommendation?.query, "query-beta");
});

test("insert buffer scene returns null recommendation", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "alpha", sceneIndex: 0, query: "query-alpha" },
    { sceneId: "beta", sceneIndex: 1, query: "query-beta" },
  ]);

  const buffer = buildScene({ id: "buffer", subtitle: "Add subtitle..." });
  const recommendation = selectSceneRecommendation(planning, 2, buffer.id);
  assert.equal(recommendation, undefined);
});

test("index fallback marks scene_identity_mismatch staleness", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "alpha", sceneIndex: 0, query: "query-alpha" },
    { sceneId: "beta", sceneIndex: 1, query: "query-beta" },
  ]);

  const script = buildScript([
    buildScene({ id: "buffer", subtitle: "Add subtitle..." }),
    buildScene({ id: "beta", subtitle: "Beta" }),
  ]);

  const resolved = resolveSceneRecommendationByIdentity(planning, "buffer", 0);
  assert.equal(resolved.context.usedIndexFallback, true);
  assert.equal(resolved.value?.sceneId, "alpha");

  const fallbacks = detectSceneIdentityIndexFallbacks(script, planning);
  assert.ok(fallbacks.length > 0);

  const staleness = buildIdentityMismatchStaleness(undefined, true);
  assert.equal(staleness.isStale, true);
  assert.ok(staleness.score >= 0.6);
  assert.ok(staleness.reasons.includes(SCENE_IDENTITY_MISMATCH_REASON));
  assert.ok(staleness.affectedScopes.includes("timeline"));
});

test("duplicate planning sceneIds prefer first exact match", () => {
  const planning = buildIdentityMockPlanning([
    { sceneId: "dup-id", sceneIndex: 0, query: "query-first" },
    { sceneId: "dup-id", sceneIndex: 1, query: "query-second" },
  ]);

  const match = resolvePlanningItemBySceneIdentity(
    planning.recommendation.sceneRecommendations,
    "dup-id",
    1,
  );

  assert.equal(match.value?.topRecommendation?.query, "query-first");
  assert.equal(match.context.lookupMethod, "scene_id");
});

test("selectors remain pure without cache mutation", () => {
  const selectorsSource = readFileSync(CREATOR_ASSET_SELECTORS_PATH, "utf8");

  assert.doesNotMatch(selectorsSource, /\bupdatePlanningCache\b/);
  assert.doesNotMatch(selectorsSource, /\bupdatePlanningCacheStaleness\b/);
  assert.doesNotMatch(selectorsSource, /\binvalidatePlanningCache\b/);
  assert.doesNotMatch(selectorsSource, /\brunAssetIntelligence\b/);
  assert.doesNotMatch(selectorsSource, /\brunStudioIntelligence\b/);
});

test("soft read keeps stale planning visible after metadata mismatch", () => {
  resetPlanningCachesForTests();
  const prev = buildScript([buildScene({ id: "1" }), buildScene({ id: "2" })]);
  cacheCreatorAssetPlanning({
    storyId: "evolution-soft-read",
    script: prev,
    storyMode: "top_5",
    planning: buildIdentityMockPlanning([
      { sceneId: "1", sceneIndex: 0, query: "query-1" },
      { sceneId: "2", sceneIndex: 1, query: "query-2" },
    ]),
  });

  const next = buildScript([
    buildScene({ id: "1" }),
    buildScene({ id: "2" }),
    buildScene({ id: "3", subtitle: "Add subtitle..." }),
  ]);

  applyStoryEvolutionOnEdit({ storyId: "evolution-soft-read", prevScript: prev, nextScript: next });

  const softRead = readPlanningData("evolution-soft-read", {
    scriptHash: buildScriptHash(next),
    sceneCount: next.scenes.length,
    storyMode: "top_5",
  });

  assert.ok(softRead);
  assert.ok(softRead!.staleness?.isStale);
  assert.equal(buildPlanningStaleBadge(softRead!.staleness)?.level, "full");
});

test("strict read still returns null on metadata mismatch", () => {
  resetPlanningCachesForTests();
  const prev = buildScript([buildScene({ id: "1" })]);
  cacheCreatorAssetPlanning({
    storyId: "evolution-strict-read",
    script: prev,
    storyMode: "top_5",
    planning: buildIdentityMockPlanning([{ sceneId: "1", sceneIndex: 0, query: "query-1" }]),
  });

  const next = buildScript([buildScene({ id: "1" }), buildScene({ id: "2" })]);

  assert.equal(
    readPlanningData(
      "evolution-strict-read",
      {
        scriptHash: buildScriptHash(next),
        sceneCount: next.scenes.length,
        storyMode: "top_5",
      },
      { mode: "strict" },
    ),
    null,
  );
});

console.log("All story evolution checks passed.");
