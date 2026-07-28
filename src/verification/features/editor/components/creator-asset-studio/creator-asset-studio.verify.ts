/**
 * Creator Asset Studio compact mode verification
 * (run via: npm run test:creator-asset-planning-cache).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = join(process.cwd(), "src/features/editor/components/creator-asset-studio");
const STUDIO_PATH = join(STUDIO_ROOT, "CreatorAssetStudio.tsx");
const PLANNING_CONTEXT_PATH = join(STUDIO_ROOT, "CreatorAssetPlanningContextSection.tsx");
const CTA_PATH = join(STUDIO_ROOT, "CreatorAssetSearchAssetsCta.tsx");
const INSPECTOR_PATH = join(process.cwd(), "src/features/editor/components/StudioSceneInspector.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

export function runCreatorAssetStudioCompactTests(): void {
  console.log("creatorAssetStudioCompact");

  test("CreatorAssetStudio exposes compact prop with safe default", () => {
    const source = readSource(STUDIO_PATH);
    assert.match(source, /compact\?: boolean/);
    assert.match(source, /compact = false/);
  });

  test("editor inspector enables compact mode", () => {
    const source = readSource(INSPECTOR_PATH);
    assert.match(source, /<CreatorAssetStudio[^>]*compact/);
  });

  test("compact mode groups secondary metadata under Planning Context", () => {
    const studioSource = readSource(STUDIO_PATH);
    const planningSource = readSource(PLANNING_CONTEXT_PATH);

    assert.match(studioSource, /title="Planning Context"/);
    assert.match(studioSource, /defaultOpen=\{false\}/);
    assert.match(studioSource, /CreatorAssetPlanningContextSection/);

    assert.match(planningSource, /CreatorAssetSceneIntelligenceSection/);
    assert.match(planningSource, /CreatorAssetVisualIntentSection/);
    assert.match(planningSource, /CreatorAssetSceneImportanceSection/);
    assert.match(planningSource, /CreatorAssetProviderContextSection/);
    assert.match(planningSource, /CreatorAssetRecommendationContextSection/);
  });

  test("compact mode keeps primary workflow visible", () => {
    const source = readSource(STUDIO_PATH);

    assert.match(source, /CreatorAssetRecommendationCard/);
    assert.match(source, /CreatorAssetSearchQuery/);
    assert.match(source, /CreatorAssetSearchAssetsCta/);
    assert.match(source, /CreatorAssetValidationCard[\s\S]*summaryOnly/);
    assert.match(source, /CreatorAssetRepairSuggestions[\s\S]*summaryOnly/);
    assert.match(source, /CreatorAssetPlanningStaleBadge/);
  });

  test("compact mode collapses secondary planning actions under More options", () => {
    const source = readSource(STUDIO_PATH);

    assert.match(source, /title="More options"/);
    assert.match(source, /CreatorAssetAlternativeList/);
    assert.match(source, /CreatorAssetProviderList/);
    assert.match(source, /CreatorAssetQuickActions/);
  });

  test("Search Assets CTA compact layout avoids split columns", () => {
    const source = readSource(CTA_PATH);

    assert.match(source, /useCreatorAssetStudioCompact/);
    assert.match(source, /if \(compact\)/);
    assert.match(source, /line-clamp-2/);
    assert.match(source, /w-full/);
    assert.match(source, /studioCardTag/);
    assert.doesNotMatch(
      source.match(/if \(compact\) \{[\s\S]*?\}/)?.[0] ?? "",
      /sm:flex-row/,
      "compact CTA branch must not use split row layout",
    );
  });

  test("compact mode does not mutate planning cache or call asset APIs", () => {
    const source = readSource(STUDIO_PATH);
    const forbiddenPatterns = [
      /\bupdatePlanningCache\s*\(/,
      /\bcreatePlanningCache\s*\(/,
      /\brunAssetIntelligence\s*\(/,
      /\brunStudioIntelligence\s*\(/,
      /\bfetch\s*\(/,
      /\/api\/search-assets/,
    ];

    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, "CreatorAssetStudio must remain presentation-only");
    }
  });

  test("compact mode preserves asset browser handoff and attach wiring", () => {
    const source = readSource(STUDIO_PATH);

    assert.match(source, /AssetBrowser/);
    assert.match(source, /canHandoffToAssetBrowser/);
    assert.match(source, /canAttachFromAssetBrowser/);
    assert.match(source, /attachContext/);
    assert.match(source, /onScriptChange/);
  });

  console.log("All creator asset studio compact checks passed.");
}
