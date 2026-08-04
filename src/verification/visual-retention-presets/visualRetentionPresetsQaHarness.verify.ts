/**
 * Visual Retention Presets QA harness verification.
 * Run via: npm run test:visual-retention-presets-qa
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { projectSceneVisualPlan } from "@/features/mixed-media-scenes";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";
import {
  buildVisualRetentionPresetsQaStory,
  VISUAL_RETENTION_PRESETS_QA_IMAGE_URL,
  VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_1_ID,
  VISUAL_RETENTION_PRESETS_QA_SCENE_1_ITEM_IDS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_2_ID,
  VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_IDS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS,
  VISUAL_RETENTION_PRESETS_QA_SCENE_3_ID,
  VISUAL_RETENTION_PRESETS_QA_SCENE_3_ITEM_ID,
  VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS,
} from "@/features/visual-retention-presets/qa/build-visual-retention-presets-qa-story";
import {
  VISUAL_RETENTION_PRESET_IDS,
  listVisualRetentionPresets,
} from "@/features/visual-retention-presets";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function stagingEnv(input: {
  readonly phases?: string;
  readonly branch?: string;
  readonly vercelEnv?: string;
}): Readonly<Record<string, unknown>> {
  return {
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: input.vercelEnv ?? "preview",
    VERCEL_GIT_COMMIT_REF:
      input.branch ?? "staging-visual-retention-presets",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES:
      input.phases ?? "12A,12B,12C,12D,12E,12F",
  };
}

function testProductionGuardFailClosed(): void {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("test"), false);
  assert.equal(isLocalDevQaHarnessAllowed(undefined), false);
  assert.equal(isLocalDevQaHarnessAllowed(""), false);
  assert.equal(isLocalDevQaHarnessAllowed("staging"), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);

  const page = readSrc("src/app/dev/visual-retention-presets-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.match(
    page,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*visual-retention-presets-qa/);
  assert.match(page, /force-dynamic/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_/);
  assert.doesNotMatch(page, /process\.env\.(?!NODE_ENV)/);
}

function testNoPublicNavigationLink(): void {
  for (const rel of [
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/create/page.tsx",
    "src/app/drafts/page.tsx",
  ]) {
    if (existsSync(path.join(process.cwd(), rel))) {
      assert.doesNotMatch(readSrc(rel), /visual-retention-presets-qa/);
    }
  }
  assert.doesNotMatch(
    readSrc("src/app/dev/visual-retention-presets-qa/page.tsx"),
    /href=.*visual-retention-presets-qa/,
  );
  assert.doesNotMatch(
    readSrc(
      "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
    ),
    /href=.*visual-retention-presets-qa/,
  );
}

function testInitialStoryValidity(): void {
  const story = buildVisualRetentionPresetsQaStory();
  assert.equal(story.scenes.length, 3);
  assert.equal(story.voiceoverUrl, undefined);
  assert.equal(story.voiceoverDurationMs, undefined);
  assert.deepEqual(story.backgroundMusic, {
    enabled: false,
    source: "none",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
  assert.equal(story.visualRetentionExtensions, undefined);
  assert.equal(story.visualRetentionPresetProvenance, undefined);

  const [scene1, scene2, scene3] = story.scenes;
  assert.equal(scene1!.id, VISUAL_RETENTION_PRESETS_QA_SCENE_1_ID);
  assert.equal(scene2!.id, VISUAL_RETENTION_PRESETS_QA_SCENE_2_ID);
  assert.equal(scene3!.id, VISUAL_RETENTION_PRESETS_QA_SCENE_3_ID);
  assert.equal(scene1!.durationMs, VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS);
  assert.equal(scene2!.durationMs, VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS);
  assert.equal(scene3!.durationMs, VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS);
  assert.ok((scene1!.narration ?? "").split(".").filter(Boolean).length >= 3);
  assert.ok((scene2!.narration ?? "").length > 0);
  assert.ok((scene3!.narration ?? "").length > 0);

  assert.deepEqual(
    scene1!.visualSequence!.items.map((item) => item.id),
    [...VISUAL_RETENTION_PRESETS_QA_SCENE_1_ITEM_IDS],
  );
  assert.deepEqual(
    scene1!.visualSequence!.items.map((item) => ({
      start: item.startOffsetMs,
      duration: item.durationMs,
    })),
    [
      { start: 0, duration: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS },
      {
        start: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS,
        duration: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS,
      },
      {
        start: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS * 2,
        duration: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS,
      },
    ],
  );
  assert.deepEqual(
    scene1!.mediaTimeline!.items.map((item) => item.id),
    [...VISUAL_RETENTION_PRESETS_QA_SCENE_1_ITEM_IDS],
  );

  const dims = [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 360, height: 640 },
  ];
  for (let index = 0; index < 3; index += 1) {
    const item = scene1!.visualSequence!.items[index]!;
    assert.equal(item.media.url, VISUAL_RETENTION_PRESETS_QA_IMAGE_URL);
    assert.equal(item.media.width, dims[index]!.width);
    assert.equal(item.media.height, dims[index]!.height);
    assert.equal(item.media.motion, undefined);
    assert.equal(item.media.visualEffect, undefined);
    assert.equal(item.media.visualAdjustments, undefined);
    assert.doesNotMatch(item.media.url ?? "", /^https?:\/\//);
    assert.doesNotMatch(item.media.url ?? "", /^blob:/);
  }

  assert.deepEqual(
    scene2!.visualSequence!.items.map((item) => item.id),
    [...VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_IDS],
  );
  const keyed = scene2!.visualSequence!.items[0]!.media;
  assert.equal(keyed.motion?.presetId, "custom");
  assert.equal(keyed.motion?.enabled, true);
  assert.ok((keyed.motion?.keyframes?.length ?? 0) >= 2);
  assert.equal(keyed.visualEffect, undefined);
  const adjusted = scene2!.visualSequence!.items[1]!.media;
  assert.equal(
    adjusted.visualAdjustments?.brightness,
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
  assert.equal(adjusted.motion, undefined);
  assert.equal(adjusted.visualEffect, undefined);

  assert.equal(scene3!.visualSequence!.items.length, 1);
  assert.equal(
    scene3!.visualSequence!.items[0]!.id,
    VISUAL_RETENTION_PRESETS_QA_SCENE_3_ITEM_ID,
  );
  assert.equal(scene3!.visualSequence!.items[0]!.media.motion, undefined);
  assert.equal(scene3!.visualSequence!.items[0]!.media.visualEffect, undefined);
  assert.equal(scene3!.visualSequence!.items[0]!.media.width, 1080);
  assert.equal(scene3!.visualSequence!.items[0]!.media.height, 1920);

  for (const scene of story.scenes) {
    assert.equal(scene.visualBeatPlan, undefined);
    const plan = projectSceneVisualPlan(scene, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(plan.fromVisualSequence, true);
    assert.equal(plan.windows.length, scene.visualSequence!.items.length);
    assert.deepEqual(
      plan.windows.map((window) => window.itemId),
      scene.visualSequence!.items.map((item) => item.id),
    );
  }

  assert.equal(
    existsSync(
      path.join(
        process.cwd(),
        "public",
        VISUAL_RETENTION_PRESETS_QA_IMAGE_URL.replace(/^\//, ""),
      ),
    ),
    true,
  );
}

function testNoProviderOrCapabilityOverride(): void {
  const page = readSrc("src/app/dev/visual-retention-presets-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/visual-retention-presets/qa/build-visual-retention-presets-qa-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(combined, /\bgenerateStory\b|\bcreateStory\b/);
  assert.doesNotMatch(combined, /localStorage\.(get|set)Item|sessionStorage/);
  assert.doesNotMatch(combined, /https?:\/\/(?!localhost)/);
  assert.doesNotMatch(harness, /fetch\(/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /VisualRetentionCapabilitiesProvider/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability|capabilityOverride/i);
  assert.doesNotMatch(harness, /visualRetentionPresetsEnabled\s*=/);
  assert.doesNotMatch(combined, /process\.env\.(?!NODE_ENV)/);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.match(harness, /<StoryWorkspace[\s\S]*?\/>/);
  assert.equal((harness.match(/<StoryWorkspace/g) ?? []).length, 1);
  // InspectorContext.storyId is required for the presets panel to mount.
  assert.match(
    harness,
    /VISUAL_RETENTION_PRESETS_QA_DRAFT_ID\s*=\s*["']visual-retention-presets-qa["']/,
  );
  assert.match(harness, /draftId=\{VISUAL_RETENTION_PRESETS_QA_DRAFT_ID\}/);
  assert.doesNotMatch(
    harness,
    /import\s+.*VisualRetentionPresetsPanel|<VisualRetentionPresetsPanel/,
  );
  assert.doesNotMatch(harness, /VisualPacingPanel|Suggest pacing/);
  assert.doesNotMatch(harness, /MediaMotionInspectorPanel|MediaVisualEffectControls/);
  assert.doesNotMatch(harness, /EngagementOverlayControls|BrandStingExportControls/);
  assert.doesNotMatch(harness, /ExportPanel|HeadlessExportSection|VideoPreview/);
  assert.doesNotMatch(harness, /buildExportManifest|prepareExportRequest/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.match(workspace, /VideoPreview/);
  assert.match(workspace, /ExportPanel/);
  assert.match(workspace, /storyId=\{draftId\}/);

  const projectInspector = readSrc(
    "src/features/editor/components/EditorProjectInspector.tsx",
  );
  assert.match(projectInspector, /VisualRetentionPresetsPanel/);
  assert.match(projectInspector, /useVisualRetentionPresetsEnabled/);
  assert.match(
    projectInspector,
    /showVisualRetentionPresets\s*=\s*[\s\S]*storyId != null/,
  );

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
  assert.match(exportPanel, /visualRetentionPresetsEnabled/);
}

function testResetBehavior(): void {
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /data-visual-retention-presets-qa-reset/);
  assert.match(harness, /buildVisualRetentionPresetsQaStory\(\)/);
  assert.match(harness, /setWorkspaceKey/);
  assert.match(harness, /setSelectedSceneIndex\(0\)/);
  assert.match(harness, /key=\{workspaceKey\}/);
  assert.match(harness, /resetButtonRef\.current\?\.focus\(\)/);
  assert.match(harness, /queueMicrotask/);
  assert.doesNotMatch(harness, /setTimeout|setInterval/);

  const a = buildVisualRetentionPresetsQaStory();
  const b = buildVisualRetentionPresetsQaStory();
  assert.notEqual(a, b);
  assert.deepEqual(
    a.scenes.map((scene) => scene.id),
    b.scenes.map((scene) => scene.id),
  );
  assert.equal(
    a.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.equal(
    a.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments?.brightness,
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );

  a.visualRetentionPresetProvenance = {
    version: 1,
    catalogVersion: 1,
    presetId: "visual-retention-balanced-clarity",
    inputFingerprint: "vrp1:x",
    planFingerprint: "vrp1:y",
    status: "applied",
    changes: [],
  } as never;
  a.scenes[0]!.visualBeatPlan = { version: 1 } as never;
  a.scenes[1]!.visualSequence!.items[0]!.media.motion = undefined;
  a.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments = undefined;

  const restored = buildVisualRetentionPresetsQaStory();
  assert.equal(restored.visualRetentionPresetProvenance, undefined);
  assert.equal(restored.scenes[0]!.visualBeatPlan, undefined);
  assert.equal(
    restored.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.ok(
    (restored.scenes[1]!.visualSequence!.items[0]!.media.motion?.keyframes
      ?.length ?? 0) >= 2,
  );
  assert.equal(
    restored.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments
      ?.brightness,
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
  assert.equal(restored.scenes.length, 3);
}

function testCapabilityMatrix(): void {
  const withPresets = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B,12C,12D,12E,12F" }),
  );
  assert.equal(withPresets.mixedMediaScenesEnabled, true);
  assert.equal(withPresets.visualBeatDensityEnabled, true);
  assert.equal(withPresets.sourceQualityIntelligenceEnabled, true);
  assert.equal(withPresets.keyframedVisualEffectsEnabled, true);
  assert.equal(withPresets.engagementOverlaysEnabled, true);
  assert.equal(withPresets.shortForgeBrandStingEnabled, true);
  assert.equal(withPresets.subjectAwareReframingEnabled, true);
  assert.equal(withPresets.visualRetentionPresetsEnabled, true);

  const withoutPresets =
    resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D,12E" }),
    );
  assert.equal(withoutPresets.mixedMediaScenesEnabled, true);
  assert.equal(withoutPresets.visualBeatDensityEnabled, true);
  assert.equal(withoutPresets.sourceQualityIntelligenceEnabled, true);
  assert.equal(withoutPresets.keyframedVisualEffectsEnabled, true);
  assert.equal(withoutPresets.engagementOverlaysEnabled, true);
  assert.equal(withoutPresets.shortForgeBrandStingEnabled, true);
  assert.equal(withoutPresets.visualRetentionPresetsEnabled, false);

  for (const env of [
    stagingEnv({ phases: "", branch: "staging-visual-retention-presets" }),
    stagingEnv({
      phases: "12A,12B,12C,12D,12E,12F",
      branch: "main",
    }),
    stagingEnv({
      phases: "12A,12B,12C,12D,12E,12F",
      vercelEnv: "production",
    }),
  ] as const) {
    const closed = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(env);
    assert.equal(closed.visualRetentionPresetsEnabled, false);
    assert.equal(closed.keyframedVisualEffectsEnabled, false);
    assert.equal(closed.mixedMediaScenesEnabled, false);
  }

  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /visualRetentionPresetsEnabled:\s*true/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
}

function testNoHarnessLeakIntoProductionContracts(): void {
  const provider = readSrc(
    "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
  );
  assert.equal(
    (
      provider.match(
        /fetch\(\s*["']\/api\/visual-retention\/capabilities["']/g,
      ) ?? []
    ).length,
    1,
  );

  for (const rel of [
    "src/features/export/domain/build-export-manifest.ts",
    "src/features/export/domain/export-manifest.types.ts",
    "src/features/export/domain/prepare-export-request.ts",
    "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
  ]) {
    assert.doesNotMatch(
      readSrc(rel),
      /visual-retention-presets-qa|VisualRetentionPresetsQaHarness|buildVisualRetentionPresetsQaStory/,
    );
  }
}

function testChromeFlowStaticExpectations(): void {
  const catalog = listVisualRetentionPresets();
  assert.deepEqual(
    catalog.map((preset) => preset.id),
    [...VISUAL_RETENTION_PRESET_IDS],
  );

  const balanced = catalog.find(
    (preset) => preset.id === "visual-retention-balanced-clarity",
  )!;
  assert.equal(balanced.recipe.pacing.mode, "suggest");
  if (balanced.recipe.pacing.mode === "suggest") {
    assert.equal(balanced.recipe.pacing.density, "balanced");
  }
  assert.equal(balanced.recipe.motion.mode, "apply-if-no-keyframes");
  if (balanced.recipe.motion.mode === "apply-if-no-keyframes") {
    assert.equal(balanced.recipe.motion.presetId, "slow-zoom-in");
  }
  assert.equal(balanced.recipe.look.mode, "preserve");
  assert.equal(balanced.recipe.engagement.mode, "preserve");
  assert.equal(balanced.recipe.outro.mode, "preserve");

  const pulse = catalog.find(
    (preset) => preset.id === "visual-retention-pulse-edit",
  )!;
  assert.equal(pulse.recipe.motion.mode, "apply-if-no-keyframes");
  assert.equal(pulse.recipe.look.mode, "apply");

  const cinematic = catalog.find(
    (preset) => preset.id === "visual-retention-cinematic-hold",
  )!;
  assert.equal(cinematic.recipe.pacing.mode, "suggest");
  if (cinematic.recipe.pacing.mode === "suggest") {
    assert.equal(cinematic.recipe.pacing.density, "studio");
  }
  assert.equal(cinematic.recipe.look.mode, "apply");
  if (cinematic.recipe.look.mode === "apply") {
    assert.equal(cinematic.recipe.look.presetId, "cinematic");
  }

  const share = catalog.find(
    (preset) => preset.id === "visual-retention-share-ready",
  )!;
  assert.equal(share.recipe.engagement.mode, "add-if-absent");
  if (share.recipe.engagement.mode === "add-if-absent") {
    assert.equal(share.recipe.engagement.kind, "subscribe");
    assert.equal(share.recipe.engagement.timingPolicy, "closing-scene");
  }
  assert.equal(share.recipe.outro.mode, "enable-if-absent");
  if (share.recipe.outro.mode === "enable-if-absent") {
    assert.equal(share.recipe.outro.durationMs, 2500);
  }

  // Fixture facts required by the intended Chrome certification flow.
  const story = buildVisualRetentionPresetsQaStory();
  assert.equal(story.scenes[2]!.id, VISUAL_RETENTION_PRESETS_QA_SCENE_3_ID);
  assert.equal(story.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId, "custom");
  assert.equal(
    story.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments?.brightness,
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /VISUAL_RETENTION_PRESET_STALE|visualRetentionPresetsEnabled/);
  assert.match(exportPanel, /HeadlessExportSection/);
  assert.match(exportPanel, /exportRenderer === ["']browser["']/);

  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /exportFootieShort\(|prepareExportRequest\(/);
  assert.doesNotMatch(harness, /startOwnedHeadless|dispatchOwnedHeadless/);
}

function testHydrationSafeAndPersistenceContracts(): void {
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  const page = readSrc("src/app/dev/visual-retention-presets-qa/page.tsx");
  assert.doesNotMatch(harness, /\bwindow\./);
  assert.doesNotMatch(harness, /Date\.now|new Date\(|Math\.random|toLocale/);
  assert.doesNotMatch(harness, /autoFocus|autofocus/);
  assert.match(
    harness,
    /useState<FootieScript>\(\(\) =>\s*buildVisualRetentionPresetsQaStory\(\)/,
  );
  assert.match(harness, /saveDraftDisabled/);
  assert.match(harness, /intentionally no-op|never persists/i);
  assert.doesNotMatch(
    `${page}\n${harness}`,
    /saveDraft\(|persistDraft|writeDraft|upsertDraft/i,
  );
  assert.doesNotMatch(`${page}\n${harness}`, /FormData|upload|materialize/i);
}

function testResponsibilityBasedNaming(): void {
  for (const rel of [
    "src/app/dev/visual-retention-presets-qa/page.tsx",
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
    "src/features/visual-retention-presets/qa/build-visual-retention-presets-qa-story.ts",
    "src/verification/visual-retention-presets/visualRetentionPresetsQaHarness.verify.ts",
  ]) {
    assert.doesNotMatch(
      rel,
      /sprint|phase|slice|checkpoint|hardening|final|ticket|followup|chronology|\d{4}-\d{2}-\d{2}/i,
    );
    assert.ok(readSrc(rel).length > 0);
    assert.doesNotMatch(
      readSrc(rel),
      /\bSprint\b|\bSlice\b|\bCheckpoint\b|\bHardening\b|\bFollowup\b|\bFinal\b/,
    );
  }

  const pkg = readSrc("package.json");
  assert.match(pkg, /"test:visual-retention-presets-qa"/);
  assert.match(pkg, /visualRetentionPresetsQaHarness\.verify\.ts/);
}

function testHarnessShellContract(): void {
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  assert.match(harness, /data-visual-retention-presets-qa-harness/);
  assert.match(harness, /data-visual-retention-presets-qa-fixture/);
  assert.match(harness, /Visual Retention Presets QA/);
  assert.match(harness, /Fixture:/);
  assert.match(harness, /queueMicrotask\(\(\) => \{\s*resetButtonRef\.current\?\.focus\(\)/);
}

function testOpenDoesNotAutoMutate(): void {
  const harness = readSrc(
    "src/app/dev/visual-retention-presets-qa/VisualRetentionPresetsQaHarness.tsx",
  );
  const panel = readSrc(
    "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
  );
  const selection = readSrc(
    "src/features/visual-retention-presets/editor/useVisualRetentionPresetSelection.ts",
  );

  assert.doesNotMatch(harness, /applyVisualRetentionPresetPlan|onScriptChange\(/);
  assert.doesNotMatch(harness, /setSelectedPresetId|visualRetentionPresetProvenance\s*=/);
  assert.doesNotMatch(harness, /Suggest pacing|visualBeatPlan/);
  assert.match(
    panel,
    /useVisualRetentionPresetSelection\(\{\s*appliedPresetId,\s*\}\)/,
  );
  assert.match(
    selection,
    /useState<VisualRetentionPresetId \| null>\(\(\) =>\s*normalizeAppliedPresetId\(input\.appliedPresetId\)/,
  );
  assert.match(selection, /Never writes the story/);
  assert.doesNotMatch(selection, /localStorage|sessionStorage|useEffect/);
  assert.doesNotMatch(panel, /useEffect\([\s\S]*applyVisualRetentionPresetPlan/);
  assert.doesNotMatch(harness, /useEffect\([\s\S]*onScriptChange/);

  const story = buildVisualRetentionPresetsQaStory();
  assert.equal(story.visualRetentionPresetProvenance, undefined);
  assert.equal(story.visualRetentionExtensions, undefined);
  for (const scene of story.scenes) {
    assert.equal(scene.visualBeatPlan, undefined);
  }

  // Builder returns detached graphs — mutating one build cannot poison the next.
  const first = buildVisualRetentionPresetsQaStory();
  first.title = "mutated";
  first.scenes[0]!.narration = "mutated";
  first.scenes[1]!.visualSequence!.items[0]!.media.motion = undefined;
  first.visualRetentionPresetProvenance = {
    version: 1,
    catalogVersion: 1,
    presetId: "visual-retention-balanced-clarity",
    inputFingerprint: "x",
    planFingerprint: "y",
    status: "applied",
    changes: [],
  } as never;
  const second = buildVisualRetentionPresetsQaStory();
  assert.equal(second.title, "Visual Retention Presets QA");
  assert.notEqual(second.scenes[0]!.narration, "mutated");
  assert.equal(
    second.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.equal(second.visualRetentionPresetProvenance, undefined);
}

function testProjectInspectorPlacement(): void {
  const inspector = readSrc(
    "src/features/editor/components/EditorProjectInspector.tsx",
  );
  const storyReviewIdx = inspector.indexOf("<StoryReview");
  const presetsIdx = inspector.indexOf("<VisualRetentionPresetsPanel");
  assert.ok(storyReviewIdx >= 0, "StoryReview must mount in Project Inspector");
  assert.ok(presetsIdx >= 0, "presets panel must mount in Project Inspector");
  assert.ok(
    presetsIdx > storyReviewIdx,
    "presets panel must mount directly below StoryReview",
  );
  assert.equal(
    (inspector.match(/<VisualRetentionPresetsPanel/g) ?? []).length,
    1,
  );
}

function main(): void {
  console.log("\nvisual-retention-presets-qa-harness\n");
  const tests: Array<[string, () => void]> = [
    ["production guard fail-closed", testProductionGuardFailClosed],
    ["no public navigation link", testNoPublicNavigationLink],
    ["initial story validity", testInitialStoryValidity],
    ["no provider/capability override", testNoProviderOrCapabilityOverride],
    ["real component composition", testRealComponentComposition],
    ["reset behavior", testResetBehavior],
    ["capability matrix A–F / A–E / fail-closed", testCapabilityMatrix],
    ["no harness leak into production contracts", testNoHarnessLeakIntoProductionContracts],
    ["Chrome flow static expectations", testChromeFlowStaticExpectations],
    ["hydration-safe and persistence contracts", testHydrationSafeAndPersistenceContracts],
    ["responsibility-based naming", testResponsibilityBasedNaming],
    ["harness shell contract", testHarnessShellContract],
    ["open does not auto-mutate", testOpenDoesNotAutoMutate],
    ["project inspector placement", testProjectInspectorPlacement],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\nVisual Retention Presets QA harness: ${passed}/${tests.length} PASS\n`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
