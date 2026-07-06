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

  const resolver = readSrc("src/features/editor/inspector/InspectorResolver.tsx");
  const tabShell = readSrc("src/features/editor/inspector/InspectorTabShell.tsx");
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const projectInspector = readSrc("src/features/editor/components/EditorProjectInspector.tsx");

  test("InspectorResolver composes the tab shell", () => {
    assert.match(resolver, /InspectorTabShell/);
    assert.doesNotMatch(resolver, /panelIds\.map/);
  });

  test("tab shell exposes Scene and Project tabs with independent scroll hosts", () => {
    assert.match(tabShell, /studioWorkspaceTabTrack/);
    assert.match(tabShell, /studioWorkspaceTabActive/);
    assert.match(tabShell, /inspector-tabpanel-scene/);
    assert.match(tabShell, /inspector-tabpanel-project/);
    assert.match(tabShell, /hidden=\{displayedTab !== "scene"\}/);
    assert.match(tabShell, /hidden=\{displayedTab !== "project"\}/);
    assert.match(tabShell, /studioInspectorTabBodyScrollHost/);
    assert.doesNotMatch(tabShell, /absolute inset-0/);
    assert.match(tabShell, /InspectorPanel panelId="scene"/);
    assert.match(tabShell, /InspectorPanel panelId="project"/);
  });

  test("scene inspector groups existing sections under accordions", () => {
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.general/);
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.image/);
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.caption/);
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.transition/);
    assert.match(sceneInspector, /SCENE_INSPECTOR_GROUP_LABELS\.assets/);
    assert.match(sceneInspector, /CaptionWorkspace/);
    assert.match(sceneInspector, /title="Narration"/);
    assert.match(sceneInspector, /title="Motion"/);
    assert.match(sceneInspector, /title="Transition"/);
    assert.match(sceneInspector, /CreatorAssetStudio/);
  });

  test("image edit mode still forces image group and image controls open", () => {
    assert.match(sceneInspector, /inspectorImageEditing \? true : imageGroupOpen/);
    assert.match(sceneInspector, /open=\{inspectorImageEditing \? true : undefined\}/);
    assert.match(sceneInspector, /open=\{inspectorImageEditing \? false : undefined\}/);
    assert.match(sceneInspector, /writeSceneGroupOpenState\("image", true\)/);
    assert.match(tabShell, /displayedTab = inspectorImageEditing \? "scene" : activeTab/);
  });

  test("sync UI stays above tabs and voice focus switches to project tab", () => {
    assert.match(workspace, /SynchronizationStatusCard/);
    assert.match(workspace, /InspectorResolver/);
    assert.match(workspace, /focusInspectorProjectTab/);
    assert.match(projectInspector, /ProjectAudioStudio/);
    assert.match(projectInspector, /StoryReview/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runInspectorTabShellTests();
}
