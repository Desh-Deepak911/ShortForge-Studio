/**
 * Workspace visual hierarchy verification — styling tokens only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

export function runWorkspaceHierarchyTests(): void {
  console.log("workspaceHierarchy");

  const studioUi = readSrc("src/lib/utils/studioUi.ts");
  const accordion = readSrc("src/components/studio-shell/StudioAccordion.tsx");
  const inspector = readSrc("src/components/studio-shell/StudioInspector.tsx");
  const sidebar = readSrc("src/components/studio-shell/StudioSidebar.tsx");
  const canvas = readSrc("src/components/studio-shell/StudioCanvas.tsx");
  const syncCard = readSrc("src/features/story-sync/components/SynchronizationStatusCard.tsx");
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const timelineUi = readSrc("src/features/timeline-editor/timeline-editor.ui.ts");

  test("studio UI defines progressive workspace elevation tokens", () => {
    assert.match(studioUi, /studioShellCanvasRegionEditor/);
    assert.match(studioUi, /studioShellInspectorSurface/);
    assert.match(studioUi, /studioShellSidebarSurface/);
    assert.match(studioUi, /studioInspectorSection/);
    assert.match(studioUi, /studioWorkspaceTabActive/);
    assert.match(studioUi, /studioSyncStatusCard/);
    assert.match(studioUi, /studioInspectorStack = "flex min-w-0 flex-col gap-3\.5"/);
  });

  test("inspector accordions support section icons without logic changes", () => {
    assert.match(accordion, /icon\?: LucideIcon/);
    assert.match(accordion, /studioInspectorSectionIcon/);
    assert.match(sceneInspector, /icon=\{PenLine\}/);
    assert.match(sceneInspector, /icon=\{ImageIcon\}/);
  });

  test("shell regions use dedicated surface treatments", () => {
    assert.match(inspector, /studioShellInspectorSurface/);
    assert.match(sidebar, /studioShellSidebarSurface/);
    assert.match(canvas, /studioShellCanvasRegionEditor/);
  });

  test("sync card uses presentation-only hierarchy classes", () => {
    assert.match(syncCard, /studioSyncStatusCard/);
    assert.doesNotMatch(syncCard, /onScriptChange/);
  });

  test("timeline styling strengthens selection and playhead presentation", () => {
    assert.match(timelineUi, /ring-2 ring-accent\/55/);
    assert.match(timelineUi, /timelinePlaybackHeadLine/);
    assert.match(timelineUi, /timelineTransitionMarkerBody/);
  });

  test("preview stage uses height-first layout without transform scaling", () => {
    const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
    const storyWorkspace = readSrc("src/components/StoryWorkspace.tsx");
    assert.match(studioUi, /studioPreviewFrameSlot/);
    assert.match(studioUi, /studioPreviewTransportStack/);
    assert.match(studioUi, /studioPreviewStack/);
    assert.doesNotMatch(studioUi, /scale-\[1\.0\]/);
    assert.doesNotMatch(studioUi, /bg-black\/35/);
    assert.match(videoPreview, /studioPreviewFrameSlot/);
    assert.match(videoPreview, /studioPreviewTransportStack/);
    assert.match(storyWorkspace, /viewportMode="fixed"/);
  });

  test("route layout isolation keeps document scroll off editor-only viewport rules", () => {
    const shell = readSrc("src/components/studio-shell/StudioShell.tsx");
    const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
    const reviewPage = readSrc("src/app/create/review/[draftId]/page.tsx");
    assert.match(studioUi, /studioShellRootDocument/);
    assert.match(studioUi, /studioShellRootFixed/);
    assert.match(studioUi, /studioShellCanvasRegionDocument/);
    assert.match(shell, /viewportMode = "document"/);
    assert.match(shell, /data-viewport-mode/);
    assert.match(createFlow, /viewportMode="document"/);
    assert.match(reviewFlow, /viewportMode="document"/);
    assert.match(reviewPage, /StudioPage/);
  });

  test("inspector accordion bodies avoid fractional grid height animation", () => {
    const accordion = readSrc("src/components/studio-shell/StudioAccordion.tsx");
    const tabShell = readSrc("src/features/editor/inspector/InspectorTabShell.tsx");
    assert.doesNotMatch(studioUi, /grid-rows-\[0fr\]/);
    assert.doesNotMatch(studioUi, /grid-rows-\[1fr\]/);
    assert.match(studioUi, /studioInspectorTabBodyScrollHost/);
    assert.match(tabShell, /studioInspectorTabBodyScrollHost/);
    assert.doesNotMatch(tabShell, /absolute inset-0/);
    assert.match(accordion, /handleSummaryClick/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkspaceHierarchyTests();
}
