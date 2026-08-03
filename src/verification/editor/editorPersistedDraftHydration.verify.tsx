/**
 * Persisted-draft hydration: /drafts localStorage adoption, editor loading shell,
 * workspace-layout Export drawer, and capability-gated inspector branches must
 * keep server markup identical to the first client hydration snapshot.
 *
 * Run via: npm run test:editor-persisted-draft-hydration
 */

import "./editorPersistedDraftHydration.dom-prelude";
import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, useEffect, useSyncExternalStore, type ReactElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import ExportDrawer from "@/components/studio-shell/ExportDrawer";
import DraftsDashboard from "@/features/drafts/components/DraftsDashboard";
import { useEditorStoryDocument } from "@/features/drafts/hooks/useEditorStoryDocument";
import {
  clearCurrentDocument,
  getStoryDocumentState,
  hydrateFromDraft,
} from "@/features/drafts/store/story-document.store";
import {
  DRAFT_STORAGE_KEY,
  getDraft,
  listDrafts,
  saveDraft,
} from "@/features/drafts/services/draft-storage.service";
import { createDraftFromScript, toDraftSummary } from "@/features/drafts/utils";
import {
  EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
  useEditorWorkspaceLayout,
  writeEditorWorkspaceLayout,
  type EditorWorkspaceLayoutState,
} from "@/features/editor/workspace-layout";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { VisualRetentionCapabilitiesProvider } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";

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

const QA_DRAFT_ID = "qa-persisted-draft-hydration";

function qaFourSceneScript(): FootieScript {
  return {
    title: "QA persisted draft hydration",
    totalDuration: 12,
    narration: "One. Two. Three. Four.",
    scenes: [0, 1, 2, 3].map((index) => ({
      id: `qa-hydration-scene-${index + 1}`,
      start: index * 3,
      end: (index + 1) * 3,
      duration: 3,
      startMs: index * 3_000,
      endMs: (index + 1) * 3_000,
      durationMs: 3_000,
      subtitle: `Scene ${index + 1}`,
      narration: `Beat ${index + 1}.`,
    })),
  };
}

function seedQaDraft(): ReturnType<typeof createDraftFromScript> {
  const draft = createDraftFromScript(
    qaFourSceneScript(),
    {
      topic: "qa-persisted-draft-hydration",
      tone: "dramatic",
      duration: 12,
      qualityMode: "cheap",
      sceneCount: 4,
    },
    QA_DRAFT_ID,
    "editor_ready",
  );
  saveDraft(draft);
  return draft;
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

const stubAppRouter: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => {},
};

function renderDraftsDashboard(): ReactElement {
  return createElement(
    AppRouterContext.Provider,
    { value: stubAppRouter },
    createElement(DraftsDashboard),
  );
}

/**
 * Link-free mirror of the drafts storage-adoption contract so hydrateRoot can
 * compare trees under the minimal DOM (Next Link/SVG SSR is Chrome-covered).
 */
const HARNESS_EMPTY_TITLES: string[] = [];
let harnessTitles: string[] = HARNESS_EMPTY_TITLES;
let harnessAdopted = false;
const harnessListeners = new Set<() => void>();

function resetHarnessStore(): void {
  harnessTitles = HARNESS_EMPTY_TITLES;
  harnessAdopted = false;
}

function emitHarnessChange(): void {
  for (const listener of harnessListeners) {
    listener();
  }
}

function DraftsStorageAdoptionHarness(): ReactElement {
  const titles = useSyncExternalStore(
    (onStoreChange) => {
      harnessListeners.add(onStoreChange);
      return () => {
        harnessListeners.delete(onStoreChange);
      };
    },
    () => harnessTitles,
    () => HARNESS_EMPTY_TITLES,
  );
  const storageAdopted = useSyncExternalStore(
    (onStoreChange) => {
      harnessListeners.add(onStoreChange);
      return () => {
        harnessListeners.delete(onStoreChange);
      };
    },
    () => harnessAdopted,
    () => false,
  );

  useEffect(() => {
    harnessTitles = listDrafts().map((draft) => toDraftSummary(draft).title);
    harnessAdopted = true;
    emitHarnessChange();
  }, []);

  if (!storageAdopted) {
    return <div data-drafts-storage-pending="">Loading stories…</div>;
  }

  if (titles.length === 0) {
    return <div data-drafts-empty="">No stories yet</div>;
  }

  return (
    <ul data-drafts-storage-ready="">
      {titles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}

function ExportLayoutHarness(): ReactElement {
  const layout = useEditorWorkspaceLayout();
  return (
    <div data-editor-layout-harness="">
      <span data-export-open={String(layout.exportDrawerOpen)} />
      <ExportDrawer
        open={layout.exportDrawerOpen}
        onOpenChange={layout.setExportDrawerOpen}
      >
        <div data-export-body="">Browser export</div>
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
      data-scene-count={String(result.script?.scenes.length ?? 0)}
    />
  );
}

function CapabilitiesProbeHarness(): ReactElement {
  return (
    <VisualRetentionCapabilitiesProvider>
      <span data-capabilities-probe="pending" />
    </VisualRetentionCapabilitiesProvider>
  );
}

function InspectorCapabilityHarness(props: {
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly media?: SceneMedia | null;
}): ReactElement {
  const scene: FootieScene = {
    id: "qa-inspector-scene",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3_000,
    durationMs: 3_000,
    subtitle: "Inspector",
    narration: "Inspector beat.",
    ...(props.media ? { media: props.media } : {}),
  };
  return (
    <div data-inspector-capability-harness="">
      <SourceQualitySummary
        scene={scene}
        media={props.media ?? null}
        readiness={{ ready: props.ready, enabled: props.enabled }}
      />
      <span
        data-mixed-media-gate={props.ready && props.enabled ? "on" : "off"}
      />
      <span
        data-visual-pacing-gate={props.ready && props.enabled ? "on" : "off"}
      />
    </div>
  );
}

/**
 * Minimal DOM's `innerHTML` setter only assigns textContent. Materialize a
 * real element tree from simple React SSR markup so hydrateRoot can compare.
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
      for (const node of [
        ...document.querySelectorAll("[data-studio-overlay-backdrop]"),
        ...document.querySelectorAll('[role="dialog"]'),
      ]) {
        node.parentElement?.removeChild(node);
      }
    },
  };
}

function testDraftsDashboardSourceContract(): void {
  const dashboard = readSrc("src/features/drafts/components/DraftsDashboard.tsx");
  assert.match(dashboard, /storageAdopted/);
  assert.match(dashboard, /data-drafts-storage-pending/);
  assert.match(dashboard, /useSyncExternalStore/);
  assert.match(dashboard, /getServerDraftListSnapshot/);
  assert.match(dashboard, /adoptDraftListFromStorage/);
  assert.match(
    dashboard,
    /useEffect\(\(\)\s*=>\s*\{\s*adoptDraftListFromStorage\(\)/,
  );
  assert.doesNotMatch(
    dashboard,
    /useState<StoryDraftSummary\[\]>\(\(\)\s*=>\s*listDrafts/,
  );
  assert.doesNotMatch(dashboard, /suppressHydrationWarning/);
  assert.match(dashboard, /No stories yet/);
}

function testEditorParityContractsRemain(): void {
  const layoutHook = readSrc(
    "src/features/editor/workspace-layout/useEditorWorkspaceLayout.ts",
  );
  assert.match(layoutHook, /getServerEditorWorkspaceLayoutSnapshot/);
  assert.match(
    layoutHook,
    /useEffect\(\(\)\s*=>\s*\{\s*adoptEditorWorkspaceLayoutFromStorage\(\)/,
  );

  const storyStore = readSrc(
    "src/features/drafts/store/story-document.store.tsx",
  );
  assert.match(storyStore, /getServerStoryDocumentSnapshot/);

  const editorDoc = readSrc(
    "src/features/drafts/hooks/useEditorStoryDocument.ts",
  );
  assert.match(editorDoc, /isLoading = !isClient/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /visualRetentionCapabilitiesReady/);
  assert.match(inspector, /SourceQualitySummary/);
  assert.match(inspector, /VisualPacingPanel/);
  assert.match(inspector, /MixedMediaSequencePanel/);

  const sourceQuality = readSrc(
    "src/features/source-quality/editor/SourceQualitySummary.tsx",
  );
  assert.match(sourceQuality, /if \(!ready \|\| !enabled\)/);
  assert.match(sourceQuality, /No media/);
}

async function testDraftsDashboardSsrPendingThenClientAdoptsQaDraft(): Promise<void> {
  memoryStorage.clear();
  resetHarnessStore();
  seedQaDraft();
  assert.ok(window.localStorage.getItem(DRAFT_STORAGE_KEY));

  const dashboard = renderDraftsDashboard();
  const serverHtml = renderToStaticMarkup(dashboard);
  assert.match(serverHtml, /data-drafts-storage-pending/);
  assert.match(serverHtml, /Loading stories/);
  assert.doesNotMatch(serverHtml, /QA persisted draft hydration/);
  assert.doesNotMatch(serverHtml, /No stories yet/);

  // hydrateRoot round-trip of Next Link/SVG is covered in Chrome smoke; the
  // storage-adoption contract is hydrated via the link-free harness below.
  const harness = createElement(DraftsStorageAdoptionHarness);
  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(harness);
  assert.equal(html, renderToStaticMarkup(harness));
  assert.equal(
    errors.length,
    0,
    `unexpected drafts harness hydration errors: ${String(errors[0])}`,
  );
  assert.ok(host.querySelector("[data-drafts-storage-ready]"));
  assert.ok((host.textContent ?? "").includes("QA persisted draft hydration"));

  // Production dashboard post-mount adoption (createRoot — same effect path).
  const mountHost = document.createElement("div");
  document.body.appendChild(mountHost);
  let mountRoot: ReturnType<typeof createRoot> | null = null;
  await act(async () => {
    mountRoot = createRoot(mountHost);
    mountRoot.render(dashboard);
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(
    (mountHost.textContent ?? "").includes("QA persisted draft hydration"),
    "DraftsDashboard must adopt QA draft after mount",
  );
  assert.equal(mountHost.querySelector("[data-drafts-storage-pending]"), null);

  await act(async () => {
    mountRoot?.unmount();
  });
  mountHost.remove();
  await cleanup();
  memoryStorage.clear();
}

async function testDraftsDashboardEmptyAfterAdoption(): Promise<void> {
  memoryStorage.clear();
  resetHarnessStore();
  assert.equal(listDrafts().length, 0);

  const dashboard = renderDraftsDashboard();
  assert.match(renderToStaticMarkup(dashboard), /data-drafts-storage-pending/);

  const harness = createElement(DraftsStorageAdoptionHarness);
  const { host, errors, cleanup } = await hydrateAndCollectErrors(harness);
  assert.equal(errors.length, 0);
  assert.equal(listDrafts().length, 0);
  assert.ok(
    host.querySelector("[data-drafts-empty]"),
    `expected empty marker; got ${host.innerHTML || host.toString()}`,
  );
  assert.equal(host.querySelector("[data-drafts-storage-ready]"), null);

  const mountHost = document.createElement("div");
  document.body.appendChild(mountHost);
  let mountRoot: ReturnType<typeof createRoot> | null = null;
  await act(async () => {
    mountRoot = createRoot(mountHost);
    mountRoot.render(dashboard);
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(mountHost.querySelector("[data-drafts-storage-pending]"), null);
  assert.ok(
    mountHost.querySelector("[data-drafts-empty]"),
    "empty storage must show empty state only after adoption",
  );

  await act(async () => {
    mountRoot?.unmount();
  });
  mountHost.remove();
  await cleanup();
  memoryStorage.clear();
}

async function testPersistedOpenExportDrawerHydration(): Promise<void> {
  memoryStorage.clear();
  seedLayout({ exportDrawerOpen: true, sidebarCollapsed: true });

  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(
    createElement(ExportLayoutHarness),
  );
  assert.equal(errors.length, 0, `unexpected hydration errors: ${String(errors[0])}`);
  assert.match(html, /data-export-open="false"/);
  assert.equal(
    host.querySelector("[data-export-open]")?.getAttribute("data-export-open"),
    "true",
  );
  assert.ok(
    document.querySelector("[data-studio-overlay-backdrop]") ||
      document.querySelector('[role="dialog"]'),
  );
  await cleanup();
  memoryStorage.clear();
}

async function testPersistedClosedExportDrawerHydration(): Promise<void> {
  memoryStorage.clear();
  seedLayout({ exportDrawerOpen: false });

  const { host, errors, cleanup } = await hydrateAndCollectErrors(
    createElement(ExportLayoutHarness),
  );
  assert.equal(errors.length, 0);
  assert.equal(
    host.querySelector("[data-export-open]")?.getAttribute("data-export-open"),
    "false",
  );
  await cleanup();
  memoryStorage.clear();
}

async function testWarmQaDraftEditorHydratesFromLoadingShell(): Promise<void> {
  memoryStorage.clear();
  clearCurrentDocument();
  const draft = seedQaDraft();
  hydrateFromDraft(draft);
  assert.equal(getStoryDocumentState().draftId, draft.id);

  const element = createElement(EditorLoadHarness, { draftId: draft.id });
  const serverHtml = renderToStaticMarkup(element);
  assert.match(serverHtml, /data-loading="true"/);
  assert.match(serverHtml, /data-has-script="false"/);

  const { host, errors, html, cleanup } = await hydrateAndCollectErrors(element);
  assert.equal(html, serverHtml);
  assert.equal(errors.length, 0, `unexpected warm-store hydration error: ${String(errors[0])}`);
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-loading"),
    "false",
  );
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-has-script"),
    "true",
  );
  assert.equal(
    host.querySelector("[data-editor-load]")?.getAttribute("data-scene-count"),
    "4",
  );
  assert.equal(getDraft(draft.id)?.updatedAt, draft.updatedAt);

  await cleanup();
  memoryStorage.clear();
}

async function testCapabilitiesLoadingKeepsFailClosedMarkup(): Promise<void> {
  memoryStorage.clear();
  const element = createElement(CapabilitiesProbeHarness);
  const serverHtml = renderToStaticMarkup(element);
  const { errors, html, cleanup } = await hydrateAndCollectErrors(element);
  assert.equal(html, serverHtml);
  assert.equal(errors.length, 0);
  await cleanup();
}

async function testInspectorCapabilityBranchesHydrate(): Promise<void> {
  const loading = createElement(InspectorCapabilityHarness, {
    ready: false,
    enabled: false,
    media: null,
  });
  const loadingHtml = renderToStaticMarkup(loading);
  assert.doesNotMatch(loadingHtml, /data-source-quality-summary/);
  assert.match(loadingHtml, /data-mixed-media-gate="off"/);
  assert.match(loadingHtml, /data-visual-pacing-gate="off"/);
  const loadingHydrate = await hydrateAndCollectErrors(loading);
  assert.equal(loadingHydrate.errors.length, 0);
  assert.equal(loadingHydrate.html, loadingHtml);
  await loadingHydrate.cleanup();

  const noMedia = createElement(InspectorCapabilityHarness, {
    ready: true,
    enabled: true,
    media: null,
  });
  const noMediaHtml = renderToStaticMarkup(noMedia);
  assert.match(noMediaHtml, /data-source-quality-summary/);
  assert.match(noMediaHtml, /No media/);
  const noMediaHydrate = await hydrateAndCollectErrors(noMedia);
  assert.equal(noMediaHydrate.errors.length, 0);
  assert.equal(noMediaHydrate.html, noMediaHtml);
  await noMediaHydrate.cleanup();

  const withMedia = createElement(InspectorCapabilityHarness, {
    ready: true,
    enabled: true,
    media: {
      type: "image",
      url: "https://example.com/qa-hydration.jpg",
      source: "upload",
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      width: 1080,
      height: 1920,
    },
  });
  const withMediaHtml = renderToStaticMarkup(withMedia);
  assert.match(withMediaHtml, /data-source-quality-summary/);
  assert.doesNotMatch(withMediaHtml, />No media</);
  const withMediaHydrate = await hydrateAndCollectErrors(withMedia);
  assert.equal(withMediaHydrate.errors.length, 0);
  assert.equal(withMediaHydrate.html, withMediaHtml);
  await withMediaHydrate.cleanup();
}

function testLayoutStorageKeyUnchanged(): void {
  assert.equal(
    EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
    "shortforge.editor.workspace-layout.v2",
  );
}

async function main(): Promise<void> {
  console.log("\neditor-persisted-draft-hydration\n");

  const syncTests: Array<[string, () => void]> = [
    ["drafts dashboard defers localStorage until after hydration", testDraftsDashboardSourceContract],
    ["editor parity contracts remain hydration-safe", testEditorParityContractsRemain],
    ["layout storage key unchanged", testLayoutStorageKeyUnchanged],
  ];

  const asyncTests: Array<[string, () => Promise<void>]> = [
    [
      "drafts SSR pending shell; harness hydrates; dashboard adopts QA draft",
      testDraftsDashboardSsrPendingThenClientAdoptsQaDraft,
    ],
    [
      "drafts empty storage shows empty state only after adoption",
      testDraftsDashboardEmptyAfterAdoption,
    ],
    [
      "persisted-open Export drawer matches server then adopts",
      testPersistedOpenExportDrawerHydration,
    ],
    [
      "persisted-closed Export drawer stays closed",
      testPersistedClosedExportDrawerHydration,
    ],
    [
      "warm QA draft editor hydrates from loading shell without storage rewrite",
      testWarmQaDraftEditorHydratesFromLoadingShell,
    ],
    [
      "capabilities provider keeps fail-closed markup through hydration",
      testCapabilitiesLoadingKeepsFailClosedMarkup,
    ],
    [
      "inspector capability loading/enabled + media/no-media hydrate cleanly",
      testInspectorCapabilityBranchesHydrate,
    ],
  ];

  let passed = 0;
  const total = syncTests.length + asyncTests.length;
  for (const [name, run] of syncTests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  for (const [name, run] of asyncTests) {
    await run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }

  console.log(`\neditor-persisted-draft-hydration: ${passed}/${total} PASS`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
