/**
 * Inspector tab shell wiring verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

export function runInspectorTabShellTests(): void {
  console.log("inspectorTabShell");

  const resolver = readSrc(
    "src/features/editor/inspector/InspectorResolver.tsx",
  );
  const tabShell = readSrc(
    "src/features/editor/inspector/InspectorTabShell.tsx",
  );
  const sceneInspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const projectInspector = readSrc(
    "src/features/editor/components/EditorProjectInspector.tsx",
  );
  const audioInspector = readSrc(
    "src/features/editor/components/EditorAudioInspector.tsx",
  );

  test("InspectorResolver composes the tab shell", () => {
    assert.match(resolver, /InspectorTabShell/);
    assert.doesNotMatch(resolver, /panelIds\.map/);
  });

  test("tab shell exposes contextual Scene, Audio, and Project tabs", () => {
    assert.match(tabShell, /studioWorkspaceTabTrack/);
    assert.match(tabShell, /studioWorkspaceTabActive/);
    assert.match(tabShell, /inspector-tabpanel-scene/);
    assert.match(tabShell, /inspector-tabpanel-audio/);
    assert.match(tabShell, /inspector-tabpanel-project/);
    assert.match(tabShell, /hidden=\{displayedTab !== "scene"\}/);
    assert.match(tabShell, /hidden=\{displayedTab !== "audio"\}/);
    assert.match(tabShell, /hidden=\{displayedTab !== "project"\}/);
    assert.match(tabShell, /studioInspectorTabBodyScrollHost/);
    assert.doesNotMatch(tabShell, /absolute inset-0/);
    assert.match(tabShell, /InspectorPanel panelId="scene"/);
    assert.match(tabShell, /InspectorPanel panelId="audio"/);
    assert.match(tabShell, /InspectorPanel panelId="project"/);
  });

  test("scene inspector preserves every editing surface in contextual workspaces", () => {
    assert.match(sceneInspector, /SCENE_WORKSPACES/);
    assert.match(sceneInspector, /displayedWorkspace === "media"/);
    assert.match(sceneInspector, /displayedWorkspace === "adjust"/);
    assert.match(sceneInspector, /displayedWorkspace === "caption"/);
    assert.match(sceneInspector, /displayedWorkspace === "timing"/);
    assert.match(sceneInspector, /displayedWorkspace === "transition"/);
    assert.match(sceneInspector, /displayedWorkspace === "assets"/);
    assert.match(sceneInspector, /SceneMediaItemInspector/);
    assert.match(sceneInspector, /SceneVideoInspector/);
    assert.match(sceneInspector, /SceneImageInspector/);
    assert.match(sceneInspector, /MediaMotionInspectorPanel/);
    assert.match(sceneInspector, /MediaVisualAdjustmentsPanel/);
    assert.match(sceneInspector, /CaptionWorkspace/);
    assert.match(sceneInspector, /SceneMediaTransitionInspector/);
    assert.match(sceneInspector, /TransitionCard/);
    assert.match(sceneInspector, /CreatorAssetStudio/);
  });

  test("canvas image and media-boundary selections force the matching workspace", () => {
    assert.match(sceneInspector, /inspectorImageEditing/);
    assert.match(sceneInspector, /\? "transition"/);
    assert.match(sceneInspector, /\? "adjust"/);
    assert.match(sceneInspector, /showMediaTransitionInspector/);
    assert.match(
      tabShell,
      /displayedTab = inspectorImageEditing \? "scene" : activeTab/,
    );
  });

  test("workflow status is consolidated and voice focus opens the audio workspace", () => {
    assert.match(workspace, /EditorWorkflowStatus/);
    assert.match(workspace, /InspectorResolver/);
    assert.match(workspace, /focusInspectorProjectTab/);
    assert.match(audioInspector, /ProjectAudioStudio/);
    assert.match(projectInspector, /StoryReview/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runInspectorTabShellTests();
}
