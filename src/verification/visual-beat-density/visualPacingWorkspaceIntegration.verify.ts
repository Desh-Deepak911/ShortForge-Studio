/**
 * Visual pacing workspace integration verification.
 * Run: npm run test:visual-pacing-ui
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  console.log("\nVisual pacing workspace integration\n");

  test("Scene Inspector places Visual pacing above Visual sequence", () => {
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.match(inspector, /VisualPacingPanel/);
    assert.match(inspector, /MixedMediaSequencePanel/);
    assert.match(inspector, /useVisualRetentionCapabilitiesReady/);
    assert.match(inspector, /useVisualBeatDensityEnabled/);
    assert.match(inspector, /visualPacingPanelEnabled/);

    const pacingIndex = inspector.indexOf("<VisualPacingPanel");
    const sequenceIndex = inspector.indexOf("<MixedMediaSequencePanel");
    assert.ok(pacingIndex > 0);
    assert.ok(sequenceIndex > 0);
    assert.ok(
      pacingIndex < sequenceIndex,
      "Visual pacing must render above Visual sequence",
    );

    // Fail-closed: require ready + mixed-media + beat-density.
    assert.match(
      inspector,
      /visualRetentionCapabilitiesReady &&\s*mixedMediaScenesEnabled &&\s*visualBeatDensityEnabled/,
    );
  });

  test("capability loading stays fail-closed without briefly exposing controls", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.match(provider, /VISUAL_RETENTION_CAPABILITIES_DISABLED/);
    assert.match(provider, /ready:\s*true/);

    const parser = readSrc(
      "src/features/visual-retention/client/parse-visual-retention-capabilities.ts",
    );
    assert.match(parser, /ready:\s*false/);
    assert.match(parser, /mixedMediaScenesEnabled:\s*false/);
    assert.match(parser, /visualBeatDensityEnabled:\s*false/);

    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /if \(!capabilitiesOn\) \{\s*return null;/);
    assert.match(
      panel,
      /visualBeatDensityEnabled === true && mixedMediaScenesEnabled === true/,
    );
  });

  test("one shared capability fetch; panel does not fetch", () => {
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

    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.doesNotMatch(panel, /fetch\(/);
    const selection = readSrc(
      "src/features/visual-beat-density/editor/useVisualPacingSelection.ts",
    );
    assert.doesNotMatch(selection, /fetch\(/);
    const preview = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingSuggestionPreview.tsx",
    );
    assert.doesNotMatch(preview, /fetch\(/);

    const workspace = readSrc("src/components/StoryWorkspace.tsx");
    assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
    assert.equal(
      (
        workspace.match(
          /fetch\(\s*["']\/api\/visual-retention\/capabilities/g,
        ) ?? []
      ).length,
      0,
    );
  });

  test("mixed-media panel remains intact without pacing controls", () => {
    const sequence = readSrc(
      "src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx",
    );
    assert.match(sequence, /Visual sequence/);
    assert.doesNotMatch(sequence, /Visual pacing|Suggest pacing|visualBeatPlan/);
    assert.match(sequence, /StudioNumberStepper/);
  });

  test("ExportPanel and Headless controls unchanged for density UI", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    // Shared capability hook is allowed for recoverable export guidance only.
    assert.match(exportPanel, /useVisualBeatDensityEnabled/);
    assert.match(exportPanel, /useMixedMediaScenesEnabled/);
    assert.doesNotMatch(
      exportPanel,
      /VisualPacingPanel|Suggest pacing|More changes|Fewer, clearer cuts/,
    );

    const headlessUi = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessJobStatusPanel.tsx",
    );
    assert.doesNotMatch(
      headlessUi,
      /Visual pacing|Suggest pacing|VisualPacingPanel/,
    );
  });

  test("ExportManifest and preview do not consume plan metadata", () => {
    assert.doesNotMatch(
      readSrc("src/features/export/domain/export-manifest.types.ts"),
      /visualBeatPlan|VisualPacingPanel|visual-beat-density/,
    );
    assert.doesNotMatch(
      readSrc("src/features/preview/components/VideoPreview.tsx"),
      /visualBeatPlan|VisualPacingPanel|Suggest pacing/,
    );
  });

  test("commands remain the write seam; panel uses onScriptChange media intent", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /visualPacingPanelCommandRunner\.suggestVisualBeatPlan/);
    assert.match(panel, /visualPacingPanelCommandRunner\.applyVisualBeatPlan/);
    assert.match(panel, /visualPacingPanelCommandRunner\.discardVisualBeatPlan/);
    assert.match(
      panel,
      /visualPacingPanelCommandRunner\.projectVisualBeatPlanStalenessForScene/,
    );
    assert.match(panel, /onScriptChange\(next, \{ intent: ["']media["'] \}\)/);
    // Panel must not invent its own sequence writer.
    assert.doesNotMatch(panel, /writeMixedMediaSequenceItems/);
  });

  test("post-commit focus placement is wired without timers", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /useLayoutEffect/);
    assert.match(panel, /pendingSuggestFocusRef/);
    assert.match(panel, /requestSuggestFocusAfterCommit/);
    assert.doesNotMatch(panel, /setTimeout\(|setInterval\(|requestIdleCallback/);
    // Success Apply path requests post-commit Suggest focus (no sync Apply focus after).
    assert.match(
      panel,
      /\/\/ Apply unmounts; focus surviving Suggest again after the committed render\.\s*requestSuggestFocusAfterCommit\(\);\s*commitScript\(/,
    );
    assert.match(
      panel,
      /\/\/ Discard unmounts; focus surviving Suggest pacing after the committed render\.\s*requestSuggestFocusAfterCommit\(\);\s*commitScript\(/,
    );
  });

  test("no project-level density setting in Visual pacing UI", () => {
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.doesNotMatch(inspector, /projectDensity|story\.visualBeatDensity/);
    const storyTypes = readSrc("src/features/story/types/story.types.ts");
    assert.doesNotMatch(storyTypes, /visualBeatDensity\?:/);
    assert.match(storyTypes, /visualBeatPlan\?:/);
  });

  test("permanent filenames are responsibility-based", () => {
    for (const rel of [
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
      "src/features/visual-beat-density/editor/VisualPacingSuggestionPreview.tsx",
      "src/features/visual-beat-density/editor/useVisualPacingSelection.ts",
      "src/verification/visual-beat-density/visualPacingPanel.verify.ts",
      "src/verification/visual-beat-density/visualPacingWorkspaceIntegration.verify.ts",
      "src/verification/visual-beat-density/visualPacingAccessibility.verify.ts",
    ]) {
      const base = path.basename(rel);
      assert.doesNotMatch(
        base,
        /sprint|phase|hardening|final|\d{4}-\d{2}-\d{2}/i,
      );
      assert.ok(readSrc(rel).length > 0);
    }
  });

  console.log(`\nVisual pacing workspace integration: ${passed} PASS`);
}

main();
