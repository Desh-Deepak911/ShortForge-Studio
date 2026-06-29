/**
 * Hydration + routing QA (run: npm run test:hydration-routing-qa).
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  isEditorReadyDraft,
  resolveDraftHref,
  resolveDraftScriptForEditor,
  shouldOpenScriptReview,
  updateDraft,
} from "@/features/drafts";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    console.log(`  ✓ ${name}`);
  });
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function scriptOnlyDraft(): FootieScript {
  return syncFootieScript({
    title: "Hydration QA",
    narration: "Script for hydration routing checks.",
    totalDuration: 30,
    scenes: [],
  });
}

console.log("hydrationRoutingQa");

async function run() {
await test("HR-1 /create generates script-only and redirects to review", () => {
  const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  assert.match(flow, /mode:\s*"script-only"/);
  assert.match(flow, /router\.replace\(`\/create\/review\/\$\{draft\.id\}`\)/);
  assert.doesNotMatch(flow, /router\.push\(`\/editor\/\$\{draft\.id\}`\)/);
});

await test("HR-2 review + editor use session draft store (no render-time getDraft)", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const editorHook = readSrc("src/features/drafts/hooks/useEditorStoryDocument.ts");
  const storyStore = readSrc("src/features/drafts/store/story-document.store.tsx");
  const loading = readSrc("src/features/drafts/components/DraftLoadingState.tsx");

  assert.match(reviewFlow, /useReviewStoryDocument/);
  assert.match(editorFlow, /useEditorStoryDocument/);
  assert.match(editorHook, /hydrateFromDraft/);
  assert.match(editorHook, /getDraft\(draftId\)/);
  assert.match(editorHook, /storyDocumentHasScenes/);
  assert.match(editorHook, /shouldOpenScriptReview/);
  assert.match(storyStore, /applyEditorReadyStoryDocument/);
  assert.doesNotMatch(reviewFlow, /useMemo\(\(\) => getDraft/);
  assert.doesNotMatch(editorFlow, /useMemo\(\(\) => getDraft/);
  assert.doesNotMatch(reviewFlow, /useState<FootieScript[^]*getDraft/);
  assert.match(loading, /Loading your story\.\.\./);
  assert.match(loading, /hasProject=\{false\}/);
});

await test("HR-3 review voiceover + Create Scenes routes to editor", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  assert.match(reviewFlow, /mode:\s*"scenes-only"/);
  assert.match(reviewFlow, /flushPersist\("editor_ready"/);
  assert.match(reviewFlow, /router\.push\(`\/editor\/\$\{draftId\}`\)/);
});

await test("HR-4 staged workflow persists editor_ready draft for editor navigation", () => {
  const adapter = createMemoryDraftStorageAdapter();
  const options = { adapter };

  const draft = createDraft(
    {
      script: scriptOnlyDraft(),
      pipelineStage: "script_review",
      creationBrief: {
        topic: "Hydration QA",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 6,
      },
    },
    options,
  );

  assert.equal(resolveDraftHref(draft), `/create/review/${draft.id}`);

  const withVoice = updateDraft(
    draft.id,
    {
      pipelineStage: "voiceover_ready",
      script: syncFootieScript({
        ...scriptOnlyDraft(),
        voiceoverUrl: "blob:voice",
        voiceoverDurationMs: 28_000,
      }),
    },
    options,
  );
  assert.ok(withVoice);
  assert.equal(shouldOpenScriptReview(withVoice!), true);

  const withScenes = updateDraft(
    draft.id,
    {
      pipelineStage: "editor_ready",
      script: syncFootieScript({
        ...scriptOnlyDraft(),
        voiceoverUrl: "blob:voice",
        voiceoverDurationMs: 28_000,
        scenes: [{ id: "1", start: 0, end: 28, duration: 28, subtitle: "Scene 1" }],
      }),
    },
    options,
  );
  assert.ok(withScenes);
  assert.equal(isEditorReadyDraft(withScenes!), true);
  assert.equal(resolveDraftHref(withScenes!), `/editor/${draft.id}`);

  const reloaded = getDraft(draft.id, options);
  assert.ok(reloaded);
  assert.equal(reloaded!.pipelineStage, "editor_ready");
  assert.ok(resolveDraftScriptForEditor(reloaded!).scenes.length > 0);
});

await test("HR-5 legacy drafts with scenes open in editor", () => {
  const legacyScript = syncFootieScript({
    title: "Legacy draft",
    narration: "Pre-staged workflow.",
    totalDuration: 30,
    scenes: [{ id: "1", start: 0, end: 30, duration: 30, subtitle: "Legacy scene" }],
  });

  const draft = createDraft({ script: legacyScript }, { adapter: createMemoryDraftStorageAdapter() });
  assert.equal(shouldOpenScriptReview(draft), false);
  assert.equal(resolveDraftHref(draft), `/editor/${draft.id}`);
});

await test("HR-6 missing draft resolves to not_found after load (not during loading shell)", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const sessionStore = readSrc("src/features/drafts/session/draft-session-store.ts");

  assert.match(sessionStore, /loadStatus: "not_found"/);
  assert.match(reviewFlow, /if \(isLoading\)[\s\S]*DraftLoadingState/);
  assert.match(reviewFlow, /isNotFound/);
  assert.match(reviewFlow, /Draft not found/);
  assert.match(editorFlow, /if \(isLoading \|\| needsReviewRedirect\)[\s\S]*DraftLoadingState/);
  assert.match(editorFlow, /isNotFound/);
  assert.match(editorFlow, /Draft not found/);

  const missing = getDraft("missing-draft-id", { adapter: createMemoryDraftStorageAdapter() });
  assert.equal(missing, null);
});

await test("HR-7 SSR HTML serves loading shell before client draft lookup", async () => {
  const port = 3999;
  const server = await startProductionServer(port);

  try {
    const editorHtml = await fetchText(`http://127.0.0.1:${port}/editor/hydration-qa-draft`);
    const reviewHtml = await fetchText(`http://127.0.0.1:${port}/create/review/hydration-qa-draft`);

    for (const [label, html] of [
      ["editor", editorHtml],
      ["review", reviewHtml],
    ] as const) {
      assert.match(html, /Loading your story\.\.\./, `${label} SSR should show loading shell`);
      assert.doesNotMatch(
        html,
        /Draft not found/,
        `${label} SSR should not render not-found before client lookup`,
      );
      assert.doesNotMatch(
        html,
        /StoryWorkspace|Review your script/,
        `${label} SSR should not render draft-dependent UI`,
      );
    }
  } finally {
    await stopServer(server);
  }
});

console.log("All hydration routing QA checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  assert.equal(response.ok, true, `Expected 200 from ${url}, got ${response.status}`);
  return response.text();
}

function startProductionServer(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "start", "--", "-p", String(port)], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
    });

    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timed out waiting for next start"));
        void stopServer(child);
      }
    }, 120_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Ready") || text.includes(`localhost:${port}`)) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`next start exited early with code ${code ?? "unknown"}`));
      }
    });
  });
}

function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.killed) {
      resolve();
      return;
    }

    child.once("exit", () => resolve());
    child.kill("SIGTERM");

    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5000);
  });
}
