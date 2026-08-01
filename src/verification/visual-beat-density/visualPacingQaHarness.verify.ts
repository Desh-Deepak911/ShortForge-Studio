/**
 * Visual pacing QA harness verification.
 * Run via: npm run test:visual-pacing-qa
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  projectSceneVisualPlan,
  resolveInspectorSceneMediaProjection,
} from "@/features/mixed-media-scenes";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import {
  buildVisualPacingQaStory,
  VISUAL_PACING_QA_DURATION_MS,
  VISUAL_PACING_QA_IMAGE_URL,
  VISUAL_PACING_QA_ITEM_IDS,
  VISUAL_PACING_QA_SCENE_ID,
  VISUAL_PACING_QA_WINDOW_DURATION_MS,
} from "@/features/visual-beat-density/qa/build-visual-pacing-qa-story";
import { resolveVisualBeatDensityEnabledFromEnvironment } from "@/features/visual-retention/server/resolve-visual-beat-density-enabled";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testProductionGuardFailClosed(): void {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("test"), false);
  assert.equal(isLocalDevQaHarnessAllowed(undefined), false);
  assert.equal(isLocalDevQaHarnessAllowed(""), false);
  assert.equal(isLocalDevQaHarnessAllowed("staging"), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);

  const guard = readSrc(
    "src/features/visual-retention/qa/assert-local-dev-qa-harness-allowed.ts",
  );
  assert.match(guard, /notFound\(\)/);
  assert.match(guard, /nodeEnv === ["']development["']/);
  assert.doesNotMatch(guard, /NEXT_PUBLIC_/);
  assert.doesNotMatch(guard, /process\.env\.(?!NODE_ENV)/);

  const page = readSrc("src/app/dev/visual-pacing-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.match(
    page,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*visual-pacing-qa/);

  // Shared guard: mixed-media route still uses the same responsibility-based module.
  const mixedPage = readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx");
  assert.match(
    mixedPage,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.equal(
    existsSync(
      "src/features/mixed-media-scenes/qa/assert-local-dev-qa-harness-allowed.ts",
    ),
    false,
  );
}

function testNoPublicNavigationLink(): void {
  const layout = path.join(process.cwd(), "src/app/layout.tsx");
  if (existsSync(layout)) {
    assert.doesNotMatch(readSrc("src/app/layout.tsx"), /visual-pacing-qa/);
  }
  assert.doesNotMatch(
    readSrc("src/app/dev/visual-pacing-qa/page.tsx"),
    /href=.*visual-pacing-qa/,
  );
  assert.doesNotMatch(
    readSrc("src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx"),
    /href=.*visual-pacing-qa/,
  );
}

function testInitialStoryValidity(): void {
  const story = buildVisualPacingQaStory();
  assert.equal(story.scenes.length, 1);
  const scene = story.scenes[0]!;
  assert.equal(scene.id, VISUAL_PACING_QA_SCENE_ID);
  assert.equal(scene.durationMs, VISUAL_PACING_QA_DURATION_MS);
  assert.ok(
    Math.abs((scene.duration ?? 0) - VISUAL_PACING_QA_DURATION_MS / 1000) <
      0.001,
  );
  assert.ok((scene.narration ?? "").includes("."));
  assert.ok((scene.narration ?? "").split(".").filter(Boolean).length >= 3);

  assert.ok(scene.visualSequence);
  assert.equal(scene.visualSequence!.items.length, 3);
  assert.deepEqual(
    scene.visualSequence!.items.map((item) => item.id),
    [...VISUAL_PACING_QA_ITEM_IDS],
  );
  assert.equal(
    new Set(scene.visualSequence!.items.map((item) => item.id)).size,
    3,
  );

  const windows = scene.visualSequence!.items.map((item) => ({
    id: item.id,
    start: item.startOffsetMs,
    duration: item.durationMs,
  }));
  assert.deepEqual(windows, [
    {
      id: VISUAL_PACING_QA_ITEM_IDS[0],
      start: 0,
      duration: VISUAL_PACING_QA_WINDOW_DURATION_MS,
    },
    {
      id: VISUAL_PACING_QA_ITEM_IDS[1],
      start: VISUAL_PACING_QA_WINDOW_DURATION_MS,
      duration: VISUAL_PACING_QA_WINDOW_DURATION_MS,
    },
    {
      id: VISUAL_PACING_QA_ITEM_IDS[2],
      start: VISUAL_PACING_QA_WINDOW_DURATION_MS * 2,
      duration: VISUAL_PACING_QA_WINDOW_DURATION_MS,
    },
  ]);

  assert.ok(scene.mediaTimeline);
  assert.equal(scene.mediaTimeline!.items.length, 3);
  assert.deepEqual(
    scene.mediaTimeline!.items.map((item) => item.id),
    [...VISUAL_PACING_QA_ITEM_IDS],
  );

  for (const item of scene.visualSequence!.items) {
    assert.equal(item.media.type, "image");
    assert.equal(item.media.url, VISUAL_PACING_QA_IMAGE_URL);
    assert.doesNotMatch(item.media.url, /^https?:\/\//);
    assert.doesNotMatch(item.media.url, /^blob:/);
  }

  assert.equal(scene.visualBeatPlan, undefined);
  assert.equal(story.voiceoverUrl, undefined);
  assert.deepEqual(story.backgroundMusic, {
    enabled: false,
    source: "none",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
  assert.equal(story.backgroundMusic?.enabled, false);
  assert.equal(story.backgroundMusic?.source, "none");

  const publicSvg = path.join(
    process.cwd(),
    "public",
    VISUAL_PACING_QA_IMAGE_URL.replace(/^\//, ""),
  );
  assert.equal(existsSync(publicSvg), true);
}

function testNoProviderOrNetworkDependencyInHarness(): void {
  const page = readSrc("src/app/dev/visual-pacing-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/visual-beat-density/qa/build-visual-pacing-qa-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(combined, /\bgenerateStory\b|\bcreateStory\b/);
  assert.doesNotMatch(combined, /localStorage\.(get|set)Item/);
  assert.doesNotMatch(combined, /https?:\/\/(?!localhost)/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /fetch\(/);
  assert.doesNotMatch(harness, /visualBeatDensityEnabled\s*=/);
  assert.doesNotMatch(harness, /mixedMediaScenesEnabled\s*=/);
  assert.doesNotMatch(harness, /VisualRetentionCapabilitiesProvider/);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.match(harness, /<StoryWorkspace[\s\S]*?\/>/);
  // Harness must not copy pacing / sequence / export implementation.
  assert.doesNotMatch(harness, /VisualPacingPanel/);
  assert.doesNotMatch(harness, /MixedMediaSequencePanel/);
  assert.doesNotMatch(harness, /StudioSceneInspector/);
  assert.doesNotMatch(harness, /suggestVisualBeatPlan|applyVisualBeatPlan/);
  assert.doesNotMatch(harness, /resolveVisualPacingExportGuidance/);
  assert.doesNotMatch(harness, /\bFast\b|\bBalanced\b|\bStudio\b/);
  assert.doesNotMatch(harness, /role=["']radiogroup["']|Suggest pacing|Apply pacing/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.match(workspace, /EditorSelectionProvider/);
  assert.match(workspace, /VideoPreview/);
  assert.match(workspace, /ExportPanel/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /VisualPacingPanel/);
  assert.match(inspector, /MixedMediaSequencePanel/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
  assert.match(exportPanel, /useVisualBeatDensityEnabled/);
}

function testResetBehavior(): void {
  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /data-visual-pacing-qa-reset/);
  assert.match(harness, /buildVisualPacingQaStory\(\)/);
  assert.match(harness, /setWorkspaceKey/);
  assert.match(harness, /resetButtonRef\.current\?\.focus\(\)/);

  const a = buildVisualPacingQaStory();
  const b = buildVisualPacingQaStory();
  assert.equal(a.scenes[0]!.id, b.scenes[0]!.id);
  assert.deepEqual(
    a.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
    })),
    b.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
    })),
  );
  assert.equal(a.scenes[0]!.visualBeatPlan, undefined);
  assert.equal(b.scenes[0]!.visualBeatPlan, undefined);
  assert.notEqual(a, b);
  assert.notEqual(a.scenes[0], b.scenes[0]);
  assert.notEqual(a.scenes[0]!.visualSequence, b.scenes[0]!.visualSequence);
}

function testEnabledCapabilityPath(): void {
  const scene = buildVisualPacingQaStory().scenes[0]!;
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(plan.fromVisualSequence, true);
  assert.equal(plan.windows.length, 3);
  assert.equal(plan.windows[0]!.itemId, VISUAL_PACING_QA_ITEM_IDS[0]);
  assert.equal(plan.windows[0]!.durationMs, VISUAL_PACING_QA_WINDOW_DURATION_MS);

  const inspector = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspector.windows.length, 3);

  const active = resolveActiveSceneMediaRenderView(scene, 4500, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(active.mediaItemId, VISUAL_PACING_QA_ITEM_IDS[1]);

  const enabledDensity = resolveVisualBeatDensityEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B,12C",
  });
  assert.equal(enabledDensity, true);
  const enabledMixed = resolveMixedMediaScenesEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B,12C",
  });
  assert.equal(enabledMixed, true);

  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /visualBeatDensityEnabled:\s*true/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability/i);

  const inspectorSrc = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(
    inspectorSrc,
    /visualRetentionCapabilitiesReady &&\s*mixedMediaScenesEnabled &&\s*visualBeatDensityEnabled/,
  );
}

function testDisabledCapabilityPath(): void {
  const withoutDensity = resolveVisualBeatDensityEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
  });
  assert.equal(withoutDensity, false);
  const mixedRemains = resolveMixedMediaScenesEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
  });
  assert.equal(mixedRemains, true);

  const failClosed = resolveVisualBeatDensityEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "",
  });
  assert.equal(failClosed, false);

  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /visualBeatDensityEnabled:\s*false/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
}

function testSharedCapabilityFetchAndExportWiring(): void {
  const provider = readSrc(
    "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
  );
  assert.equal(
    (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities["']/g) ??
      []).length,
    1,
  );

  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /\/api\/visual-retention\/capabilities/);
  assert.doesNotMatch(harness, /\bfetch\(/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /720|1080/);
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
  assert.doesNotMatch(exportPanel, /visual-beat-density-v1/);

  // Manifest builders must not gain plan/provenance fields from this harness slice.
  const manifestTypes = readSrc(
    "src/features/export/domain/export-manifest.types.ts",
  );
  assert.doesNotMatch(manifestTypes, /visualBeatPlan|sourceSnapshot/);
}

function testHydrationSafeInitialValues(): void {
  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /\bwindow\./);
  assert.doesNotMatch(harness, /Date\.now|new Date\(|Math\.random|toLocale/);
  assert.doesNotMatch(harness, /autoFocus|autofocus/);
  assert.match(harness, /useState<FootieScript>\(\(\) =>\s*buildVisualPacingQaStory\(\)/);
}

function testNoPersistenceOrDeploymentSideEffects(): void {
  const harness = readSrc(
    "src/app/dev/visual-pacing-qa/VisualPacingQaHarness.tsx",
  );
  const page = readSrc("src/app/dev/visual-pacing-qa/page.tsx");
  const combined = `${page}\n${harness}`;

  assert.match(harness, /saveDraftDisabled/);
  assert.match(harness, /intentionally no-op|never persists/i);
  assert.doesNotMatch(combined, /saveDraft\(|persistDraft|writeDraft|upsertDraft/i);
  assert.doesNotMatch(combined, /deploy|vercel\.deploy|git push/i);
  assert.doesNotMatch(combined, /localStorage\.setItem|indexedDB/i);
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["production guard fail-closed", testProductionGuardFailClosed],
    ["no public navigation link", testNoPublicNavigationLink],
    ["initial story validity", testInitialStoryValidity],
    ["no provider/network dependency in harness", testNoProviderOrNetworkDependencyInHarness],
    ["real component composition", testRealComponentComposition],
    ["reset behavior", testResetBehavior],
    ["enabled capability path", testEnabledCapabilityPath],
    ["disabled capability path", testDisabledCapabilityPath],
    ["shared capability fetch and export wiring", testSharedCapabilityFetchAndExportWiring],
    ["hydration-safe initial values", testHydrationSafeInitialValues],
    ["no persistence or deployment side effects", testNoPersistenceOrDeploymentSideEffects],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\nVisual pacing QA harness: ${passed}/${tests.length} PASS`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
