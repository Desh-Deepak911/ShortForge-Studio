/**
 * Visual Retention Presets workspace / Project Inspector integration.
 * Run via: npm run test:visual-retention-presets-ui
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function main(): void {
  console.log("\nvisual-retention-presets-workspace-integration\n");

  test("exactly one Project Inspector panel mount below Project story section", () => {
    const inspector = readSrc(
      "src/features/editor/components/EditorProjectInspector.tsx",
    );
    assert.match(inspector, /VisualRetentionPresetsPanel/);
    assert.match(inspector, /StoryReview/);
    assert.match(inspector, /showVisualRetentionPresets/);
    const storyIdx = inspector.indexOf("StoryReview");
    const panelIdx = inspector.indexOf("VisualRetentionPresetsPanel");
    assert.ok(storyIdx >= 0 && panelIdx > storyIdx);
    const mounts = inspector.match(/<VisualRetentionPresetsPanel/g) ?? [];
    assert.equal(mounts.length, 1);
    assert.match(inspector, /useVisualRetentionCapabilitiesReady/);
    assert.match(inspector, /useVisualRetentionPresetsEnabled/);
    assert.match(inspector, /useMixedMediaScenesEnabled/);
    assert.match(inspector, /useVisualBeatDensityEnabled/);
    assert.match(inspector, /useKeyframedVisualEffectsEnabled/);
    assert.match(inspector, /useEngagementOverlaysEnabled/);
    assert.match(inspector, /useShortForgeBrandStingEnabled/);
    assert.match(inspector, /projectKey=\{storyId\}/);
    assert.match(inspector, /key=\{storyId\}/);
    assert.match(inspector, /storyId != null/);
    assert.doesNotMatch(inspector, /project-local/);
  });

  test("no Scene / Timeline / Export / Preview duplicate mounts", () => {
    const blocked = [
      "src/features/editor/components/StudioSceneInspector.tsx",
      "src/features/editor/inspector/panels/SceneInspector.tsx",
      "src/features/editor/inspector/panels/ImageInspector.tsx",
      "src/components/ExportPanel.tsx",
      "src/features/preview",
      "src/features/export",
      "src/features/editor/components/EditorTimeline.tsx",
    ];
    for (const rel of blocked) {
      const abs = path.join(process.cwd(), rel);
      let files: string[] = [];
      try {
        if (statSync(abs).isDirectory()) files = walkTsFiles(abs);
        else files = [abs];
      } catch {
        continue;
      }
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /VisualRetentionPresetsPanel/,
          `${file} must not mount VisualRetentionPresetsPanel`,
        );
      }
    }
  });

  test("shared provider / single capability fetch remains", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.match(provider, /visualRetentionPresetsEnabled/);
    assert.match(provider, /useVisualRetentionPresetsEnabled/);
    const route = readSrc(
      "src/app/api/visual-retention/capabilities/route.ts",
    );
    assert.match(route, /visualRetentionPresetsEnabled/);
    const resolver = readSrc(
      "src/features/visual-retention/server/resolve-visual-retention-creator-capabilities.ts",
    );
    assert.match(resolver, /isVisualRetentionPresetsCapabilityEnabled/);
    const capabilityLeaf = readSrc(
      "src/features/visual-retention/domain/visual-retention-presets-capability.ts",
    );
    assert.match(capabilityLeaf, /visual-retention-presets-v1/);

    const inspector = readSrc(
      "src/features/editor/components/EditorProjectInspector.tsx",
    );
    assert.doesNotMatch(inspector, /fetch\(/);
    assert.doesNotMatch(
      inspector,
      /\/api\/visual-retention\/capabilities/,
    );

    const panel = readSrc(
      "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
    );
    assert.doesNotMatch(panel, /fetch\(/);
    assert.doesNotMatch(panel, /\/api\/visual-retention\/capabilities/);
  });

  test("capability booleans passed explicitly into panel", () => {
    const inspector = readSrc(
      "src/features/editor/components/EditorProjectInspector.tsx",
    );
    assert.match(inspector, /mixedMediaScenesEnabled/);
    assert.match(inspector, /visualBeatDensityEnabled/);
    assert.match(inspector, /keyframedVisualEffectsEnabled/);
    assert.match(inspector, /engagementOverlaysEnabled/);
    assert.match(inspector, /shortForgeBrandStingEnabled/);
    assert.match(inspector, /visualRetentionPresetsEnabled/);
    assert.match(inspector, /ready: capabilitiesReady/);
    const panel = readSrc(
      "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
    );
    assert.match(panel, /mixedMediaScenesEnabled === true/);
    assert.match(panel, /planningCapabilities/);
  });

  test("planner/commands used from feature; no mutable command-runner global", () => {
    const panel = readSrc(
      "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
    );
    assert.match(panel, /buildVisualRetentionPresetApplicationPlan/);
    assert.match(panel, /projectStoryVisualRetentionPresetInput/);
    assert.match(panel, /applyVisualRetentionPresetPlan/);
    assert.match(panel, /evaluateVisualRetentionPresetStaleness/);
    assert.doesNotMatch(panel, /CommandRunner|commandRunner\s*=/);

    const commands = readSrc(
      "src/features/visual-retention-presets/editor/visual-retention-preset.commands.ts",
    );
    assert.doesNotMatch(commands, /let\s+\w*Runner|globalThis/);
  });

  test("no preview/export/manifest import of presets UI", () => {
    for (const root of [
      "src/features/preview",
      "src/features/export",
      "src/features/headless-renderer",
    ] as const) {
      const abs = path.join(process.cwd(), root);
      for (const file of walkTsFiles(abs)) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /VisualRetentionPresetsPanel|useVisualRetentionPresetSelection/,
        );
        assert.doesNotMatch(
          src,
          /from ["']@\/features\/visual-retention-presets/,
        );
      }
    }
    const manifestTypes = readSrc(
      "src/features/export/domain/export-manifest.types.ts",
    );
    assert.doesNotMatch(manifestTypes, /visualRetentionPreset|PRESET_/);
  });

  test("applied ordinary settings remain owned by existing feature panels", () => {
    const panel = readSrc(
      "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
    );
    assert.match(
      panel,
      /Applied settings stay editable in\s+their usual controls/,
    );
    assert.doesNotMatch(panel, /VisualPacingPanel|MediaMotion|BrandStingExport/);
    const pacing = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.doesNotMatch(pacing, /VisualRetentionPresetsPanel/);
  });

  test("package script wires the UI suite", () => {
    const pkg = readSrc("package.json");
    assert.match(
      pkg,
      /"test:visual-retention-presets-ui":\s*"tsx src\/verification\/visual-retention-presets\/visualRetentionPresetsUi\.verify\.tsx && tsx src\/verification\/visual-retention-presets\/visualRetentionPresetsAccessibility\.verify\.tsx && tsx src\/verification\/visual-retention-presets\/visualRetentionPresetsWorkspaceIntegration\.verify\.ts"/,
    );
  });

  console.log(
    `\nvisual-retention-presets-workspace-integration: ${passed} PASS\n`,
  );
}

main();
