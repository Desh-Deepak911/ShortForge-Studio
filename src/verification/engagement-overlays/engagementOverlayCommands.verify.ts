/**
 * Engagement-overlay command immutability and prepare-copy verification.
 * Run via: npm run test:engagement-overlays
 */

import assert from "node:assert/strict";

import {
  addEngagementOverlay,
  getSceneEngagementOverlay,
  normalizeVisualRetentionProjectExtensions,
  projectEngagementOverlayToManifest,
  pruneEngagementOverlaysToScenes,
  removeEngagementOverlay,
  setEngagementOverlayDurationMs,
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayScale,
  setEngagementOverlaySize,
  setEngagementOverlayStartMs,
} from "@/features/engagement-overlays";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { deleteTimelineScene } from "@/features/timeline-editor/timeline-editor.commands";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

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

function media(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/cta.jpg",
    source: "upload",
  };
}

function scene(id: string, durationMs = 5000): FootieScene {
  return {
    id,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: id,
    narration: id,
    media: media(),
  };
}

function baseStory(): FootieScript {
  return syncFootieScript({
    title: "CTA commands",
    narration: "one two",
    totalDuration: 10,
    scenes: [scene("scene-a"), scene("scene-b")],
  });
}

const ON = { engagementOverlaysEnabled: true } as const;

async function main(): Promise<void> {
  console.log("\nengagement-overlay-commands\n");

  test("capability off refuses all mutations", () => {
    const script = baseStory();
    const result = addEngagementOverlay(script, "scene-a", {
      engagementOverlaysEnabled: false,
    });
    assert.equal(result.status, "terminal");
    assert.equal(result.script.visualRetentionExtensions, undefined);
    assert.equal(getSceneEngagementOverlay(script, "scene-a"), undefined);
  });

  test("no automatic creation; add is explicit and immutable", () => {
    const script = baseStory();
    assert.equal(getSceneEngagementOverlay(script, "scene-a"), undefined);
    const added = addEngagementOverlay(script, "scene-a", ON);
    assert.ok(added.status === "ok" || added.status === "recoverable");
    assert.ok(added.overlay);
    assert.equal(getSceneEngagementOverlay(script, "scene-a"), undefined);
    assert.ok(getSceneEngagementOverlay(added.script, "scene-a"));
    assert.equal(added.overlay?.size, "medium");
    assert.equal(added.overlay?.scale, 1);
    assert.notEqual(added.script, script);
  });

  test("kind/position/size/scale/start/duration mutate only the target scene", () => {
    let script = addEngagementOverlay(baseStory(), "scene-a", ON).script;
    script = setEngagementOverlayKind(script, "scene-a", "share", ON).script;
    script = setEngagementOverlayPosition(script, "scene-a", "bottom-left", ON)
      .script;
    script = setEngagementOverlaySize(script, "scene-a", "large", ON).script;
    script = setEngagementOverlayScale(script, "scene-a", 1.1, ON).script;
    script = setEngagementOverlayStartMs(script, "scene-a", 0.5, ON).script;
    script = setEngagementOverlayDurationMs(script, "scene-a", 2, ON).script;

    const target = getSceneEngagementOverlay(script, "scene-a");
    assert.equal(target?.kind, "share");
    assert.equal(target?.position, "bottom-left");
    assert.equal(target?.size, "large");
    assert.equal(target?.scale, 1.1);
    assert.equal(target?.startOffsetMs, 500);
    assert.equal(target?.durationMs, 2000);
    assert.equal(getSceneEngagementOverlay(script, "scene-b"), undefined);
  });

  test("all seven positions and bounded fine scaling are authorable", () => {
    let script = addEngagementOverlay(baseStory(), "scene-a", ON).script;
    for (const position of [
      "top-left",
      "top-center",
      "top-right",
      "center",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ] as const) {
      const result = setEngagementOverlayPosition(script, "scene-a", position, ON);
      assert.equal(result.status, "ok");
      assert.equal(result.overlay?.position, position);
      script = result.script;
    }
    script = setEngagementOverlayScale(script, "scene-a", 9, ON).script;
    assert.equal(getSceneEngagementOverlay(script, "scene-a")?.scale, 1.15);
    script = setEngagementOverlayScale(script, "scene-a", -2, ON).script;
    assert.equal(getSceneEngagementOverlay(script, "scene-a")?.scale, 0.85);
  });

  test("deleted-scene refusal and prune on timeline delete", () => {
    const withOverlay = addEngagementOverlay(baseStory(), "scene-a", ON).script;
    const missing = setEngagementOverlayKind(
      withOverlay,
      "gone",
      "like",
      ON,
    );
    assert.equal(missing.status, "terminal");

    const deleted = deleteTimelineScene(withOverlay, "scene-a");
    assert.ok(deleted);
    assert.equal(
      getSceneEngagementOverlay(deleted.script, "scene-a"),
      undefined,
    );
    assert.equal(
      deleted.script.visualRetentionExtensions?.engagementOverlaysBySceneId?.[
        "scene-a"
      ],
      undefined,
    );
  });

  test("remove clears overlay and leaves other scenes untouched", () => {
    let script = addEngagementOverlay(baseStory(), "scene-a", ON).script;
    script = addEngagementOverlay(script, "scene-b", ON).script;
    const removed = removeEngagementOverlay(script, "scene-a", ON);
    assert.equal(removed.status, "ok");
    assert.equal(getSceneEngagementOverlay(removed.script, "scene-a"), undefined);
    assert.ok(getSceneEngagementOverlay(removed.script, "scene-b"));
  });

  await testAsync(
    "prepare clamps export copy only and preserves authoring metadata",
    async () => {
      const authored = addEngagementOverlay(
        syncFootieScript({
          title: "short scene",
          narration: "x",
          totalDuration: 0.2,
          scenes: [scene("scene-a", 200)],
        }),
        "scene-a",
        ON,
      );
      // Force an authored overlay that cannot fit after clamp.
      const script: FootieScript = {
        ...authored.script,
        visualRetentionExtensions: {
          version: 1,
          engagementOverlaysBySceneId: {
            "scene-a": [
              {
                version: 1,
                id: "engagement-scene-a",
                kind: "like",
                startOffsetMs: 0,
                durationMs: 2500,
                position: "top-right",
                presetId: "compact-pill-v1",
              },
            ],
          },
        },
      };
      const prepared = await prepareExportRequest({
        story: script,
        options: { audioMode: "silent" },
        throwIfBlocked: false,
        engagementOverlaysEnabled: true,
        environment: {
          supportsCanvasCaptureStream: true,
          supportsManualCanvasFrameRequest: true,
          supportsMediaRecorder: true,
          supportsWebAssembly: true,
          ffmpegRuntimePoisoned: false,
          mp4EncoderAvailable: false,
          estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
        },
      });
      assert.equal(
        prepared.manifest.scenes[0] &&
          "engagementOverlays" in prepared.manifest.scenes[0]
          ? prepared.manifest.scenes[0].engagementOverlays
          : undefined,
        undefined,
      );
      assert.ok(
        prepared.preflight.warnings.some(
          (warning) => warning.code === "ENGAGEMENT_OVERLAY_OMITTED",
        ),
      );
      assert.ok(getSceneEngagementOverlay(script, "scene-a"));
      assert.equal(
        getSceneEngagementOverlay(script, "scene-a")?.durationMs,
        2500,
      );

      const projected = projectEngagementOverlayToManifest(
        getSceneEngagementOverlay(script, "scene-a"),
        5000,
        true,
      );
      assert.ok(projected.overlay);
      assert.equal(
        getSceneEngagementOverlay(script, "scene-a")?.startOffsetMs,
        0,
      );
    },
  );

  test("narration and music fields are unchanged by overlay commands", () => {
    const script = baseStory();
    script.backgroundMusic = {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      volume: 0.4,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    };
    const next = addEngagementOverlay(script, "scene-a", ON).script;
    assert.equal(next.narration, script.narration);
    assert.deepEqual(next.backgroundMusic, script.backgroundMusic);
    assert.equal(next.scenes[0]!.durationMs, script.scenes[0]!.durationMs);
    assert.equal(next.scenes[0]!.narration, script.scenes[0]!.narration);
  });

  test("scene delete prunes only that overlay and preserves brand-sting contract", () => {
    let script = addEngagementOverlay(baseStory(), "scene-a", ON).script;
    script = addEngagementOverlay(script, "scene-b", ON).script;
    script = {
      ...script,
      visualRetentionExtensions: {
        version: 1,
        engagementOverlaysBySceneId:
          script.visualRetentionExtensions!.engagementOverlaysBySceneId!,
        shortForgeBrandSting: {
          version: 1,
          enabled: false,
          title: "ShortForge Studio",
          durationMs: 2500,
          presetId: "sting-v1",
          narrationPolicy: "none",
          captionPolicy: "none",
          playbackSpeedPolicy: "fixed",
        },
      },
    };
    const deleted = deleteTimelineScene(script, "scene-a");
    assert.ok(deleted);
    assert.equal(getSceneEngagementOverlay(deleted.script, "scene-a"), undefined);
    assert.ok(getSceneEngagementOverlay(deleted.script, "scene-b"));
    assert.equal(
      deleted.script.visualRetentionExtensions?.shortForgeBrandSting?.presetId,
      "sting-v1",
    );
  });

  test("malformed overlay entries strip without deleting unrelated extension data", () => {
    const script: FootieScript = {
      ...baseStory(),
      visualRetentionExtensions: {
        version: 1,
        engagementOverlaysBySceneId: {
          "scene-a": [
            { version: 9, id: "bad" } as never,
            {
              version: 1,
              id: "good",
              kind: "like",
              startOffsetMs: 0,
              durationMs: 2500,
              position: "top-right",
              presetId: "compact-pill-v1",
            },
          ],
          "scene-a-dupe": [
            {
              version: 1,
              id: "first",
              kind: "share",
              startOffsetMs: 0,
              durationMs: 2500,
              position: "top-left",
              presetId: "compact-pill-v1",
            },
            {
              version: 1,
              id: "second",
              kind: "subscribe",
              startOffsetMs: 100,
              durationMs: 2500,
              position: "bottom-left",
              presetId: "compact-pill-v1",
            },
          ],
        },
        shortForgeBrandSting: {
          version: 1,
          enabled: false,
          title: "ShortForge Studio",
          durationMs: 2000,
          presetId: "sting-keep",
          narrationPolicy: "none",
          captionPolicy: "none",
          playbackSpeedPolicy: "fixed",
        },
      },
    };
    const normalized = normalizeVisualRetentionProjectExtensions(
      script.visualRetentionExtensions,
      ["scene-a", "scene-a-dupe"],
    );
    assert.equal(normalized?.engagementOverlaysBySceneId?.["scene-a"]?.length, 1);
    assert.equal(
      normalized?.engagementOverlaysBySceneId?.["scene-a"]?.[0]?.id,
      "good",
    );
    assert.equal(
      normalized?.engagementOverlaysBySceneId?.["scene-a-dupe"]?.length,
      1,
    );
    assert.equal(
      normalized?.engagementOverlaysBySceneId?.["scene-a-dupe"]?.[0]?.id,
      "first",
    );
    assert.equal(normalized?.shortForgeBrandSting?.presetId, "sting-keep");
    assert.equal(
      pruneEngagementOverlaysToScenes({
        ...script,
        visualRetentionExtensions: undefined,
      }).visualRetentionExtensions,
      undefined,
    );
  });

  test("stale-scene commands fail without recreating extension entries", () => {
    const script = baseStory();
    const result = setEngagementOverlayKind(script, "missing", "like", ON);
    assert.equal(result.status, "terminal");
    assert.equal(result.script.visualRetentionExtensions, undefined);
    assert.equal(script.visualRetentionExtensions, undefined);
  });

  await testAsync(
    "prepare after voiceover clamp does not require engagement when omitted",
    async () => {
      const script: FootieScript = {
        ...syncFootieScript({
          title: "short",
          narration: "x",
          totalDuration: 0.2,
          scenes: [scene("scene-a", 200)],
        }),
        visualRetentionExtensions: {
          version: 1,
          engagementOverlaysBySceneId: {
            "scene-a": [
              {
                version: 1,
                id: "engagement-scene-a",
                kind: "like",
                startOffsetMs: 0,
                durationMs: 2500,
                position: "top-right",
                presetId: "compact-pill-v1",
              },
            ],
          },
        },
      };
      const prepared = await prepareExportRequest({
        story: script,
        options: { audioMode: "silent" },
        throwIfBlocked: false,
        engagementOverlaysEnabled: true,
        environment: {
          supportsCanvasCaptureStream: true,
          supportsManualCanvasFrameRequest: true,
          supportsMediaRecorder: true,
          supportsWebAssembly: true,
          ffmpegRuntimePoisoned: false,
          mp4EncoderAvailable: false,
          estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
        },
      });
      assert.equal(prepared.manifest.version, 4);
      assert.ok(!("requiredCapabilities" in prepared.manifest));
      assert.equal(
        prepared.preflight.warnings.filter(
          (warning) => warning.code === "ENGAGEMENT_OVERLAY_OMITTED",
        ).length,
        1,
      );
    },
  );

  console.log(`\n${passed} passed\n`);
}

void main();
