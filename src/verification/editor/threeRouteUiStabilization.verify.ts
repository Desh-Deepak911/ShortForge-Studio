import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  keepNarrationInSingleParagraph,
  normalizeNarrationForEditing,
} from "@/features/story/utils/narration-editing.utils";

const root = process.cwd();
const readSrc = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log("threeRouteUiStabilization");

test("generated narration is presented as one paragraph", () => {
  assert.equal(
    normalizeNarrationForEditing(
      "First sentence.\n\nSecond sentence.\t Third sentence.",
    ),
    "First sentence. Second sentence. Third sentence.",
  );
  assert.equal(
    keepNarrationInSingleParagraph("First sentence.\nSecond sentence. "),
    "First sentence. Second sentence. ",
  );

  const createFlow = readSrc(
    "src/features/create/components/CreateStoryFlow.tsx",
  );
  const storyReview = readSrc("src/components/StoryReview.tsx");
  assert.match(createFlow, /normalizeNarrationForEditing/);
  assert.match(storyReview, /keepNarrationInSingleParagraph/);
});

test("storyboard creation saves narration and storyboard before editor readiness", () => {
  const reviewFlow = readSrc(
    "src/features/create/components/ScriptReviewFlow.tsx",
  );
  const createScenesStart = reviewFlow.indexOf(
    "const handleCreateScenes = useCallback",
  );
  const primaryActionStart = reviewFlow.indexOf(
    "const handlePrimaryAction = useCallback",
  );
  const createScenesBlock = reviewFlow.slice(
    createScenesStart,
    primaryActionStart,
  );

  const saveNarrationAt = createScenesBlock.indexOf(
    'flushPersist("voiceover_ready", script)',
  );
  const generateAt = createScenesBlock.indexOf(
    'fetch("/api/generate-script"',
  );
  const saveStoryboardAt = createScenesBlock.indexOf(
    'flushPersist("editor_ready", nextScriptWithScenes)',
  );
  const applyEditorReadyAt = createScenesBlock.indexOf(
    "applyEditorReadyScript(nextScriptWithScenes)",
  );

  assert.ok(saveNarrationAt >= 0 && saveNarrationAt < generateAt);
  assert.ok(generateAt >= 0 && generateAt < saveStoryboardAt);
  assert.ok(
    saveStoryboardAt >= 0 && saveStoryboardAt < applyEditorReadyAt,
  );
  assert.doesNotMatch(createScenesBlock, /router\.push|router\.replace/);
});

test("only the explicit Open Editor action navigates after storyboard success", () => {
  const reviewFlow = readSrc(
    "src/features/create/components/ScriptReviewFlow.tsx",
  );
  assert.doesNotMatch(
    reviewFlow,
    /router\.replace\(`\/editor\/\$\{draftId\}`\)/,
  );
  assert.match(
    reviewFlow,
    /label:\s*"Open Editor"[\s\S]*onClick:\s*handlePrimaryAction/,
  );
  assert.match(
    reviewFlow,
    /const handleOpenEditor[\s\S]*router\.push\(`\/editor\/\$\{draftId\}`\)/,
  );
});

test("draft audio is offloaded before localStorage metadata is updated", () => {
  const persistence = readSrc(
    "src/features/drafts/session/draft-session-persist.utils.ts",
  );
  const routeHydration = readSrc(
    "src/features/drafts/hooks/useRouteStoryDocument.ts",
  );
  const audioStorage = readSrc(
    "src/features/drafts/services/draft-audio-storage.service.ts",
  );

  const serializeAt = persistence.indexOf(
    "serializeEditorStateForDraftAsync(scriptToPersist)",
  );
  const offloadAt = persistence.indexOf(
    "offloadDraftAudioAssets(draftId, serializedWithAudio)",
  );
  const updateAt = persistence.indexOf("updateDraft(draftId");
  assert.ok(serializeAt >= 0 && serializeAt < offloadAt);
  assert.ok(offloadAt >= 0 && offloadAt < updateAt);
  assert.match(routeHydration, /hydrateDraftWithAudioAssets\(stored\)/);
  assert.match(audioStorage, /shortforge-draft-audio:/);
  assert.match(audioStorage, /delete compact\.voiceoverAudioBase64/);
  assert.match(audioStorage, /delete compactBackground\.fileDataBase64/);
});

test("explicit saves queue behind background autosave instead of reusing it", () => {
  const sessionStore = readSrc(
    "src/features/drafts/session/draft-session-store.ts",
  );
  assert.match(
    sessionStore,
    /if \(nextStage != null \|\| scriptOverride != null\)[\s\S]*inFlight\.then[\s\S]*flushDraftSessionPersist/,
  );
});

test("Create and Review use bounded compact document layouts", () => {
  const createFlow = readSrc(
    "src/features/create/components/CreateStoryFlow.tsx",
  );
  const briefCanvas = readSrc(
    "src/features/create/components/BriefCanvas.tsx",
  );
  const reviewFlow = readSrc(
    "src/features/create/components/ScriptReviewFlow.tsx",
  );
  const scriptCanvas = readSrc(
    "src/features/create/components/ScriptCanvas.tsx",
  );

  assert.match(createFlow, /compactMode/);
  assert.match(reviewFlow, /compactMode/);
  assert.match(briefCanvas, /max-w-\[68rem\]/);
  assert.match(scriptCanvas, /max-w-\[68rem\]/);
  assert.match(reviewFlow, /max-w-\[92rem\]/);
  assert.match(
    reviewFlow,
    /xl:grid-cols-\[minmax\(0,1fr\)_22rem\]/,
  );
  assert.match(reviewFlow, /aria-label="Story workflow"/);
  assert.doesNotMatch(reviewFlow, /\n\s+sidebar=\{/);
  assert.doesNotMatch(reviewFlow, /\n\s+inspector=\{/);
});

test("Editor missing-media recovery remains compact", () => {
  const sidebar = readSrc(
    "src/features/editor/components/EditorProjectSidebar.tsx",
  );
  assert.match(sidebar, /aria-label=\{`Add media to scene/);
  assert.match(sidebar, /className="flex w-8 shrink-0/);
  assert.doesNotMatch(sidebar, />\s*Add media\s*</);
  assert.doesNotMatch(sidebar, /Project timeline/);
});

console.log(`${passed} passed`);
