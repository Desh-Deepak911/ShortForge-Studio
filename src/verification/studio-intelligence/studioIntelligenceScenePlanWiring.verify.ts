/**
 * Studio Intelligence scene plan wiring verification
 * (run: npm run test:studio-intelligence-scene-plan-wiring).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isStudioIntelligenceScenePlanEnabled,
  tryGenerateScenesFromStudioIntelligence,
} from "@/features/story/services/studio-intelligence-scene-plan.utils";

import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
): void {
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

console.log("studio-intelligence-scene-plan-wiring");

test("env off + request true → dual gate disabled", () => {
  withEnv({ STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED: undefined }, () => {
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: true }), false);
  });

  withEnv({ STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED: "false" }, () => {
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: true }), false);
  });
});

test("env on + request false → dual gate disabled", () => {
  withEnv({ STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED: "true" }, () => {
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: false }), false);
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: undefined }), false);
  });
});

test("env on + request true → dual gate enabled", () => {
  withEnv({ STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED: "true" }, () => {
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: true }), true);
  });
});

test("scene planner branches before OpenAI when dual gate enabled", () => {
  const scenePlanner = readSrc("src/features/story/services/scene-planning.service.ts");
  const functionStart = scenePlanner.indexOf("export async function generateScenesFromScriptAndAudio");
  const functionBody = scenePlanner.slice(functionStart);
  const branchIndex = functionBody.indexOf("isStudioIntelligenceScenePlanEnabled");
  const openAiIndex = functionBody.indexOf("buildScenePlanPrompt");

  assert.ok(branchIndex >= 0);
  assert.ok(openAiIndex >= 0);
  assert.ok(branchIndex < openAiIndex);
  assert.match(functionBody, /tryGenerateScenesFromStudioIntelligence/);
  assert.match(functionBody, /logStudioIntelligenceScenePlanDebug\("falling back to AI scene planner"/);
});

test("scene plan utils wires density adapter before blueprint adapter", () => {
  const siService = readSrc("src/features/story/services/studio-intelligence-scene-plan.utils.ts");
  const densityIndex = siService.indexOf("adaptSceneDensity(");
  const adapterIndex = siService.indexOf("mapBlueprintsToScenes(");

  assert.ok(densityIndex >= 0);
  assert.ok(adapterIndex >= 0);
  assert.ok(densityIndex < adapterIndex);
  assert.match(siService, /density\.collection/);
});

test("SI success returns production-shaped scenes when scene count matches", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const matchingSceneCount = 6;

  const result = tryGenerateScenesFromStudioIntelligence({
    topic: fixture.input.topic,
    narration: fixture.input.narration,
    voiceoverDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
    sceneCount: matchingSceneCount,
    scriptMode: fixture.input.mode,
  });

  assert.equal(result.success, true, result.success ? undefined : result.reason);
  if (!result.success) {
    return;
  }

  assert.equal(result.scenes.length, matchingSceneCount);
  assert.equal(result.diagnostics.densityAdapterSuccess, true);
  assert.equal(result.diagnostics.adaptedBlueprintCount, matchingSceneCount);
  assert.ok(result.scenes.every((scene) => scene.subtitle.trim().length > 0));
  assert.ok(result.scenes.every((scene) => !scene.image?.url));
});

test("scene count mismatch → SI failure with fallback reason", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === "Player biography");
  assert.ok(fixture);

  const result = tryGenerateScenesFromStudioIntelligence({
    topic: fixture.input.topic,
    narration: fixture.input.narration,
    voiceoverDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
    sceneCount: 3,
    scriptMode: fixture.input.mode,
  });

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  assert.match(result.reason, /scene density adapter failed|unable to adapt/);
});

test("scriptMode is passed through scenes-only route and reviewed script service", () => {
  const route = readSrc("src/app/api/generate-script/route.ts");
  const reviewedScript = readSrc("src/features/story/services/audio-first-generation.service.ts");
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const scenePlanner = readSrc("src/features/story/services/scene-planning.service.ts");

  assert.match(route, /scriptMode: params\.scriptMode/);
  assert.match(route, /useStudioIntelligenceScenes: params\.useStudioIntelligenceScenes === true/);
  assert.match(reviewedScript, /scriptMode: input\.scriptMode/);
  assert.match(reviewedScript, /useStudioIntelligenceScenes: input\.useStudioIntelligenceScenes/);
  assert.match(reviewFlow, /scriptMode,/);
  assert.match(scenePlanner, /scriptMode: input\.scriptMode/);
});

test("response shape unchanged — no SI metadata on GenerateScriptResponse", () => {
  const responseType = readSrc("src/types/footiebitz.ts");
  const responseBlock = responseType.slice(responseType.indexOf("export interface GenerateScriptResponse"));
  const route = readSrc("src/app/api/generate-script/route.ts");

  assert.doesNotMatch(responseBlock, /useStudioIntelligenceScenes/);
  assert.doesNotMatch(responseBlock, /StudioIntelligenceScenePlanDiagnostics/);
  assert.match(responseBlock, /scenePlanDevDebug\?: ScenePlanDevDebug/);
  assert.match(route, /data: buildStoryResponse\(scenesResult\.footieScript\)/);
  assert.doesNotMatch(route, /materializer|BlueprintMappedScene|StudioIntelligenceResult/);
});

test("client defaults useStudioIntelligenceScenes off — omitted unless toggle enabled", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const devUtils = readSrc("src/features/story/utils/studio-intelligence-scene-plan-dev.utils.ts");

  assert.match(reviewFlow, /useState\(false\)/);
  assert.match(reviewFlow, /useStudioIntelligenceScenes \? \{ useStudioIntelligenceScenes: true \}/);
  assert.doesNotMatch(reviewFlow, /useStudioIntelligenceScenes:\s*true,/);
  assert.match(reviewFlow, /isStudioIntelligenceScenePlanToggleVisible/);
  assert.match(devUtils, /NODE_ENV !== "production"/);
  assert.match(devUtils, /NEXT_PUBLIC_STUDIO_INTELLIGENCE_SCENE_PLAN_TOGGLE/);
});

test("review storyboard toggle is hidden unless dev/staging visibility rules pass", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const reviewInspector = readSrc("src/features/create/components/ReviewInspector.tsx");

  assert.match(reviewFlow, /showStudioIntelligenceScenePlanToggle/);
  assert.match(reviewInspector, /Use Studio Intelligence scene planning/);
  assert.match(reviewInspector, /showStudioIntelligenceScenePlanToggle \?/);
});

test("dev debug badge surfaces SI source without raw diagnostics", () => {
  const badge = readSrc("src/features/create/components/ScenePlanDevBadge.tsx");
  const reviewInspector = readSrc("src/features/create/components/ReviewInspector.tsx");
  const responseType = readSrc("src/types/footiebitz.ts");

  assert.match(badge, /Studio Intelligence used/);
  assert.match(badge, /AI fallback used/);
  assert.match(badge, /Scene density adapted/);
  assert.match(badge, /isScenePlanDevDebugEnabled/);
  assert.match(reviewInspector, /ScenePlanDevBadge/);
  assert.match(responseType, /scenePlanDevDebug\?: ScenePlanDevDebug/);
  assert.doesNotMatch(responseType, /StudioIntelligenceScenePlanDiagnostics/);
});

test("env off with request flag still disables SI path before OpenAI fallback", () => {
  withEnv({ STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED: undefined }, () => {
    assert.equal(isStudioIntelligenceScenePlanEnabled({ requestFlag: true }), false);
  });

  const scenePlanner = readSrc("src/features/story/services/scene-planning.service.ts");
  assert.match(scenePlanner, /scenePlanMeta: \{\s*source: "ai_fallback"/s);
});

test("SI service does not re-split narration after materializer", () => {
  const scenePlanner = readSrc("src/features/story/services/scene-planning.service.ts");
  const siService = readSrc("src/features/story/services/studio-intelligence-scene-plan.utils.ts");
  const generateStart = scenePlanner.indexOf("export async function generateScenesFromScriptAndAudio");
  const generateEnd = scenePlanner.indexOf("async function requestAiScenePlan");
  const generateBody = scenePlanner.slice(generateStart, generateEnd);

  assert.match(generateBody, /studioIntelligenceResult\.success/);
  assert.match(generateBody, /buildStudioIntelligenceScenePlanMeta/);
  assert.doesNotMatch(generateBody, /attachSceneNarrationFromScript/);
  assert.doesNotMatch(siService, /attachSceneNarrationFromScript/);
});

test("full audio-first path does not pass Studio Intelligence scene flags", () => {
  const reviewedScript = readSrc("src/features/story/services/audio-first-generation.service.ts");
  const audioFirstBlock = reviewedScript.slice(
    reviewedScript.indexOf("export async function generateAudioFirstStory"),
    reviewedScript.indexOf("export async function applyAudioFirstTiming"),
  );

  assert.doesNotMatch(audioFirstBlock, /useStudioIntelligenceScenes/);
  assert.doesNotMatch(audioFirstBlock, /scriptMode: input\.scriptMode/);
});

console.log("All Studio Intelligence scene plan wiring checks passed.");
