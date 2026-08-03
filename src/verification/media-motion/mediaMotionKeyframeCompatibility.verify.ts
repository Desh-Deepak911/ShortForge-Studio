/**
 * Keyframe story/JSON compatibility and render-isolation verification.
 * Run via: npm run test:media-motion-keyframes
 *
 * Proves dormant keyframes survive story normalize/JSON round-trip, preserve
 * legacy motion authority, leave ExportManifest v4/fingerprint unchanged, and
 * are not imported by preview/export/headless consumers (direct or barrel).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  MEDIA_MOTION_STATIC,
  normalizeSceneMediaMotion,
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";
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

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function baseMedia(keyframes?: SceneMedia["motion"]): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/a.jpg",
    source: "upload",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "ease-out",
      intensity: 0.8,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1.12, rotation: 0 },
      ...(keyframes ? { keyframes: keyframes.keyframes } : {}),
    },
  };
}

function storyFor(media: SceneMedia): FootieScript {
  const scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Hello",
    narration: "Hello narration",
    media,
    image: {
      url: media.url!,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fitMode: "fill",
    },
  };
  return syncFootieScript({
    title: "Keyframe compatibility",
    narration: "Hello narration",
    totalDuration: 4,
    scenes: [scene],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4000,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      fileName: "music.mp3",
      volume: 0.4,
      duckingEnabled: true,
      fadeIn: false,
      fadeOut: false,
    },
  });
}

function main(): void {
  console.log("\nmedia-motion-keyframe-compatibility\n");

  test("JSON round-trip preserves valid keyframes through story normalize", () => {
    const media = baseMedia({
      version: 1,
      keyframes: [
        {
          offsetMs: 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
        {
          offsetMs: 1000,
          x: 40,
          y: -10,
          scale: 1.1,
          rotation: 5,
          opacity: 0.8,
          easing: "ease-in",
        },
      ],
    });
    const normalized = normalizeSceneMedia(media);
    assert.ok(normalized?.motion?.keyframes);
    assert.equal(normalized!.motion!.keyframes!.length, 2);
    const roundTripped = normalizeSceneMedia(
      JSON.parse(JSON.stringify(normalized)),
    );
    assert.deepEqual(
      roundTripped!.motion!.keyframes,
      normalized!.motion!.keyframes,
    );
    assert.equal(roundTripped!.motion!.presetId, "slow-zoom-in");
    assert.equal(roundTripped!.motion!.intensity, 0.8);
  });

  test("malformed keyframes strip without blocking project open", () => {
    const raw = {
      ...baseMedia(),
      motion: {
        ...baseMedia().motion!,
        keyframes: [
          { offsetMs: "bad", x: 1, y: 1, scale: 1, rotation: 0, opacity: 1 },
          null,
          {
            offsetMs: 0,
            x: 0,
            y: 0,
            scale: 1,
            easing: "linear",
          },
          {
            offsetMs: 500,
            x: 10,
            y: 0,
            scale: 1,
            easing: "ease-out",
          },
        ],
      },
    };
    const normalized = normalizeSceneMedia(raw);
    assert.ok(normalized);
    assert.equal(normalized!.motion!.presetId, "slow-zoom-in");
    assert.equal(normalized!.motion!.enabled, true);
    assert.ok(normalized!.motion!.keyframes);
    assert.equal(normalized!.motion!.keyframes!.length, 2);
  });

  test("legacy motion without keyframes stays authoritative and unchanged", () => {
    const media = baseMedia();
    delete media.motion!.keyframes;
    const normalized = normalizeSceneMedia(media);
    assert.equal(normalized!.motion!.keyframes, undefined);
    const resolved = resolveSceneMediaMotion({ media: normalized });
    assert.equal(resolved.presetId, "slow-zoom-in");
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.keyframes, undefined);

    const baseTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    const without = resolveMediaMotionStateForSceneTiming({
      motion: resolved,
      baseTransform,
      sceneElapsedMs: 2000,
      sceneDurationMs: 4000,
    });
    const withDormantMedia = normalizeSceneMedia({
      ...normalized!,
      motion: {
        ...normalized!.motion!,
        keyframes: [
          {
            offsetMs: 0,
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            easing: "linear",
          },
          {
            offsetMs: 4000,
            x: 100,
            y: 0,
            scale: 1.2,
            rotation: 0,
            opacity: 0.5,
            easing: "ease-in",
          },
        ],
      },
    });
    const withMotion = resolveSceneMediaMotion({ media: withDormantMedia });
    assert.ok(withMotion.keyframes);
    assert.equal(withMotion.keyframes!.length, 2);
    const withState = resolveMediaMotionStateForSceneTiming({
      motion: withMotion,
      baseTransform,
      sceneElapsedMs: 2000,
      sceneDurationMs: 4000,
    });
    assert.deepEqual(withState.transform, without.transform);
    assert.equal(withState.progress, without.progress);
    assert.equal(withState.easedProgress, without.easedProgress);
    assert.equal(withState.presetId, without.presetId);
  });

  test("dormant custom-identity enablement remains intentionally unchanged", () => {
    // Intentional until renderer/manifest integration: custom + identity
    // start/end still normalizes disabled even when dormant keyframes exist.
    const customWithKeys = normalizeSceneMediaMotion({
      version: 1,
      presetId: "custom",
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      keyframes: [
        {
          offsetMs: 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
        {
          offsetMs: 1000,
          x: 40,
          y: 0,
          scale: 1.1,
          rotation: 0,
          opacity: 1,
          easing: "ease-in",
        },
      ],
    });
    assert.equal(customWithKeys.presetId, "custom");
    assert.equal(customWithKeys.enabled, false);
    assert.ok(customWithKeys.keyframes);
    assert.equal(customWithKeys.keyframes!.length, 2);

    const state = resolveMediaMotionStateForSceneTiming({
      motion: customWithKeys,
      baseTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      sceneElapsedMs: 500,
      sceneDurationMs: 1000,
    });
    assert.equal(state.active, false);
    assert.deepEqual(state.transform, { x: 0, y: 0, scale: 1, rotation: 0 });
  });

  test("motion fingerprint ignores dormant keyframes", () => {
    const base = normalizeSceneMediaMotion({
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "ease-out",
      intensity: 0.8,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1.12, rotation: 0 },
    });
    const withKeys = normalizeSceneMediaMotion({
      ...base,
      keyframes: [
        {
          offsetMs: 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
        {
          offsetMs: 1000,
          x: 50,
          y: 0,
          scale: 1.1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
      ],
    });
    assert.equal(
      serializeSceneMediaMotionFingerprint(base),
      serializeSceneMediaMotionFingerprint(withKeys),
    );
    assert.notEqual(
      serializeSceneMediaMotionFingerprint(base),
      serializeSceneMediaMotionFingerprint(MEDIA_MOTION_STATIC),
    );
  });

  test("dormant keyframes do not change ExportManifest v4 JSON/fingerprint/windows/narration/music", () => {
    const baseStory = storyFor(baseMedia());
    const keyedMedia = baseMedia({
      version: 1,
      keyframes: [
        {
          offsetMs: 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
        {
          offsetMs: 2000,
          x: 80,
          y: 20,
          scale: 1.15,
          rotation: 10,
          opacity: 0.7,
          easing: "ease-in-out",
        },
      ],
    });
    const keyedStory = storyFor(keyedMedia);

    const manifestBase = buildExportManifest({
      story: baseStory,
      environment: CAPABLE_ENV,
      includeBackgroundMusic: true,
      audioMode: "with-voice",
    });
    const manifestKeyed = buildExportManifest({
      story: keyedStory,
      environment: CAPABLE_ENV,
      includeBackgroundMusic: true,
      audioMode: "with-voice",
    });

    assert.equal(manifestBase.version, 4);
    assert.equal(manifestKeyed.version, 4);
    assert.equal(manifestBase.fingerprint, manifestKeyed.fingerprint);
    assert.equal(
      manifestBase.project.contentDurationMs,
      manifestKeyed.project.contentDurationMs,
    );
    assert.equal(
      manifestBase.project.renderDurationMs,
      manifestKeyed.project.renderDurationMs,
    );

    const baseJson = JSON.stringify(manifestBase);
    const keyedJson = JSON.stringify(manifestKeyed);
    // Compare stable manifest authority surfaces (exclude volatile ids/timestamps).
    assert.equal(
      JSON.stringify({
        version: manifestBase.version,
        rendererContractVersion: manifestBase.rendererContractVersion,
        project: manifestBase.project,
        output: manifestBase.output,
        scenes: manifestBase.scenes,
        captions: manifestBase.captions,
        audio: manifestBase.audio,
        capabilities: manifestBase.capabilities,
      }),
      JSON.stringify({
        version: manifestKeyed.version,
        rendererContractVersion: manifestKeyed.rendererContractVersion,
        project: manifestKeyed.project,
        output: manifestKeyed.output,
        scenes: manifestKeyed.scenes,
        captions: manifestKeyed.captions,
        audio: manifestKeyed.audio,
        capabilities: manifestKeyed.capabilities,
      }),
    );
    assert.doesNotMatch(keyedJson, /"keyframes"/);
    assert.doesNotMatch(baseJson, /"keyframes"/);
    assert.ok(manifestKeyed.audio.music);
    assert.ok(manifestBase.audio.music);
    assert.deepEqual(manifestBase.audio.music, manifestKeyed.audio.music);
    assert.ok(manifestBase.audio.voiceover);
    assert.deepEqual(
      manifestBase.audio.voiceover,
      manifestKeyed.audio.voiceover,
    );
    assert.deepEqual(
      manifestBase.capabilities,
      manifestKeyed.capabilities,
    );
  });

  test("preview/export/headless consumers avoid direct and barrel keyframe imports", () => {
    const forbiddenSymbols =
      /resolveMediaMotionKeyframes|normalizeMediaMotionKeyframes|selectEndpointPreservingKeyframes|media-motion-keyframes|resolve-media-motion-keyframes/;
    // Barrel import of the whole feature is allowed for existing motion APIs,
    // but consumers must not reference keyframe symbols from that barrel.
    const consumerFiles = [
      "src/features/editor/preview/motion/previewMotionAdapter.ts",
      "src/features/editor/export/motion/exportMotionAdapter.ts",
      "src/features/media-motion/media-motion.engine.ts",
      "src/features/export/domain/build-export-manifest.ts",
      "src/features/export/runtime/prepare-export-from-manifest.ts",
      "src/features/export/utils/export-scene-media-renderer.ts",
      "src/features/export/domain/run-export-capability-preflight.ts",
    ];

    for (const rel of consumerFiles) {
      const src = readSrc(rel);
      assert.doesNotMatch(src, forbiddenSymbols, rel);
      assert.doesNotMatch(
        src,
        /from ["']@\/features\/media-motion\/domain\//,
        rel,
      );
    }

    const headlessRoot = path.join(process.cwd(), "src/features/headless-renderer");
    for (const file of walkFiles(headlessRoot)) {
      const rel = path.relative(process.cwd(), file);
      const src = readSrc(rel);
      assert.doesNotMatch(src, forbiddenSymbols, rel);
      assert.doesNotMatch(
        src,
        /from ["']@\/features\/media-motion\/domain\//,
        rel,
      );
    }

    // Barrel re-exports keyframe APIs for future wiring only.
    const barrel = readSrc("src/features/media-motion/index.ts");
    assert.match(barrel, /resolveMediaMotionKeyframes/);
    assert.match(barrel, /normalizeMediaMotionKeyframes/);
    assert.match(
      readSrc("src/features/media-motion/domain/resolve-media-motion-keyframes.ts"),
      /Not connected to preview, export, canvas/,
    );

    // Engine source must not branch on keyframes.
    assert.doesNotMatch(
      readSrc("src/features/media-motion/media-motion.engine.ts"),
      /keyframes/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
