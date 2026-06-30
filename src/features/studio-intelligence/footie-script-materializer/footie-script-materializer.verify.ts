/**
 * FootieScript materializer unit verification
 * (run: npm run test:studio-intelligence-footie-script-materializer).
 */
import assert from "node:assert/strict";

import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import type { SceneImportanceScore } from "@/features/studio-intelligence";
import {
  capSubtitleWords,
  cloneFootieScriptMaterializerInput,
  materializerInputsEqual,
  materializeMappedScenesToFootieScript,
  resolveMaterializedSubtitle,
  subtitlesWithinWordCap,
} from "@/features/studio-intelligence/footie-script-materializer";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeImportance(value: number): SceneImportanceScore {
  return {
    value,
    tier: value >= 0.85 ? "critical" : value >= 0.65 ? "high" : value >= 0.35 ? "medium" : "low",
  };
}

function defaultSemanticFields(): Pick<
  BlueprintMappedScene,
  | "semanticSlotId"
  | "semanticSlotLabel"
  | "semanticRole"
  | "templateId"
  | "templateApplied"
  | "contentPattern"
  | "planningTags"
> {
  return {
    semanticSlotId: "hook",
    semanticSlotLabel: "Hook",
    semanticRole: "Hook",
    templateId: "default",
    templateApplied: false,
    contentPattern: "hook_scene",
    planningTags: ["template:default", "slot:hook", "pattern:hook_scene"],
  };
}

function makeMappedScene(
  partial: Partial<BlueprintMappedScene> & Pick<BlueprintMappedScene, "id" | "order">,
): BlueprintMappedScene {
  return {
    sourceBlueprintId: partial.sourceBlueprintId ?? "blueprint-1",
    sourceArcId: partial.sourceArcId ?? "arc-1",
    sourceBeatIds: partial.sourceBeatIds ?? ["beat-1"],
    blueprintRole: partial.blueprintRole ?? "intro",
    blueprintKind: partial.blueprintKind ?? "hook_opener",
    proposedSceneType: partial.proposedSceneType ?? "intro",
    title: partial.title ?? "Opening hook",
    narrationExcerpt: partial.narrationExcerpt ?? "Haaland scored again and changed the title race.",
    durationMs: partial.durationMs ?? 3000,
    importance: partial.importance ?? makeImportance(0.8),
    visualIntentType: partial.visualIntentType ?? "player_portrait",
    motionSuggestion: partial.motionSuggestion ?? "ken_burns",
    visualHints: partial.visualHints ?? {
      visualIntentType: "player_portrait",
      subject: "Erling Haaland",
    },
    mediaHints: partial.mediaHints ?? {
      assetRequirementType: "image",
      searchQuery: "Erling Haaland portrait",
      preferredOrientation: "portrait",
      imageCount: 1,
    },
    motionHints: partial.motionHints ?? {
      suggestedMotion: "ken_burns",
      intensity: "medium",
    },
    captionHints: partial.captionHints ?? {
      emphasis: "phrase",
      highlightWords: ["Haaland"],
      captionStyleHint: "bold_hook",
      captionText: partial.captionText ?? "Haaland changed the title race",
    },
    timingMetadata: partial.timingMetadata ?? {
      suggestedDurationMs: 3000,
      minDurationMs: 1500,
      maxDurationMs: 5000,
      pacing: "normal",
    },
    narrationMetadata: partial.narrationMetadata ?? {
      narrationStartIndex: 0,
      sentenceRange: { start: 0, end: 0 },
      slicingStrategy: "blueprint_summary",
      narrationConfidence: 0.9,
    },
    confidence: partial.confidence ?? 0.85,
    mappingDecisions: partial.mappingDecisions ?? [],
    captionText: partial.captionText ?? "Haaland changed the title race",
    assetSearchQuery: partial.assetSearchQuery ?? "Erling Haaland portrait",
    ...defaultSemanticFields(),
    ...partial,
  };
}

console.log("studio-intelligence-footie-script-materializer");

test("subtitle fallback uses title then scene number", () => {
  const warnings: Parameters<typeof resolveMaterializedSubtitle>[3] = [];
  const fallbacks: string[] = [];

  const fromTitle = resolveMaterializedSubtitle(
    makeMappedScene({
      id: "mapped:bp-1",
      order: 0,
      captionText: "",
      captionHints: { emphasis: "none", highlightWords: [], captionStyleHint: "default" },
      title: "Title fallback",
      narrationExcerpt: "",
    }),
    0,
    12,
    warnings,
    fallbacks,
  );

  assert.equal(fromTitle, "Title fallback");

  const sceneNumber = resolveMaterializedSubtitle(
    makeMappedScene({
      id: "mapped:bp-2",
      order: 1,
      captionText: "",
      captionHints: { emphasis: "none", highlightWords: [], captionStyleHint: "default" },
      title: "",
      narrationExcerpt: "",
    }),
    1,
    12,
    [],
    [],
  );

  assert.equal(sceneNumber, "Scene 2");
});

test("subtitle respects 12-word cap", () => {
  const longCaption = "one two three four five six seven eight nine ten eleven twelve thirteen";
  const capped = capSubtitleWords(longCaption, 12);

  assert.ok(subtitlesWithinWordCap(capped, 12));
  assert.equal(capped.split(" ").length, 12);
});

test("empty mapped scenes returns success=false with warning", () => {
  const result = materializeMappedScenesToFootieScript({
    mappedScenes: [],
    narration: "Some narration.",
    voiceoverDurationMs: 30_000,
  });

  assert.equal(result.success, false);
  assert.equal(result.footieScenes.length, 0);
  assert.ok(result.warnings.some((warning) => warning.code === "EMPTY_MAPPED_SCENES"));
});

test("input is not mutated during materialization", () => {
  const input = {
    mappedScenes: [makeMappedScene({ id: "mapped:bp-1", order: 0 })],
    narration: "Haaland scored again and changed the title race.",
    voiceoverDurationMs: 30_000,
  };
  const before = cloneFootieScriptMaterializerInput(input);

  materializeMappedScenesToFootieScript(input);

  assert.ok(materializerInputsEqual(before, input));
});

console.log("All FootieScript materializer unit checks passed.");
