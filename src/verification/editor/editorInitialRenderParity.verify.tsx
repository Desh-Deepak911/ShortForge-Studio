/**
 * Editor initial-render parity: server markup, first client hydration snapshot,
 * and post-mount adoption of browser-backed draft/layout state must not diverge
 * during hydration.
 *
 * Run via: npm run test:editor-initial-render-parity
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, type ReactElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import ExportDrawer from "@/components/studio-shell/ExportDrawer";
import StudioOverlay from "@/components/studio-overlay/StudioOverlay";
import { useEditorStoryDocument } from "@/features/drafts/hooks/useEditorStoryDocument";
import {
  clearCurrentDocument,
  getStoryDocumentState,
} from "@/features/drafts/store/story-document.store";
import {
  DRAFT_STORAGE_KEY,
  getDraft,
  saveDraft,
} from "@/features/drafts/services/draft-storage.service";
import { createDraftFromScript } from "@/features/drafts/utils";
import {
  EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
  useEditorWorkspaceLayout,
  writeEditorWorkspaceLayout,
  type EditorWorkspaceLayoutState,
} from "@/features/editor/workspace-layout";
import { VisualRetentionCapabilitiesProvider } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import type { FootieScript } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function installMemoryLocalStorage(): {
  store: Map<string, string>;
  clear(): void;
} {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });
  return {
    store,
    clear() {
      store.clear();
      clearCurrentDocument();
    },
  };
}

const memoryStorage = installMemoryLocalStorage();

function fixtureScript(): FootieScript {
  return {
    title: "Editor parity fixture",
    totalDuration: 6,
    narration: "One beat. Two beat.",
    scenes: [
      {
        id: "parity-scene-1",
        start: 0,
        end: 6,
        duration: 6,
        startMs: 0,
        endMs: 6_000,
        durationMs: 6_000,
        subtitle: "Fixture",
        narration: "One beat. Two beat.",
      },
    ],
  };
}

function ExportLayoutHarness(): ReactElement {
  const layout = useEditorWorkspaceLayout();
  return (
    <div data-editor-layout-harness="">
      <span data-export-open={String(layout.exportDrawerOpen)} />
      <span data-sidebar-collapsed={String(layout.sidebarCollapsed)} />
      <ExportDrawer
        open={layout.exportDrawerOpen}
        onOpenChange={layout.setExportDrawerOpen}
      >
        <div data-export-body="">
          Browser export
          <span data-headless-marker="">Headless</span>
        </div>
      </ExportDrawer>
    </div>
  );
}

function EditorLoadHarness({ draftId }: { draftId: string }): ReactElement {
  const result = useEditorStoryDocument(draftId);
  return (
    <div
      data-editor-load=""
      data-loading={String(result.isLoading)}
      data-not-found={String(result.isNotFound)}
      data-has-script={String(result.script != null)}
    />
  );
}

function CapabilitiesHarness(): ReactElement {
  return (
    <VisualRetentionCapabilitiesProvider>
      <span data-capabilities-probe="pending" />
    </VisualRetentionCapabilitiesProvider>
  );
}

function seedLayout(partial: Partial<EditorWorkspaceLayoutState>): void {
  writeEditorWorkspaceLayout({
    sidebarCollapsed: false,
    inspectorCollapsed: false,
    inspectorWidthPx: 420,
    timelineDensity: "comfortable",
    timelineHeightPx: 280,
    previewSize: "fit",
    focusMode: false,
    exportDrawerOpen: false,
    ...partial,
  });
}

function assertNoOverlayMarkup(root: ParentNode | string): void {
  const html = typeof root === "string" ? root : root.toString();
  assert.doesNotMatch(html, /data-studio-overlay-backdrop/);
  assert.doesNotMatch(html, /role="dialog"/);
  assert.doesNotMatch(html, /aria-modal/);
}

/**
 * Minimal DOM's `innerHTML` setter only assigns textContent. Materialize a
 * real element tree from the simple React SSR markup used by these harnesses
 * (div/span + data-* attrs + text) so hydrateRoot can compare trees.
 */
function appendParsedMarkup(host: HTMLElement, html: string): void {
  let cursor = 0;
  const length = html.length;

  const parseAttrs = (raw: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const attrRe = /([^\s=]+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = attrRe.exec(raw)) != null) {
      attrs[match[1]!] = match[2]!;
    }
    return attrs;
  };

  const parseNodes = (stopTag: string | null): Node[] => {
    const nodes: Node[] = [];
    while (cursor < length) {
      if (stopTag && html.startsWith(`</${stopTag}>`, cursor)) {
        cursor += stopTag.length + 3;
        break;
      }
      if (html[cursor] !== "<") {
        const nextTag = html.indexOf("<", cursor);
        const text = html.slice(cursor, nextTag < 0 ? length : nextTag);
        cursor = nextTag < 0 ? length : nextTag;
        if (text.length > 0) {
          nodes.push(document.createTextNode(text));
        }
        continue;
      }
      assert.notEqual(html[cursor + 1], "/", "unexpected close tag while parsing");
      const afterOpen = cursor + 1;
      const tagEnd = html.indexOf(">", afterOpen);
      assert.ok(tagEnd > afterOpen, "malformed SSR tag");
      const openRaw = html.slice(afterOpen, tagEnd);
      cursor = tagEnd + 1;
      const selfClosing = openRaw.endsWith("/");
      const openBody = selfClosing ? openRaw.slice(0, -1).trim() : openRaw.trim();
      const space = openBody.search(/\s/);
      const tag = (space < 0 ? openBody : openBody.slice(0, space)).toLowerCase();
      const attrRaw = space < 0 ? "" : openBody.slice(space + 1);
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(parseAttrs(attrRaw))) {
        el.setAttribute(name, value);
      }
      if (!selfClosing) {
        for (const child of parseNodes(tag)) {
          el.appendChild(child);
        }
      }
      nodes.push(el);
    }
    return nodes;
  };

  for (const node of parseNodes(null)) {
    host.appendChild(node);
  }
}

async function hydrateAndCollectErrors(
  element: ReactElement,
): Promise<{
  host: HTMLElement;
  errors: unknown[];
  html: string;
  cleanup: () => Promise<void>;
}> {
  const html = renderToStaticMarkup(element);
  const host = document.createElement("div");
  document.body.appendChild(host);
  appendParsedMarkup(host, html);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(host, element, {
      onRecoverableError(error) {
        errors.push(error);
      },
    });
  });
  // Allow requestAnimationFrame-backed post-mount work (draft load) to settle.
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  return {
    host,
    errors,
    html,
    async cleanup() {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
      // Portals target document.body — clear any leftover overlay nodes.
      for (const node of [
        ...document.querySelectorAll("[data-studio-overlay-backdrop]"),
        ...document.querySelectorAll('[role="dialog"]'),
      ]) {
        node.parentElement?.removeChild(node);
      }
    },
  };
}

function testSourceHydrationContracts(): void {
  const layoutHook = readSrc(
    "src/features/editor/workspace-layout/useEditorWorkspaceLayout.ts",
  );
  assert.match(layoutHook, /DEFAULT_EDITOR_WORKSPACE_LAYOUT/);
  assert.match(layoutHook, /getServerEditorWorkspaceLayoutSnapshot/);
  assert.match(layoutHook, /useSyncExternalStore/);
  assert.match(layoutHook, /readEditorWorkspaceLayout\(\)/);
  assert.doesNotMatch(layoutHook, /useState\(\(\)\s*=>\s*readEditorWorkspaceLayout/);
  assert.doesNotMatch(layoutHook, /suppressHydrationWarning/);

  const storyStore = readSrc(
    "src/features/drafts/store/story-document.store.tsx",
  );
  assert.match(storyStore, /getServerStoryDocumentSnapshot/);
  assert.match(
    storyStore,
    /useSyncExternalStore\(\s*subscribeStoryDocument,\s*getStoryDocumentSnapshot,\s*getServerStoryDocumentSnapshot/,
  );

  const canvas = readSrc(
    "src/features/editor/components/EditorCanvasEditLayer.tsx",
  );
  assert.match(canvas, /getServerCanvasEditHintsSnapshot/);
  assert.match(canvas, /useSyncExternalStore/);
  assert.doesNotMatch(canvas, /useState\(areCanvasEditHintsDismissed/);
  assert.doesNotMatch(canvas, /useState\(false\);\s*\n\s*useEffect\(\(\)\s*=>\s*\{\s*setHintsDismissed/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /workspaceLayout\.exportDrawerOpen/);
  assert.match(workspace, /workspaceLayout\.setExportDrawerOpen/);
  assert.doesNotMatch(
    workspace,
    /const \[exportDrawerOpen,\s*setExportDrawerOpen\]\s*=\s*useState\(false\)/,
  );

  const editorDoc = readSrc(
    "src/features/drafts/hooks/useEditorStoryDocument.ts",
  );
  assert.match(editorDoc, /useIsClientMounted/);
  assert.match(editorDoc, /isLoading = !isClient/);

  const loadingState = readSrc(
    "src/features/drafts/components/DraftLoadingState.tsx",
  );
  assert.match(loadingState, /Stable SSR\/client shell/);
  assert.match(loadingState, /Opening your project/);
  assert.doesNotMatch(loadingState, /getDraft\(|window\.localStorage/);

  const capabilities = readSrc(
    "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
  );
  assert.match(capabilities, /VISUAL_RETENTION_CAPABILITIES_DISABLED/);
  assert.match(capabilities, /useState<VisualRetentionCapabilitiesSnapshot>\(\s*VISUAL_RETENTION_CAPABILITIES_DISABLED/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection/);
  assert.match(exportPanel, /Browser/);

  const overlay = readSrc("src/components/studio-overlay/StudioOverlay.tsx");
  assert.match(overlay, /useClientMounted/);
  assert.doesNotMatch(overlay, /suppressHydrationWarning/);
}

function testServerRenderOmitsOpenDrawerPortal(): void {
  seedLayout({ exportDrawerOpen: true, sidebarCollapsed: true });
  const html = renderToStaticMarkup(<ExportLayoutHarness />);
  assert.match(html, /data-export-open="false"/);
  assert.match(html, /data-sidebar-collapsed="false"/);
  assertNoOverlayMarkup(html);
  assert.doesNotMatch(html, /data-export-body/);
}

function testServerRenderClosedDrawerStaysEmpty(): void {
  seedLayout({ exportDrawerOpen: false });
  const html = renderToStaticMarkup(<ExportLayoutHarness />);
  assert.match(html, /data-export-open="false"/);
  assertNoOverlayMarkup(html);
}

function testStudioOverlayServerStillOmitsPortal(): void {
  for (const open of [false, true]) {
    const html = renderToStaticMarkup(
      <StudioOverlay
        open={open}
        onOpenChange={() => {}}
        variant="drawer-end"
        title="Export Video"
        keepMounted
      >
        panel-body
      </StudioOverlay>,
    );
    assert.equal(html, "");
  }
}

async function testHydrationMatchesServerWithPersistedOpenDrawer(): Promise<void> {
  memoryStorage.clear();
  seedLayout({ exportDrawerOpen: true, sidebarCollapsed: true });

  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(
    <ExportLayoutHarness />,
  );

  assert.equal(errors.length, 0, `unexpected hydration errors: ${String(errors[0])}`);
  assert.match(html, /data-export-open="false"/);
  assertNoOverlayMarkup(html);

  // Post-hydration adoption: persisted open drawer + layout chrome.
  assert.equal(
    host.querySelector("[data-export-open]")?.getAttribute("data-export-open"),
    "true",
  );
  assert.equal(
    host
      .querySelector("[data-sidebar-collapsed]")
      ?.getAttribute("data-sidebar-collapsed"),
    "true",
  );
  assert.ok(
    document.querySelector("[data-studio-overlay-backdrop]") ||
      document.querySelector('[role="dialog"]'),
    "expected Export drawer portal after hydration adoption",
  );
  assert.ok(
    document.body.textContent?.includes("Browser export"),
    "expected Browser export controls after mount",
  );
  assert.ok(
    document.body.textContent?.includes("Headless"),
    "expected Headless marker after mount",
  );

  await cleanup();
  memoryStorage.clear();
}

async function testHydrationKeepsPersistedClosedDrawerClosed(): Promise<void> {
  memoryStorage.clear();
  seedLayout({ exportDrawerOpen: false });

  const { host, errors, cleanup } = await hydrateAndCollectErrors(
    <ExportLayoutHarness />,
  );
  assert.equal(errors.length, 0);
  assert.equal(
    host.querySelector("[data-export-open]")?.getAttribute("data-export-open"),
    "false",
  );
  // keepMounted portals may exist after mount; closed means aria-hidden + flag false.
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog) {
    assert.equal(dialog.getAttribute("aria-hidden"), "true");
  }
  assert.equal(
    host.querySelector("[data-export-open]")?.getAttribute("data-export-open"),
    "false",
    "closed drawer must stay closed after mount",
  );
  await cleanup();
  memoryStorage.clear();
}

async function testDraftNotFoundDeterministicHydration(): Promise<void> {
  memoryStorage.clear();
  clearCurrentDocument();

  const element = <EditorLoadHarness draftId="missing-parity-draft" />;
  const serverHtml = renderToStaticMarkup(element);
  assert.match(serverHtml, /data-loading="true"/);
  assert.match(serverHtml, /data-not-found="false"/);

  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(element);
  assert.equal(html, serverHtml);
  assert.equal(errors.length, 0);
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-not-found"),
    "true",
  );
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-loading"),
    "false",
  );
  await cleanup();
  memoryStorage.clear();
}

async function testExistingDraftLoadsWithoutMutation(): Promise<void> {
  memoryStorage.clear();
  clearCurrentDocument();

  const draft = createDraftFromScript(
    fixtureScript(),
    {
      topic: "parity fixture",
      tone: "dramatic",
      duration: 6,
      qualityMode: "cheap",
      sceneCount: 1,
    },
    "parity-draft-fixture",
    "editor_ready",
  );
  saveDraft(draft);
  const before = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  assert.ok(before);

  const { host, errors, cleanup } = await hydrateAndCollectErrors(
    <EditorLoadHarness draftId={draft.id} />,
  );
  assert.equal(errors.length, 0);

  // Allow async audio hydrate + store adopt.
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  });

  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-has-script"),
    "true",
  );
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-loading"),
    "false",
  );

  const after = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  assert.equal(after, before, "opening an existing draft must not rewrite storage");
  const reloaded = getDraft(draft.id);
  assert.ok(reloaded);
  assert.equal(reloaded!.updatedAt, draft.updatedAt);
  assert.equal(reloaded!.script.title, draft.script.title);
  assert.equal(getStoryDocumentState().draftId, draft.id);

  await cleanup();
  memoryStorage.clear();
}

async function testCapabilitiesProviderDoesNotDivergeMarkup(): Promise<void> {
  memoryStorage.clear();
  const element = <CapabilitiesHarness />;
  const serverHtml = renderToStaticMarkup(element);
  assert.match(serverHtml, /data-capabilities-probe="pending"/);

  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(element);
  assert.equal(html, serverHtml);
  assert.equal(errors.length, 0);
  assert.equal(
    host
      .querySelector("[data-capabilities-probe]")
      ?.getAttribute("data-capabilities-probe"),
    "pending",
    "capabilities provider must keep fail-closed markup through hydration",
  );
  await cleanup();
}

function testLayoutStorageKeyUnchanged(): void {
  assert.equal(
    EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
    "shortforge.editor.workspace-layout.v2",
  );
  assert.match(
    window.localStorage
      ? EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY
      : "shortforge.editor.workspace-layout.v2",
    /workspace-layout\.v2/,
  );
}

async function main(): Promise<void> {
  console.log("\neditor-initial-render-parity\n");

  const syncTests: Array<[string, () => void]> = [
    ["source hydration contracts", testSourceHydrationContracts],
    [
      "server render with persisted-open drawer omits portal",
      testServerRenderOmitsOpenDrawerPortal,
    ],
    [
      "server render with persisted-closed drawer stays empty",
      testServerRenderClosedDrawerStaysEmpty,
    ],
    ["StudioOverlay SSR omits portal", testStudioOverlayServerStillOmitsPortal],
    ["layout storage key unchanged", testLayoutStorageKeyUnchanged],
  ];

  const asyncTests: Array<[string, () => Promise<void>]> = [
    [
      "hydration matches server; persisted-open drawer appears after mount",
      testHydrationMatchesServerWithPersistedOpenDrawer,
    ],
    [
      "persisted-closed drawer remains closed after mount",
      testHydrationKeepsPersistedClosedDrawerClosed,
    ],
    [
      "draft-not-found loading markup deterministic then resolves",
      testDraftNotFoundDeterministicHydration,
    ],
    [
      "existing draft loads without mutating storage",
      testExistingDraftLoadsWithoutMutation,
    ],
    [
      "visual retention capabilities provider does not diverge markup",
      testCapabilitiesProviderDoesNotDivergeMarkup,
    ],
  ];

  let passed = 0;
  const total = syncTests.length + asyncTests.length;
  for (const [name, run] of syncTests) {
    memoryStorage.clear();
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  for (const [name, run] of asyncTests) {
    memoryStorage.clear();
    await run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }

  // Keep createRoot import exercised for mount-only overlay focus regression smoke.
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StudioOverlay
        open
        onOpenChange={() => {}}
        variant="drawer-end"
        title="Export Video"
        keepMounted
      >
        mounted-body
      </StudioOverlay>,
    );
  });
  assert.ok(document.querySelector('[role="dialog"]'));
  await act(async () => {
    root.unmount();
  });
  host.remove();
  passed += 1;
  console.log(`  ✓ StudioOverlay client mount still portals when open`);

  console.log(
    `\neditor-initial-render-parity: ${passed}/${total + 1} PASS`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
