/**
 * Phase 2G.15 editor workspace redesign authority.
 *
 * This is intentionally a source-wiring gate: the redesign may move controls,
 * but it must keep the existing editing and export owners intact.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_EDITOR_WORKSPACE_LAYOUT,
  normalizeEditorWorkspaceLayout,
} from "../../features/editor/workspace-layout";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

export function runEditorWorkspaceRedesignTests(): void {
  console.log("editorWorkspaceRedesign");

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const shell = readSrc("src/components/studio-shell/StudioShell.tsx");
  const sidebar = readSrc("src/components/studio-shell/StudioSidebar.tsx");
  const projectSidebar = readSrc(
    "src/features/editor/components/EditorProjectSidebar.tsx",
  );
  const inspector = readSrc("src/components/studio-shell/StudioInspector.tsx");
  const timelineShell = readSrc(
    "src/components/studio-shell/StudioTimelineShell.tsx",
  );
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const sceneInspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  const mediaInspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  const header = readSrc(
    "src/features/editor/components/EditorStudioHeader.tsx",
  );
  const workflowStatus = readSrc(
    "src/features/editor/components/EditorWorkflowStatus.tsx",
  );
  const studioUi = readSrc("src/lib/utils/studioUi.ts");
  const layoutHook = readSrc(
    "src/features/editor/workspace-layout/useEditorWorkspaceLayout.ts",
  );
  const layoutStorage = readSrc(
    "src/features/editor/workspace-layout/editor-workspace-layout.storage.ts",
  );

  test("layout state is bounded and malformed persisted values fail safe", () => {
    assert.deepEqual(
      normalizeEditorWorkspaceLayout(undefined),
      DEFAULT_EDITOR_WORKSPACE_LAYOUT,
    );
    assert.deepEqual(
      normalizeEditorWorkspaceLayout({
        inspectorWidthPx: 9999,
        timelineHeightPx: -10,
        timelineDensity: "unknown",
      }),
      {
        ...DEFAULT_EDITOR_WORKSPACE_LAYOUT,
        inspectorWidthPx: 520,
        timelineHeightPx: 112,
      },
    );
  });

  test("workspace reuses the production preview, timeline, inspector, and export owners", () => {
    for (const marker of [
      "VideoPreview",
      "StudioTimeline",
      "InspectorResolver",
      "ExportPanel",
      "SceneMediaImageAppendProvider",
      "EditorWorkflowStatus",
      "useEditorWorkspaceLayout",
    ]) {
      assert.match(workspace, new RegExp(marker));
    }
    assert.match(shell, /StudioSidebar/);
    assert.match(shell, /StudioInspector/);
    assert.match(shell, /StudioTimelineShell/);
  });

  test("all scene editing surfaces remain reachable from contextual workspaces", () => {
    for (const marker of [
      "SceneVideoInspector",
      "SceneImageInspector",
      "SceneMediaItemInspector",
      "SceneMediaTransitionInspector",
      "MediaMotionInspectorPanel",
      "MediaVisualAdjustmentsPanel",
      "CaptionWorkspace",
      "TransitionCard",
      "CreatorAssetStudio",
      "SmartEditImageAction",
    ]) {
      assert.match(sceneInspector, new RegExp(marker));
    }

    for (const marker of [
      "buildVideoTrimPatch",
      "buildPosterTimePatch",
      "buildMediaFramingPatch",
      "buildMediaMotionPatch",
      "patchSceneMediaVisualAdjustments",
    ]) {
      assert.match(mediaInspector, new RegExp(marker));
    }
  });

  test("timeline compacts unselected scenes without removing editing commands", () => {
    for (const marker of [
      "selectedSceneDetailOnly",
      "showSelectedSceneMedia",
      "insertTimelineSceneAfter",
      "insertTimelineSceneBefore",
      "deleteTimelineScene",
      "duplicateTimelineScene",
      "reorderTimelineScene",
      "resolveResizedDurationSec",
      "onApplyVideoTrim",
      "TimelineTransitionMarker",
      "SceneMediaTimelineLane",
    ]) {
      assert.match(timeline, new RegExp(marker));
    }
    assert.match(timelineShell, /density/);
    assert.match(timelineShell, /onResizePointerDown/);
  });

  test("desktop rails collapse, mobile rails draw, and dimensions persist", () => {
    assert.match(sidebar, /mobileOpen/);
    assert.match(projectSidebar, /onCollapsedToggle/);
    assert.match(inspector, /onResizePointerDown/);
    assert.match(inspector, /mobileOpen/);
    assert.match(layoutStorage, /localStorage/);
    assert.match(layoutHook, /keydown/);
    assert.match(layoutHook, /beginInspectorResize/);
    assert.match(layoutHook, /beginTimelineResize/);
  });

  test("editor uses a wider desktop boundary without changing document shells", () => {
    assert.match(studioUi, /studioShellEditorMaxWidth/);
    assert.match(studioUi, /max-w-\[120rem\]/);
    assert.match(shell, /editorLayout[\s\S]*studioShellEditorMaxWidth/);
    assert.match(
      timelineShell,
      /hasEditorLayout[\s\S]*studioShellEditorMaxWidth/,
    );
    assert.match(header, /<StudioHeader wide>/);
  });

  test("status actions stay consolidated in the header without losing behavior", () => {
    assert.match(header, /workflowStatus/);
    assert.match(workflowStatus, /resolveStorySyncBanner/);
    assert.match(workflowStatus, /resolveStorySyncSteps/);
    assert.match(workflowStatus, /handleBannerPrimary/);
    assert.match(workflowStatus, /dismissBanner/);
    assert.match(workflowStatus, /onGenerateVoice/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEditorWorkspaceRedesignTests();
}
