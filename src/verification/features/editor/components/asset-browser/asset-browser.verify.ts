/**
 * Unified asset browser verification
 * (run: npm run test:asset-browser).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedAssetResult } from "@/features/asset-search/orchestrator";
import { getSceneImage } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import { mapNormalizedAssetToAttribution } from "@/features/asset-attach";
import {
  applyAssetBrowserFilters,
  assertNoProviderPayloadLeak,
  attachBrowserAssetToScene,
  buildAssetBrowserInitialSearchContext,
  canAttachFromAssetBrowser,
  canHandoffToAssetBrowser,
  createAssetBrowserDebounce,
  DEFAULT_ASSET_BROWSER_FILTERS,
  isAssetBrowserVisible,
  resolveDebouncedQuery,
  resolveEmptyStateKind,
  sortAssetBrowserResults,
} from "@/features/editor/components/asset-browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROWSER_ROOT = join(process.cwd(), "src/features/editor/components/asset-browser");
const CREATOR_ASSET_STUDIO_PATH = join(
  process.cwd(),
  "src/features/editor/components/creator-asset-studio/CreatorAssetStudio.tsx",
);
const CREATOR_SEARCH_ASSETS_CTA_PATH = join(
  process.cwd(),
  "src/features/editor/components/creator-asset-studio/CreatorAssetSearchAssetsCta.tsx",
);
const MANUAL_UPLOAD_PATH = join(process.cwd(), "src/features/editor/hooks/useSceneImageUpload.ts");
const ASSET_BROWSER_DETAILS_PATH = join(process.cwd(), "src/features/editor/components/asset-browser/AssetBrowserDetails.tsx");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function buildSampleScript(): FootieScript {
  return {
    title: "Browser Attach QA",
    narration: "Browser attach verification narration.",
    totalDuration: 6,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Scene one",
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

function buildHandoffContexts(sceneId = "scene-1", sceneIndex = 0) {
  const initialSearchContext = {
    query: "Lionel Messi celebration",
    sceneId,
    sceneIndex,
    visualIntent: "match_action",
    semanticSlot: "climax",
    rankedProviderIds: ["pexels", "mock"] as const,
  };

  const searchContext = {
    storyId: "story-browser-attach",
    sceneId,
    sceneIndex,
    recommendation: {
      sceneId,
      sceneIndex,
      confidence: "high" as const,
      reasoning: [],
      topRecommendation: {
        query: "Lionel Messi celebration",
        entityIds: [],
        entityNames: [],
        entityTypes: [],
        score: 0.9,
        confidence: "high" as const,
        reasons: [],
        reasonLabels: [],
        tags: [],
        rank: 1,
      },
      alternatives: [],
    },
    providerResult: {
      sceneId,
      sceneIndex,
      query: "Lionel Messi celebration",
      rankedProviders: [],
    },
  };

  return { initialSearchContext, searchContext };
}

function buildSampleAsset(partial: Partial<NormalizedAssetResult> = {}): NormalizedAssetResult {
  return {
    id: partial.id ?? "mock:sample-1",
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

function collectBrowserSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectBrowserSources(fullPath));
      continue;
    }

    if ((fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) && !fullPath.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function runAssetBrowserTests(): Promise<void> {
  console.log("assetBrowser");

  test("renders normalized assets via filter pipeline", () => {
    const assets = [
      buildSampleAsset({ id: "mock:a", score: 0.9, providerId: "mock" }),
      buildSampleAsset({
        id: "pexels:b",
        providerId: "pexels",
        score: 0.7,
        orientation: "portrait",
        license: {
          licenseType: "commercial",
          requiresAttribution: true,
          commercialUse: true,
          modificationAllowed: true,
          editorialOnly: false,
        },
      }),
    ];

    const filtered = applyAssetBrowserFilters(assets, {
      ...DEFAULT_ASSET_BROWSER_FILTERS,
      providerId: "pexels",
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.providerId, "pexels");
  });

  test("provider independent filtering", () => {
    const assets = [
      buildSampleAsset({ id: "mock:a", providerId: "mock" }),
      buildSampleAsset({ id: "pexels:b", providerId: "pexels" }),
    ];

    const mockOnly = applyAssetBrowserFilters(assets, {
      ...DEFAULT_ASSET_BROWSER_FILTERS,
      providerId: "mock",
    });
    const pexelsOnly = applyAssetBrowserFilters(assets, {
      ...DEFAULT_ASSET_BROWSER_FILTERS,
      providerId: "pexels",
    });

    assert.equal(mockOnly[0]!.providerId, "mock");
    assert.equal(pexelsOnly[0]!.providerId, "pexels");
  });

  test("pagination helpers derive empty states", () => {
    assert.equal(
      resolveEmptyStateKind({
        query: "football",
        success: false,
        resultCount: 0,
        error: "providers failed",
      }),
      "provider_unavailable",
    );

    assert.equal(
      resolveEmptyStateKind({
        query: "",
        success: false,
        resultCount: 0,
      }),
      "missing_query",
    );
  });

  await testAsync("search debounce schedules callback", async () => {
    const debounce = createAssetBrowserDebounce(20);
    let calls = 0;

    await new Promise<void>((resolve) => {
      debounce.schedule(() => {
        calls += 1;
        resolve();
      });
    });

    assert.equal(calls, 1);
    assert.equal(resolveDebouncedQuery("football", "football"), true);
  });

  test("filters and sort", () => {
    const assets = [
      buildSampleAsset({ id: "mock:low", score: 0.4, metadata: { itemIndex: 0 } }),
      buildSampleAsset({ id: "mock:high", score: 0.95, metadata: { itemIndex: 2 } }),
    ];

    const sorted = sortAssetBrowserResults(assets, "score");
    assert.equal(sorted[0]!.id, "mock:high");

    const licensed = applyAssetBrowserFilters(assets, {
      ...DEFAULT_ASSET_BROWSER_FILTERS,
      license: "commercial",
    });
    assert.equal(licensed.length, 2);
  });

  test("loading and empty state kinds", () => {
    assert.equal(
      resolveEmptyStateKind({
        query: "test",
        success: true,
        resultCount: 0,
      }),
      "no_results",
    );

    assert.equal(
      resolveEmptyStateKind({
        query: "test",
        disabledReason: "ASSET_SEARCH_ENABLED is not true",
        success: false,
        resultCount: 0,
      }),
      "search_disabled",
    );
  });

  test("attach CTA hidden without studio handoff", () => {
    const previousPublic = process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
    process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = "true";

    try {
      assert.equal(
        canAttachFromAssetBrowser({
          searchEnabled: true,
          fromStudioHandoff: false,
          sceneId: "scene-1",
        }),
        false,
      );
    } finally {
      if (previousPublic === undefined) {
        delete process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = previousPublic;
      }
    }

    const detailsSource = readFileSync(ASSET_BROWSER_DETAILS_PATH, "utf8");
    assert.match(detailsSource, /attachEnabled/);
    assert.match(detailsSource, /Attach to Scene/);
  });

  test("attach CTA visible with studio handoff and scene id", () => {
    const previousPublic = process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
    process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = "true";

    try {
      assert.equal(
        canAttachFromAssetBrowser({
          searchEnabled: true,
          fromStudioHandoff: true,
          sceneId: "scene-1",
        }),
        true,
      );
    } finally {
      if (previousPublic === undefined) {
        delete process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = previousPublic;
      }
    }
  });

  await testAsync("successful browser attach updates only selected scene", async () => {
    const script = buildSampleScript();
    const asset = buildSampleAsset();
    const assetBefore = JSON.stringify(asset);
    const { initialSearchContext, searchContext } = buildHandoffContexts("scene-2", 1);

    const result = await attachBrowserAssetToScene({
      script,
      sceneId: "scene-2",
      asset,
      initialSearchContext,
      searchContext,
      recommendationQuery: initialSearchContext.query,
      planningScriptHash: "hash-browser-attach",
      materializeAssetUrl: async () => ({
        success: true,
        playableUrl: "blob:browser-attached-image",
        strategy: "data_url",
        persisted: true,
      }),
    });

    assert.equal(result.success, true);
    assert.ok(result.script);
    assert.equal(getSceneImage(result.script!.scenes[1])?.url, "blob:browser-attached-image");
    assert.equal(getSceneImage(result.script!.scenes[0])?.url, undefined);
    assert.equal(JSON.stringify(asset), assetBefore);
  });

  await testAsync("failed materialization does not mutate script", async () => {
    const script = buildSampleScript();
    const scriptBefore = JSON.stringify(script);
    const { initialSearchContext, searchContext } = buildHandoffContexts();

    const result = await attachBrowserAssetToScene({
      script,
      sceneId: "scene-1",
      asset: buildSampleAsset(),
      initialSearchContext,
      searchContext,
      recommendationQuery: initialSearchContext.query,
      materializeAssetUrl: async () => ({
        success: false,
        strategy: "remote",
        error: "mock materialization failed",
      }),
    });

    assert.equal(result.success, false);
    assert.equal(result.script, undefined);
    assert.equal(JSON.stringify(script), scriptBefore);
  });

  await testAsync("assetAttachment metadata and attribution are stored on attach", async () => {
    const script = buildSampleScript();
    const asset = buildSampleAsset();
    const { initialSearchContext, searchContext } = buildHandoffContexts("scene-1", 0);

    const result = await attachBrowserAssetToScene({
      script,
      sceneId: "scene-1",
      asset,
      initialSearchContext,
      searchContext,
      recommendationQuery: initialSearchContext.query,
      planningScriptHash: "hash-browser-attach",
      materializeAssetUrl: async () => ({
        success: true,
        playableUrl: "blob:browser-attached-image",
        strategy: "data_url",
        persisted: true,
      }),
    });

    assert.equal(result.success, true);
    const scene = result.script!.scenes[0];
    assert.ok(scene?.assetAttachment);
    assert.equal(scene.assetAttachment.attachSource, "asset_search");
    assert.equal(scene.assetAttachment.normalizedAssetId, asset.id);
    assert.equal(scene.assetAttachment.providerId, asset.providerId);
    assert.equal(scene.assetAttachment.handoff?.storyId, searchContext.storyId);
    assert.equal(scene.assetAttachment.handoff?.recommendationQuery, initialSearchContext.query);
    assert.deepEqual(
      scene.assetAttachment.attribution,
      mapNormalizedAssetToAttribution(asset),
    );
  });

  test("manual upload flow remains unchanged", () => {
    const manualUploadSource = readFileSync(MANUAL_UPLOAD_PATH, "utf8");
    assert.doesNotMatch(manualUploadSource, /attachBrowserAssetToScene/);
    assert.doesNotMatch(manualUploadSource, /asset-materialization/);
  });

  test("no preview or export runtime changes for browser attach", () => {
    const exportRenderPath = join(process.cwd(), "src/features/export/services/video-render.service.ts");
    const exportRenderSource = readFileSync(exportRenderPath, "utf8");
    assert.doesNotMatch(exportRenderSource, /attachBrowserAssetToScene/);
    assert.doesNotMatch(exportRenderSource, /asset-materialization\.client/);

    const browserSources = collectBrowserSources(BROWSER_ROOT);
    for (const sourcePath of browserSources) {
      const source = readFileSync(sourcePath, "utf8");
      assert.doesNotMatch(source, /\bapplySceneUpdate\b/, `${sourcePath} must route attach via attach service`);
    }
  });

  test("attach uses controlled service path without provider raw payload", () => {
    const browserSource = readFileSync(join(BROWSER_ROOT, "AssetBrowser.tsx"), "utf8");
    assert.match(browserSource, /attachBrowserAssetToScene/);
    assert.match(browserSource, /structuredClone\(selectedAsset\)/);
    assert.doesNotMatch(browserSource, /runAssetSearchOrchestrator/);
  });

  test("no provider payload leakage in normalized sample", () => {
    const asset = buildSampleAsset({
      providerId: "pexels",
      attribution: {
        creatorName: "Jane Doe",
        creatorUrl: "https://www.pexels.com/@jane",
        providerName: "Pexels",
        providerUrl: "https://www.pexels.com/photo/1/",
        requiredText: "Photo by Jane Doe on Pexels",
      },
    });

    assert.equal(assertNoProviderPayloadLeak(asset), true);
  });

  test("handoff builds recommendation query and scene context", () => {
    const initialSearchContext = buildAssetBrowserInitialSearchContext({
      sceneId: "scene-2",
      sceneIndex: 2,
      query: "Lionel Messi celebration",
      topRecommendation: {
        query: "Lionel Messi celebration",
        entityIds: [],
        entityNames: [],
        entityTypes: [],
        score: 0.9,
        confidence: "high",
        reasons: [],
        reasonLabels: [],
        tags: [],
        visualIntent: "match_action",
        semanticRole: "climax",
        rank: 1,
      },
      providerResult: {
        sceneId: "scene-2",
        sceneIndex: 2,
        query: "Lionel Messi celebration",
        rankedProviders: [
          { providerId: "pexels", priority: "primary", score: 0.9, reasons: [] },
          { providerId: "mock", priority: "fallback", score: 0.5, reasons: [] },
        ],
      },
    });

    assert.ok(initialSearchContext);
    assert.equal(initialSearchContext!.query, "Lionel Messi celebration");
    assert.equal(initialSearchContext!.sceneId, "scene-2");
    assert.equal(initialSearchContext!.sceneIndex, 2);
    assert.equal(initialSearchContext!.visualIntent, "match_action");
    assert.equal(initialSearchContext!.semanticSlot, "climax");
    assert.deepEqual(initialSearchContext!.rankedProviderIds, ["pexels", "mock"]);
  });

  test("CTA hidden when search flag off", () => {
    const previousPublic = process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
    const previousServer = process.env.ASSET_SEARCH_ENABLED;
    delete process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
    delete process.env.ASSET_SEARCH_ENABLED;

    try {
      assert.equal(isAssetBrowserVisible(), false);
      assert.equal(
        canHandoffToAssetBrowser({
          searchEnabled: false,
          hasRecommendation: true,
          initialSearchContext: {
            query: "test",
            sceneId: "scene-1",
            sceneIndex: 0,
          },
          searchContext: null,
        }),
        false,
      );
    } finally {
      if (previousPublic === undefined) {
        delete process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = previousPublic;
      }

      if (previousServer === undefined) {
        delete process.env.ASSET_SEARCH_ENABLED;
      } else {
        process.env.ASSET_SEARCH_ENABLED = previousServer;
      }
    }
  });

  test("CTA appears when search enabled and recommendation exists", () => {
    const previousPublic = process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
    process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = "true";

    try {
      assert.equal(
        canHandoffToAssetBrowser({
          searchEnabled: isAssetBrowserVisible(),
          hasRecommendation: true,
          initialSearchContext: {
            query: "Lionel Messi celebration",
            sceneId: "scene-1",
            sceneIndex: 0,
          },
          searchContext: {
            storyId: "story-1",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: {
              sceneId: "scene-1",
              sceneIndex: 0,
              confidence: "high",
              reasoning: [],
              topRecommendation: {
                query: "Lionel Messi celebration",
                entityIds: [],
                entityNames: [],
                entityTypes: [],
                score: 0.9,
                confidence: "high",
                reasons: [],
                reasonLabels: [],
                tags: [],
                rank: 1,
              },
              alternatives: [],
            },
            providerResult: {
              sceneId: "scene-1",
              sceneIndex: 0,
              query: "Lionel Messi celebration",
              rankedProviders: [],
            },
          },
        }),
        true,
      );
    } finally {
      if (previousPublic === undefined) {
        delete process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ASSET_SEARCH_ENABLED = previousPublic;
      }
    }
  });

  test("scene switch changes handoff query", () => {
    const sceneA = buildAssetBrowserInitialSearchContext({
      sceneId: "scene-a",
      sceneIndex: 0,
      query: "Messi goal",
      topRecommendation: {
        query: "Messi goal",
        entityIds: [],
        entityNames: [],
        entityTypes: [],
        score: 0.8,
        confidence: "high",
        reasons: [],
        reasonLabels: [],
        tags: [],
        rank: 1,
      },
    });
    const sceneB = buildAssetBrowserInitialSearchContext({
      sceneId: "scene-b",
      sceneIndex: 1,
      query: "Ronaldo free kick",
      topRecommendation: {
        query: "Ronaldo free kick",
        entityIds: [],
        entityNames: [],
        entityTypes: [],
        score: 0.8,
        confidence: "high",
        reasons: [],
        reasonLabels: [],
        tags: [],
        rank: 1,
      },
    });

    assert.notDeepEqual(sceneA, sceneB);
    assert.equal(sceneA!.sceneIndex, 0);
    assert.equal(sceneB!.sceneIndex, 1);
  });

  test("studio handoff wires attach context from inspector script updates", () => {
    const studioSource = readFileSync(CREATOR_ASSET_STUDIO_PATH, "utf8");
    const ctaSource = readFileSync(CREATOR_SEARCH_ASSETS_CTA_PATH, "utf8");

    assert.match(studioSource, /CreatorAssetSearchAssetsCta/);
    assert.match(studioSource, /initialSearchContext/);
    assert.match(studioSource, /browserSceneIndex === sceneIndex/);
    assert.match(studioSource, /attachContext=/);
    assert.match(studioSource, /canAttachFromAssetBrowser/);
    assert.match(studioSource, /onScriptChange/);
    assert.match(studioSource, /compact\?: boolean/);
    assert.match(ctaSource, /Search Assets/);
    assert.match(ctaSource, /useCreatorAssetStudioCompact/);
    assert.match(ctaSource, /line-clamp-2/);
    assert.doesNotMatch(ctaSource, /Attach to Scene/);
  });
}

void runAssetBrowserTests()
  .then(() => {
    console.log("All asset browser checks passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
