/**
 * Creator-export journey QA harness verification.
 * Run via: npm run test:creator-export-journey
 *
 * Does not submit Browser or Headless export.
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";

import { getShortForgeBrandSting } from "@/features/brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildCreatorExportJourneyStory,
  cloneCreatorExportQaCheckpoint,
  CREATOR_EXPORT_QA_DRAFT_ID,
  CREATOR_EXPORT_QA_IMAGE_URL,
  CREATOR_EXPORT_QA_SCENE_1_DURATION_MS,
  CREATOR_EXPORT_QA_SCENE_1_ID,
  CREATOR_EXPORT_QA_SCENE_1_ITEM_IDS,
  CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS,
  CREATOR_EXPORT_QA_SCENE_2_DURATION_MS,
  CREATOR_EXPORT_QA_SCENE_2_ID,
  CREATOR_EXPORT_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  CREATOR_EXPORT_QA_SCENE_2_ITEM_IDS,
  CREATOR_EXPORT_QA_SCENE_2_WINDOW_MS,
  CREATOR_EXPORT_QA_SCENE_3_DURATION_MS,
  CREATOR_EXPORT_QA_SCENE_3_ID,
  CREATOR_EXPORT_QA_SCENE_3_ITEM_ID,
} from "@/features/export/qa/build-creator-export-journey-story";
import { projectSceneVisualPlan } from "@/features/mixed-media-scenes";
import { readStoredVisualBeatPlan } from "@/features/visual-beat-density/adapters/project-scene-visual-beat-plan";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  evaluateVisualRetentionPresetStaleness,
  projectStoryVisualRetentionPresetInput,
  resolveVisualRetentionPresetExportGuidance,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";
import type { FootieScript } from "@/features/story/types";
import { CreatorExportQaSessionChrome } from "@/app/dev/creator-export-qa/CreatorExportQaHarness";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

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
    VERCEL_GIT_COMMIT_REF: input.branch ?? "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES:
      input.phases ?? "12A,12B,12C,12D,12E,12F",
  };
}

function allCapabilities(
  overrides: Partial<VisualRetentionPresetPlanningCapabilities> = {},
): VisualRetentionPresetPlanningCapabilities {
  return {
    ready: true,
    visualRetentionPresetsEnabled: true,
    visualBeatDensityEnabled: true,
    keyframedVisualEffectsEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    mixedMediaScenesEnabled: true,
    ...overrides,
  };
}

function applyShareReady(story: FootieScript): FootieScript {
  const caps = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(story, {
    mixedMediaScenesEnabled: true,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    presetId: "visual-retention-share-ready",
    facts,
    capabilities: caps,
  });
  assert.equal(plan.terminalCode, null);
  const applied = applyVisualRetentionPresetPlan({
    script: story,
    plan,
    capabilities: caps,
    generatedAtIso: "2026-08-05T02:00:00.000Z",
  });
  if (applied.ok !== true) {
    const code =
      "terminalCode" in applied ? String(applied.terminalCode) : "unknown";
    throw new Error(`expected Share Ready apply, got ${code}`);
  }
  return applied.script;
}

function guidanceCaps() {
  return {
    visualRetentionCapabilitiesReady: true,
    visualRetentionPresetsEnabled: true,
    visualBeatDensityEnabled: true,
    keyframedVisualEffectsEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    mixedMediaScenesEnabled: true,
  } as const;
}

function withManualLookOverride(story: FootieScript): FootieScript {
  return {
    ...story,
    scenes: story.scenes.map((scene, sceneIndex) => {
      if (sceneIndex !== 0 || !scene.visualSequence) return scene;
      const items = scene.visualSequence.items.map((item, index) => {
        if (index !== 0) return item;
        return {
          ...item,
          media: {
            ...item.media,
            visualEffect: {
              version: 1 as const,
              presetId: "monochrome" as const,
              intensity: 0.2,
            },
          },
        };
      });
      return {
        ...scene,
        visualSequence: { version: 1 as const, items },
      };
    }),
  };
}

function testProductionGuardFailClosed(): void {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("test"), false);
  assert.equal(isLocalDevQaHarnessAllowed(undefined), false);
  assert.equal(isLocalDevQaHarnessAllowed(""), false);
  assert.equal(isLocalDevQaHarnessAllowed("staging"), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);

  const page = readSrc("src/app/dev/creator-export-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.match(
    page,
    /@\/features\/visual-retention\/qa\/assert-local-dev-qa-harness-allowed/,
  );
  assert.doesNotMatch(page, /["']use client["']/);
  assert.match(page, /force-dynamic/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_/);
  assert.doesNotMatch(page, /process\.env\.(?!NODE_ENV)/);
  assert.doesNotMatch(page, /typeof window|window\./);
}

function testNoPublicNavigationLink(): void {
  for (const rel of [
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/create/page.tsx",
    "src/app/drafts/page.tsx",
  ]) {
    if (existsSync(path.join(process.cwd(), rel))) {
      assert.doesNotMatch(readSrc(rel), /creator-export-qa/);
    }
  }
  assert.doesNotMatch(
    readSrc("src/app/dev/creator-export-qa/page.tsx"),
    /href=.*creator-export-qa/,
  );
  assert.doesNotMatch(
    readSrc("src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx"),
    /href=.*creator-export-qa/,
  );
}

function testExportQaOwnershipSeparation(): void {
  const exportQa = readSrc("src/app/dev/export-qa/page.tsx");
  assert.match(exportQa, /["']use client["']/);
  assert.doesNotMatch(exportQa, /StoryWorkspace/);
  assert.doesNotMatch(exportQa, /assertLocalDevQaHarnessAllowed/);
  assert.match(exportQa, /createExportDeviceQaReport|EXPORT_GOLDEN_PROJECTS/);

  const creatorPage = readSrc("src/app/dev/creator-export-qa/page.tsx");
  assert.match(creatorPage, /assertLocalDevQaHarnessAllowed/);
  assert.doesNotMatch(creatorPage, /createExportDeviceQaReport/);
}

function testInitialStoryValidity(): void {
  const story = buildCreatorExportJourneyStory();
  assert.equal(story.scenes.length, 3);
  assert.equal(story.title, "QA — Creator Export Disposable — Local Only");
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
  assert.equal(scene1!.id, CREATOR_EXPORT_QA_SCENE_1_ID);
  assert.equal(scene2!.id, CREATOR_EXPORT_QA_SCENE_2_ID);
  assert.equal(scene3!.id, CREATOR_EXPORT_QA_SCENE_3_ID);
  assert.equal(scene1!.durationMs, CREATOR_EXPORT_QA_SCENE_1_DURATION_MS);
  assert.equal(scene2!.durationMs, CREATOR_EXPORT_QA_SCENE_2_DURATION_MS);
  assert.equal(scene3!.durationMs, CREATOR_EXPORT_QA_SCENE_3_DURATION_MS);
  assert.ok((scene1!.narration ?? "").split(".").filter(Boolean).length >= 3);

  assert.deepEqual(
    scene1!.visualSequence!.items.map((item) => item.id),
    [...CREATOR_EXPORT_QA_SCENE_1_ITEM_IDS],
  );
  assert.deepEqual(
    scene1!.visualSequence!.items.map((item) => ({
      start: item.startOffsetMs,
      duration: item.durationMs,
    })),
    [
      { start: 0, duration: CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS },
      {
        start: CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS,
        duration: CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS,
      },
      {
        start: CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS * 2,
        duration: CREATOR_EXPORT_QA_SCENE_1_WINDOW_MS,
      },
    ],
  );

  const dims = [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 360, height: 640 },
  ];
  for (let index = 0; index < 3; index += 1) {
    const item = scene1!.visualSequence!.items[index]!;
    assert.equal(item.media.url, CREATOR_EXPORT_QA_IMAGE_URL);
    assert.equal(item.media.width, dims[index]!.width);
    assert.equal(item.media.height, dims[index]!.height);
    assert.equal(item.media.motion, undefined);
    assert.equal(item.media.visualEffect, undefined);
    assert.doesNotMatch(item.media.url ?? "", /^https?:\/\//);
    assert.doesNotMatch(item.media.url ?? "", /^blob:/);
  }

  assert.equal(
    scene2!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.ok(
    (scene2!.visualSequence!.items[0]!.media.motion?.keyframes?.length ?? 0) >=
      2,
  );
  assert.equal(
    scene2!.visualSequence!.items[1]!.media.visualAdjustments?.brightness,
    CREATOR_EXPORT_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
  assert.equal(scene3!.visualSequence!.items[0]!.id, CREATOR_EXPORT_QA_SCENE_3_ITEM_ID);
  assert.equal(scene3!.visualSequence!.items[0]!.media.width, 1080);
  assert.equal(scene3!.visualSequence!.items[0]!.media.height, 1920);

  for (const scene of story.scenes) {
    assert.equal(scene.visualBeatPlan, undefined);
    const plan = projectSceneVisualPlan(scene, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(plan.fromVisualSequence, true);
  }

  assert.equal(
    existsSync(
      path.join(
        process.cwd(),
        "public",
        CREATOR_EXPORT_QA_IMAGE_URL.replace(/^\//, ""),
      ),
    ),
    true,
  );
  assert.equal(CREATOR_EXPORT_QA_DRAFT_ID, "creator-export-qa");
}

function testNoProviderOrCapabilityOverride(): void {
  const page = readSrc("src/app/dev/creator-export-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/export/qa/build-creator-export-journey-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(
    combined,
    /localStorage\.(get|set)Item|sessionStorage\.(get|set)Item|indexedDB\.open/i,
  );
  assert.doesNotMatch(
    combined,
    /draft-storage\.service|persistDraft|upsertDraft|writeDraft/i,
  );
  assert.doesNotMatch(harness, /fetch\(/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /VisualRetentionCapabilitiesProvider/);
  assert.doesNotMatch(harness, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability|capabilityOverride/i);
  assert.doesNotMatch(combined, /process\.env\.(?!NODE_ENV)/);
  assert.doesNotMatch(combined, /\b12G\b/);
  assert.doesNotMatch(harness, /persistWarning/);
  assert.doesNotMatch(harness, /Save failed/);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.equal((harness.match(/<StoryWorkspace/g) ?? []).length, 1);
  assert.match(harness, /draftId=\{CREATOR_EXPORT_QA_DRAFT_ID\}/);
  assert.match(harness, /onSaveDraft=\{handleSaveDraft\}/);
  assert.doesNotMatch(harness, /saveDraftDisabled/);
  assert.doesNotMatch(
    harness,
    /import\s+.*VisualRetentionPresetsPanel|<VisualRetentionPresetsPanel/,
  );
  assert.doesNotMatch(harness, /ExportPanel|HeadlessExportSection|VideoPreview/);
  assert.doesNotMatch(harness, /exportFootieShort\(|prepareExportRequest\(/);
  assert.doesNotMatch(harness, /startOwnedHeadless|dispatchOwnedHeadless|MediaRecorder/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.match(workspace, /ExportPanel/);
  assert.match(workspace, /storyId=\{draftId\}/);
}

function testHonestInMemorySaveContract(): void {
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.match(
    harness,
    /Local QA session — Save Draft stores an in-memory checkpoint only\./,
  );
  assert.match(harness, /latestScriptRef/);
  assert.match(harness, /savedCheckpointRef/);
  assert.match(
    harness,
    /cloneCreatorExportQaCheckpoint\(latestScriptRef\.current\)/,
  );
  assert.match(harness, /savedCheckpointRef\.current = snapshot/);
  assert.match(harness, /setSavedCheckpoint\(snapshot\)/);
  assert.match(harness, /saveDraftConfirmation=\{saveConfirmation\}/);
  assert.doesNotMatch(harness, /persistWarning/);
  assert.doesNotMatch(harness, /Save failed/);
  assert.match(
    harness,
    /const handleSaveDraft = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\)/,
  );
  assert.doesNotMatch(
    harness,
    /handleSaveDraft = useCallback\([\s\S]*?\}, \[script\]\)/,
  );
  assert.match(
    harness,
    /A page reload clears the in-memory checkpoint/,
  );

  const pristine = buildCreatorExportJourneyStory();
  const checkpoint = cloneCreatorExportQaCheckpoint(pristine);
  assert.notEqual(checkpoint, pristine);
  assert.notEqual(checkpoint.scenes, pristine.scenes);
  assert.notEqual(checkpoint.scenes[0], pristine.scenes[0]);
  assert.deepEqual(
    checkpoint.scenes.map((scene) => scene.id),
    pristine.scenes.map((scene) => scene.id),
  );
  checkpoint.title = "mutated-checkpoint";
  checkpoint.scenes[1]!.visualSequence!.items[0]!.media.motion = undefined;
  assert.equal(
    buildCreatorExportJourneyStory().title,
    "QA — Creator Export Disposable — Local Only",
  );
  assert.notEqual(pristine.title, "mutated-checkpoint");
  assert.equal(
    pristine.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
}

function testFixtureDeterminismAndIsolation(): void {
  const a = buildCreatorExportJourneyStory();
  const b = buildCreatorExportJourneyStory();
  assert.notEqual(a, b);
  assert.notEqual(a.scenes, b.scenes);
  assert.deepEqual(
    a.scenes.map((scene) => scene.id),
    b.scenes.map((scene) => scene.id),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(a)),
    JSON.parse(JSON.stringify(b)),
  );

  const ids = [
    ...a.scenes.map((scene) => scene.id),
    ...a.scenes.flatMap(
      (scene) => scene.visualSequence!.items.map((item) => item.id),
    ),
  ];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));

  for (const scene of a.scenes) {
    const items = scene.visualSequence!.items;
    let cursor = 0;
    for (const item of items) {
      assert.ok(Number.isFinite(item.startOffsetMs));
      assert.ok(Number.isFinite(item.durationMs));
      assert.ok(item.durationMs > 0);
      assert.equal(item.startOffsetMs, cursor);
      cursor += item.durationMs;
      assert.equal(item.media.url, CREATOR_EXPORT_QA_IMAGE_URL);
      assert.doesNotMatch(item.media.url ?? "", /^blob:/i);
      assert.doesNotMatch(item.media.url ?? "", /^data:/i);
      assert.doesNotMatch(item.media.url ?? "", /^https?:\/\//i);
    }
    assert.equal(cursor, scene.durationMs);
    assert.equal(scene.mediaTimeline!.items.length, items.length);
  }

  assert.deepEqual(
    a.scenes[1]!.visualSequence!.items.map((item) => item.id),
    [...CREATOR_EXPORT_QA_SCENE_2_ITEM_IDS],
  );
  assert.equal(
    a.scenes[1]!.visualSequence!.items[0]!.durationMs,
    CREATOR_EXPORT_QA_SCENE_2_WINDOW_MS,
  );

  a.title = "poison";
  a.scenes[0]!.narration = "poison";
  assert.equal(
    buildCreatorExportJourneyStory().title,
    "QA — Creator Export Disposable — Local Only",
  );

  const fixtureSrc = readSrc(
    "src/features/export/qa/build-creator-export-journey-story.ts",
  );
  assert.doesNotMatch(fixtureSrc, /Math\.random|Date\.now|crypto\.|localStorage/);
  assert.doesNotMatch(fixtureSrc, /let\s+\w+\s*=\s*\[|module\.exports/);
}

function testSaveAuthoritySourceContracts(): void {
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.match(
    harness,
    /latestScriptRef\.current = next/,
  );
  assert.match(
    harness,
    /handleScriptChange = useCallback\(\(next: FootieScript\) => \{/,
  );
  assert.doesNotMatch(harness, /useEffect\([\s\S]*handleSaveDraft/);
  assert.doesNotMatch(harness, /useEffect\([\s\S]*setSavedCheckpoint/);
  assert.doesNotMatch(harness, /setTimeout|setInterval/);
  assert.doesNotMatch(harness, /useLayoutEffect\([\s\S]*setScript/);
  // Save must not remount or clear selection — inspect only the Save callback body.
  const saveBody = harness.match(
    /const handleSaveDraft = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/,
  );
  assert.ok(saveBody, "expected handleSaveDraft callback body");
  assert.doesNotMatch(saveBody![1]!, /setWorkspaceKey|setSelectedSceneIndex/);
  assert.match(saveBody![1]!, /latestScriptRef\.current/);
  assert.match(harness, /disabled=\{!canReopen\}/);
  assert.match(harness, /canReopen=\{savedCheckpoint != null\}/);
}

function testShareReadyPlanApplyPreservation(): void {
  const story = buildCreatorExportJourneyStory();
  const caps = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(story, {
    mixedMediaScenesEnabled: true,
  });
  const planOnly = buildVisualRetentionPresetApplicationPlan({
    presetId: "visual-retention-share-ready",
    facts,
    capabilities: caps,
  });
  assert.equal(planOnly.terminalCode, null);
  assert.equal(story.visualRetentionPresetProvenance, undefined);
  assert.equal(
    getSceneEngagementOverlay(story, CREATOR_EXPORT_QA_SCENE_3_ID),
    undefined,
  );
  assert.equal(
    getShortForgeBrandSting(story.visualRetentionExtensions),
    undefined,
  );

  const beforeOffsets = story.scenes.map((scene) =>
    scene.visualSequence!.items.map((item) => item.startOffsetMs),
  );
  const applied = applyShareReady(story);
  assert.ok(applied.visualRetentionPresetProvenance);
  assert.equal(
    applied.visualRetentionPresetProvenance?.presetId,
    "visual-retention-share-ready",
  );
  assert.equal(applied.visualRetentionPresetProvenance?.status, "applied");

  const overlay = getSceneEngagementOverlay(applied, CREATOR_EXPORT_QA_SCENE_3_ID);
  assert.ok(overlay);
  assert.equal(overlay!.kind, "combined");

  const sting = getShortForgeBrandSting(applied.visualRetentionExtensions);
  assert.ok(sting);
  assert.equal(sting!.enabled, true);
  assert.equal(sting!.durationMs, 2500);

  // Custom keyframes preserved.
  assert.equal(
    applied.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.ok(
    (applied.scenes[1]!.visualSequence!.items[0]!.media.motion?.keyframes
      ?.length ?? 0) >= 2,
  );
  // Freeform adjustment preserved.
  assert.equal(
    applied.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments
      ?.brightness,
    CREATOR_EXPORT_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
  // Suggest-only pacing: timing windows are not retimed by Apply.
  const afterOffsets = applied.scenes.map((scene) =>
    scene.visualSequence!.items.map((item) => item.startOffsetMs),
  );
  assert.deepEqual(afterOffsets, beforeOffsets);
  // Commands never call applyVisualBeatPlan for presets.
  const commands = readSrc(
    "src/features/visual-retention-presets/editor/visual-retention-preset.commands.ts",
  );
  assert.match(commands, /suggestVisualBeatPlan/);
  assert.doesNotMatch(commands, /applyVisualBeatPlan\(/);
  // Closing scene remains an honest insufficient-media pacing target (1 item).
  assert.equal(applied.scenes[2]!.visualSequence!.items.length, 1);
  // Suggest-only may store a beat-plan draft on multi-item scenes.
  assert.ok(
    readStoredVisualBeatPlan(applied.scenes[0]!) != null ||
      readStoredVisualBeatPlan(applied.scenes[1]!) != null,
  );
}

function testSaveReopenRollback(): void {
  const baseline = buildCreatorExportJourneyStory();
  const applied = applyShareReady(baseline);
  const saved = cloneCreatorExportQaCheckpoint(applied);

  // Later editor mutations must not mutate the saved snapshot by shared ref.
  applied.title = "live-mutated-after-save";
  applied.scenes[0]!.narration = "live mutation";
  assert.notEqual(saved.title, "live-mutated-after-save");
  assert.notEqual(saved.scenes[0]!.narration, "live mutation");

  const unsaved = cloneCreatorExportQaCheckpoint(applied);
  unsaved.title = "unsaved edit after checkpoint";
  unsaved.scenes[0]!.narration = "mutated after save";

  const reopened = cloneCreatorExportQaCheckpoint(saved);
  assert.notEqual(reopened.title, "unsaved edit after checkpoint");
  assert.equal(
    reopened.visualRetentionPresetProvenance?.presetId,
    "visual-retention-share-ready",
  );
  assert.equal(
    reopened.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.equal(
    reopened.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments
      ?.brightness,
    CREATOR_EXPORT_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
  assert.ok(getSceneEngagementOverlay(reopened, CREATOR_EXPORT_QA_SCENE_3_ID));
  assert.equal(
    getShortForgeBrandSting(reopened.visualRetentionExtensions)?.durationMs,
    2500,
  );
  assert.deepEqual(
    reopened.scenes.map((scene) => scene.id),
    [
      CREATOR_EXPORT_QA_SCENE_1_ID,
      CREATOR_EXPORT_QA_SCENE_2_ID,
      CREATOR_EXPORT_QA_SCENE_3_ID,
    ],
  );

  const current = evaluateVisualRetentionPresetStaleness({
    script: reopened,
    capabilities: allCapabilities(),
  });
  assert.equal(current.effectiveStatus, "applied");

  // Repeated Save replaces the checkpoint atomically.
  const secondLive = cloneCreatorExportQaCheckpoint(reopened);
  secondLive.title = "second-checkpoint";
  const secondSaved = cloneCreatorExportQaCheckpoint(secondLive);
  const afterUnsaved = cloneCreatorExportQaCheckpoint(secondLive);
  afterUnsaved.title = "discard-me";
  const secondReopen = cloneCreatorExportQaCheckpoint(secondSaved);
  assert.equal(secondReopen.title, "second-checkpoint");
  assert.notEqual(secondReopen.title, "discard-me");
}

function testShareReadyCurrentThenStaleOnce(): void {
  const applied = applyShareReady(buildCreatorExportJourneyStory());
  const saved = cloneCreatorExportQaCheckpoint(applied);
  const reopened = cloneCreatorExportQaCheckpoint(saved);

  const prepared = prepareStoryForExport(reopened, {
    mixedMediaScenesEnabled: true,
  });
  const currentGuidance = resolveVisualRetentionPresetExportGuidance(
    prepared.story,
    guidanceCaps(),
  );
  assert.equal(
    currentGuidance.filter(
      (item) =>
        item.code ===
        VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    ).length,
    0,
  );
  assert.equal(
    evaluateVisualRetentionPresetStaleness({
      script: prepared.story,
      capabilities: allCapabilities(),
    }).effectiveStatus,
    "applied",
  );

  const stale = withManualLookOverride(reopened);
  const stalePrepared = prepareStoryForExport(stale, {
    mixedMediaScenesEnabled: true,
  });
  const first = resolveVisualRetentionPresetExportGuidance(
    stalePrepared.story,
    guidanceCaps(),
  );
  const second = resolveVisualRetentionPresetExportGuidance(
    stalePrepared.story,
    guidanceCaps(),
  );
  assert.equal(
    first.filter(
      (item) =>
        item.code ===
        VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    ).length,
    1,
  );
  assert.equal(
    second.filter(
      (item) =>
        item.code ===
        VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    ).length,
    1,
  );
  assert.deepEqual(
    first.map((item) => item.code),
    second.map((item) => item.code),
  );
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
  };
}

async function clickNode(node: Element | null): Promise<void> {
  assert.ok(node, "expected clickable node");
  const props = getReactProps(node);
  await act(async () => {
    props.onClick?.({
      type: "click",
      target: node,
      currentTarget: node,
      preventDefault() {},
      stopPropagation() {},
    });
  });
}

async function testSessionChromeFocusAndRemount(): Promise<void> {
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.match(harness, /Reopen saved checkpoint/);
  assert.match(harness, /data-creator-export-qa-reopen/);
  assert.match(harness, /data-creator-export-qa-reset/);
  assert.match(harness, /setWorkspaceKey\(\(key\) => key \+ 1\)/);
  assert.match(harness, /key=\{workspaceKey\}/);
  assert.match(harness, /setSelectedSceneIndex\(0\)/);
  assert.match(
    harness,
    /queueMicrotask\(\(\) => \{\s*reopenButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(
    harness,
    /queueMicrotask\(\(\) => \{\s*resetButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(harness, /setSavedCheckpoint\(null\)/);
  assert.doesNotMatch(harness, /setTimeout|setInterval/);

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const reopenRef = createRef<HTMLButtonElement>();
  const resetRef = createRef<HTMLButtonElement>();
  let reopenCount = 0;
  let resetCount = 0;

  await act(async () => {
    root.render(
      createElement(CreatorExportQaSessionChrome, {
        canReopen: true,
        onReopen: () => {
          reopenCount += 1;
          queueMicrotask(() => reopenRef.current?.focus());
        },
        onReset: () => {
          resetCount += 1;
          queueMicrotask(() => resetRef.current?.focus());
        },
        reopenRef,
        resetRef,
      }),
    );
  });

  const reopen = host.querySelector(
    "[data-creator-export-qa-reopen]",
  ) as HTMLButtonElement;
  const reset = host.querySelector(
    "[data-creator-export-qa-reset]",
  ) as HTMLButtonElement;
  assert.ok(reopen);
  assert.ok(reset);
  assert.equal(reopen.hasAttribute("disabled"), false);

  await clickNode(reopen);
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(reopenCount, 1);
  assert.equal(document.activeElement, reopen);

  await clickNode(reset);
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(resetCount, 1);
  assert.equal(document.activeElement, reset);

  await act(async () => {
    root.render(
      createElement(CreatorExportQaSessionChrome, {
        canReopen: false,
        onReopen: () => {
          reopenCount += 1;
        },
        onReset: () => {
          resetCount += 1;
        },
        reopenRef,
        resetRef,
      }),
    );
  });
  assert.equal(
    (
      host.querySelector(
        "[data-creator-export-qa-reopen]",
      ) as HTMLButtonElement
    ).hasAttribute("disabled"),
    true,
  );

  await act(async () => {
    root.unmount();
  });
  host.remove();
}

function testPristineReset(): void {
  const mutated = applyShareReady(buildCreatorExportJourneyStory());
  mutated.title = "dirty";
  const restored = buildCreatorExportJourneyStory();
  assert.equal(restored.title, "QA — Creator Export Disposable — Local Only");
  assert.equal(restored.visualRetentionPresetProvenance, undefined);
  assert.equal(restored.visualRetentionExtensions, undefined);
  assert.equal(
    restored.scenes[1]!.visualSequence!.items[0]!.media.motion?.presetId,
    "custom",
  );
  assert.equal(
    restored.scenes[1]!.visualSequence!.items[1]!.media.visualAdjustments
      ?.brightness,
    CREATOR_EXPORT_QA_SCENE_2_ITEM_2_BRIGHTNESS,
  );
}

function testCapabilityMatrix(): void {
  const withPresets = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B,12C,12D,12E,12F" }),
  );
  assert.equal(withPresets.visualRetentionPresetsEnabled, true);
  assert.equal(withPresets.mixedMediaScenesEnabled, true);
  assert.equal(withPresets.phasesValid, true);

  const withoutPresets =
    resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D,12E" }),
    );
  assert.equal(withoutPresets.visualRetentionPresetsEnabled, false);
  assert.equal(withoutPresets.mixedMediaScenesEnabled, true);

  for (const env of [
    stagingEnv({ phases: "" }),
    stagingEnv({ phases: "12A,12B,12C,12D,12E,12F", branch: "main" }),
    stagingEnv({
      phases: "12A,12B,12C,12D,12E,12F",
      vercelEnv: "production",
    }),
  ] as const) {
    const closed = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(env);
    assert.equal(closed.visualRetentionPresetsEnabled, false);
    assert.equal(closed.mixedMediaScenesEnabled, false);
  }

  // 12G alone is not a creator capability.
  const with12G = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B,12C,12D,12E,12F,12G" }),
  );
  assert.equal(with12G.visualRetentionPresetsEnabled, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(with12G, "visualRetention12GEnabled"),
    false,
  );

  const route = readSrc("src/app/api/visual-retention/capabilities/route.ts");
  assert.doesNotMatch(route, /12G|visualRetention12G/);
}

async function testExportPreflightBoundary(): Promise<void> {
  const applied = applyShareReady(buildCreatorExportJourneyStory());
  const reopened = cloneCreatorExportQaCheckpoint(applied);

  const preparedStory = prepareStoryForExport(reopened, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(preparedStory.story);

  const guidance = resolveVisualRetentionPresetExportGuidance(
    preparedStory.story,
    guidanceCaps(),
  );
  assert.ok(
    !guidance.some(
      (item) =>
        item.code ===
        VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    ),
  );

  const stale = withManualLookOverride(reopened);
  const stalePrepared = prepareStoryForExport(stale, {
    mixedMediaScenesEnabled: true,
  });
  const staleGuidance = resolveVisualRetentionPresetExportGuidance(
    stalePrepared.story,
    guidanceCaps(),
  );
  const staleItems = staleGuidance.filter(
    (item) =>
      item.code ===
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
  );
  assert.equal(staleItems.length, 1);

  const capableEnv = {
    browserName: "chrome" as const,
    supportsCanvasCaptureStream: true,
    supportsManualCanvasFrameRequest: true,
    supportsMediaRecorder: true,
    supportsRequestVideoFrameCallback: true,
    supportsWebAssembly: true,
    serverRendererAvailable: false,
    ffmpegRuntimePoisoned: false,
    estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
    mp4EncoderAvailable: true,
  };
  const request = await prepareExportRequest({
    story: reopened,
    options: {
      exportSettings: {
        resolution: "720x1280",
        format: "webm",
        quality: "standard",
      },
    },
    throwIfBlocked: false,
    mixedMediaScenesEnabled: true,
    visualBeatDensityEnabled: true,
    sourceQualityIntelligenceEnabled: true,
    keyframedVisualEffectsEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    visualRetentionPresetsEnabled: true,
    visualRetentionCapabilitiesReady: true,
    environment: capableEnv,
  });
  assert.ok(request.manifest);
  assert.doesNotMatch(
    JSON.stringify(request.manifest),
    /visual-retention-presets-v1/,
  );

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /720x1280/);
  assert.match(exportPanel, /1080x1920/);
  assert.match(exportPanel, /exportRenderer === ["']browser["']/);
  assert.match(exportPanel, /HeadlessExportSection/);
  assert.match(exportPanel, /4[Kk]|4k/);

  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /exportFootieShort|renderExport|downloadBlob/);
  assert.doesNotMatch(harness, /MediaRecorder|canvas\.captureStream/);
  assert.doesNotMatch(harness, /startOwnedHeadless|dispatchOwnedHeadless/);
}

function testNoHarnessLeak(): void {
  for (const rel of [
    "src/features/export/domain/build-export-manifest.ts",
    "src/features/export/domain/prepare-export-request.ts",
    "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
    "src/components/StoryWorkspace.tsx",
  ]) {
    assert.doesNotMatch(
      readSrc(rel),
      /creator-export-qa|CreatorExportQaHarness|buildCreatorExportJourneyStory/,
    );
  }
}

function testResponsibilityBasedNaming(): void {
  for (const rel of [
    "src/app/dev/creator-export-qa/page.tsx",
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
    "src/features/export/qa/build-creator-export-journey-story.ts",
    "src/verification/export/creatorExportJourney.verify.ts",
  ]) {
    assert.doesNotMatch(
      rel,
      /sprint|phase|slice|checkpoint|hardening|final|ticket|followup|chronology|\d{4}-\d{2}-\d{2}/i,
    );
    // Filename path itself may contain "checkpoint" in prose elsewhere — check file bodies.
    assert.doesNotMatch(
      readSrc(rel),
      /\bSprint\b|\bSlice\b|\bHardening\b|\bFollowup\b/,
    );
  }

  const pkg = readSrc("package.json");
  assert.match(pkg, /"test:creator-export-journey"/);
  assert.match(pkg, /creatorExportJourney\.verify\.ts/);
}

function testOpenDoesNotAutoMutate(): void {
  const harness = readSrc(
    "src/app/dev/creator-export-qa/CreatorExportQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /applyVisualRetentionPresetPlan/);
  assert.doesNotMatch(harness, /useEffect\([\s\S]*onScriptChange/);
  assert.doesNotMatch(harness, /useEffect\([\s\S]*handleSaveDraft/);
  assert.match(
    harness,
    /useState<FootieScript>\(\(\) =>\s*buildCreatorExportJourneyStory\(\)/,
  );

  const first = buildCreatorExportJourneyStory();
  first.title = "mutated";
  const second = buildCreatorExportJourneyStory();
  assert.equal(second.title, "QA — Creator Export Disposable — Local Only");
}

async function main(): Promise<void> {
  console.log("\ncreator-export-journey\n");

  test("production guard fail-closed", testProductionGuardFailClosed);
  test("no public navigation link", testNoPublicNavigationLink);
  test("export-qa ownership separation", testExportQaOwnershipSeparation);
  test("initial story validity", testInitialStoryValidity);
  test("fixture determinism and deep isolation", testFixtureDeterminismAndIsolation);
  test("no provider/capability override", testNoProviderOrCapabilityOverride);
  test("real component composition", testRealComponentComposition);
  test("honest in-memory Save contract", testHonestInMemorySaveContract);
  test("Save authority source contracts", testSaveAuthoritySourceContracts);
  test("Share Ready plan/apply preservation", testShareReadyPlanApplyPreservation);
  test("Save/Reopen unsaved-edit rollback", testSaveReopenRollback);
  test(
    "Share Ready current-after-reopen then stale exactly once",
    testShareReadyCurrentThenStaleOnce,
  );
  await testAsync(
    "session chrome focus and remount",
    testSessionChromeFocusAndRemount,
  );
  test("pristine Reset rebuild", testPristineReset);
  test(
    "capability matrix A–F / A–E / fail-closed / no 12G",
    testCapabilityMatrix,
  );
  await testAsync(
    "export preflight boundary without submission",
    testExportPreflightBoundary,
  );
  test("no harness leak into production contracts", testNoHarnessLeak);
  test("responsibility-based naming", testResponsibilityBasedNaming);
  test("open does not auto-mutate", testOpenDoesNotAutoMutate);

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
