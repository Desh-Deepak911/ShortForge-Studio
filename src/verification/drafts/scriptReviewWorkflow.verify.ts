/**
 * Script review workflow verification (run: npm run test:script-review-workflow).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  hydrateDraftScriptAudio,
  isEditorReadyDraft,
  resolveDraftHref,
  resolveDraftStatusLabel,
  resolveDraftWorkflowStatus,
  resolvePipelineStageFromScript,
  shouldOpenScriptReview,
  toDraftSummary,
} from "@/features/drafts";
import type { Draft } from "@/features/drafts";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseDraft(overrides: Partial<Draft> = {}): Draft {
  const script: FootieScript = syncFootieScript({
    title: "Review QA",
    narration: "A narration script for review workflow testing.",
    totalDuration: 30,
    scenes: [],
    ...(overrides.script ?? {}),
  });

  return {
    id: "draft-review-qa",
    title: script.title,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    script,
    scenes: script.scenes,
    sceneCount: script.scenes.length,
    totalDuration: script.totalDuration,
    hasVoiceover: false,
    creationBrief: {
      topic: "Review QA topic",
      tone: "dramatic",
      duration: 30,
      qualityMode: "cheap",
      sceneCount: 6,
    },
    pipelineStage: "script_review",
    ...overrides,
  };
}

console.log("scriptReviewWorkflow");

test("create flow requests script-only generation", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const briefInspector = readSrc("src/features/create/components/CreateBriefInspector.tsx");
  assert.match(createFlow, /mode:\s*"script-only"/);
  assert.match(createFlow, /\/create\/review\//);
  assert.match(createFlow, /scriptMode/);
  assert.match(createFlow, /creationBrief/);
  assert.doesNotMatch(createFlow, /attachVoiceoverToScript/);
  assert.doesNotMatch(createFlow, /\/editor\//);
  assert.match(briefInspector, /scriptMode/);
  assert.match(briefInspector, /Stats, formations, or anything else to include/);
});

test("review route and editor redirect are wired", () => {
  const reviewPage = readSrc("src/app/create/review/[draftId]/page.tsx");
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");

  assert.match(reviewPage, /ScriptReviewFlow/);
  assert.match(reviewFlow, /mode:\s*"scenes-only"/);
  assert.match(reviewFlow, /StoryReview/);
  assert.match(reviewFlow, /VoiceSettingsCard/);
  assert.match(reviewFlow, /Build Storyboard/);
  assert.match(reviewFlow, /Additional Notes/);
  assert.match(reviewFlow, /Content type/);
  assert.match(reviewFlow, /variant="review"/);
  assert.match(readSrc("src/features/drafts/hooks/useEditorStoryDocument.ts"), /shouldOpenScriptReview/);
  assert.match(editorFlow, /useEditorStoryDocument/);
  assert.match(reviewFlow, /useReviewStoryDocument/);
  assert.match(editorFlow, /router\.replace/);
  assert.match(editorFlow, /\/create\/review\//);
  assert.doesNotMatch(editorFlow, /generate-script/);
  assert.doesNotMatch(editorFlow, /generate-voiceover/);
  assert.doesNotMatch(editorFlow, /fetch\(/);
});

test("generate-script route supports staged modes", () => {
  const route = readSrc("src/app/api/generate-script/route.ts");
  const resolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
  const prompts = readSrc("src/lib/ai/prompts.ts");
  assert.match(route, /generateScriptOnlyStory/);
  assert.match(route, /generateScenesForReviewedScript/);
  assert.match(route, /mode === "script-only"/);
  assert.match(route, /mode === "scenes-only"/);
  assert.match(route, /scriptMode/);
  assert.match(route, /resolveScriptResearchContext/);
  assert.match(route, /enableResearch/);
  assert.match(route, /researchPreview/);
  assert.match(resolver, /applyAssembledResearchContext/);
  assert.match(resolver, /isResearchContextTextUseful/);
  assert.match(prompts, /RESEARCHED FOOTBALL CONTEXT/);
  assert.match(prompts, /Mode voice/);
  assert.match(prompts, /tactical_review/);
  assert.match(prompts, /no fake xG/);
  assert.match(prompts, /Output exactly two fields/);
});

test("pipeline helpers route incomplete drafts to review", () => {
  const scriptReview = baseDraft();
  assert.equal(shouldOpenScriptReview(scriptReview), true);
  assert.equal(resolveDraftHref(scriptReview), "/create/review/draft-review-qa");
  assert.equal(resolveDraftWorkflowStatus(scriptReview), "script_review");
  assert.equal(resolveDraftStatusLabel(scriptReview), "Story");

  const withVoice = baseDraft({
    pipelineStage: "voiceover_ready",
    script: syncFootieScript({
      title: "Review QA",
      narration: "Voice attached.",
      totalDuration: 30,
      voiceoverUrl: "blob:voice",
      voiceoverDurationMs: 30_000,
      scenes: [],
    }),
    hasVoiceover: true,
  });
  assert.equal(shouldOpenScriptReview(withVoice), true);
  assert.equal(resolveDraftHref(withVoice), "/create/review/draft-review-qa");
  assert.equal(resolveDraftWorkflowStatus(withVoice), "voice_ready");
  assert.equal(resolveDraftStatusLabel(withVoice), "Narration");

  const editorReady = baseDraft({
    pipelineStage: "editor_ready",
    script: syncFootieScript({
      title: "Review QA",
      narration: "Storyboard ready.",
      totalDuration: 30,
      voiceoverUrl: "blob:voice",
      voiceoverDurationMs: 30_000,
      scenes: [
        {
          id: "1",
          start: 0,
          end: 30,
          duration: 30,
          subtitle: "Scene",
        },
      ],
    }),
    sceneCount: 1,
  });
  assert.equal(isEditorReadyDraft(editorReady), true);
  assert.equal(shouldOpenScriptReview(editorReady), false);
  assert.equal(resolveDraftHref(editorReady), "/editor/draft-review-qa");
  assert.equal(resolveDraftWorkflowStatus(editorReady), "storyboard_ready");
  assert.equal(resolveDraftStatusLabel(editorReady), "Storyboard");

  const legacyWithScenes = baseDraft({
    pipelineStage: undefined,
    script: syncFootieScript({
      title: "Legacy",
      narration: "Old one-shot draft.",
      totalDuration: 30,
      scenes: [{ id: "1", start: 0, end: 30, duration: 30, subtitle: "Scene" }],
    }),
    sceneCount: 1,
  });
  assert.equal(resolveDraftHref(legacyWithScenes), "/editor/draft-review-qa");
  assert.equal(resolveDraftWorkflowStatus(legacyWithScenes), "storyboard_ready");

  const exported = baseDraft({ status: "exported" });
  assert.equal(resolveDraftWorkflowStatus(exported), "exported");
  assert.equal(resolveDraftStatusLabel(exported), "Exported");

  const summary = toDraftSummary(withVoice);
  assert.equal(summary.workflowStatus, "voice_ready");
  assert.equal(summary.workflowStatusLabel, "Narration");
});

test("editor guard blocks incomplete drafts before StoryWorkspace", () => {
  const scriptReview = baseDraft();
  assert.equal(shouldOpenScriptReview(scriptReview), true);

  const legacyWithScenes = baseDraft({
    pipelineStage: undefined,
    script: syncFootieScript({
      title: "Legacy",
      narration: "Legacy draft with scenes.",
      totalDuration: 30,
      scenes: [{ id: "1", start: 0, end: 30, duration: 30, subtitle: "Scene" }],
    }),
    sceneCount: 1,
  });
  assert.equal(shouldOpenScriptReview(legacyWithScenes), false);
  assert.equal(resolveDraftHref(legacyWithScenes), "/editor/draft-review-qa");
});

test("drafts dashboard shows workflow status labels", () => {
  const dashboard = readSrc("src/features/drafts/components/DraftsDashboard.tsx");
  assert.match(dashboard, /workflowStatusLabel/);
  assert.match(dashboard, /resolveDraftHref/);
});

test("resolvePipelineStageFromScript follows voiceover and scenes", () => {
  const scriptOnly = syncFootieScript({
    title: "Stage",
    narration: "Only script.",
    totalDuration: 30,
    scenes: [],
  });
  assert.equal(resolvePipelineStageFromScript(scriptOnly), "script_review");

  const withVoice = syncFootieScript({
    ...scriptOnly,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 30_000,
  });
  assert.equal(resolvePipelineStageFromScript(withVoice), "voiceover_ready");

  const withScenes = syncFootieScript({
    ...withVoice,
    scenes: [{ id: "1", start: 0, end: 30, duration: 30, subtitle: "Scene" }],
  });
  assert.equal(resolvePipelineStageFromScript(withScenes), "editor_ready");
});

console.log("\nscriptReviewWorkflow QA checklist");

test("QA-1 /create generates script only", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  assert.match(createFlow, /mode:\s*"script-only"/);
  assert.doesNotMatch(createFlow, /mode:\s*"full"/);
  assert.doesNotMatch(createFlow, /mode:\s*"scenes-only"/);
  assert.doesNotMatch(createFlow, /generate-voiceover/);
});

test("QA-2 scriptMode and context are saved in creationBrief", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  assert.match(createFlow, /scriptMode,/);
  assert.match(createFlow, /context: context\.trim\(\)/);

  const adapter = createMemoryDraftStorageAdapter();
  const draft = createDraft(
    {
      script: syncFootieScript({
        title: "Tactical QA",
        narration: "Pressing triggers and shape.",
        totalDuration: 30,
        scenes: [],
      }),
      creationBrief: {
        topic: "Tactical QA topic",
        tone: "tactical",
        duration: 30,
        qualityMode: "balanced",
        sceneCount: 6,
        scriptMode: "tactical_review",
        context: "4-3-3 vs 4-2-3-1, 58% possession",
      },
      pipelineStage: "script_review",
    },
    { adapter },
  );

  const loaded = getDraft(draft.id, { adapter });
  assert.equal(loaded?.creationBrief?.scriptMode, "tactical_review");
  assert.equal(loaded?.creationBrief?.context, "4-3-3 vs 4-2-3-1, 58% possession");
});

test("QA-3 review page opens after script generation", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  assert.match(createFlow, /router\.replace\(`\/create\/review\/\$\{draft\.id\}`\)/);
  assert.match(createFlow, /seedDraftSession/);
  assert.match(createFlow, /variant="script-only"/);
  assert.doesNotMatch(createFlow, /router\.push\(`\/editor\//);
});

test("QA-4 script can be edited and auto-saved on review page", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const storyReview = readSrc("src/components/StoryReview.tsx");
  assert.match(reviewFlow, /StoryReview/);
  assert.match(reviewFlow, /onStoryChange/);
  assert.match(reviewFlow, /schedulePersist/);
  assert.match(reviewFlow, /script\?\.title, script\?\.narration/);
  assert.match(storyReview, /story-narration/);
  assert.match(storyReview, /story-title/);
  assert.match(storyReview, /getEstimatedScriptDurationSeconds/);
  assert.match(storyReview, /Target:/);
  assert.match(storyReview, /Estimated script:/);
  assert.match(storyReview, /SCRIPT_LENGTH_OVER_TARGET_WARNING/);
  assert.match(reviewFlow, /variant="embedded"/);
});

test("QA-5 voiceover generates from current edited script", () => {
  const hook = readSrc("src/hooks/useStoryVoiceoverApply.ts");
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  assert.match(hook, /const baseline = scriptRef\.current/);
  assert.match(hook, /narration: narrationText/);
  assert.match(hook, /baseline\.narration\.trim\(\)/);
  assert.match(reviewFlow, /variant="review"/);
  assert.match(reviewFlow, /VoiceSettingsCard/);
});

test("QA-6 scene count is respected when creating scenes", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const route = readSrc("src/app/api/generate-script/route.ts");
  assert.match(reviewFlow, /handleSceneCountChange/);
  assert.match(reviewFlow, /sceneCount,/);
  assert.match(reviewFlow, /MIN_SCENE_COUNT/);
  assert.match(reviewFlow, /MAX_SCENE_COUNT/);
  assert.match(route, /resolveSceneCount\(body\.sceneCount\)/);
});

test("QA-7 Build Storyboard builds storyboard from reviewed script + voiceover", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  assert.match(reviewFlow, /Build Storyboard/);
  assert.match(reviewFlow, /mode:\s*"scenes-only"/);
  assert.match(reviewFlow, /title: script\.title/);
  assert.match(reviewFlow, /narration: script\.narration/);
  assert.match(reviewFlow, /voiceoverDurationMs: measuredVoiceoverDurationMs/);
  assert.match(reviewFlow, /mergeStoryboardOntoScript/);
  assert.match(reviewFlow, /applyEditorReadyScript\(nextScriptWithScenes\)/);
  assert.match(reviewFlow, /flushPersist\("editor_ready"/);
  assert.match(reviewFlow, /resolveReviewHasVoiceover/);
  assert.match(reviewFlow, /voiceoverAudioBase64/);
  assert.match(reviewFlow, /useReviewStoryDocument/);
  assert.match(readSrc("src/features/drafts/hooks/useRouteStoryDocument.ts"), /hydrateFromDraft/);
  assert.match(readSrc("src/features/drafts/store/story-document.store.tsx"), /applyEditorReadyStoryDocument/);
  assert.match(reviewFlow, /hasNarration/);
});

test("QA-8 editor opens after storyboard creation", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  assert.match(reviewFlow, /router\.push\(`\/editor\/\$\{draftId\}`\)/);
});

test("QA-9 legacy drafts with scenes still open in editor", () => {
  const legacy = baseDraft({
    pipelineStage: undefined,
    script: syncFootieScript({
      title: "Legacy one-shot",
      narration: "Generated before staged workflow.",
      totalDuration: 45,
      voiceoverUrl: "blob:legacy-voice",
      voiceoverDurationMs: 45_000,
      scenes: [
        { id: "1", start: 0, end: 15, duration: 15, subtitle: "Intro" },
        { id: "2", start: 15, end: 45, duration: 30, subtitle: "Outro" },
      ],
    }),
    sceneCount: 2,
  });
  assert.equal(isEditorReadyDraft(legacy), true);
  assert.equal(shouldOpenScriptReview(legacy), false);
  assert.equal(resolveDraftHref(legacy), "/editor/draft-review-qa");
});

test("QA-10 draft dashboard routes correctly by workflow status", () => {
  const dashboard = readSrc("src/features/drafts/components/DraftsDashboard.tsx");
  assert.match(dashboard, /resolveDraftHref\(storedDraft\)/);
  assert.match(dashboard, /workflowStatusLabel/);

  assert.equal(resolveDraftHref(baseDraft()), "/create/review/draft-review-qa");
  assert.equal(
    resolveDraftHref(
      baseDraft({
        pipelineStage: "editor_ready",
        script: syncFootieScript({
          title: "Ready",
          narration: "Scenes exist.",
          totalDuration: 30,
          scenes: [{ id: "1", start: 0, end: 30, duration: 30, subtitle: "Scene" }],
        }),
        sceneCount: 1,
      }),
    ),
    "/editor/draft-review-qa",
  );
});

test("QA-11 no unnecessary API calls on editor or review load", () => {
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const voiceHook = readSrc("src/hooks/useStoryVoiceoverApply.ts");

  assert.doesNotMatch(editorFlow, /fetch\(/);
  assert.doesNotMatch(editorFlow, /generate-script/);
  assert.doesNotMatch(editorFlow, /generate-voiceover/);

  const reviewFetchCount = (reviewFlow.match(/fetch\(/g) ?? []).length;
  assert.equal(reviewFetchCount, 1, "review page should only fetch on Build Storyboard");

  const createFetchCount = (createFlow.match(/fetch\(/g) ?? []).length;
  assert.equal(createFetchCount, 2, "create page fetches on Research Preview and Write Story");
  assert.match(createFlow, /\/api\/research-football/);
  assert.match(createFlow, /\/api\/generate-script/);

  assert.match(
    reviewFlow,
    /const handleCreateScenes = useCallback\(async \(\) => \{[\s\S]*await fetch\("\/api\/generate-script"/,
  );
  assert.match(voiceHook, /await fetch\("\/api\/generate-voiceover"/);
  assert.match(voiceHook, /const applyVoiceoverChanges = async \(\) =>/);
});

test("QA-12 voiceover persistence hydrates review state for Build Storyboard", () => {
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const loadingShell = readSrc("src/features/drafts/components/DraftLoadingState.tsx");
  const editorHook = readSrc("src/features/drafts/hooks/useEditorStoryDocument.ts");
  const storyStore = readSrc("src/features/drafts/store/story-document.store.tsx");

  assert.match(storyStore, /resolveDraftScriptForEditor/);
  assert.match(editorHook, /hydrateFromDraft/);
  assert.match(editorHook, /storyDocumentHasScenes/);
  assert.match(reviewFlow, /useReviewStoryDocument/);
  assert.match(reviewFlow, /DraftLoadingState/);
  assert.match(editorFlow, /useEditorStoryDocument/);
  assert.match(editorFlow, /DraftLoadingState/);
  assert.match(loadingShell, /hasProject=\{false\}/);
  assert.match(loadingShell, /Loading your story\.\.\./);
  assert.doesNotMatch(reviewFlow, /hasVoiceover = Boolean\(script && getCanonicalVoiceover\(script\)\?\.url\)/);

  const persistedScript = syncFootieScript({
    title: "Hydrated voice",
    narration: "Saved narration audio.",
    totalDuration: 30,
    scenes: [],
    voiceoverDurationMs: 28_500,
    voiceoverAudioBase64: "dGVzdC1hdWRpby1ieXRlcw==",
  });

  const hydrated = hydrateDraftScriptAudio(persistedScript);
  assert.match(hydrated.voiceoverUrl ?? "", /^blob:/);
  assert.equal(hydrated.voiceoverDurationMs, 28_500);
});

console.log("All script review workflow checks passed.");
