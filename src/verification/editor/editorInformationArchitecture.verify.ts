/**
 * Phase 2G.15.3 review/create/editor information architecture authority.
 *
 * Presentation may become progressively disclosed, but all existing data and
 * production actions must remain reachable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void): void {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("editorInformationArchitecture");

const reviewInspector = readSrc(
  "src/features/create/components/ReviewInspector.tsx",
);
const intelligence = readSrc(
  "src/features/create/components/StoryIntelligencePanel.tsx",
);
const createInspector = readSrc(
  "src/features/create/components/CreateBriefInspector.tsx",
);
const voiceSettings = readSrc("src/components/VoiceSettingsCard.tsx");
const editorSidebar = readSrc(
  "src/features/editor/components/EditorProjectSidebar.tsx",
);

test("review separates overview, voice, and storyboard without dropping owners", () => {
  for (const marker of ["overview", "voice", "storyboard"]) {
    assert.match(reviewInspector, new RegExp(`"${marker}"`));
  }
  assert.match(reviewInspector, /StoryIntelligencePanel/);
  assert.match(reviewInspector, /VoiceSettingsCard/);
  assert.match(reviewInspector, /onSceneCountChange/);
  assert.match(reviewInspector, /onUseStudioIntelligenceScenesChange/);
});

test("story intelligence summarizes and preserves complete explainability", () => {
  assert.match(intelligence, /summaryIds/);
  assert.match(intelligence, /View all story intelligence/);
  assert.match(intelligence, /model\.rows/);
  assert.match(intelligence, /actionableWarnings/);
  assert.match(intelligence, /Story checks passed/);
  assert.doesNotMatch(
    intelligence,
    /\{model\.warningNotes\.map/,
    "internal pass markers must not render as warnings",
  );
});

test("create groups guidance, research, and output settings without losing controls", () => {
  for (const marker of ["guide", "research", "settings"]) {
    assert.match(createInspector, new RegExp(`"${marker}"`));
  }
  assert.match(createInspector, /ResearchPreviewPanel/);
  assert.match(createInspector, /onApplyRecommendedSettings/);
  assert.match(createInspector, /onContextChange/);
  assert.match(createInspector, /onQualityModeChange/);
  assert.match(createInspector, /onSceneCountChange/);
});

test("voice library is progressively disclosed while every voice control remains wired", () => {
  assert.match(voiceSettings, /Change voice and delivery/);
  assert.match(voiceSettings, /VoiceLibraryPanel/);
  assert.match(voiceSettings, /SpeechStylePanel/);
  assert.match(voiceSettings, /VOICEOVER_SPEED_OPTIONS/);
  assert.match(voiceSettings, /applyVoiceoverChanges/);
});

test("editor missing-media recovery is compact and remains directly accessible", () => {
  assert.match(editorSidebar, /aria-label=\{`Add media to scene/);
  assert.match(editorSidebar, /w-8 shrink-0/);
  assert.doesNotMatch(editorSidebar, />\s*Add media\s*</);
});

console.log("5 passed");
