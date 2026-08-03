/**
 * Source-quality adjustment workspace / inspector integration contracts.
 * Run via: npm run test:source-quality-adjustment-ui
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { EXPORT_MANIFEST_VERSION } from "@/features/export/domain/export-manifest.types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log("\nSource quality adjustment workspace integration\n");

  test("single Source quality panel under Media; pacing/sequence below", () => {
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    const summaryIndex = inspector.indexOf("<SourceQualitySummary");
    const pacingIndex = inspector.indexOf("<VisualPacingPanel");
    const sequenceIndex = inspector.indexOf("<MixedMediaSequencePanel");
    assert.ok(summaryIndex >= 0);
    assert.ok(pacingIndex > summaryIndex);
    assert.ok(sequenceIndex > summaryIndex);
    assert.equal(
      (inspector.match(/<SourceQualitySummary/g) ?? []).length,
      1,
    );
    assert.match(inspector, /script=\{script\}/);
    assert.match(inspector, /onScriptChange=\{onScriptChange\}/);
    assert.match(inspector, /mixedMediaScenesEnabled=\{mixedMediaScenesEnabled\}/);
    assert.match(inspector, /resolveSourceQualityWinningAdjustmentTarget/);
    assert.match(
      inspector,
      /source-quality\/adapters\/resolve-source-quality-adjustment-target/,
    );
    assert.match(inspector, /sourceQualityWinningMediaItemId/);
    assert.match(
      inspector,
      /mediaItemId=\{sourceQualityWinningMediaItemId\}/,
    );
    assert.match(inspector, /lastSelectedMediaIndexRef/);
    assert.doesNotMatch(inspector, /lastSelectedMediaIndexHint/);
    assert.doesNotMatch(inspector, /setLastSelectedMediaIndexHint/);
    assert.doesNotMatch(
      inspector,
      /isSceneMediaItemSelected \? selectedMediaItemId/,
    );
  });

  test("source-quality adapter owns winning target; mixed-media stays independent", () => {
    const adapter = readSrc(
      "src/features/source-quality/adapters/resolve-source-quality-adjustment-target.ts",
    );
    assert.match(adapter, /resolveInspectorSceneMediaProjection/);
    assert.match(adapter, /resolveNearestInspectorMediaItemId/);
    assert.match(adapter, /resolveSourceQualityMedia/);
    const mixedProjection = readSrc(
      "src/features/mixed-media-scenes/adapters/inspector-scene-media-projection.ts",
    );
    assert.doesNotMatch(
      mixedProjection,
      /resolveSourceQualityWinningAdjustmentTarget|source-quality/,
    );
    const mixedBarrel = readSrc("src/features/mixed-media-scenes/index.ts");
    assert.doesNotMatch(
      mixedBarrel,
      /resolveSourceQualityWinningAdjustmentTarget|source-quality/,
    );
    const upload = readSrc(
      "src/features/mixed-media-scenes/editor/useMixedMediaSequenceUpload.ts",
    );
    assert.doesNotMatch(
      upload,
      /from\s+["'][^"']*source-quality[^"']*["']/,
    );
    assert.match(upload, /probeImageObjectUrlMetadata\?/);
  });

  test("no duplicate Source quality panel in item inspector", () => {
    const itemInspector = readSrc(
      "src/features/editor/components/media/SceneMediaItemInspector.tsx",
    );
    assert.doesNotMatch(
      itemInspector,
      /SourceQualitySummary|SourceQualityAdjustmentControls/,
    );
  });

  test("controls commit through onScriptChange media intent only", () => {
    const controls = readSrc(
      "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
    );
    assert.match(controls, /intent:\s*["']media["']/);
    assert.match(controls, /resolveLatestScene/);
    assert.match(
      controls,
      /applySourceQualityAdjustmentRecommendation/,
    );
    assert.match(
      controls,
      /undoSourceQualityAdjustmentRecommendation/,
    );
    assert.match(
      controls,
      /dismissSourceQualityAdjustmentProvenance/,
    );
    assert.doesNotMatch(controls, /sourceQualityAdjustmentCommandRunner/);
    assert.doesNotMatch(controls, /buildMediaFramingPatch/);
    assert.doesNotMatch(controls, /updateSceneMediaItemMedia/);
    assert.doesNotMatch(controls, /writeMixedMediaSequenceItems/);
    assert.doesNotMatch(controls, /fetch\(/);
    const barrel = readSrc("src/features/source-quality/index.ts");
    assert.doesNotMatch(barrel, /sourceQualityAdjustmentCommandRunner/);
  });

  test("one shared visual-retention capability fetch; no new provider", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.equal(
      (
        provider.match(
          /fetch\(\s*["']\/api\/visual-retention\/capabilities/g,
        ) ?? []
      ).length,
      1,
    );
    const controls = readSrc(
      "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
    );
    assert.doesNotMatch(controls, /fetch\(/);
    assert.doesNotMatch(
      controls,
      /VisualRetentionCapabilitiesProvider|createContext/,
    );
  });

  test("ExportManifest v4 unchanged; provenance excluded from export types", () => {
    assert.equal(EXPORT_MANIFEST_VERSION, 4);
    const manifestTypes = readSrc(
      "src/features/export/domain/export-manifest.types.ts",
    );
    assert.doesNotMatch(
      manifestTypes,
      /sourceQualityAdjustmentProvenance|SOURCE_QUALITY_/,
    );
    const buildManifest = readSrc(
      "src/features/export/domain/build-export-manifest.ts",
    );
    assert.doesNotMatch(buildManifest, /sourceQualityAdjustmentProvenance/);
  });

  test("package script wires all three adjustment UI verifies", () => {
    const pkg = readSrc("package.json");
    assert.match(pkg, /"test:source-quality-adjustment-ui"/);
    assert.match(
      pkg,
      /sourceQualityAdjustmentUi\.verify\.tsx/,
    );
    assert.match(
      pkg,
      /sourceQualityAdjustmentWorkspaceIntegration\.verify\.ts/,
    );
    assert.match(
      pkg,
      /sourceQualityAdjustmentAccessibility\.verify\.tsx/,
    );
  });

  test("responsibility-based permanent names", () => {
    const names = [
      "SourceQualityAdjustmentControls.tsx",
      "sourceQualityAdjustmentUi.verify.tsx",
      "sourceQualityAdjustmentWorkspaceIntegration.verify.ts",
      "sourceQualityAdjustmentAccessibility.verify.tsx",
      "test:source-quality-adjustment-ui",
    ];
    for (const name of names) {
      assert.doesNotMatch(
        name,
        /sprint|12[Dd]|slice|checkpoint|hardening|final/i,
      );
    }
  });

  console.log(
    `\nSource quality adjustment workspace integration: ${passed} PASS\n`,
  );
}

void main();
