/**
 * Asset attach foundation verification
 * (run: npm run test:asset-attach).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedAssetResult } from "@/features/asset-search/orchestrator";
import { createSceneImageFromUrl, getSceneImage } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import {
  attachNormalizedAssetToScene,
  buildAssetAttachMetadata,
  mapNormalizedAssetToAttribution,
} from "@/features/asset-attach";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ATTACH_ROOT = join(process.cwd(), "src/features/asset-attach");
const MANUAL_UPLOAD_PATH = join(
  process.cwd(),
  "src/features/editor/hooks/useSceneImageUpload.ts",
);

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function buildSampleAsset(partial: Partial<NormalizedAssetResult> = {}): NormalizedAssetResult {
  return {
    id: partial.id ?? "mock:sample-attach-1",
    providerId: partial.providerId ?? "mock",
    title: partial.title ?? "Football celebration",
    description: partial.description ?? "Sample normalized asset",
    previewUrl: partial.previewUrl ?? "https://mock.asset-search.local/preview/sample-1",
    thumbnailUrl: partial.thumbnailUrl ?? "https://mock.asset-search.local/thumb/sample-1",
    fullResolutionUrl: partial.fullResolutionUrl ?? "https://mock.asset-search.local/full/sample-1",
    width: partial.width ?? 1920,
    height: partial.height ?? 1080,
    orientation: partial.orientation ?? "landscape",
    tags: partial.tags ?? ["football"],
    license: partial.license ?? {
      licenseType: "platform",
      requiresAttribution: false,
      commercialUse: true,
      modificationAllowed: true,
      editorialOnly: false,
    },
    attribution: partial.attribution ?? {
      creatorName: "Mock Creator",
      creatorUrl: "https://mock.asset-search.local/creator",
      providerName: "Mock Asset Search",
      providerUrl: "https://mock.asset-search.local",
      requiredText: "Photo by Mock Creator on Mock Asset Search",
    },
    score: partial.score ?? 0.82,
    metadata: partial.metadata ?? { itemIndex: 0 },
  };
}

function buildSampleScript(): FootieScript {
  return {
    title: "Attach QA",
    narration: "Attach verification narration.",
    totalDuration: 6,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Scene one",
        image: createSceneImageFromUrl("blob:previous-scene-image"),
      },
      {
        id: "scene-2",
        start: 3,
        end: 6,
        duration: 3,
        subtitle: "Scene two",
      },
    ],
  };
}

function collectAttachSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectAttachSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("asset-attach foundation");

async function runAssetAttachTests() {
  test("maps attribution metadata from normalized asset", () => {
    const asset = buildSampleAsset();
    const attribution = mapNormalizedAssetToAttribution(asset);

    assert.equal(attribution.providerName, asset.attribution.providerName);
    assert.equal(attribution.providerUrl, asset.attribution.providerUrl);
    assert.equal(attribution.creatorName, asset.attribution.creatorName);
    assert.equal(attribution.creatorUrl, asset.attribution.creatorUrl);
    assert.equal(attribution.requiredText, asset.attribution.requiredText);
    assert.equal(attribution.licenseType, asset.license.licenseType);
    assert.equal(attribution.requiresAttribution, asset.license.requiresAttribution);
    assert.equal(attribution.commercialUse, asset.license.commercialUse);
    assert.equal(attribution.editorialOnly, asset.license.editorialOnly);
  });

  test("builds attach metadata with handoff and materialization fields", () => {
    const asset = buildSampleAsset();
    const handoff = {
      storyId: "story-attach-qa",
      sceneIndex: 1,
      recommendationQuery: "football celebration",
      semanticSlot: "hero",
      visualIntent: "energetic",
      rankedProviderIds: ["pexels", "mock"] as const,
      planningScriptHash: "hash-123",
    };

    const metadata = buildAssetAttachMetadata({
      asset,
      source: "asset_search",
      handoff,
      materialization: { strategy: "blob", persisted: true },
      attachedAt: "2026-06-20T12:00:00.000Z",
    });

    assert.equal(metadata.normalizedAssetId, asset.id);
    assert.equal(metadata.providerId, asset.providerId);
    assert.equal(metadata.title, asset.title);
    assert.equal(metadata.sourcePreviewUrl, asset.previewUrl);
    assert.equal(metadata.sourceFullResolutionUrl, asset.fullResolutionUrl);
    assert.equal(metadata.attachSource, "asset_search");
    assert.equal(metadata.attachedAt, "2026-06-20T12:00:00.000Z");
    assert.deepEqual(metadata.handoff, handoff);
    assert.equal(metadata.materialization.strategy, "blob");
    assert.equal(metadata.materialization.persisted, true);
    assert.equal(metadata.attribution.requiredText, asset.attribution.requiredText);
  });

  await testAsync("failed materialization returns error without script mutation", async () => {
    const script = buildSampleScript();
    const scriptBefore = JSON.stringify(script);
    const asset = buildSampleAsset();

    const result = await attachNormalizedAssetToScene(
      {
        script,
        sceneId: "scene-1",
        asset,
        source: "asset_search",
      },
      {
        materializeAssetUrl: async () => ({
          success: false,
          strategy: "blob",
          error: "mock materialization failed",
        }),
      },
    );

    assert.equal(result.success, false);
    assert.equal(result.error, "mock materialization failed");
    assert.equal(result.script, undefined);
    assert.equal(JSON.stringify(script), scriptBefore);
    assert.equal(getSceneImage(script.scenes[0]!)?.url, "blob:previous-scene-image");
  });

  await testAsync("successful attach updates correct scene with materialized URL", async () => {
    const script = buildSampleScript();
    const asset = buildSampleAsset();
    const materializedUrl = "blob:materialized-playable-url";

    const result = await attachNormalizedAssetToScene(
      {
        script,
        sceneId: "scene-1",
        asset,
        source: "asset_search",
        handoff: {
          storyId: "story-attach-qa",
          sceneIndex: 0,
          recommendationQuery: "football celebration",
        },
      },
      {
        materializeAssetUrl: async (input) => {
          assert.equal(input.sourceUrl, asset.previewUrl);
          return {
            success: true,
            playableUrl: materializedUrl,
            strategy: "blob",
            persisted: true,
          };
        },
      },
    );

    assert.equal(result.success, true);
    assert.ok(result.script);

    const updatedScene = result.script!.scenes.find((entry) => entry.id === "scene-1");
    assert.ok(updatedScene);
    assert.equal(getSceneImage(updatedScene)?.url, materializedUrl);
    assert.notEqual(getSceneImage(updatedScene)?.url, asset.previewUrl);
    assert.equal(getSceneImage(updatedScene)?.fitMode, "fit");
    assert.equal(getSceneImage(updatedScene)?.scale, 1);
  });

  await testAsync("assetAttachment metadata is stored on scene", async () => {
    const script = buildSampleScript();
    const asset = buildSampleAsset();

    const result = await attachNormalizedAssetToScene(
      {
        script,
        sceneId: "scene-2",
        asset,
        source: "asset_search",
      },
      {
        materializeAssetUrl: async () => ({
          success: true,
          playableUrl: "blob:scene-2-materialized",
          strategy: "blob",
          persisted: true,
        }),
      },
    );

    assert.equal(result.success, true);
    const updatedScene = result.script!.scenes.find((entry) => entry.id === "scene-2");
    assert.ok(updatedScene?.assetAttachment);
    assert.equal(updatedScene.assetAttachment.normalizedAssetId, asset.id);
    assert.equal(updatedScene.assetAttachment.attachSource, "asset_search");
    assert.equal(updatedScene.assetAttachment.sourcePreviewUrl, asset.previewUrl);
  });

  await testAsync("previous image and attach metadata are returned", async () => {
    const script = buildSampleScript();
    const previousAttachment = buildAssetAttachMetadata({
      asset: buildSampleAsset({ id: "mock:previous-attach" }),
      source: "manual_upload",
      materialization: { strategy: "blob", persisted: false },
      attachedAt: "2026-06-19T12:00:00.000Z",
    });
    script.scenes[0]!.assetAttachment = previousAttachment;

    const asset = buildSampleAsset({ id: "mock:next-attach" });
    const result = await attachNormalizedAssetToScene(
      {
        script,
        sceneId: "scene-1",
        asset,
        source: "asset_search",
      },
      {
        materializeAssetUrl: async () => ({
          success: true,
          playableUrl: "blob:replacement-image",
          strategy: "blob",
          persisted: true,
        }),
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.previousSceneImage?.url, "blob:previous-scene-image");
    assert.equal(result.previousAttachMetadata?.normalizedAssetId, "mock:previous-attach");
  });

  await testAsync("input NormalizedAssetResult is not mutated", async () => {
    const script = buildSampleScript();
    const asset = buildSampleAsset();
    const assetBefore = JSON.stringify(asset);

    await attachNormalizedAssetToScene(
      {
        script,
        sceneId: "scene-2",
        asset,
        source: "asset_search",
      },
      {
        materializeAssetUrl: async () => ({
          success: true,
          playableUrl: "blob:immutable-asset-check",
          strategy: "blob",
          persisted: true,
        }),
      },
    );

    assert.equal(JSON.stringify(asset), assetBefore);
  });

  test("asset-attach module has no provider/search/browser imports", () => {
    const sources = collectAttachSources(ATTACH_ROOT);
    assert.ok(sources.length >= 4);

    const forbidden = [
      /asset-search\/providers/,
      /runAssetSearchOrchestrator/,
      /asset-browser/,
      /search-assets/,
      /pexels/,
      /\/api\/assets\/materialize/,
    ];

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(
          source,
          pattern,
          `${filePath} must not reference ${pattern}`,
        );
      }
    }
  });

  test("manual upload flow files are untouched", () => {
    const manualUploadSource = readFileSync(MANUAL_UPLOAD_PATH, "utf8");
    assert.doesNotMatch(manualUploadSource, /asset-attach/);
    assert.doesNotMatch(manualUploadSource, /attachNormalizedAssetToScene/);
    assert.doesNotMatch(manualUploadSource, /assetAttachment/);
  });
}

void runAssetAttachTests()
  .then(() => {
    console.log("asset-attach foundation passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
