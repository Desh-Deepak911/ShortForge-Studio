/**
 * Visual-motion QA harness verification.
 * Run via: npm run test:visual-motion-qa
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  projectSceneVisualPlan,
  resolveInspectorSceneMediaProjection,
} from "@/features/mixed-media-scenes";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import { EXPORT_MANIFEST_VERSION } from "@/features/export/domain";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";
import {
  buildVisualMotionQaStory,
  VISUAL_MOTION_QA_IMAGE_URL,
  VISUAL_MOTION_QA_SCENE_1_DURATION_MS,
  VISUAL_MOTION_QA_SCENE_1_ID,
  VISUAL_MOTION_QA_SCENE_1_ITEM_IDS,
  VISUAL_MOTION_QA_SCENE_2_DURATION_MS,
  VISUAL_MOTION_QA_SCENE_2_ID,
  VISUAL_MOTION_QA_SCENE_2_ITEM_ID,
  VISUAL_MOTION_QA_WINDOW_DURATION_MS,
} from "@/features/visual-retention/qa/build-visual-motion-qa-story";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";

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
      input.branch ?? "staging-keyframed-motion-overlays",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES:
      input.phases ?? "12A,12B,12C,12D,12E",
  };
}

function assertNoMediaEnhancements(media: {
  readonly motion?: unknown;
  readonly visualEffect?: unknown;
  readonly subjectFocus?: unknown;
  readonly subjectAwareFramingProvenance?: unknown;
  readonly sourceQualityAdjustmentProvenance?: unknown;
}): void {
  assert.equal(media.motion, undefined);
  assert.equal(media.visualEffect, undefined);
  assert.equal(media.subjectFocus, undefined);
  assert.equal(media.subjectAwareFramingProvenance, undefined);
  assert.equal(media.sourceQualityAdjustmentProvenance, undefined);
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

  const page = readSrc("src/app/dev/visual-motion-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.match(
    page,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*visual-motion-qa/);
  assert.match(page, /force-dynamic/);

  assert.equal(
    existsSync(
      "src/features/visual-retention/qa/assert-local-dev-qa-harness-allowed.ts",
    ),
    true,
  );
}

function testNoPublicNavigationLink(): void {
  const layout = path.join(process.cwd(), "src/app/layout.tsx");
  if (existsSync(layout)) {
    assert.doesNotMatch(readSrc("src/app/layout.tsx"), /visual-motion-qa/);
  }
  for (const rel of [
    "src/app/page.tsx",
    "src/app/create/page.tsx",
    "src/app/drafts/page.tsx",
  ]) {
    if (existsSync(path.join(process.cwd(), rel))) {
      assert.doesNotMatch(readSrc(rel), /visual-motion-qa/);
    }
  }
  assert.doesNotMatch(
    readSrc("src/app/dev/visual-motion-qa/page.tsx"),
    /href=.*visual-motion-qa/,
  );
  assert.doesNotMatch(
    readSrc("src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx"),
    /href=.*visual-motion-qa/,
  );
}

function testInitialStoryValidity(): void {
  const story = buildVisualMotionQaStory();
  assert.equal(story.scenes.length, 2);
  assert.equal(story.voiceoverUrl, undefined);
  assert.deepEqual(story.backgroundMusic, {
    enabled: false,
    source: "none",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
  assert.equal(story.visualRetentionExtensions, undefined);
  assert.equal(EXPORT_MANIFEST_VERSION, 4);

  const scene1 = story.scenes[0]!;
  const scene2 = story.scenes[1]!;
  assert.equal(scene1.id, VISUAL_MOTION_QA_SCENE_1_ID);
  assert.equal(scene2.id, VISUAL_MOTION_QA_SCENE_2_ID);
  assert.equal(scene1.durationMs, VISUAL_MOTION_QA_SCENE_1_DURATION_MS);
  assert.equal(scene2.durationMs, VISUAL_MOTION_QA_SCENE_2_DURATION_MS);
  assert.ok(
    Math.abs((scene1.duration ?? 0) - VISUAL_MOTION_QA_SCENE_1_DURATION_MS / 1000) <
      0.001,
  );
  assert.ok(
    Math.abs((scene2.duration ?? 0) - VISUAL_MOTION_QA_SCENE_2_DURATION_MS / 1000) <
      0.001,
  );
  assert.ok((scene1.narration ?? "").includes("."));
  assert.ok((scene1.narration ?? "").split(".").filter(Boolean).length >= 3);
  assert.ok((scene2.narration ?? "").length > 0);

  assert.ok(scene1.visualSequence);
  assert.equal(scene1.visualSequence!.items.length, 3);
  assert.deepEqual(
    scene1.visualSequence!.items.map((item) => item.id),
    [...VISUAL_MOTION_QA_SCENE_1_ITEM_IDS],
  );

  const windows = scene1.visualSequence!.items.map((item) => ({
    id: item.id,
    start: item.startOffsetMs,
    duration: item.durationMs,
  }));
  assert.deepEqual(windows, [
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[0],
      start: 0,
      duration: VISUAL_MOTION_QA_WINDOW_DURATION_MS,
    },
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[1],
      start: VISUAL_MOTION_QA_WINDOW_DURATION_MS,
      duration: VISUAL_MOTION_QA_WINDOW_DURATION_MS,
    },
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[2],
      start: VISUAL_MOTION_QA_WINDOW_DURATION_MS * 2,
      duration: VISUAL_MOTION_QA_WINDOW_DURATION_MS,
    },
  ]);

  assert.ok(scene1.mediaTimeline);
  assert.equal(scene1.mediaTimeline!.items.length, 3);
  assert.deepEqual(
    scene1.mediaTimeline!.items.map((item) => item.id),
    [...VISUAL_MOTION_QA_SCENE_1_ITEM_IDS],
  );

  const expected: ReadonlyArray<{
    readonly id: (typeof VISUAL_MOTION_QA_SCENE_1_ITEM_IDS)[number];
    readonly width: number;
    readonly height: number;
    readonly fitMode: "cover" | "contain";
    readonly framingFit: "fill" | "fit";
  }> = [
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[0],
      width: 1080,
      height: 1920,
      fitMode: "cover",
      framingFit: "fill",
    },
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[1],
      width: 1920,
      height: 1080,
      fitMode: "cover",
      framingFit: "fill",
    },
    {
      id: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[2],
      width: 360,
      height: 640,
      fitMode: "contain",
      framingFit: "fit",
    },
  ];

  const sequenceItems = scene1.visualSequence!.items;
  const timelineItems = scene1.mediaTimeline!.items;
  for (let index = 0; index < expected.length; index += 1) {
    const expectation = expected[index]!;
    const sequenceItem = sequenceItems[index]!;
    const timelineItem = timelineItems[index]!;
    assert.equal(sequenceItem.id, timelineItem.id);
    assert.equal(sequenceItem.id, expectation.id);
    assert.equal(sequenceItem.media.type, "image");
    assert.equal(sequenceItem.media.url, VISUAL_MOTION_QA_IMAGE_URL);
    assert.equal(sequenceItem.media.width, expectation.width);
    assert.equal(sequenceItem.media.height, expectation.height);
    assert.equal(sequenceItem.media.fitMode, expectation.fitMode);
    assert.equal(sequenceItem.media.transform?.scale, 1);
    assert.equal(timelineItem.media.width, expectation.width);
    assert.equal(timelineItem.media.height, expectation.height);
    assert.doesNotMatch(sequenceItem.media.url ?? "", /^https?:\/\//);
    assert.doesNotMatch(sequenceItem.media.url ?? "", /^blob:/);
    assertNoMediaEnhancements(sequenceItem.media);
    assertNoMediaEnhancements(timelineItem.media);

    const framing = resolveSceneMediaFraming(
      { media: sequenceItem.media },
      { media: sequenceItem.media },
    );
    assert.equal(framing.fitMode, expectation.framingFit);
    assert.equal(framing.zoom, 1);
  }

  assert.ok(scene2.visualSequence);
  assert.equal(scene2.visualSequence!.items.length, 1);
  assert.equal(
    scene2.visualSequence!.items[0]!.id,
    VISUAL_MOTION_QA_SCENE_2_ITEM_ID,
  );
  assert.equal(scene2.visualSequence!.items[0]!.durationMs, VISUAL_MOTION_QA_SCENE_2_DURATION_MS);
  assert.equal(scene2.media?.url, VISUAL_MOTION_QA_IMAGE_URL);
  assert.equal(scene2.media?.width, 1080);
  assert.equal(scene2.media?.height, 1920);
  assertNoMediaEnhancements(scene2.media!);
  assertNoMediaEnhancements(scene2.visualSequence!.items[0]!.media);
  assert.equal(scene1.visualBeatPlan, undefined);
  assert.equal(scene2.visualBeatPlan, undefined);

  const publicSvg = path.join(
    process.cwd(),
    "public",
    VISUAL_MOTION_QA_IMAGE_URL.replace(/^\//, ""),
  );
  assert.equal(existsSync(publicSvg), true);

  const expectedTotalSec =
    (VISUAL_MOTION_QA_SCENE_1_DURATION_MS + VISUAL_MOTION_QA_SCENE_2_DURATION_MS) /
    1000;
  assert.ok(Math.abs((story.totalDuration ?? 0) - expectedTotalSec) < 0.001);
}

function testNoProviderOrNetworkDependencyInHarness(): void {
  const page = readSrc("src/app/dev/visual-motion-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/visual-retention/qa/build-visual-motion-qa-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(combined, /\bgenerateStory\b|\bcreateStory\b/);
  assert.doesNotMatch(combined, /localStorage\.(get|set)Item/);
  assert.doesNotMatch(combined, /https?:\/\/(?!localhost)/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /fetch\(/);
  assert.doesNotMatch(harness, /keyframedVisualEffectsEnabled\s*=/);
  assert.doesNotMatch(harness, /engagementOverlaysEnabled\s*=/);
  assert.doesNotMatch(harness, /subjectAwareReframingEnabled\s*=/);
  assert.doesNotMatch(harness, /shortForgeBrandStingEnabled\s*=/);
  assert.doesNotMatch(harness, /VisualRetentionCapabilitiesProvider/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability|capabilityOverride/i);
  assert.doesNotMatch(combined, /process\.env\.(?!NODE_ENV)/);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.match(harness, /<StoryWorkspace[\s\S]*?\/>/);
  assert.doesNotMatch(harness, /MediaMotionInspectorPanel/);
  assert.doesNotMatch(harness, /MediaMotionKeyframeEditor/);
  assert.doesNotMatch(harness, /MediaVisualEffectControls/);
  assert.doesNotMatch(harness, /EngagementOverlayControls/);
  assert.doesNotMatch(harness, /BrandStingExportControls/);
  assert.doesNotMatch(harness, /SubjectAwareFramingControls/);
  assert.doesNotMatch(harness, /SourceQualitySummary/);
  assert.doesNotMatch(harness, /StudioSceneInspector/);
  assert.doesNotMatch(harness, /ExportPanel|HeadlessExportSection|VideoPreview/);
  assert.doesNotMatch(harness, /buildExportManifest|buildSubjectFocusFramingSuggestion/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.match(workspace, /EditorSelectionProvider/);
  assert.match(workspace, /VideoPreview/);
  assert.match(workspace, /ExportPanel/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /MediaMotionInspectorPanel/);
  assert.match(inspector, /EngagementOverlayControls/);
  assert.match(inspector, /SourceQualitySummary/);

  const motionPanel = readSrc(
    "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
  );
  assert.match(motionPanel, /MediaMotionKeyframeEditor/);
  assert.match(motionPanel, /MediaVisualEffectControls/);
  assert.match(motionPanel, /useKeyframedVisualEffectsEnabled/);

  const summary = readSrc(
    "src/features/source-quality/editor/SourceQualitySummary.tsx",
  );
  assert.match(summary, /SubjectAwareFramingControls/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
  assert.match(exportPanel, /BrandStingExportControls/);
}

function testResetBehavior(): void {
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /data-visual-motion-qa-reset/);
  assert.match(harness, /buildVisualMotionQaStory\(\)/);
  assert.match(harness, /setWorkspaceKey/);
  assert.match(harness, /resetButtonRef\.current\?\.focus\(\)/);
  assert.match(harness, /queueMicrotask/);
  assert.doesNotMatch(harness, /setTimeout|setInterval/);

  const a = buildVisualMotionQaStory();
  const b = buildVisualMotionQaStory();
  assert.equal(a.scenes[0]!.id, b.scenes[0]!.id);
  assert.equal(a.scenes[1]!.id, b.scenes[1]!.id);
  assert.deepEqual(
    a.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
      width: item.media.width,
      height: item.media.height,
      fitMode: item.media.fitMode,
      scale: item.media.transform?.scale,
      motion: item.media.motion ?? null,
      visualEffect: item.media.visualEffect ?? null,
      subjectFocus: item.media.subjectFocus ?? null,
      subjectProvenance: item.media.subjectAwareFramingProvenance ?? null,
    })),
    b.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
      width: item.media.width,
      height: item.media.height,
      fitMode: item.media.fitMode,
      scale: item.media.transform?.scale,
      motion: item.media.motion ?? null,
      visualEffect: item.media.visualEffect ?? null,
      subjectFocus: item.media.subjectFocus ?? null,
      subjectProvenance: item.media.subjectAwareFramingProvenance ?? null,
    })),
  );
  assert.notEqual(a, b);
  assert.notEqual(a.scenes[0], b.scenes[0]);
  assert.notEqual(a.scenes[0]!.visualSequence, b.scenes[0]!.visualSequence);

  const mutated = a.scenes[0]!.visualSequence!.items[0]!;
  mutated.media.transform = {
    ...(mutated.media.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }),
    scale: 2.5,
  };
  mutated.media.subjectFocus = {
    version: 1,
    centerX: 0.5,
    centerY: 0.5,
    source: "manual",
  };
  mutated.media.visualEffect = {
    version: 1,
    presetId: "cinematic",
    intensity: 0.5,
  };

  const restored = buildVisualMotionQaStory();
  const restoredItem = restored.scenes[0]!.visualSequence!.items[0]!;
  assert.equal(restoredItem.media.transform?.scale, 1);
  assertNoMediaEnhancements(restoredItem.media);
  assert.equal(restored.visualRetentionExtensions, undefined);
  assert.equal(restored.scenes.length, 2);
  assert.equal(
    restored.scenes[0]!.visualSequence!.items[1]!.startOffsetMs,
    VISUAL_MOTION_QA_WINDOW_DURATION_MS,
  );
}

function testEnabledCapabilityPath(): void {
  const scene1 = buildVisualMotionQaStory().scenes[0]!;
  const plan = projectSceneVisualPlan(scene1, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(plan.fromVisualSequence, true);
  assert.equal(plan.windows.length, 3);
  assert.equal(plan.windows[0]!.itemId, VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[0]);
  assert.equal(plan.windows[0]!.durationMs, VISUAL_MOTION_QA_WINDOW_DURATION_MS);

  const inspector = resolveInspectorSceneMediaProjection(scene1, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspector.windows.length, 3);

  const active = resolveActiveSceneMediaRenderView(scene1, 4500, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(active.mediaItemId, VISUAL_MOTION_QA_SCENE_1_ITEM_IDS[1]);

  const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B,12C,12D,12E" }),
  );
  assert.equal(snapshot.mixedMediaScenesEnabled, true);
  assert.equal(snapshot.visualBeatDensityEnabled, true);
  assert.equal(snapshot.sourceQualityIntelligenceEnabled, true);
  assert.equal(snapshot.keyframedVisualEffectsEnabled, true);
  assert.equal(snapshot.engagementOverlaysEnabled, true);
  assert.equal(snapshot.shortForgeBrandStingEnabled, true);
  assert.equal(snapshot.subjectAwareReframingEnabled, true);

  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /keyframedVisualEffectsEnabled:\s*true/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability/i);

  // Production controls gate visibility through the shared capability hooks.
  assert.match(
    readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    ),
    /useKeyframedVisualEffectsEnabled/,
  );
  assert.match(
    readSrc("src/features/editor/components/StudioSceneInspector.tsx"),
    /useEngagementOverlaysEnabled/,
  );
  assert.match(
    readSrc("src/components/ExportPanel.tsx"),
    /useShortForgeBrandStingEnabled/,
  );
  assert.match(
    readSrc("src/features/source-quality/editor/SourceQualitySummary.tsx"),
    /useSubjectAwareReframingEnabled/,
  );
}

function testDisabledCapabilityPath(): void {
  const withoutMotion =
    resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D" }),
    );
  assert.equal(withoutMotion.mixedMediaScenesEnabled, true);
  assert.equal(withoutMotion.visualBeatDensityEnabled, true);
  assert.equal(withoutMotion.sourceQualityIntelligenceEnabled, true);
  assert.equal(withoutMotion.keyframedVisualEffectsEnabled, false);
  assert.equal(withoutMotion.engagementOverlaysEnabled, false);
  assert.equal(withoutMotion.shortForgeBrandStingEnabled, false);
  assert.equal(withoutMotion.subjectAwareReframingEnabled, false);

  const failClosed = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "" }),
  );
  assert.equal(failClosed.keyframedVisualEffectsEnabled, false);
  assert.equal(failClosed.engagementOverlaysEnabled, false);
  assert.equal(failClosed.shortForgeBrandStingEnabled, false);
  assert.equal(failClosed.subjectAwareReframingEnabled, false);

  const production = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C,12D,12E",
      vercelEnv: "production",
    }),
  );
  assert.equal(production.keyframedVisualEffectsEnabled, false);
  assert.equal(production.subjectAwareReframingEnabled, false);

  const main = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C,12D,12E",
      branch: "main",
    }),
  );
  assert.equal(main.keyframedVisualEffectsEnabled, false);
  assert.equal(main.engagementOverlaysEnabled, false);

  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /keyframedVisualEffectsEnabled:\s*false/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
}

function testNoHarnessLeakIntoProductionContracts(): void {
  const provider = readSrc(
    "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
  );
  assert.equal(
    (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities["']/g) ??
      []).length,
    1,
  );

  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /\/api\/visual-retention\/capabilities/);
  assert.doesNotMatch(harness, /\bfetch\(/);

  for (const rel of [
    "src/features/export/domain/build-export-manifest.ts",
    "src/features/export/domain/export-manifest.types.ts",
    "src/features/export/domain/run-export-capability-preflight.ts",
    "src/features/export/domain/prepare-export-request.ts",
  ]) {
    const src = readSrc(rel);
    assert.doesNotMatch(
      src,
      /visual-motion-qa|VisualMotionQaHarness|buildVisualMotionQaStory/,
    );
  }
}

function testHydrationSafeInitialValues(): void {
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /\bwindow\./);
  assert.doesNotMatch(harness, /Date\.now|new Date\(|Math\.random|toLocale/);
  assert.doesNotMatch(harness, /autoFocus|autofocus/);
  assert.match(
    harness,
    /useState<FootieScript>\(\(\) =>\s*buildVisualMotionQaStory\(\)/,
  );
}

function testNoPersistenceOrDeploymentSideEffects(): void {
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  const page = readSrc("src/app/dev/visual-motion-qa/page.tsx");
  const combined = `${page}\n${harness}`;

  assert.match(harness, /saveDraftDisabled/);
  assert.match(harness, /intentionally no-op|never persists/i);
  assert.doesNotMatch(combined, /saveDraft\(|persistDraft|writeDraft|upsertDraft/i);
  assert.doesNotMatch(combined, /deploy|vercel\.deploy|git push/i);
  assert.doesNotMatch(combined, /localStorage\.setItem|indexedDB/i);
  assert.doesNotMatch(combined, /FormData|upload|materialize/i);
}

function testResponsibilityBasedNaming(): void {
  for (const rel of [
    "src/app/dev/visual-motion-qa/page.tsx",
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
    "src/features/visual-retention/qa/build-visual-motion-qa-story.ts",
    "src/verification/visual-retention/visualMotionQaHarness.verify.ts",
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
  assert.match(pkg, /"test:visual-motion-qa"/);
  assert.match(pkg, /visualMotionQaHarness\.verify\.ts/);
}

function testHarnessShellAndRemountContract(): void {
  // Full StoryWorkspace mount exceeds install-minimal-dom (select/options, media).
  // Prove the harness shell + remount contract without copying production UI.
  const harness = readSrc(
    "src/app/dev/visual-motion-qa/VisualMotionQaHarness.tsx",
  );
  assert.match(harness, /data-visual-motion-qa-harness/);
  assert.match(harness, /data-visual-motion-qa-reset/);
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /key=\{workspaceKey\}/);
  assert.match(harness, /setSelectedSceneIndex\(0\)/);
  assert.match(harness, /setWorkspaceKey\(\(key\) => key \+ 1\)/);
  assert.match(harness, /buildVisualMotionQaStory\(\)/);
  assert.match(harness, /queueMicrotask\(\(\) => \{\s*resetButtonRef\.current\?\.focus\(\)/);

  // Behavioral remount: rebuild clears enhancements and restores windows.
  const dirty = buildVisualMotionQaStory();
  dirty.scenes[0]!.visualSequence!.items[0]!.media.subjectFocus = {
    version: 1,
    centerX: 0.2,
    centerY: 0.2,
    source: "manual",
  };
  dirty.scenes[0]!.durationMs = 1;
  const remounted = buildVisualMotionQaStory();
  assert.equal(remounted.scenes[0]!.durationMs, VISUAL_MOTION_QA_SCENE_1_DURATION_MS);
  assert.equal(remounted.scenes[0]!.visualSequence!.items[0]!.media.subjectFocus, undefined);
  assert.equal(remounted.scenes.length, 2);
  assert.equal(
    remounted.scenes[0]!.visualSequence!.items.map((item) => item.id).join(","),
    VISUAL_MOTION_QA_SCENE_1_ITEM_IDS.join(","),
  );
}

function main(): void {
  const tests: Array<[string, () => void]> = [
    ["production guard fail-closed", testProductionGuardFailClosed],
    ["no public navigation link", testNoPublicNavigationLink],
    ["initial story validity", testInitialStoryValidity],
    ["no provider/network dependency in harness", testNoProviderOrNetworkDependencyInHarness],
    ["real component composition", testRealComponentComposition],
    ["reset behavior", testResetBehavior],
    ["enabled capability path", testEnabledCapabilityPath],
    ["disabled capability path", testDisabledCapabilityPath],
    ["no harness leak into production contracts", testNoHarnessLeakIntoProductionContracts],
    ["hydration-safe initial values", testHydrationSafeInitialValues],
    ["no persistence or deployment side effects", testNoPersistenceOrDeploymentSideEffects],
    ["responsibility-based naming", testResponsibilityBasedNaming],
    ["harness shell and remount contract", testHarnessShellAndRemountContract],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\nVisual motion QA harness: ${passed}/${tests.length} PASS`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
