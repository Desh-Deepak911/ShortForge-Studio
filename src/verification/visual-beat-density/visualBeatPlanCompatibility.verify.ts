/**
 * Visual-beat plan story compatibility verification.
 * Run: npm run test:visual-beat-plan-commands
 */

import assert from "node:assert/strict";

import {
  parseStoredVisualBeatPlan,
  suggestVisualBeatPlan,
  type VisualBeatPlanV1,
} from "@/features/visual-beat-density";
import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

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
    transform: { x: 0, y: 0, scale: 1 },
  };
}

function scene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Legacy subtitle only",
    ...overrides,
  };
}

function scriptFrom(sceneValue: FootieScene): FootieScript {
  return {
    title: "compat",
    totalDuration: 6,
    narration: "compat",
    scenes: [sceneValue],
  };
}

function main(): void {
  console.log("\nVisual-beat plan compatibility\n");

  test("old project with no plan remains untouched shape", () => {
    const legacy = scene({
      media: imageMedia("https://example.com/legacy.jpg"),
    });
    const json = JSON.stringify(legacy);
    assert.equal(json.includes("visualBeatPlan"), false);
    const parsed = JSON.parse(json) as FootieScene;
    assert.equal(parsed.visualBeatPlan, undefined);
    const projection = parseStoredVisualBeatPlan(parsed.visualBeatPlan);
    assert.equal(projection.plan, undefined);
    assert.equal(projection.invalid, false);
  });

  test("valid draft round-trip JSON", () => {
    let seeded = scene({
      narration: "Hello world. More text!",
    });
    seeded = appendMixedMediaSequenceItem(
      seeded,
      imageMedia("https://example.com/a.jpg"),
      { mixedMediaScenesEnabled: true, generateId: () => "a" },
    ).scene;
    seeded = appendMixedMediaSequenceItem(
      seeded,
      imageMedia("blob:https://app/local-file"),
      { mixedMediaScenesEnabled: true, generateId: () => "b" },
    ).scene;
    const suggested = suggestVisualBeatPlan(scriptFrom(seeded), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const roundTrip = JSON.parse(
      JSON.stringify(suggested.script.scenes[0]!.visualBeatPlan),
    ) as VisualBeatPlanV1;
    const parsed = parseStoredVisualBeatPlan(roundTrip);
    assert.equal(parsed.invalid, false);
    assert.deepEqual(parsed.plan, roundTrip);
  });

  test("valid applied round-trip keeps status and snapshot", () => {
    let seeded = scene({
      narration: "Hello world. More text!",
    });
    seeded = appendMixedMediaSequenceItem(
      seeded,
      imageMedia("https://example.com/a.jpg"),
      { mixedMediaScenesEnabled: true, generateId: () => "a" },
    ).scene;
    seeded = appendMixedMediaSequenceItem(
      seeded,
      imageMedia("https://example.com/b.jpg"),
      { mixedMediaScenesEnabled: true, generateId: () => "b" },
    ).scene;
    const suggested = suggestVisualBeatPlan(scriptFrom(seeded), {
      sceneId: "scene-1",
      density: "fast",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const appliedPlan: VisualBeatPlanV1 = {
      ...suggested.plan!,
      status: "applied",
    };
    const roundTrip = JSON.parse(JSON.stringify(appliedPlan)) as VisualBeatPlanV1;
    const parsed = parseStoredVisualBeatPlan(roundTrip);
    assert.equal(parsed.invalid, false);
    assert.equal(parsed.plan?.status, "applied");
    assert.deepEqual(parsed.plan?.sourceSnapshot, appliedPlan.sourceSnapshot);
  });

  test("missing sourceSnapshot is invalid metadata", () => {
    const suggested = suggestVisualBeatPlan(
      scriptFrom(
        appendMixedMediaSequenceItem(
          scene({ narration: "Hello world." }),
          imageMedia("https://example.com/a.jpg"),
          { mixedMediaScenesEnabled: true, generateId: () => "a" },
        ).scene,
      ),
      {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2020-01-01T00:00:00.000Z",
        visualBeatDensityEnabled: true,
      },
    );
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const { sourceSnapshot: _snap, ...without } = suggested.plan!;
    void _snap;
    const parsed = parseStoredVisualBeatPlan(without);
    assert.equal(parsed.invalid, true);
    assert.equal(parsed.plan, undefined);
  });

  test("malformed versions / missing fields / unknown density/status", () => {
    assert.equal(parseStoredVisualBeatPlan({ version: 2 }).invalid, true);
    assert.equal(parseStoredVisualBeatPlan({ version: 1 }).invalid, true);
    assert.equal(
      parseStoredVisualBeatPlan({
        version: 1,
        generatorVersion: 1,
        density: "turbo",
        status: "draft",
        sourceFingerprint: "x",
        proposedStartOffsetsMs: [0],
        preferredBeatCount: 1,
        achievedMediaWindowCount: 1,
        warningCodes: [],
      }).invalid,
      true,
    );
    assert.equal(
      parseStoredVisualBeatPlan({
        version: 1,
        generatorVersion: 1,
        density: "fast",
        status: "ready",
        sourceFingerprint: "x",
        proposedStartOffsetsMs: [0],
        preferredBeatCount: 1,
        achievedMediaWindowCount: 1,
        warningCodes: [],
      }).invalid,
      true,
    );
  });

  test("capability off ignores plan persistence path", () => {
    const seeded = appendMixedMediaSequenceItem(
      scene({ narration: "Hi there." }),
      imageMedia("https://example.com/a.jpg"),
      { mixedMediaScenesEnabled: true, generateId: () => "a" },
    ).scene;
    const result = suggestVisualBeatPlan(scriptFrom(seeded), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "BEATS_CAPABILITY_OFF");
    assert.equal(result.script.scenes[0]!.visualBeatPlan, undefined);
  });

  test("sequence absent but timeline/legacy media present still Suggests", () => {
    const legacy = scene({
      narration: "Legacy timeline path. Second beat!",
      mediaTimeline: {
        version: 1,
        items: [
          {
            id: "t1",
            media: imageMedia("https://example.com/t1.jpg"),
            durationWeight: 1,
          },
          {
            id: "t2",
            media: imageMedia("https://example.com/t2.jpg"),
            durationWeight: 1,
          },
        ],
      },
    });
    assert.equal(legacy.visualSequence, undefined);
    const result = suggestVisualBeatPlan(scriptFrom(legacy), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan?.achievedMediaWindowCount, 2);
    assert.equal(result.script.scenes[0]!.visualSequence, undefined);
  });

  test("one visual + blob URL metadata without binary rehydration", () => {
    const one = appendMixedMediaSequenceItem(
      scene({ narration: "Single visual scene." }),
      imageMedia("blob:https://localhost/object-id"),
      { mixedMediaScenesEnabled: true, generateId: () => "blob-1" },
    ).scene;
    const result = suggestVisualBeatPlan(scriptFrom(one), {
      sceneId: "scene-1",
      density: "studio",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan?.achievedMediaWindowCount, 1);
    assert.deepEqual(result.plan?.proposedStartOffsetsMs, [0]);
    assert.equal(result.script.scenes[0]!.visualSequence?.items[0]?.media.url, "blob:https://localhost/object-id");
  });

  console.log(`\n${passed} passed\n`);
}

main();
