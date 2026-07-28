/**
 * Draft asset planning persistence verification
 * (imported by creatorAssetPlanningCache.verify.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  normalizeDraft,
  serializeEditorStateForDraft,
  updateDraft,
} from "@/features/drafts";
import {
  DRAFT_ASSET_PLANNING_SNAPSHOT_MAX_BYTES,
  measureDraftPlanningSnapshotBytes,
  rehydrateAssetPlanningCacheFromDraft,
  resolveAssetPlanningSnapshotForDraftPersist,
} from "@/features/drafts/utils/draft-asset-planning-persistence.utils";
import {
  hasPlanningCache,
  readPlanningCache,
  readPlanningData,
  resetPlanningCachesForTests,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import {
  buildCreatorAssetPlanningFromAssetInput,
  buildCreatorAssetPlanningSnapshot,
  buildScriptHash,
  cacheCreatorAssetPlanning,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { runAssetIntelligence } from "@/features/asset-intelligence";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSISTENCE_UTILS_PATH = join(process.cwd(), "src/features/drafts/utils/draft-asset-planning-persistence.utils.ts");
const DRAFT_LOAD_UTILS_PATH = join(process.cwd(), "src/features/drafts/utils/draft-load.utils.ts");
const STORY_DOCUMENT_STORE_PATH = join(
  process.cwd(),
  "src/features/drafts/store/story-document.store.tsx",
);

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withEnvAsync(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function buildSampleScript(): FootieScript {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);

  return syncFootieScript({
    title: fixture.topic,
    narration: fixture.narration,
    totalDuration: 30,
    scenes: assetResult.sceneAssetPlans.map((plan, index) => ({
      id: plan.sceneId,
      subtitle: `Scene ${index + 1}`,
      narration: fixture.narration,
      duration: 5,
      start: index * 5,
      end: (index + 1) * 5,
    })),
  });
}

function buildSamplePlanning() {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  return buildCreatorAssetPlanningFromAssetInput(assetInput);
}

export async function runDraftAssetPlanningPersistenceTests(): Promise<void> {
  console.log("draft asset planning persistence");

  withEnv({}, () => {
    console.log("  ✓ old draft without assetPlanningSnapshot loads normally");
    const adapter = createMemoryDraftStorageAdapter();
    const script = buildSampleScript();
    const draft = createDraft({ script }, { adapter });

    assert.equal(draft.assetPlanningSnapshot, undefined);
    const loaded = getDraft(draft.id, { adapter });
    assert.ok(loaded);
    assert.equal(loaded!.assetPlanningSnapshot, undefined);
    assert.equal(loaded!.script.scenes.length, script.scenes.length);
  });

  await testAsync("draft save includes assetPlanningSnapshot when enabled", async () => {
    resetPlanningCachesForTests();
    const adapter = createMemoryDraftStorageAdapter();
    const script = buildSampleScript();
    const draft = createDraft({ script, pipelineStage: "editor_ready" }, { adapter });

    withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
      cacheCreatorAssetPlanning({
        storyId: draft.id,
        script,
        storyMode: "top_5",
        planning: buildSamplePlanning(),
      });
    });

    await withEnvAsync({ ASSET_INTELLIGENCE_ENABLED: "true" }, async () => {
      const snapshot = resolveAssetPlanningSnapshotForDraftPersist(draft.id);
      assert.ok(snapshot);

      const updated = updateDraft(
        draft.id,
        {
          script: serializeEditorStateForDraft(script),
          pipelineStage: "editor_ready",
          assetPlanningSnapshot: snapshot,
        },
        { adapter },
      );

      assert.ok(updated);
      assert.ok(updated!.assetPlanningSnapshot);
      assert.ok(updated!.assetPlanningSnapshot!.planning.recommendation);
      assert.ok(updated!.assetPlanningSnapshot!.planning.providerPlan);
      assert.ok(updated!.assetPlanningSnapshot!.planning.validationResult);
      assert.equal(typeof updated!.assetPlanningSnapshot!.planningVersion, "string");
      assert.equal(typeof updated!.assetPlanningSnapshot!.generatedAt, "string");
      assert.equal(typeof updated!.assetPlanningSnapshot!.scriptHash, "string");
    });
  });

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    console.log("  ✓ draft reload hydrates planning cache");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const snapshot = buildCreatorAssetPlanningSnapshot({
      script,
      storyMode: "top_5",
      planning: buildSamplePlanning(),
    });

    const draft = normalizeDraft({
      id: "draft-reload-hydrate",
      script,
      assetPlanningSnapshot: snapshot,
    });

    assert.equal(hasPlanningCache(draft.id), false);
    rehydrateAssetPlanningCacheFromDraft(draft);
    assert.equal(hasPlanningCache(draft.id), true);

    const planning = readPlanningData(draft.id, {
      scriptHash: buildScriptHash(script),
      sceneCount: script.scenes.length,
      storyMode: "top_5",
    });

    assert.ok(planning);
    assert.ok(planning!.recommendation.sceneRecommendations.length > 0);
  });

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    console.log("  ✓ stale snapshot after script change shows stale, not empty");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const snapshot = buildCreatorAssetPlanningSnapshot({
      script,
      storyMode: "top_5",
      planning: buildSamplePlanning(),
    });

    rehydrateAssetPlanningCacheFromDraft(
      normalizeDraft({
        id: "draft-stale-reload",
        script,
        assetPlanningSnapshot: snapshot,
      }),
    );

    const changedScript = {
      ...script,
      narration: `${script.narration} Updated ending.`,
    };

    const planning = readPlanningData("draft-stale-reload", {
      scriptHash: buildScriptHash(changedScript),
      sceneCount: changedScript.scenes.length,
      storyMode: "top_5",
    });

    assert.ok(planning);
    assert.equal(planning!.staleness?.isStale, true);
    assert.ok(planning!.recommendation.sceneRecommendations.length > 0);
  });

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    console.log("  ✓ oversized snapshot skipped safely");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const planning = buildSamplePlanning();
    const oversizedRecommendation = JSON.parse(
      JSON.stringify(planning.recommendation),
    ) as typeof planning.recommendation;
    if (oversizedRecommendation.sceneRecommendations[0]?.topRecommendation) {
      oversizedRecommendation.sceneRecommendations[0].topRecommendation.query =
        "x".repeat(DRAFT_ASSET_PLANNING_SNAPSHOT_MAX_BYTES);
    }

    cacheCreatorAssetPlanning({
      storyId: "draft-oversized",
      script,
      storyMode: "top_5",
      planning: {
        ...planning,
        recommendation: oversizedRecommendation,
      },
    });

    const snapshot = resolveAssetPlanningSnapshotForDraftPersist("draft-oversized");
    assert.equal(snapshot, undefined);
  });

  withEnv(
    { ASSET_INTELLIGENCE_ENABLED: undefined, NEXT_PUBLIC_ASSET_INTELLIGENCE_ENABLED: undefined },
    () => {
      console.log("  ✓ feature flag off does not persist snapshot");
      resetPlanningCachesForTests();
      const script = buildSampleScript();

      cacheCreatorAssetPlanning({
        storyId: "draft-flag-off",
        script,
        storyMode: "top_5",
        planning: buildSamplePlanning(),
      });

      const snapshot = resolveAssetPlanningSnapshotForDraftPersist("draft-flag-off");
      assert.equal(snapshot, undefined);
    },
  );

  withEnv(
    { ASSET_INTELLIGENCE_ENABLED: undefined, NEXT_PUBLIC_ASSET_INTELLIGENCE_ENABLED: undefined },
    () => {
      console.log("  ✓ feature flag off does not rehydrate snapshot");
      resetPlanningCachesForTests();
      const script = buildSampleScript();
      const snapshot = buildCreatorAssetPlanningSnapshot({
        script,
        storyMode: "top_5",
        planning: buildSamplePlanning(),
      });

      rehydrateAssetPlanningCacheFromDraft(
        normalizeDraft({
          id: "draft-flag-off-rehydrate",
          script,
          assetPlanningSnapshot: snapshot,
        }),
      );

      assert.equal(hasPlanningCache("draft-flag-off-rehydrate"), false);
    },
  );

  console.log("  ✓ no intelligence execution on draft load");
  const persistenceSource = readFileSync(PERSISTENCE_UTILS_PATH, "utf8");
  const draftLoadSource = readFileSync(DRAFT_LOAD_UTILS_PATH, "utf8");
  const storeSource = readFileSync(STORY_DOCUMENT_STORE_PATH, "utf8");

  const forbiddenPatterns = [
    /\brunAssetIntelligence\s*\(/,
    /\brunStudioIntelligence\s*\(/,
    /\bbuildRecommendationsFromAssetIntelligence\s*\(/,
    /\bbuildAssetProviderPlan\s*\(/,
    /\bvalidateAssetRecommendations\s*\(/,
    /\bbuildCreatorAssetPlanningFromAssetInput\s*\(/,
    /\bbuildCreatorAssetPlanningFromScenePlan\s*\(/,
  ];

  for (const source of [persistenceSource, draftLoadSource, storeSource]) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern);
    }
  }

  assert.match(persistenceSource, /hydrateCreatorAssetPlanningCache/);
  assert.match(storeSource, /rehydrateAssetPlanningCacheFromDraft/);

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    console.log("  ✓ persist keeps existing snapshot when cache empty");
    resetPlanningCachesForTests();
    const adapter = createMemoryDraftStorageAdapter();
    const script = buildSampleScript();
    const snapshot = buildCreatorAssetPlanningSnapshot({
      script,
      storyMode: "top_5",
      planning: buildSamplePlanning(),
    });

    const draft = createDraft({ script, pipelineStage: "editor_ready" }, { adapter });
    updateDraft(
      draft.id,
      { assetPlanningSnapshot: snapshot },
      { adapter },
    );

    const resolved = resolveAssetPlanningSnapshotForDraftPersist(draft.id);
    assert.equal(resolved, undefined);

    const stored = getDraft(draft.id, { adapter });
    assert.ok(stored?.assetPlanningSnapshot);
    assert.equal(
      measureDraftPlanningSnapshotBytes(stored!.assetPlanningSnapshot!),
      measureDraftPlanningSnapshotBytes(snapshot),
    );
  });

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    console.log("  ✓ rehydrated cache entry matches persisted metadata");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const snapshot = buildCreatorAssetPlanningSnapshot({
      script,
      storyMode: "top_5",
      planning: buildSamplePlanning(),
    });

    rehydrateAssetPlanningCacheFromDraft(
      normalizeDraft({
        id: "draft-metadata",
        script,
        assetPlanningSnapshot: snapshot,
      }),
    );

    const entry = readPlanningCache("draft-metadata");
    assert.ok(entry);
    assert.equal(entry!.scriptHash, snapshot.scriptHash);
    assert.equal(entry!.sceneCount, snapshot.sceneCount);
    assert.equal(entry!.storyMode, snapshot.storyMode);
  });
}
