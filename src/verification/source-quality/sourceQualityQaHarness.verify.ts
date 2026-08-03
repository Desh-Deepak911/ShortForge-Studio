/**
 * Source-quality QA harness verification.
 * Run via: npm run test:source-quality-qa
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
import { assessSourceQuality } from "@/features/source-quality/domain/assess-source-quality";
import { recommendSafeVisualAdjustment } from "@/features/source-quality/domain/safe-visual-adjustment-recommendation";
import {
  buildSourceQualityQaStory,
  SOURCE_QUALITY_QA_DURATION_MS,
  SOURCE_QUALITY_QA_IMAGE_URL,
  SOURCE_QUALITY_QA_ITEM_IDS,
  SOURCE_QUALITY_QA_SCENE_ID,
  SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
} from "@/features/source-quality/qa/build-source-quality-qa-story";
import { EXPORT_MANIFEST_VERSION } from "@/features/export/domain";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";
import { resolveSourceQualityIntelligenceEnabledFromEnvironment } from "@/features/visual-retention/server/resolve-source-quality-intelligence-enabled";
import { resolveVisualBeatDensityEnabledFromEnvironment } from "@/features/visual-retention/server/resolve-visual-beat-density-enabled";
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
      input.branch ?? "staging-source-quality-intelligence",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES:
      input.phases ?? "12A,12B,12C,12D",
  };
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

  const page = readSrc("src/app/dev/source-quality-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.match(
    page,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*source-quality-qa/);

  // Shared guard only — no duplicate source-quality-local guard module.
  assert.equal(
    existsSync(
      "src/features/source-quality/qa/assert-local-dev-qa-harness-allowed.ts",
    ),
    false,
  );
}

function testNoPublicNavigationLink(): void {
  const layout = path.join(process.cwd(), "src/app/layout.tsx");
  if (existsSync(layout)) {
    assert.doesNotMatch(readSrc("src/app/layout.tsx"), /source-quality-qa/);
  }
  assert.doesNotMatch(
    readSrc("src/app/dev/source-quality-qa/page.tsx"),
    /href=.*source-quality-qa/,
  );
  assert.doesNotMatch(
    readSrc("src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx"),
    /href=.*source-quality-qa/,
  );
}

function testInitialStoryValidity(): void {
  const story = buildSourceQualityQaStory();
  assert.equal(story.scenes.length, 1);
  const scene = story.scenes[0]!;
  assert.equal(scene.id, SOURCE_QUALITY_QA_SCENE_ID);
  assert.equal(scene.durationMs, SOURCE_QUALITY_QA_DURATION_MS);
  assert.ok(
    Math.abs((scene.duration ?? 0) - SOURCE_QUALITY_QA_DURATION_MS / 1000) <
      0.001,
  );
  assert.ok((scene.narration ?? "").includes("."));
  assert.ok((scene.narration ?? "").split(".").filter(Boolean).length >= 3);

  assert.ok(scene.visualSequence);
  assert.equal(scene.visualSequence!.items.length, 3);
  assert.deepEqual(
    scene.visualSequence!.items.map((item) => item.id),
    [...SOURCE_QUALITY_QA_ITEM_IDS],
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
      id: SOURCE_QUALITY_QA_ITEM_IDS[0],
      start: 0,
      duration: SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
    },
    {
      id: SOURCE_QUALITY_QA_ITEM_IDS[1],
      start: SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
      duration: SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
    },
    {
      id: SOURCE_QUALITY_QA_ITEM_IDS[2],
      start: SOURCE_QUALITY_QA_WINDOW_DURATION_MS * 2,
      duration: SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
    },
  ]);

  assert.ok(scene.mediaTimeline);
  assert.equal(scene.mediaTimeline!.items.length, 3);
  assert.deepEqual(
    scene.mediaTimeline!.items.map((item) => item.id),
    [...SOURCE_QUALITY_QA_ITEM_IDS],
  );

  // visualSequence / mediaTimeline parity for each item.
  const sequenceItems = scene.visualSequence!.items;
  const timelineItems = scene.mediaTimeline!.items;
  for (let index = 0; index < 3; index += 1) {
    const sequenceItem = sequenceItems[index]!;
    const timelineItem = timelineItems[index]!;
    assert.equal(sequenceItem.id, timelineItem.id);
    assert.equal(sequenceItem.media.width, timelineItem.media.width);
    assert.equal(sequenceItem.media.height, timelineItem.media.height);
    assert.equal(sequenceItem.media.fitMode, timelineItem.media.fitMode);
    assert.equal(
      sequenceItem.media.transform?.scale,
      timelineItem.media.transform?.scale,
    );
  }

  const expected: ReadonlyArray<{
    readonly id: (typeof SOURCE_QUALITY_QA_ITEM_IDS)[number];
    readonly width: number;
    readonly height: number;
    readonly fitMode: "cover" | "contain";
    readonly scale: number;
    readonly framingFit: "fill" | "fit";
  }> = [
    {
      id: SOURCE_QUALITY_QA_ITEM_IDS[0],
      width: 1080,
      height: 1920,
      fitMode: "cover",
      scale: 1.4,
      framingFit: "fill",
    },
    {
      id: SOURCE_QUALITY_QA_ITEM_IDS[1],
      width: 1920,
      height: 1080,
      fitMode: "cover",
      scale: 1,
      framingFit: "fill",
    },
    {
      id: SOURCE_QUALITY_QA_ITEM_IDS[2],
      width: 360,
      height: 640,
      fitMode: "contain",
      scale: 1,
      framingFit: "fit",
    },
  ];

  for (let index = 0; index < expected.length; index += 1) {
    const expectation = expected[index]!;
    const item = sequenceItems[index]!;
    assert.equal(item.id, expectation.id);
    assert.equal(item.media.type, "image");
    assert.equal(item.media.url, SOURCE_QUALITY_QA_IMAGE_URL);
    assert.equal(item.media.width, expectation.width);
    assert.equal(item.media.height, expectation.height);
    assert.equal(item.media.fitMode, expectation.fitMode);
    assert.equal(item.media.transform?.scale, expectation.scale);
    assert.equal(item.media.sourceQualityAdjustmentProvenance, undefined);
    assert.doesNotMatch(item.media.url ?? "", /^https?:\/\//);
    assert.doesNotMatch(item.media.url ?? "", /^blob:/);

    const framing = resolveSceneMediaFraming({ media: item.media }, {
      media: item.media,
    });
    assert.equal(framing.fitMode, expectation.framingFit);
    assert.equal(framing.zoom, expectation.scale);
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
  assert.equal(EXPORT_MANIFEST_VERSION, 4);

  const publicSvg = path.join(
    process.cwd(),
    "public",
    SOURCE_QUALITY_QA_IMAGE_URL.replace(/^\//, ""),
  );
  assert.equal(existsSync(publicSvg), true);
}

function testFixtureRecommendations(): void {
  const scene = buildSourceQualityQaStory().scenes[0]!;
  const portrait = scene.visualSequence!.items[0]!.media;
  const landscape = scene.visualSequence!.items[1]!.media;
  const low = scene.visualSequence!.items[2]!.media;

  const portraitFraming = resolveSceneMediaFraming(
    { media: portrait },
    { media: portrait },
  );
  const portraitRec = recommendSafeVisualAdjustment({
    media: portrait,
    framing: portraitFraming,
  });
  assert.equal(portraitRec.applicable, true);
  assert.ok(portraitRec.recommendationCodes.includes("RESET_EXCESSIVE_ZOOM"));

  const landscapeFraming = resolveSceneMediaFraming(
    { media: landscape },
    { media: landscape },
  );
  const landscapeAssessment = assessSourceQuality({
    media: landscape,
    framing: landscapeFraming,
  });
  assert.ok(
    landscapeAssessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"),
  );
  const landscapeRec = recommendSafeVisualAdjustment({
    media: landscape,
    framing: landscapeFraming,
  });
  assert.equal(landscapeRec.applicable, true);
  assert.ok(landscapeRec.recommendationCodes.includes("USE_FIT_FRAMING"));

  const lowFraming = resolveSceneMediaFraming({ media: low }, { media: low });
  const lowRec = recommendSafeVisualAdjustment({
    media: low,
    framing: lowFraming,
  });
  assert.equal(lowRec.applicable, false);
  assert.ok(
    lowRec.recommendationCodes.includes("USE_HIGHER_RESOLUTION_SOURCE"),
  );
}

function testNoProviderOrNetworkDependencyInHarness(): void {
  const page = readSrc("src/app/dev/source-quality-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/source-quality/qa/build-source-quality-qa-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(combined, /\bgenerateStory\b|\bcreateStory\b/);
  assert.doesNotMatch(combined, /localStorage\.(get|set)Item/);
  assert.doesNotMatch(combined, /https?:\/\/(?!localhost)/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /fetch\(/);
  assert.doesNotMatch(harness, /sourceQualityIntelligenceEnabled\s*=/);
  assert.doesNotMatch(harness, /mixedMediaScenesEnabled\s*=/);
  assert.doesNotMatch(harness, /VisualRetentionCapabilitiesProvider/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability|capabilityOverride/i);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.match(harness, /<StoryWorkspace[\s\S]*?\/>/);
  // Harness must not copy source-quality / sequence / export implementation.
  assert.doesNotMatch(harness, /SourceQualitySummary/);
  assert.doesNotMatch(harness, /SourceQualityAdjustmentControls/);
  assert.doesNotMatch(harness, /MixedMediaSequencePanel/);
  assert.doesNotMatch(harness, /StudioSceneInspector/);
  assert.doesNotMatch(harness, /ExportPanel|HeadlessExportSection/);
  assert.doesNotMatch(harness, /assessSourceQuality|recommendSafeVisualAdjustment/);
  assert.doesNotMatch(harness, /resolveSourceQualityExportGuidance/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.match(workspace, /EditorSelectionProvider/);
  assert.match(workspace, /VideoPreview|ExportPanel/);
  assert.match(workspace, /ExportPanel/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /SourceQualitySummary/);
  assert.match(inspector, /MixedMediaSequencePanel/);

  const summary = readSrc(
    "src/features/source-quality/editor/SourceQualitySummary.tsx",
  );
  assert.match(summary, /SourceQualityAdjustmentControls/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
  assert.match(exportPanel, /useSourceQualityIntelligenceEnabled/);
}

function testResetBehavior(): void {
  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /data-source-quality-qa-reset/);
  assert.match(harness, /buildSourceQualityQaStory\(\)/);
  assert.match(harness, /setWorkspaceKey/);
  assert.match(harness, /resetButtonRef\.current\?\.focus\(\)/);
  assert.match(harness, /queueMicrotask/);
  assert.doesNotMatch(harness, /setTimeout|setInterval/);

  const a = buildSourceQualityQaStory();
  const b = buildSourceQualityQaStory();
  assert.equal(a.scenes[0]!.id, b.scenes[0]!.id);
  assert.deepEqual(
    a.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
      width: item.media.width,
      height: item.media.height,
      fitMode: item.media.fitMode,
      scale: item.media.transform?.scale,
      provenance: item.media.sourceQualityAdjustmentProvenance ?? null,
    })),
    b.scenes[0]!.visualSequence!.items.map((item) => ({
      id: item.id,
      start: item.startOffsetMs,
      duration: item.durationMs,
      width: item.media.width,
      height: item.media.height,
      fitMode: item.media.fitMode,
      scale: item.media.transform?.scale,
      provenance: item.media.sourceQualityAdjustmentProvenance ?? null,
    })),
  );
  assert.equal(a.scenes[0]!.visualBeatPlan, undefined);
  assert.equal(b.scenes[0]!.visualBeatPlan, undefined);
  assert.notEqual(a, b);
  assert.notEqual(a.scenes[0], b.scenes[0]);
  assert.notEqual(a.scenes[0]!.visualSequence, b.scenes[0]!.visualSequence);

  // Mutating one fixture must not affect a freshly built one.
  const mutated = a.scenes[0]!.visualSequence!.items[0]!;
  mutated.media.transform = {
    ...(mutated.media.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }),
    scale: 2.5,
  };
  mutated.media.sourceQualityAdjustmentProvenance = {
    version: 1,
    recommendationFingerprint: "qa-mutated",
    mediaFingerprint: "qa-mutated",
    recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
    previousFraming: {
      fitMode: "fill",
      positionX: 0,
      positionY: 0,
      zoom: 1.4,
      rotationDeg: 0,
    },
    appliedFraming: {
      fitMode: "fill",
      positionX: 0,
      positionY: 0,
      zoom: 1,
      rotationDeg: 0,
    },
    mediaItemId: SOURCE_QUALITY_QA_ITEM_IDS[0],
  };
  const restored = buildSourceQualityQaStory();
  const restoredItem = restored.scenes[0]!.visualSequence!.items[0]!;
  assert.equal(restoredItem.media.transform?.scale, 1.4);
  assert.equal(restoredItem.media.sourceQualityAdjustmentProvenance, undefined);
  assert.equal(
    restored.scenes[0]!.visualSequence!.items[0]!.durationMs,
    SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
  );
  assert.equal(
    restored.scenes[0]!.visualSequence!.items[1]!.startOffsetMs,
    SOURCE_QUALITY_QA_WINDOW_DURATION_MS,
  );
}

function testEnabledCapabilityPath(): void {
  const scene = buildSourceQualityQaStory().scenes[0]!;
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(plan.fromVisualSequence, true);
  assert.equal(plan.windows.length, 3);
  assert.equal(plan.windows[0]!.itemId, SOURCE_QUALITY_QA_ITEM_IDS[0]);
  assert.equal(plan.windows[0]!.durationMs, SOURCE_QUALITY_QA_WINDOW_DURATION_MS);

  const inspector = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspector.windows.length, 3);

  const active = resolveActiveSceneMediaRenderView(scene, 4500, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(active.mediaItemId, SOURCE_QUALITY_QA_ITEM_IDS[1]);

  const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B,12C,12D" }),
  );
  assert.equal(snapshot.mixedMediaScenesEnabled, true);
  assert.equal(snapshot.visualBeatDensityEnabled, true);
  assert.equal(snapshot.sourceQualityIntelligenceEnabled, true);

  assert.equal(
    resolveSourceQualityIntelligenceEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D" }),
    ),
    true,
  );

  const inspectorSrc = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspectorSrc, /SourceQualitySummary/);
  assert.match(inspectorSrc, /sourceQualityIntelligenceEnabled/);

  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /sourceQualityIntelligenceEnabled:\s*true/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability/i);
}

function testDisabledCapabilityPath(): void {
  const withoutSourceQuality =
    resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    );
  assert.equal(withoutSourceQuality.mixedMediaScenesEnabled, true);
  assert.equal(withoutSourceQuality.visualBeatDensityEnabled, true);
  assert.equal(withoutSourceQuality.sourceQualityIntelligenceEnabled, false);

  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    ),
    true,
  );
  assert.equal(
    resolveVisualBeatDensityEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    ),
    true,
  );
  assert.equal(
    resolveSourceQualityIntelligenceEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    ),
    false,
  );

  const failClosed = resolveSourceQualityIntelligenceEnabledFromEnvironment(
    stagingEnv({ phases: "" }),
  );
  assert.equal(failClosed, false);

  const production = resolveSourceQualityIntelligenceEnabledFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C,12D",
      vercelEnv: "production",
    }),
  );
  assert.equal(production, false);

  const main = resolveSourceQualityIntelligenceEnabledFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C,12D",
      branch: "main",
    }),
  );
  assert.equal(main, false);

  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /sourceQualityIntelligenceEnabled:\s*false/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);

  // Capability-off UI seam remains fail-closed in the real summary.
  const summary = readSrc(
    "src/features/source-quality/editor/SourceQualitySummary.tsx",
  );
  assert.match(summary, /useSourceQualityIntelligenceEnabled/);
  assert.match(summary, /useVisualRetentionCapabilitiesReady/);
}

function testExportControlsRemainPresent(): void {
  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /720x1280|720/);
  assert.match(exportPanel, /1080x1920|1080/);
  assert.match(exportPanel, /HeadlessExportSection/);

  const headless = readSrc(
    "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
  );
  assert.match(headless, /\["720p"/);
  assert.match(headless, /\["1080p"/);
  assert.match(headless, /\["4k"/);
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
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
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
    assert.doesNotMatch(src, /source-quality-qa|SourceQualityQaHarness|buildSourceQualityQaStory/);
  }

  const manifestTypes = readSrc(
    "src/features/export/domain/export-manifest.types.ts",
  );
  assert.doesNotMatch(
    manifestTypes,
    /sourceQualityAdjustmentProvenance|SOURCE_QUALITY_QA/,
  );
  assert.equal(EXPORT_MANIFEST_VERSION, 4);
}

function testHydrationSafeInitialValues(): void {
  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /\bwindow\./);
  assert.doesNotMatch(harness, /Date\.now|new Date\(|Math\.random|toLocale/);
  assert.doesNotMatch(harness, /autoFocus|autofocus/);
  assert.doesNotMatch(harness, /value=\{[^}]*undefined/);
  assert.match(
    harness,
    /useState<FootieScript>\(\(\) =>\s*buildSourceQualityQaStory\(\)/,
  );
}

function testNoPersistenceOrDeploymentSideEffects(): void {
  const harness = readSrc(
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
  );
  const page = readSrc("src/app/dev/source-quality-qa/page.tsx");
  const combined = `${page}\n${harness}`;

  assert.match(harness, /saveDraftDisabled/);
  assert.match(harness, /intentionally no-op|never persists/i);
  assert.doesNotMatch(combined, /saveDraft\(|persistDraft|writeDraft|upsertDraft/i);
  assert.doesNotMatch(combined, /deploy|vercel\.deploy|git push/i);
  assert.doesNotMatch(combined, /localStorage\.setItem|indexedDB/i);
}

function testResponsibilityBasedNaming(): void {
  for (const rel of [
    "src/app/dev/source-quality-qa/page.tsx",
    "src/app/dev/source-quality-qa/SourceQualityQaHarness.tsx",
    "src/features/source-quality/qa/build-source-quality-qa-story.ts",
    "src/verification/source-quality/sourceQualityQaHarness.verify.ts",
  ]) {
    assert.doesNotMatch(
      rel,
      /sprint|phase|slice|checkpoint|hardening|final|ticket|\d{4}-\d{2}-\d{2}/i,
    );
    assert.ok(readSrc(rel).length > 0);
    assert.doesNotMatch(
      readSrc(rel),
      /\bSprint\b|\bSlice\b|\bCheckpoint\b|\bHardening\b/,
    );
  }

  const pkg = readSrc("package.json");
  assert.match(pkg, /"test:source-quality-qa"/);
  assert.match(pkg, /sourceQualityQaHarness\.verify\.ts/);
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["production guard fail-closed", testProductionGuardFailClosed],
    ["no public navigation link", testNoPublicNavigationLink],
    ["initial story validity", testInitialStoryValidity],
    ["fixture recommendations match intent", testFixtureRecommendations],
    ["no provider/network dependency in harness", testNoProviderOrNetworkDependencyInHarness],
    ["real component composition", testRealComponentComposition],
    ["reset behavior", testResetBehavior],
    ["enabled capability path", testEnabledCapabilityPath],
    ["disabled capability path", testDisabledCapabilityPath],
    ["export controls remain present", testExportControlsRemainPresent],
    ["no harness leak into production contracts", testNoHarnessLeakIntoProductionContracts],
    ["hydration-safe initial values", testHydrationSafeInitialValues],
    ["no persistence or deployment side effects", testNoPersistenceOrDeploymentSideEffects],
    ["responsibility-based naming", testResponsibilityBasedNaming],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\nSource quality QA harness: ${passed}/${tests.length} PASS`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
