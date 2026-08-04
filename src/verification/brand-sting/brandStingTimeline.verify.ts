/**
 * Brand-sting timeline / duration / isolation verification.
 * Run via: npm run test:brand-sting-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createDefaultShortForgeBrandSting,
  disableBrandSting,
  enableBrandSting,
  resolveAuthoritativeBrandStingDurationMs,
  resolveBrandStingFinalElapsedMs,
  resolveBrandStingFrame,
  resolveBrandStingLocalElapsedMs,
  resolveBrandStingTerminalElapsedMs,
  resolveBrandStingTimelineBounds,
  resolvePreviewPlaybackDurationMs,
  setBrandStingDurationMs,
} from "@/features/brand-sting";
import { resolveExportAudioEndPolicy } from "@/features/export/audio/resolve-export-audio-end-policy";
import { resolveExportAudioMixPlan } from "@/features/export/audio/resolve-export-audio-mix-plan";
import {
  buildExportManifest,
  isExportManifestV5,
  type ExportEnvironmentSnapshot,
  type ExportManifestV5,
} from "@/features/export/domain";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolvePreviewDurationSec } from "@/features/preview/utils/preview-master-timeline.utils";
import {
  resolveScenePlaybackBounds,
  resolveScenePlaybackBoundary,
} from "@/features/preview/utils/preview-scene-playback.utils";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function asV5(manifest: ReturnType<typeof buildExportManifest>): ExportManifestV5 {
  assert.equal(isExportManifestV5(manifest), true);
  return manifest as ExportManifestV5;
}

function story(): FootieScript {
  return syncFootieScript({
    title: "Timeline",
    narration: "Hello world",
    totalDuration: 4,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: 4,
        duration: 4,
        startMs: 0,
        endMs: 4000,
        durationMs: 4000,
        subtitle: "Hello",
        narration: "Hello",
        media: {
          type: "image",
          url: "https://example.com/t.jpg",
          source: "upload",
        },
      },
    ],
  });
}

console.log("\nbrand-sting-timeline\n");

test("narration duration unchanged; total duration adds sting", () => {
  const base = story();
  const preparedBase = prepareStoryForExport(base);
  const enabled = enableBrandSting(base, { shortForgeBrandStingEnabled: true }).script;
  const preparedEnabled = prepareStoryForExport(enabled);

  assert.equal(preparedEnabled.contentEndMs, preparedBase.contentEndMs);
  assert.equal(preparedEnabled.story.scenes.length, preparedBase.story.scenes.length);
  assert.equal(preparedEnabled.story.scenes[0]!.durationMs, preparedBase.story.scenes[0]!.durationMs);

  const without = buildExportManifest({
    story: enabled,
    environment: CAPABLE_ENV,
    audioMode: "silent",
    shortForgeBrandStingEnabled: false,
  });
  const withSting = asV5(
    buildExportManifest({
      story: enabled,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
    }),
  );
  assert.equal(
    withSting.project.contentDurationMs,
    without.project.contentDurationMs + 2500,
  );
  assert.equal(
    withSting.project.renderDurationMs,
    without.project.renderDurationMs + 2500,
  );
  assert.equal(withSting.project.sceneCount, without.project.sceneCount);
  assert.equal(withSting.scenes.length, without.scenes.length);
});

test("sting excluded from scenes, voiceover refit, captions, engagement, music", () => {
  const script = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const manifest = asV5(
    buildExportManifest({
      story: script,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
    }),
  );
  assert.ok(!manifest.scenes.some((scene) => scene.id.includes("brand")));
  assert.equal(manifest.brandSting?.narrationPolicy, "none");
  assert.equal(manifest.brandSting?.captionPolicy, "none");
  assert.equal(manifest.audio.voiceover, null);
  assert.equal(manifest.captions.every((caption) => caption.endMs <= manifest.brandSting!.startMs), true);

  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(preview, /brandStingDurationMs/);
  assert.match(preview, /Silent trailing brand sting/);
  assert.match(
    readSrc("src/features/export/audio/resolve-export-audio-mix-plan.ts"),
    /musicLoopEndMs/,
  );
});

test("commands are immutable and preserve engagement overlays byte-for-byte", () => {
  let script = story();
  script = {
    ...script,
    visualRetentionExtensions: {
      version: 1,
      engagementOverlaysBySceneId: {
        "scene-a": [
          {
            version: 1,
            id: "keep-overlay",
            kind: "subscribe",
            startOffsetMs: 500,
            durationMs: 1500,
            position: "top-right",
            presetId: "compact-pill-v1",
          },
        ],
      },
    },
  };
  const before = JSON.stringify(
    script.visualRetentionExtensions?.engagementOverlaysBySceneId,
  );
  const enabled = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  assert.equal(enabled.status, "ok");
  assert.equal(
    JSON.stringify(
      enabled.script.visualRetentionExtensions?.engagementOverlaysBySceneId,
    ),
    before,
  );
  const duration = setBrandStingDurationMs(enabled.script, 3000, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(duration.brandSting?.durationMs, 3000);
  assert.equal(
    JSON.stringify(
      duration.script.visualRetentionExtensions?.engagementOverlaysBySceneId,
    ),
    before,
  );
  const removed = disableBrandSting(duration.script, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(removed.brandSting, undefined);
  assert.equal(
    JSON.stringify(
      removed.script.visualRetentionExtensions?.engagementOverlaysBySceneId,
    ),
    before,
  );
  assert.notEqual(removed.script, script);
});

test("capability-off commands refuse; authoritative duration requires gate", () => {
  const script = story();
  const refused = enableBrandSting(script, { shortForgeBrandStingEnabled: false });
  assert.equal(refused.status, "terminal");
  assert.equal(refused.script.visualRetentionExtensions, undefined);
  const withSting = {
    ...script,
    visualRetentionExtensions: {
      version: 1 as const,
      shortForgeBrandSting: createDefaultShortForgeBrandSting(),
    },
  };
  assert.equal(
    resolveAuthoritativeBrandStingDurationMs({
      shortForgeBrandStingEnabled: true,
      extensions: withSting.visualRetentionExtensions,
    }),
    2500,
  );
});

test("scene playback excludes sting; full-story preview continues into it", () => {
  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(previewHook, /!isSceneScopePlayback/);
  assert.match(previewHook, /brandStingActive/);
  assert.match(previewHook, /effectiveRenderDurationMs/);
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(videoPreview, /BrandStingPreview/);
  assert.match(videoPreview, /brandStingActive/);
});

test("exact timeline equations for 2/2.5/3s excluding end buffer", () => {
  for (const durationMs of [2000, 2500, 3000] as const) {
    for (const endBufferMs of [0, 250]) {
      const bounds = resolveBrandStingTimelineBounds({
        narrationEndMs: 4000,
        endBufferMs,
        brandStingDurationMs: durationMs,
      });
      assert.equal(bounds.brandStingStartMs, bounds.narrationEndMs);
      assert.equal(bounds.brandStingEndMs, bounds.narrationEndMs + durationMs);
      assert.equal(bounds.contentDurationMs, bounds.brandStingEndMs);
      assert.equal(bounds.renderDurationMs, bounds.contentDurationMs + endBufferMs);
      assert.equal(bounds.durationMs, durationMs);
      assert.equal(bounds.endBufferMs, endBufferMs);
    }
  }
  const off = resolveBrandStingTimelineBounds({
    narrationEndMs: 4000,
    endBufferMs: 250,
    brandStingDurationMs: 0,
  });
  assert.equal(off.brandStingEndMs, 4000);
  assert.equal(off.contentDurationMs, 4000);
  assert.equal(off.renderDurationMs, 4250);
});

test("boundary local elapsed at start−1/start/end−1/end/end+1/render−1", () => {
  const narrationEndMs = 4000;
  const durationMs = 2500;
  const endBufferMs = 250;
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs,
    endBufferMs,
    brandStingDurationMs: durationMs,
  });
  const sting = createDefaultShortForgeBrandSting(durationMs);
  const samples = [
    { t: bounds.brandStingStartMs - 1, local: null as number | null, inWindow: false },
    { t: bounds.brandStingStartMs, local: 0, inWindow: true },
    {
      t: bounds.brandStingEndMs - 1,
      local: resolveBrandStingFinalElapsedMs(durationMs),
      inWindow: true,
    },
    { t: bounds.brandStingEndMs, local: null, inWindow: false },
    { t: bounds.brandStingEndMs + 1, local: null, inWindow: false },
    { t: bounds.renderDurationMs - 1, local: null, inWindow: false },
  ] as const;

  for (const sample of samples) {
    assert.equal(
      resolveBrandStingLocalElapsedMs({
        absoluteTimeMs: sample.t,
        narrationEndMs: bounds.narrationEndMs,
        durationMs: bounds.durationMs,
      }),
      sample.local,
      `local @${sample.t}`,
    );
    if (sample.inWindow) {
      assert.ok(sample.local != null);
      const plan = resolveBrandStingFrame({
        sting,
        elapsedMs: sample.local!,
      });
      assert.equal(plan.elapsedMs, sample.local);
      assert.notEqual(plan.phase, "hidden");
      continue;
    }
    if (sample.t < bounds.brandStingStartMs) continue;
    // At/after brandStingEndMs (incl. end buffer): terminal invisible — no branded tokens.
    const plan = resolveBrandStingFrame({
      sting,
      elapsedMs: resolveBrandStingTerminalElapsedMs(durationMs),
    });
    assert.equal(plan.visible, false, `invisible @${sample.t}`);
    assert.equal(plan.phase, "hidden");
    assert.equal(plan.leadInOpacity, 0);
    assert.equal(plan.titleOpacity, 0);
    assert.equal(plan.accentGlowOpacity, 0);
    assert.equal(plan.mark.reveal, 0);
  }

  assert.equal(resolveBrandStingFinalElapsedMs(durationMs), durationMs - 1);
  assert.equal(resolveBrandStingTerminalElapsedMs(durationMs), durationMs);
  const terminal = resolveBrandStingFrame({
    sting,
    elapsedMs: resolveBrandStingTerminalElapsedMs(durationMs),
  });
  assert.equal(terminal.visible, false);
  assert.equal(terminal.elapsedMs, durationMs);
});

test("manifest project math matches timeline bounds helper", () => {
  for (const durationMs of [2000, 2500, 3000] as const) {
    const script = enableBrandSting(story(), {
      shortForgeBrandStingEnabled: true,
    }).script;
    const withDuration = setBrandStingDurationMs(script, durationMs, {
      shortForgeBrandStingEnabled: true,
    }).script;
    const prepared = prepareStoryForExport(withDuration);
    const endBufferMs = Math.max(
      0,
      prepared.exportDurationMs - prepared.contentEndMs,
    );
    const bounds = resolveBrandStingTimelineBounds({
      narrationEndMs: prepared.contentEndMs,
      endBufferMs,
      brandStingDurationMs: durationMs,
    });
    const manifest = asV5(
      buildExportManifest({
        story: withDuration,
        environment: CAPABLE_ENV,
        audioMode: "silent",
        shortForgeBrandStingEnabled: true,
      }),
    );
    assert.equal(manifest.brandSting!.startMs, bounds.brandStingStartMs);
    assert.equal(
      manifest.brandSting!.startMs + manifest.brandSting!.durationMs,
      bounds.brandStingEndMs,
    );
    assert.equal(manifest.project.contentDurationMs, bounds.contentDurationMs);
    assert.equal(manifest.project.renderDurationMs, bounds.renderDurationMs);
    assert.equal(manifest.project.endBufferMs, bounds.endBufferMs);
    assert.equal(manifest.project.sceneCount, 1);
  }
});

function withAudioStems(script: FootieScript): FootieScript {
  return {
    ...script,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4000,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      volume: 0.4,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  };
}

function mixPlanFor(
  base: ExportManifestV5,
  audio: ExportManifestV5["audio"],
) {
  return resolveExportAudioMixPlan({ ...base, audio });
}

test("audio isolation: narration/music/none × sting durations and disabled", () => {
  const script = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;

  for (const durationMs of [2000, 2500, 3000] as const) {
    const timed = setBrandStingDurationMs(script, durationMs, {
      shortForgeBrandStingEnabled: true,
    }).script;
    const silent = asV5(
      buildExportManifest({
        story: timed,
        environment: CAPABLE_ENV,
        audioMode: "silent",
        shortForgeBrandStingEnabled: true,
      }),
    );
    const startMs = silent.brandSting!.startMs;
    const renderMs = silent.project.renderDurationMs;

    const noAudio = mixPlanFor(silent, {
      mode: "silent",
      voiceover: null,
      music: null,
      sourceVideoAudioPolicy: "muted",
      applyPeakProtection: false,
    });
    assert.equal(noAudio.ok, true);
    if (noAudio.ok) {
      assert.equal(noAudio.plan.combination, "silent");
      assert.equal(noAudio.plan.outputDurationMs, renderMs);
    }

    const narrationOnly = mixPlanFor(silent, {
      mode: "voice",
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4000,
        volume: 1,
        generatedPlaybackRate: 1,
        sourceVoiceSpeed: 1,
      },
      music: null,
      sourceVideoAudioPolicy: "muted",
      applyPeakProtection: false,
    });
    assert.equal(narrationOnly.ok, true);
    if (narrationOnly.ok) {
      assert.equal(narrationOnly.plan.combination, "voiceover");
      assert.equal(narrationOnly.plan.voiceover!.sourceTrimEndMs, startMs);
      assert.equal(
        narrationOnly.plan.voiceover!.padToOutputMs,
        renderMs - startMs,
      );
      assert.equal(narrationOnly.plan.music, null);
    }

    const musicOnly = mixPlanFor(silent, {
      mode: "voice-with-music",
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4000,
        volume: 1,
        generatedPlaybackRate: 1,
        sourceVoiceSpeed: 1,
      },
      music: {
        source: "https://example.com/music.mp3",
        volume: 0.4,
        duckingEnabled: false,
        duckingStrength: 0.35,
        fadeInMs: 500,
        fadeOutMs: 800,
        looping: true,
      },
      sourceVideoAudioPolicy: "muted",
      applyPeakProtection: false,
    });
    // Export has no true music-only mode; assert music ends at sting start.
    assert.equal(musicOnly.ok, true);
    if (musicOnly.ok) {
      assert.equal(musicOnly.plan.music!.loopUntilOutputMs, startMs);
      assert.ok(musicOnly.plan.music!.fadeOutMs <= startMs);
    }

    const both = mixPlanFor(silent, {
      mode: "voice-with-music",
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4000,
        volume: 1,
        generatedPlaybackRate: 1,
        sourceVoiceSpeed: 1,
      },
      music: {
        source: "https://example.com/music.mp3",
        volume: 0.4,
        duckingEnabled: true,
        duckingStrength: 0.35,
        fadeInMs: 500,
        fadeOutMs: 800,
        looping: true,
      },
      sourceVideoAudioPolicy: "muted",
      applyPeakProtection: false,
    });
    assert.equal(both.ok, true);
    if (both.ok) {
      assert.equal(both.plan.combination, "voiceover+music");
      assert.equal(both.plan.voiceover!.sourceTrimEndMs, startMs);
      assert.equal(both.plan.music!.loopUntilOutputMs, startMs);
      assert.ok(both.plan.music!.fadeOutMs <= startMs);
    }

    const policy = resolveExportAudioEndPolicy({
      ...silent,
      audio: both.ok
        ? {
            mode: "voice-with-music",
            voiceover: {
              source: "https://example.com/voice.mp3",
              durationMs: 4000,
              volume: 1,
              generatedPlaybackRate: 1,
              sourceVoiceSpeed: 1,
            },
            music: {
              source: "https://example.com/music.mp3",
              volume: 0.4,
              duckingEnabled: true,
              duckingStrength: 0.35,
              fadeInMs: 500,
              fadeOutMs: 800,
              looping: true,
            },
            sourceVideoAudioPolicy: "muted",
            applyPeakProtection: false,
          }
        : silent.audio,
    });
    assert.match(policy.music.detail ?? "", /brand-sting|sting/i);
  }

  const disabledBase = buildExportManifest({
    story: withAudioStems(story()),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
    shortForgeBrandStingEnabled: false,
  });
  assert.ok(!("brandSting" in disabledBase));
  const disabledPlan = resolveExportAudioMixPlan(disabledBase);
  assert.equal(disabledPlan.ok, true);
  if (disabledPlan.ok) {
    assert.equal(
      disabledPlan.plan.music!.loopUntilOutputMs,
      disabledBase.project.renderDurationMs,
    );
  }
});

test("disabling sting restores prior audio mix duration policy", () => {
  const withMusic = withAudioStems(story());
  const baseline = buildExportManifest({
    story: withMusic,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
    shortForgeBrandStingEnabled: false,
  });
  const baselinePlan = resolveExportAudioMixPlan(baseline);
  assert.equal(baselinePlan.ok, true);

  const enabled = enableBrandSting(withMusic, {
    shortForgeBrandStingEnabled: true,
  }).script;
  const withSting = asV5(
    buildExportManifest({
      story: enabled,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      includeBackgroundMusic: true,
      shortForgeBrandStingEnabled: true,
    }),
  );
  const stingPlan = resolveExportAudioMixPlan(withSting);
  assert.equal(stingPlan.ok, true);
  if (stingPlan.ok && baselinePlan.ok) {
    assert.equal(
      stingPlan.plan.music!.loopUntilOutputMs,
      withSting.brandSting!.startMs,
    );
    assert.ok(
      stingPlan.plan.outputDurationMs > baselinePlan.plan.outputDurationMs,
    );
  }

  const removed = disableBrandSting(enabled, {
    shortForgeBrandStingEnabled: true,
  }).script;
  const restored = buildExportManifest({
    story: removed,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
    shortForgeBrandStingEnabled: true,
  });
  const restoredPlan = resolveExportAudioMixPlan(restored);
  assert.equal(restoredPlan.ok, true);
  if (restoredPlan.ok && baselinePlan.ok) {
    assert.equal(
      restoredPlan.plan.music!.loopUntilOutputMs,
      baselinePlan.plan.music!.loopUntilOutputMs,
    );
    assert.equal(
      restoredPlan.plan.outputDurationMs,
      baselinePlan.plan.outputDurationMs,
    );
  }
});

test("preview mutes during sting and anchors music fade to narration end", () => {
  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(preview, /Mute only during the sting/);
  assert.match(preview, /musicMixEndSec/);
  assert.match(preview, /Fade-out stays anchored to narration end/);
  assert.match(preview, /clamp without restart/);
  assert.match(preview, /resolvePreviewPlaybackDurationMs/);
  assert.match(preview, /resolvePreviewDurationSec\(masterTimeline\)/);
  assert.match(preview, /exact legacy resolvePreviewDurationSec/);
  assert.doesNotMatch(preview, /brandStingFreezeActive/);
  assert.match(
    readSrc("src/features/export/runtime/prepare-export-frame.ts"),
    /terminal \(invisible\) sample/,
  );
});

test("legacy preview duration restored when sting is not authoritative", () => {
  const ordinary = story();
  const withBuffer = syncFootieScript({
    ...ordinary,
    // Longer voiceover than scenes can widen MasterTimeline end buffer.
    voiceoverUrl: "https://example.com/voice-long.mp3",
    voiceoverDurationMs: 4500,
  });

  for (const script of [ordinary, withBuffer]) {
    const timeline = buildPreviewMasterTimeline(script);
    assert.ok(timeline);
    const legacySec = resolvePreviewDurationSec(timeline);
    const legacyMs = timeline!.renderDurationMs;
    assert.equal(legacySec, legacyMs / 1000);

    const nonAuthoritativeDurations = [
      // capability false
      resolveAuthoritativeBrandStingDurationMs({
        shortForgeBrandStingEnabled: false,
        extensions: {
          version: 1,
          shortForgeBrandSting: createDefaultShortForgeBrandSting(),
        },
      }),
      // no sting metadata
      resolveAuthoritativeBrandStingDurationMs({
        shortForgeBrandStingEnabled: true,
        extensions: undefined,
      }),
      // invalid sting metadata
      resolveAuthoritativeBrandStingDurationMs({
        shortForgeBrandStingEnabled: true,
        extensions: {
          version: 1,
          shortForgeBrandSting: {
            version: 1,
            enabled: true,
            title: "Wrong",
            durationMs: 2500,
            presetId: "x",
            narrationPolicy: "none",
            captionPolicy: "none",
            playbackSpeedPolicy: "fixed",
          } as never,
        },
      }),
      // capability loading / withheld (authoritative helper not yet gated true)
      0,
      // sting removed
      resolveAuthoritativeBrandStingDurationMs({
        shortForgeBrandStingEnabled: true,
        extensions: disableBrandSting(
          enableBrandSting(script, { shortForgeBrandStingEnabled: true }).script,
          { shortForgeBrandStingEnabled: true },
        ).script.visualRetentionExtensions,
      }),
    ];

    for (const brandStingDurationMs of nonAuthoritativeDurations) {
      assert.equal(brandStingDurationMs, 0);
      assert.equal(
        resolvePreviewPlaybackDurationMs({
          contentEndMs: timeline!.contentEndMs,
          renderDurationMs: timeline!.renderDurationMs,
          brandStingDurationMs,
        }),
        legacyMs,
        "no-sting preview must match pre-feature renderDurationMs",
      );
      assert.equal(
        resolvePreviewPlaybackDurationMs({
          contentEndMs: timeline!.contentEndMs,
          renderDurationMs: timeline!.renderDurationMs,
          brandStingDurationMs,
        }) / 1000,
        resolvePreviewDurationSec(timeline),
      );
    }

    // Scene playback bounds/loop are independent of sting / full-story ceiling.
    const sceneBounds = resolveScenePlaybackBounds(script.scenes, 0);
    assert.ok(sceneBounds);
    for (const loop of [false, true]) {
      const inside = resolveScenePlaybackBoundary(
        sceneBounds!.startMs,
        sceneBounds!,
        loop,
      );
      assert.equal(inside, null);
      const atEnd = resolveScenePlaybackBoundary(
        sceneBounds!.endMs,
        sceneBounds!,
        loop,
      );
      assert.ok(atEnd);
      assert.equal(atEnd!.continuePlaying, loop);
      if (loop) {
        assert.equal(atEnd!.timelineMs, sceneBounds!.startMs);
      } else {
        assert.equal(atEnd!.timelineMs, sceneBounds!.endMs - 1);
      }
    }

    // Full-story no-sting ceiling remains legacy renderDurationMs (incl. buffer).
    assert.ok(legacyMs >= timeline!.contentEndMs);
  }
});

test("enabled sting has no narration→sting gap and no branded frame after end", () => {
  const script = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const timeline = buildPreviewMasterTimeline(script);
  assert.ok(timeline);
  const durationMs = resolveAuthoritativeBrandStingDurationMs({
    shortForgeBrandStingEnabled: true,
    extensions: script.visualRetentionExtensions,
  });
  assert.equal(durationMs, 2500);
  const previewMs = resolvePreviewPlaybackDurationMs({
    contentEndMs: timeline!.contentEndMs,
    renderDurationMs: timeline!.renderDurationMs,
    brandStingDurationMs: durationMs,
  });
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: timeline!.contentEndMs,
    endBufferMs: Math.max(
      0,
      timeline!.renderDurationMs - timeline!.contentEndMs,
    ),
    brandStingDurationMs: durationMs,
  });
  assert.equal(bounds.brandStingStartMs, timeline!.contentEndMs);
  assert.equal(bounds.brandStingEndMs, timeline!.contentEndMs + durationMs);
  assert.equal(previewMs, bounds.brandStingEndMs);
  // No legacy end-buffer gap between narration and sting.
  assert.equal(bounds.brandStingStartMs, bounds.narrationEndMs);
  assert.ok(previewMs < timeline!.renderDurationMs + durationMs);
  assert.equal(
    previewMs,
    timeline!.contentEndMs + durationMs,
  );

  const sting = createDefaultShortForgeBrandSting(2500);
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingStartMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs,
    }),
    null,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingStartMs,
      narrationEndMs: bounds.narrationEndMs,
      durationMs,
    }),
    0,
  );
  const afterEnd = resolveBrandStingFrame({
    sting,
    elapsedMs: resolveBrandStingTerminalElapsedMs(durationMs),
  });
  assert.equal(afterEnd.visible, false);
  assert.equal(afterEnd.phase, "hidden");

  // Removing sting restores exact legacy preview duration.
  const removed = disableBrandSting(script, {
    shortForgeBrandStingEnabled: true,
  }).script;
  assert.equal(
    resolvePreviewPlaybackDurationMs({
      contentEndMs: timeline!.contentEndMs,
      renderDurationMs: timeline!.renderDurationMs,
      brandStingDurationMs: resolveAuthoritativeBrandStingDurationMs({
        shortForgeBrandStingEnabled: true,
        extensions: removed.visualRetentionExtensions,
      }),
    }),
    resolvePreviewDurationSec(timeline) * 1000,
  );
});

test("end buffer stays silent and never restarts narration/music", () => {
  const script = enableBrandSting(withAudioStems(story()), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const manifest = asV5(
    buildExportManifest({
      story: script,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      includeBackgroundMusic: true,
      shortForgeBrandStingEnabled: true,
    }),
  );
  const startMs = manifest.brandSting!.startMs;
  const endMs = startMs + manifest.brandSting!.durationMs;
  assert.ok(manifest.project.renderDurationMs > endMs);
  const plan = resolveExportAudioMixPlan(manifest);
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.ok(plan.plan.voiceover!.sourceTrimEndMs <= startMs);
    assert.equal(plan.plan.music!.loopUntilOutputMs, startMs);
    assert.ok(plan.plan.voiceover!.padToOutputMs >= manifest.project.endBufferMs);
    assert.equal(plan.plan.outputDurationMs, manifest.project.renderDurationMs);
  }
  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepare, /resolveBrandStingTerminalElapsedMs/);
  assert.doesNotMatch(prepare, /resolveBrandStingFinalElapsedMs/);
});

test("Browser TTS full-story continues into authoritative silent sting after last scene", () => {
  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");

  // Defect: Browser TTS previously stopped at the last narration scene and
  // never advanced into the authoritative silent brand-sting interval.
  assert.match(preview, /scheduleAdvanceAfterScene/);
  assert.match(preview, /playbackModeRef\.current === "browser"/);
  assert.match(preview, /playbackScopeRef\.current !== "scene"/);
  assert.match(preview, /brandStingDurationMs > 0/);
  assert.match(preview, /masterTimeline\.contentEndMs/);
  assert.match(preview, /narrationEndedRef\.current = true/);
  assert.match(
    preview,
    /No TTS replay, silence synthesis, or music\/narration restart/,
  );

  // Silent rAF tail advances the existing preview clock only (sole authority).
  assert.match(
    preview,
    /playbackModeRef\.current === "browser" &&\s*masterTimeline &&\s*narrationEndedRef\.current &&\s*brandStingDurationMs > 0 &&\s*isPlayingRef\.current/,
  );
  assert.match(preview, /syncSceneToTimelineTime\(nextMs, \{ updateSelection: false \}\)/);
  assert.match(preview, /nextMs >= effectiveRenderDurationMs/);

  // Enter at brandStingStartMs (= contentEndMs) with no gap; stop clears state.
  const script = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const timeline = buildPreviewMasterTimeline(script);
  assert.ok(timeline);
  const durationMs = resolveAuthoritativeBrandStingDurationMs({
    shortForgeBrandStingEnabled: true,
    extensions: script.visualRetentionExtensions,
  });
  assert.ok(durationMs > 0);
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: timeline!.contentEndMs,
    endBufferMs: Math.max(0, timeline!.renderDurationMs - timeline!.contentEndMs),
    brandStingDurationMs: durationMs,
  });
  assert.equal(bounds.brandStingStartMs, timeline!.contentEndMs);
  assert.equal(bounds.brandStingEndMs, timeline!.contentEndMs + durationMs);
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingStartMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingStartMs,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    0,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingEndMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    resolveBrandStingFinalElapsedMs(durationMs),
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingEndMs,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
  const sting = createDefaultShortForgeBrandSting(
    durationMs as 2000 | 2500 | 3000,
  );
  const atStart = resolveBrandStingFrame({ sting, elapsedMs: 0 });
  assert.notEqual(atStart.phase, "hidden");
  const midEntrance = resolveBrandStingFrame({ sting, elapsedMs: 200 });
  assert.equal(midEntrance.visible, true);
  assert.notEqual(midEntrance.phase, "hidden");
  const afterEnd = resolveBrandStingFrame({
    sting,
    elapsedMs: resolveBrandStingTerminalElapsedMs(durationMs),
  });
  assert.equal(afterEnd.visible, false);
  assert.equal(afterEnd.phase, "hidden");
});

test("Browser TTS sting entry excludes scene-only, capability-off, removed sting, and manual stop", () => {
  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");

  // Scene-only narration never uses speakSceneAt / scheduleAdvanceAfterScene
  // for sting entry; brandStingActive already requires !isSceneScopePlayback.
  assert.match(preview, /!isSceneScopePlayback/);
  assert.match(preview, /playbackScopeRef\.current === "scene"/);
  assert.match(preview, /playScenePreview/);
  assert.match(preview, /scope: "scene"/);

  // Capability loading/off / missing / invalid / removed → duration 0 → legacy stop.
  assert.match(preview, /exact legacy resolvePreviewDurationSec/);
  assert.equal(
    resolveAuthoritativeBrandStingDurationMs({
      shortForgeBrandStingEnabled: false,
      extensions: {
        version: 1,
        shortForgeBrandSting: createDefaultShortForgeBrandSting(),
      },
    }),
    0,
  );
  assert.equal(
    resolveAuthoritativeBrandStingDurationMs({
      shortForgeBrandStingEnabled: true,
      extensions: undefined,
    }),
    0,
  );
  const enabled = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const removed = disableBrandSting(enabled, {
    shortForgeBrandStingEnabled: true,
  }).script;
  assert.equal(
    resolveAuthoritativeBrandStingDurationMs({
      shortForgeBrandStingEnabled: true,
      extensions: removed.visualRetentionExtensions,
    }),
    0,
  );

  // Manual stop during sting: stopVoice clears playing + timeline + narrationEnded.
  assert.match(preview, /const stopVoice = useCallback/);
  assert.match(preview, /resetTimeline\(\)/);
  assert.match(preview, /narrationEndedRef\.current = false/);
  assert.match(preview, /setNarrationEnded\(false\)/);
  assert.match(preview, /window\.speechSynthesis\.cancel/);

  // Removing sting mid-playback clamps via existing preview-duration helper.
  assert.match(preview, /clamp without restart/);
  assert.match(preview, /resolvePreviewPlaybackDurationMs/);

  // Seeking/returning into narration clears stale sting flags on browser restart.
  assert.match(preview, /const playWithBrowserVoice = useCallback/);
  assert.match(
    preview,
    /playWithBrowserVoice[\s\S]*?narrationEndedRef\.current = false[\s\S]*?timelineClockMsRef\.current = 0[\s\S]*?speakSceneAt\(0\)/,
  );
});

test("Browser TTS sting tail never restarts TTS/music and honors explicit loop policy only", () => {
  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");

  // Sting entry sets speaking false and syncs to contentEndMs without TTS/music restart.
  const advanceIdx = preview.indexOf("scheduleAdvanceAfterScene = useCallback");
  assert.ok(advanceIdx >= 0);
  const advanceBody = preview.slice(advanceIdx, advanceIdx + 2200);
  assert.match(advanceBody, /setIsSpeaking\(false\)/);
  assert.match(advanceBody, /syncSceneToTimelineTime\(masterTimeline\.contentEndMs/);
  assert.doesNotMatch(advanceBody, /speakSceneAt\(/);
  assert.doesNotMatch(advanceBody, /startBackgroundMusic\(/);

  // Browser full-story disables scene loop; no independent loop-story restart.
  const voiceIdx = preview.indexOf("const playWithBrowserVoice = useCallback");
  assert.ok(voiceIdx >= 0);
  const voiceBody = preview.slice(voiceIdx, voiceIdx + 1600);
  assert.match(voiceBody, /setLoopSceneEnabled\(false\)/);
  assert.match(voiceBody, /loopSceneEnabledRef\.current = false/);
  assert.doesNotMatch(preview, /loopStory|Loop Story|loopFullStory/);

  // After authoritative full-story duration, sting tail stops via stopVoice only.
  const browserTailIdx = preview.indexOf(
    'playbackModeRef.current === "browser" &&\n        masterTimeline &&\n        narrationEndedRef.current',
  );
  assert.ok(browserTailIdx >= 0);
  const browserTail = preview.slice(browserTailIdx, browserTailIdx + 900);
  assert.match(browserTail, /nextMs >= effectiveRenderDurationMs/);
  assert.match(browserTail, /stopVoice\(\)/);
  assert.doesNotMatch(browserTail, /speakSceneAt\(/);
  assert.doesNotMatch(browserTail, /playWithBrowserVoice\(/);

  // rAF cleanup on stop/unmount (isPlaying false tears down the effect).
  assert.match(preview, /return \(\) => window\.cancelAnimationFrame\(frameId\)/);
  assert.match(preview, /clearAdvanceTimeout/);
});

console.log(`\n${passed} passed\n`);
