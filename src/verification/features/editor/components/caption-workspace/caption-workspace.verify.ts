/**
 * Caption workspace wiring verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

export function runCaptionWorkspaceTests(): void {
  console.log("captionWorkspace");

  const workspace = readSrc("src/features/editor/components/caption-workspace/CaptionWorkspace.tsx");
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");

  test("scene inspector composes caption workspace inside caption group", () => {
    assert.match(sceneInspector, /CaptionWorkspace/);
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.caption/);
    assert.doesNotMatch(sceneInspector, /title="Caption Layout"/);
    assert.doesNotMatch(sceneInspector, /title="Captions"/);
  });

  test("caption workspace exposes content layout style animation tabs", () => {
    assert.match(workspace, /studioWorkspaceTabTrack/);
    assert.match(workspace, /studioWorkspaceTabActive/);
    assert.match(workspace, /caption-workspace-panel-content/);
    assert.match(workspace, /caption-workspace-panel-layout/);
    assert.match(workspace, /caption-workspace-panel-style/);
    assert.match(workspace, /caption-workspace-panel-animation/);
    assert.match(workspace, /CAPTION_WORKSPACE_TAB_LABELS\[tabId\]/);
    assert.match(workspace, /CAPTION_WORKSPACE_TABS/);
  });

  test("content tab preserves caption mode preset and text draft wiring", () => {
    assert.match(workspace, /CaptionModeControl/);
    assert.match(workspace, /CaptionPresetPanel/);
    assert.match(workspace, /Advanced subtitle effect/);
    assert.match(workspace, /buildSceneCaptionPresetPatch/);
    assert.match(workspace, /buildSceneSubtitleEffectPatch/);
    assert.match(workspace, /registerPendingSceneCaptionDraft/);
    assert.match(workspace, /CAPTION_FIELD_DEBOUNCE_MS/);
    assert.doesNotMatch(workspace, /generate-voiceover/);
  });

  test("layout style and animation tabs preserve existing controls and callbacks", () => {
    assert.match(workspace, /CaptionLayoutControl/);
    assert.match(workspace, /CaptionLayoutWorkflow/);
    assert.match(workspace, /CaptionStyleControl/);
    assert.match(workspace, /CaptionAnimationControl/);
    assert.match(workspace, /CaptionAnimationWorkflow/);
    assert.match(workspace, /onCommitPresentationPatch/);
    assert.match(workspace, /onCommitPresentationScript/);
  });

  test("inactive caption tabs stay mounted without remounting controls", () => {
    assert.match(workspace, /hidden=\{activeTab !== "content"\}/);
    assert.match(workspace, /hidden=\{activeTab !== "layout"\}/);
    assert.match(workspace, /hidden=\{activeTab !== "style"\}/);
    assert.match(workspace, /hidden=\{activeTab !== "animation"\}/);
    assert.match(workspace, /readCaptionWorkspaceTab/);
    assert.match(workspace, /writeCaptionWorkspaceTab/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCaptionWorkspaceTests();
}
