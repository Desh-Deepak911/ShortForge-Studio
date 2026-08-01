/**
 * Visual pacing panel behavior verification.
 * Run: npm run test:visual-pacing-ui
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  updateMixedMediaSequenceBoundary,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import VisualPacingPanel from "@/features/visual-beat-density/editor/VisualPacingPanel";
import {
  formatVisualPacingChangesLabel,
  formatVisualPacingOffsetSeconds,
} from "@/features/visual-beat-density/editor/VisualPacingSuggestionPreview";
import { VISUAL_PACING_DEFAULT_DENSITY } from "@/features/visual-beat-density/editor/useVisualPacingSelection";
import {
  applyVisualBeatPlan,
  discardVisualBeatPlan,
  projectVisualBeatPlanStalenessForScene,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9_000,
    durationMs: 9_000,
    subtitle: "Fallback",
    narration: "One sentence. Two sentence, then end!",
    ...overrides,
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return {
    title: "Visual pacing panel",
    totalDuration: 9,
    narration: "Story narration",
    scenes: [scene],
  };
}

function seededScript(count = 3): FootieScript {
  let scene = baseScene();
  for (let i = 0; i < count; i += 1) {
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(`https://example.com/${i}.jpg`),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => `m${i}`,
      },
    ).scene;
  }
  return baseScript(scene);
}

function renderPanel(
  script: FootieScript,
  options: {
    readonly visualBeatDensityEnabled?: boolean;
    readonly mixedMediaScenesEnabled?: boolean;
  } = {},
): string {
  const scene = script.scenes[0]!;
  return renderToStaticMarkup(
    createElement(VisualPacingPanel, {
      script,
      scene,
      onScriptChange: () => {},
      visualBeatDensityEnabled: options.visualBeatDensityEnabled !== false,
      mixedMediaScenesEnabled: options.mixedMediaScenesEnabled !== false,
    }),
  );
}

function main(): void {
  console.log("\nVisual pacing panel\n");

  test("default density constant is balanced", () => {
    assert.equal(VISUAL_PACING_DEFAULT_DENSITY, "balanced");
  });

  test("preview offset formatting", () => {
    assert.equal(formatVisualPacingOffsetSeconds(0), "0.0s");
    assert.equal(formatVisualPacingOffsetSeconds(2400), "2.4s");
    assert.equal(
      formatVisualPacingChangesLabel([0, 2400, 5100]),
      "Changes at 0.0s · 2.4s · 5.1s",
    );
  });

  test("enabled capability renders panel with density control", () => {
    const html = renderPanel(seededScript());
    assert.match(html, /data-visual-pacing-panel/);
    assert.match(html, /Visual pacing/);
    assert.match(html, /Controls how often visuals change during narration/);
    assert.match(html, /data-visual-pacing-density-group/);
    assert.match(html, /More changes/);
    assert.match(html, /Balanced/);
    assert.match(html, /Fewer, clearer cuts/);
    assert.match(html, /Recommended/);
    assert.match(html, /Suggest pacing/);
    assert.match(
      html,
      /not export quality or render speed/,
    );
  });

  test("disabled capability hides panel", () => {
    const offDensity = renderPanel(seededScript(), {
      visualBeatDensityEnabled: false,
    });
    assert.equal(offDensity, "");
    const offMixed = renderPanel(seededScript(), {
      mixedMediaScenesEnabled: false,
    });
    assert.equal(offMixed, "");
  });

  test("one visual disables Suggest with guidance copy", () => {
    const html = renderPanel(seededScript(1));
    assert.match(html, /Add another visual to use pacing suggestions/);
    assert.match(html, /data-visual-pacing-need-visuals/);
    assert.match(html, /disabled/);
  });

  test("Suggest stores draft without changing timing", () => {
    const script = seededScript();
    const before = readMixedMediaSequenceItems(script.scenes[0]!).map((item) => ({
      id: item.id,
      startOffsetMs: item.startOffsetMs,
      durationMs: item.durationMs,
    }));
    const suggested = suggestVisualBeatPlan(script, {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const after = readMixedMediaSequenceItems(suggested.script.scenes[0]!).map(
      (item) => ({
        id: item.id,
        startOffsetMs: item.startOffsetMs,
        durationMs: item.durationMs,
      }),
    );
    assert.deepEqual(after, before);
    assert.equal(suggested.plan?.status, "draft");

    const html = renderPanel(suggested.script);
    assert.match(html, /data-visual-pacing-status="draft"/);
    assert.match(html, /data-visual-pacing-suggestion-preview/);
    assert.match(html, /Apply to change the scene timing/);
    assert.match(html, /Apply to sequence/);
    assert.match(html, /Discard/);
  });

  test("Apply changes timing; Discard preserves applied timing", () => {
    let script = seededScript();
    const suggested = suggestVisualBeatPlan(script, {
      sceneId: "scene-1",
      density: "fast",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    script = suggested.script;

    const applied = applyVisualBeatPlan(script, {
      sceneId: "scene-1",
      selectedDensity: "fast",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    script = applied.script;
    const appliedTiming = readMixedMediaSequenceItems(script.scenes[0]!).map(
      (item) => item.startOffsetMs,
    );
    assert.deepEqual(
      appliedTiming,
      [...(applied.plan?.proposedStartOffsetsMs ?? [])],
    );

    const html = renderPanel(script);
    assert.match(html, /data-visual-pacing-status="applied"/);
    assert.match(html, /Narration-driven pacing is applied/);
    assert.match(html, /Suggest again/);
    assert.doesNotMatch(html, /data-visual-pacing-apply/);

    const discarded = discardVisualBeatPlan(script, { sceneId: "scene-1" });
    assert.equal(discarded.ok, true);
    if (!discarded.ok) return;
    const afterDiscard = readMixedMediaSequenceItems(
      discarded.script.scenes[0]!,
    ).map((item) => item.startOffsetMs);
    assert.deepEqual(afterDiscard, appliedTiming);
    assert.equal(discarded.script.scenes[0]?.visualBeatPlan, undefined);
  });

  test("manual boundary edit presents stale and blocks Apply", () => {
    let script = seededScript();
    const suggested = suggestVisualBeatPlan(script, {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    script = applied.script;

    const items = readMixedMediaSequenceItems(script.scenes[0]!);
    const nextBoundary = Math.min(
      items[1]!.startOffsetMs + 400,
      items[1]!.startOffsetMs + items[1]!.durationMs - 500,
    );
    const edited = updateMixedMediaSequenceBoundary(
      script.scenes[0]!,
      items[1]!.id,
      nextBoundary,
      { mixedMediaScenesEnabled: true },
    );
    script = {
      ...script,
      scenes: script.scenes.map((scene) =>
        scene.id === "scene-1" ? edited.scene : scene,
      ),
    };

    const staleness = projectVisualBeatPlanStalenessForScene(
      script.scenes[0]!,
      "balanced",
    );
    assert.equal(staleness.effectiveStatus, "stale");
    assert.ok(staleness.staleReasons.includes("TIMING_CHANGED"));
    assert.equal(staleness.applyAllowed, false);

    const html = renderPanel(script);
    assert.match(html, /data-visual-pacing-status="stale"/);
    assert.match(
      html,
      /Pacing suggestion is out of date because narration, duration, visuals, or timing changed/,
    );
    assert.match(html, /data-visual-pacing-stale-reason="TIMING_CHANGED"/);
    assert.doesNotMatch(html, /data-visual-pacing-apply/);
    assert.match(html, /Suggest again/);
    assert.match(html, /Discard/);
  });

  test("inventory warnings map to non-technical copy", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(
      panel,
      /This pacing prefers more visuals than are available/,
    );
    assert.match(panel, /All visuals remain included/);
    assert.doesNotMatch(
      panel,
      /primary UI message.*BEATS_FEWER_VISUALS_THAN_TARGET/,
    );
  });

  test("generatedAtIso only in Suggest action path", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /generatedAtIso:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(panel, /handleSuggest/);
    assert.match(panel, /visualPacingPanelCommandRunner\.suggestVisualBeatPlan/);
    // Must not sample clock during render body outside the handler.
    const withoutHandler = panel.replace(
      /const handleSuggest = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/,
      "",
    );
    assert.doesNotMatch(withoutHandler, /new Date\(\)\.toISOString\(\)/);
  });

  test("density selection alone has no onScriptChange path", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /setSelectedDensity\(option\.value\)/);
    assert.match(panel, /useVisualPacingSelection/);
    const selection = readSrc(
      "src/features/visual-beat-density/editor/useVisualPacingSelection.ts",
    );
    assert.doesNotMatch(selection, /onScriptChange|visualBeatPlan/);
  });

  console.log(`\nVisual pacing panel: ${passed} PASS`);
}

main();
