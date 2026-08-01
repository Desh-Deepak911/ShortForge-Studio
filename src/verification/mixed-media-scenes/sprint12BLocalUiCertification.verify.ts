/**
 * Sprint 12B local UI certification (no deployment).
 * Exercises the same commands/projections the editor UI calls, plus live
 * capability API checks when NEXT_PUBLIC_BASE / BASE_URL is reachable.
 *
 * Run: npx tsx src/verification/mixed-media-scenes/sprint12BLocalUiCertification.verify.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  appendMixedMediaSequenceItem,
  projectSceneVisualPlan,
  removeMixedMediaSequenceItem,
  reorderMixedMediaSequenceItem,
  updateMixedMediaSequenceBoundary,
} from "@/features/mixed-media-scenes";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";

function imageMedia(url: string): SceneMedia {
  return { type: "image", url, source: "upload", fitMode: "cover" };
}

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    fitMode: "cover",
    durationMs: 8000,
    trimStartMs: 0,
    trimEndMs: 8000,
    muted: true,
  };
}

function legacyScene(): FootieScene {
  return {
    id: "legacy",
    start: 0,
    end: 8,
    duration: 8,
    startMs: 0,
    endMs: 8000,
    durationMs: 8000,
    subtitle: "Legacy",
    media: imageMedia("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"),
  };
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function probeCapabilities(baseUrl: string): Promise<{
  mixedMediaScenesEnabled: boolean;
  phasesValid: boolean;
}> {
  const response = await fetch(`${baseUrl}/api/visual-retention/capabilities`, {
    method: "GET",
  });
  assert.equal(response.ok, true);
  const body = (await response.json()) as {
    mixedMediaScenesEnabled?: unknown;
    phasesValid?: unknown;
  };
  return {
    mixedMediaScenesEnabled: body.mixedMediaScenesEnabled === true,
    phasesValid: body.phasesValid === true,
  };
}

function testUiWiringFailClosed(): void {
  const context = readSrc(
    "src/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext.tsx",
  );
  assert.match(context, /mixedMediaScenesEnabled: false/);
  assert.match(context, /ready: false/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /mixedMediaScenesEnabled \?/);
  assert.match(inspector, /MixedMediaSequencePanel/);
  assert.match(inspector, /Add another image/);
  assert.match(inspector, /resolveInspectorSceneMediaProjection/);
  assert.doesNotMatch(inspector, /resolveProjectedSceneMediaWindows\(/);
  assert.match(inspector, /data-scene-media-inspector-warnings/);

  const panel = readSrc(
    "src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx",
  );
  assert.match(panel, /intent: ["']media["']/);
  assert.match(panel, /Boundary start/);
  assert.match(panel, /first-start-fixed|Start \(fixed\)/);
  assert.match(panel, /Music does not control visual timing/);

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /mixedMediaScenesEnabled/);
  assert.match(exportPanel, /exportFootieShort/);
  assert.match(exportPanel, /Browser|browser|Export/);

  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /useMixedMediaScenesEnabled/);
  assert.match(preview, /mixedMediaScenesEnabled=\{mixedMediaScenesEnabled\}/);
}

function testEnabledUiActionFlow(): void {
  let scene = legacyScene();
  // Open legacy project — no visualSequence required.
  assert.equal(scene.visualSequence, undefined);
  const opened = projectSceneVisualPlan(scene, { mixedMediaScenesEnabled: true });
  assert.equal(opened.windows.length, 1);

  // Legacy media becomes the first sequence item; append image + video → 3 items.
  scene = appendMixedMediaSequenceItem(scene, imageMedia("data:image/svg+xml,a"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "img-2",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, videoMedia("local://fixture/clip.mp4"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "vid-1",
  }).scene;
  assert.equal(scene.visualSequence?.items.length, 3);

  scene = reorderMixedMediaSequenceItem(scene, "vid-1", 0, {
    mixedMediaScenesEnabled: true,
  }).scene;
  assert.equal(scene.visualSequence?.items[0]?.id, "vid-1");

  // Move middle boundary (second item start) earlier.
  const middleId = scene.visualSequence!.items[1]!.id;
  const boundary = updateMixedMediaSequenceBoundary(scene, middleId, 2000, {
    mixedMediaScenesEnabled: true,
  });
  scene = boundary.scene;
  assert.equal(scene.visualSequence?.items[0]?.durationMs, 2000);

  const clamped = updateMixedMediaSequenceBoundary(scene, middleId, 10, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(clamped.warnings.some((w) => w.code === "boundary_clamped"));
  scene = clamped.scene;

  const mid = scene.visualSequence!.items[0]!.durationMs;
  const previewAtBoundary = resolveActiveSceneMediaRenderView(scene, mid, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(previewAtBoundary.mediaItemId, scene.visualSequence!.items[1]!.id);

  const removed = removeMixedMediaSequenceItem(scene, middleId, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(removed.selectedMediaItemId);
  assert.equal(removed.scene.visualSequence?.items.length, 2);
}

function testDisabledUiPreservesLegacy(): void {
  let scene = legacyScene();
  scene = appendMixedMediaSequenceItem(scene, imageMedia("data:image/svg+xml,b"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "extra",
  }).scene;
  // Dual-written timeline remains while capability off for render.
  const disabled = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(disabled.fromVisualSequence, false);
  assert.ok(disabled.windows.length >= 1);

  assert.throws(
    () =>
      appendMixedMediaSequenceItem(scene, imageMedia("data:image/svg+xml,c"), {
        mixedMediaScenesEnabled: false,
      }),
    /unavailable/i,
  );
}

function testEnvCapabilityMatrix(): void {
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment({
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
    }),
    true,
  );
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment({
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A",
    }),
    false,
  );
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment({
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "staging",
      SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
    }),
    false,
  );
}

async function main(): Promise<void> {
  console.log("\nSprint 12B local UI certification\n");
  testUiWiringFailClosed();
  console.log("  ✓ UI wiring fail-closed + browser export controls present");
  testEnabledUiActionFlow();
  console.log("  ✓ enabled UI action flow (legacy open, add, reorder, boundary, clamp, preview, remove)");
  testDisabledUiPreservesLegacy();
  console.log("  ✓ disabled: sequence authoring blocked; timeline/legacy preview preserved");
  testEnvCapabilityMatrix();
  console.log("  ✓ staging/production capability matrix");

  const baseUrl = process.env.SPRINT12B_UI_BASE_URL?.trim();
  if (baseUrl) {
    const live = await probeCapabilities(baseUrl);
    console.log(
      `  ✓ live capabilities API at ${baseUrl}: enabled=${live.mixedMediaScenesEnabled} phasesValid=${live.phasesValid}`,
    );
  } else {
    console.log(
      "  · live API probe skipped (set SPRINT12B_UI_BASE_URL=http://localhost:3000 to include)",
    );
  }

  console.log("\nSprint 12B local UI certification: PASS\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
