/**
 * Editor workflow status popover layering authority.
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

export function runEditorWorkflowStatusPopoverTests(): void {
  console.log("editorWorkflowStatusPopover");

  const workflowStatus = readSrc(
    "src/features/editor/components/EditorWorkflowStatus.tsx",
  );
  const studioUi = readSrc("src/lib/utils/studioUi.ts");
  const inspector = readSrc("src/components/studio-shell/StudioInspector.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");

  test("status trigger exposes expanded popover state", () => {
    assert.match(workflowStatus, /aria-haspopup="dialog"/);
    assert.match(workflowStatus, /aria-expanded=\{open\}/);
    assert.match(workflowStatus, /aria-controls=\{panelId\}/);
    assert.match(workflowStatus, /onClick=\{\(\) => setOpen\(\(current\) => !current\)\}/);
  });

  test("panel is a non-modal portaled dialog with opaque surface", () => {
    assert.match(workflowStatus, /createPortal\(/);
    assert.match(workflowStatus, /document\.body/);
    assert.match(workflowStatus, /role="dialog"/);
    assert.doesNotMatch(workflowStatus, /aria-modal="true"/);
    assert.match(workflowStatus, /studioWorkflowStatusPopoverPanel/);
    assert.match(studioUi, /studioWorkflowStatusPopoverPanel[\s\S]*bg-surface/);
    assert.doesNotMatch(workflowStatus, /backdrop-blur/);
    assert.doesNotMatch(workflowStatus, /bg-surface\/98/);
    assert.match(workflowStatus, /studioWorkflowStatusPopoverScroll/);
    assert.match(workflowStatus, /maxHeight: position\.maxHeight/);
  });

  test("popover layers above workspace chrome but below modal overlays", () => {
    assert.match(studioUi, /studioWorkflowStatusPopoverPanel[\s\S]*z-\[70\]/);
    assert.match(studioUi, /studioExportDrawerPanel[\s\S]*z-\[60\]/);
    assert.match(studioUi, /studioOverlayModalShell[\s\S]*z-\[80\]/);
    assert.match(workflowStatus, /position:\s*"fixed"|style=\{\{/);
  });

  test("popover closes on escape and click-outside with trigger focus restoration", () => {
    assert.match(workflowStatus, /event\.key === "Escape"/);
    assert.match(workflowStatus, /addEventListener\("pointerdown"/);
    assert.match(workflowStatus, /triggerRef\.current\?\.focus\(\)/);
  });

  test("recovery actions and story-sync handlers remain wired", () => {
    for (const marker of [
      "onPersistAction",
      "persistActionLabel",
      "handleBannerPrimary",
      "dismissBanner",
      "onUpdateNarration",
      "onGenerateVoice",
      "resolveStorySyncSteps",
      "SynchronizationStep",
    ]) {
      assert.match(workflowStatus, new RegExp(marker));
    }
    assert.match(workspace, /persistActionLabel=\{/);
    assert.match(workspace, /missingMediaScenes\.length > 0 \? "Add media" : "Retry save"/);
    assert.match(workspace, /onPersistAction=\{/);
    assert.match(workspace, /effectiveExportDisabled/);
  });

  test("panel is not owned by the inspector clipping container", () => {
    assert.doesNotMatch(inspector, /EditorWorkflowStatus/);
    assert.doesNotMatch(workflowStatus, /<details/);
    assert.doesNotMatch(workflowStatus, /absolute right-0 top-\[calc\(100%\+0\.5rem\)\]/);
  });

  test("viewport collision handling keeps the anchored panel in bounds", () => {
    assert.match(workflowStatus, /measurePopoverPosition/);
    assert.match(workflowStatus, /window\.innerWidth/);
    assert.match(workflowStatus, /window\.innerHeight/);
    assert.match(workflowStatus, /openBelow/);
    assert.match(workflowStatus, /addEventListener\("resize"/);
    assert.match(workflowStatus, /addEventListener\("scroll", handleViewportChange, true\)/);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEditorWorkflowStatusPopoverTests();
}
