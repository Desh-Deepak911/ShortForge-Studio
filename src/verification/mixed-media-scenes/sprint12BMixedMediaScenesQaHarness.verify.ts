/**
 * Sprint 12B — mixed-media scenes QA harness verification.
 * Run via: npm run test:mixed-media-scenes-12b
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  projectSceneVisualPlan,
  resolveInspectorSceneMediaProjection,
} from "@/features/mixed-media-scenes";
import { isLocalDevQaHarnessAllowed } from "@/features/mixed-media-scenes/qa/assert-local-dev-qa-harness-allowed";
import {
  buildMixedMediaScenesQaStory,
  MIXED_MEDIA_SCENES_QA_DURATION_MS,
  MIXED_MEDIA_SCENES_QA_IMAGE_URL,
  MIXED_MEDIA_SCENES_QA_ITEM_ID,
  MIXED_MEDIA_SCENES_QA_SCENE_ID,
} from "@/features/mixed-media-scenes/qa/build-mixed-media-scenes-qa-story";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testProductionGuardFailClosed(): void {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("test"), false);
  assert.equal(isLocalDevQaHarnessAllowed(undefined), false);
  assert.equal(isLocalDevQaHarnessAllowed(""), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);

  const guard = readSrc(
    "src/features/mixed-media-scenes/qa/assert-local-dev-qa-harness-allowed.ts",
  );
  assert.match(guard, /notFound\(\)/);
  assert.match(guard, /nodeEnv === ["']development["']/);
  assert.doesNotMatch(guard, /NEXT_PUBLIC_/);
  assert.doesNotMatch(guard, /process\.env\.(?!NODE_ENV)/);

  const page = readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*mixed-media-scenes-qa/);
}

function testInitialStoryValidity(): void {
  const story = buildMixedMediaScenesQaStory();
  assert.equal(story.scenes.length, 1);
  const scene = story.scenes[0]!;
  assert.equal(scene.id, MIXED_MEDIA_SCENES_QA_SCENE_ID);
  assert.equal(scene.durationMs, MIXED_MEDIA_SCENES_QA_DURATION_MS);
  assert.ok(
    Math.abs((scene.duration ?? 0) - MIXED_MEDIA_SCENES_QA_DURATION_MS / 1000) <
      0.001,
  );
  assert.ok((scene.narration ?? "").length > 0);
  assert.equal(scene.media?.type, "image");
  assert.equal(scene.media?.url, MIXED_MEDIA_SCENES_QA_IMAGE_URL);
  assert.ok(scene.visualSequence);
  assert.equal(scene.visualSequence!.items.length, 1);
  assert.equal(scene.visualSequence!.items[0]!.id, MIXED_MEDIA_SCENES_QA_ITEM_ID);
  assert.equal(scene.visualSequence!.items[0]!.startOffsetMs, 0);
  assert.equal(
    scene.visualSequence!.items[0]!.durationMs,
    MIXED_MEDIA_SCENES_QA_DURATION_MS,
  );
  assert.ok(scene.mediaTimeline);
  assert.equal(scene.mediaTimeline!.items.length, 1);
  assert.equal(story.voiceoverUrl, undefined);
  assert.equal(story.music, undefined);
  assert.doesNotMatch(scene.media!.url, /^https?:\/\//);
  assert.doesNotMatch(scene.media!.url, /^blob:/);

  const publicSvg = path.join(
    process.cwd(),
    "public",
    MIXED_MEDIA_SCENES_QA_IMAGE_URL.replace(/^\//, ""),
  );
  assert.equal(existsSync(publicSvg), true);
}

function testNoProviderOrNetworkDependencyInHarness(): void {
  const page = readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx");
  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  const fixture = readSrc(
    "src/features/mixed-media-scenes/qa/build-mixed-media-scenes-qa-story.ts",
  );
  const combined = `${page}\n${harness}\n${fixture}`;

  assert.doesNotMatch(combined, /openai|elevenlabs|replicate|fal\.ai|anthropic/i);
  assert.doesNotMatch(combined, /\bgenerateStory\b|\bcreateStory\b/);
  assert.doesNotMatch(combined, /localStorage\.(get|set)Item/);
  assert.doesNotMatch(combined, /https?:\/\/(?!localhost)/);
  assert.doesNotMatch(fixture, /fetch\(/);
  assert.doesNotMatch(harness, /fetch\(/);
  // Capability remains on the real StoryWorkspace provider — not harness-overridden.
  assert.doesNotMatch(harness, /mixedMediaScenesEnabled\s*=/);
  assert.doesNotMatch(harness, /MixedMediaScenesCapabilityProvider/);
}

function testRealComponentComposition(): void {
  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  assert.match(harness, /from ["']@\/components\/StoryWorkspace["']/);
  assert.match(harness, /<StoryWorkspace[\s\S]*?\/>/);
  assert.doesNotMatch(harness, /MixedMediaSequencePanel/);
  assert.doesNotMatch(harness, /StudioSceneInspector/);
  assert.doesNotMatch(harness, /updateMixedMediaSequenceBoundary/);
  assert.doesNotMatch(harness, /boundary_clamped|first_item_start_fixed/);

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /MixedMediaScenesCapabilityProvider/);
  assert.match(workspace, /EditorSelectionProvider/);
  assert.match(workspace, /VideoPreview/);
  assert.match(workspace, /ExportPanel/);
  assert.match(workspace, /InspectorResolver|InspectorContextProvider/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /HeadlessExportSection|headless/i);
}

function testResetBehavior(): void {
  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  assert.match(harness, /Reset QA story/);
  assert.match(harness, /data-mixed-media-scenes-qa-reset/);
  assert.match(harness, /buildMixedMediaScenesQaStory\(\)/);
  assert.match(harness, /setWorkspaceKey/);

  const a = buildMixedMediaScenesQaStory();
  const b = buildMixedMediaScenesQaStory();
  assert.equal(a.scenes[0]!.id, b.scenes[0]!.id);
  assert.equal(a.scenes[0]!.media?.url, b.scenes[0]!.media?.url);
  assert.equal(
    a.scenes[0]!.visualSequence!.items[0]!.durationMs,
    b.scenes[0]!.visualSequence!.items[0]!.durationMs,
  );
  // Distinct object graphs (in-memory reset restores a fresh story).
  assert.notEqual(a, b);
  assert.notEqual(a.scenes[0], b.scenes[0]);
}

function testEnabledCapabilityRouteIntegration(): void {
  const scene = buildMixedMediaScenesQaStory().scenes[0]!;
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(plan.fromVisualSequence, true);
  assert.equal(plan.windows.length, 1);
  assert.equal(plan.windows[0]!.itemId, MIXED_MEDIA_SCENES_QA_ITEM_ID);
  assert.equal(plan.windows[0]!.durationMs, MIXED_MEDIA_SCENES_QA_DURATION_MS);

  const inspector = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspector.windows.length, 1);
  assert.equal(inspector.windows[0]!.itemId, MIXED_MEDIA_SCENES_QA_ITEM_ID);

  const active = resolveActiveSceneMediaRenderView(scene, 500, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(active.mediaItemId, MIXED_MEDIA_SCENES_QA_ITEM_ID);
  assert.equal(active.media?.url, MIXED_MEDIA_SCENES_QA_IMAGE_URL);

  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  assert.match(harness, /StoryWorkspace/);
  // Real capability path — no harness bypass of the server decision.
  assert.doesNotMatch(harness, /mixedMediaScenesEnabled:\s*true/);
  assert.doesNotMatch(harness, /force.?on|bypassCapability/i);

  const inspectorSrc = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspectorSrc, /MixedMediaSequencePanel/);
  assert.match(inspectorSrc, /mixedMediaScenesEnabled \?/);
}

function testDisabledFailClosedIntegration(): void {
  const scene = buildMixedMediaScenesQaStory().scenes[0]!;
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(plan.fromVisualSequence, false);
  assert.equal(plan.windows.length, 1);
  assert.equal(plan.windows[0]!.media.url, MIXED_MEDIA_SCENES_QA_IMAGE_URL);

  const inspector = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(inspector.plan.fromVisualSequence, false);
  assert.equal(inspector.windows.length, 1);

  const active = resolveActiveSceneMediaRenderView(scene, 2500, {
    mixedMediaScenesEnabled: false,
  });
  assert.ok(active.media?.url === MIXED_MEDIA_SCENES_QA_IMAGE_URL);

  // Server resolve remains fail-closed without staging 12B phases.
  const disabled = resolveMixedMediaScenesEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A",
  });
  assert.equal(disabled, false);

  const inspectorSrc = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspectorSrc, /Add another image/);
  assert.match(inspectorSrc, /!mixedMediaScenesEnabled && appendApi/);
}

function testNoPersistenceOrDeploymentSideEffects(): void {
  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  const page = readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx");
  const combined = `${page}\n${harness}`;

  assert.match(harness, /saveDraftDisabled/);
  assert.match(harness, /intentionally no-op|never persists/i);
  assert.doesNotMatch(combined, /saveDraft\(|persistDraft|writeDraft|upsertDraft/i);
  assert.doesNotMatch(combined, /deploy|vercel\.deploy|git push/i);
  assert.doesNotMatch(combined, /localStorage\.setItem|indexedDB/i);

  // Route must not appear in the root app layout (no public nav link).
  const layout = path.join(process.cwd(), "src/app/layout.tsx");
  if (existsSync(layout)) {
    assert.doesNotMatch(readSrc("src/app/layout.tsx"), /mixed-media-scenes-qa/);
  }
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["production guard fail-closed", testProductionGuardFailClosed],
    ["initial story validity", testInitialStoryValidity],
    ["no provider/network dependency in harness", testNoProviderOrNetworkDependencyInHarness],
    ["real component composition", testRealComponentComposition],
    ["reset behavior", testResetBehavior],
    ["enabled capability route integration", testEnabledCapabilityRouteIntegration],
    ["disabled/fail-closed integration", testDisabledFailClosedIntegration],
    ["no persistence or deployment side effects", testNoPersistenceOrDeploymentSideEffects],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(
    `\nSprint 12B mixed-media scenes QA harness: ${passed}/${tests.length} PASS`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
