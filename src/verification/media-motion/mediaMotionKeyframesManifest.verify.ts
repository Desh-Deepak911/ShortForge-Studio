import assert from "node:assert/strict";

import {
  buildExportManifest,
  runExportCapabilityPreflight,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { buildExportManifestFingerprint } from "@/features/export/domain/export-manifest-fingerprint";
import type { MediaMotionKeyframe } from "@/features/media-motion";
import type { FootieScene, FootieScript, SceneMedia, SceneMediaMotion } from "@/features/story/types";
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

const frames: MediaMotionKeyframe[] = [
  { offsetMs: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: "ease-in" },
  { offsetMs: 4000, x: 120, y: -80, scale: 1.2, rotation: 12, opacity: 0.65, easing: "linear" },
];

function media(options: {
  keyframes?: MediaMotionKeyframe[];
  motionEnabled?: boolean;
  presetId?: string;
  startTransform?: SceneMediaMotion["startTransform"];
  endTransform?: SceneMediaMotion["endTransform"];
} = {}): SceneMedia {
  const motionEnabled = options.motionEnabled !== false;
  return {
    type: "image",
    url: "https://example.com/keyframes.jpg",
    source: "upload",
    transform: { x: 10, y: -5, scale: 1.1, rotation: 3 },
    motion: {
      version: 1,
      enabled: motionEnabled,
      presetId: options.presetId ?? "slow-zoom-in",
      easing: "linear",
      intensity: 1,
      startTransform: options.startTransform ?? { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: options.endTransform ?? { x: 0, y: 0, scale: 1.1, rotation: 0 },
      ...(options.keyframes ? { keyframes: options.keyframes } : {}),
    },
  };
}

function storyFromMedia(sceneMedia: SceneMedia): FootieScript {
  const scene: FootieScene = {
    id: "keyframe-scene",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Keyframes",
    narration: "Keyframes",
    media: sceneMedia,
    image: {
      url: "https://example.com/keyframes.jpg",
      x: 10,
      y: -5,
      scale: 1.1,
      rotation: 3,
      fitMode: "fill",
    },
  };
  return syncFootieScript({
    title: "Keyframe manifest",
    narration: "Keyframes",
    totalDuration: 4,
    scenes: [scene],
  });
}

function story(keyframes?: MediaMotionKeyframe[], motionEnabled = true): FootieScript {
  return storyFromMedia(media({ keyframes, motionEnabled }));
}

function manifest(
  keyframes: MediaMotionKeyframe[] | undefined,
  capabilityEnabled: boolean,
  motionEnabled = true,
) {
  return buildExportManifest({
    story: story(keyframes, motionEnabled),
    environment: CAPABLE_ENV,
    audioMode: "silent",
    keyframedVisualEffectsEnabled: capabilityEnabled,
  });
}

function itemMotion(result: ReturnType<typeof buildExportManifest>) {
  const itemMedia = result.scenes[0]!.mediaTimeline.items[0]!.media;
  assert.ok(itemMedia.type === "image" || itemMedia.type === "video");
  return itemMedia.motion;
}

function main(): void {
  console.log("\nmedia-motion-keyframes-manifest\n");

  test("capability off keeps keyframed stories on v4 without keyframe authority", () => {
    const plain = manifest(undefined, false);
    const dormant = manifest(frames, false);
    assert.equal(dormant.version, 4);
    assert.equal(dormant.fingerprint, plain.fingerprint);
    assert.doesNotMatch(JSON.stringify(dormant), /"keyframes"/);
    assert.ok(!("requiredCapabilities" in dormant));
  });

  test("disabled motion with stored keyframes stays v4 and fingerprint-stable", () => {
    const disabled = manifest(frames, true, false);
    const plainDisabled = manifest(undefined, true, false);
    assert.equal(disabled.version, 4);
    assert.equal(disabled.rendererContractVersion, "9D");
    assert.ok(!("requiredCapabilities" in disabled));
    assert.doesNotMatch(JSON.stringify(disabled), /"keyframes"/);
    assert.equal(disabled.fingerprint, plainDisabled.fingerprint);
  });

  test("capability on freezes usable keyframes into v5 contract 9E deterministically", () => {
    const first = manifest(frames, true);
    const second = manifest(frames, true);
    assert.equal(first.version, 5);
    assert.equal(first.rendererContractVersion, "9E");
    assert.deepEqual(first.requiredCapabilities, ["keyframed-visual-effects-v1"]);
    const motion = itemMotion(first)!;
    assert.equal(motion.keyframeSchemaVersion, 1);
    assert.ok(Object.isFrozen(motion.keyframes));
    assert.ok(Object.isFrozen(motion.keyframes![0]!));
    assert.equal(first.fingerprint, second.fingerprint);
    assert.notEqual(
      first.fingerprint,
      manifest([{ ...frames[0]! }, { ...frames[1]!, x: 121 }], true).fingerprint,
    );
  });

  test("authority matrix: only cap+enabled+valid keyframes dispatch v5", () => {
    const cases: Array<{
      label: string;
      cap: boolean;
      motionEnabled: boolean;
      keyframes?: MediaMotionKeyframe[];
      expectV5: boolean;
    }> = [
      { label: "all on", cap: true, motionEnabled: true, keyframes: frames, expectV5: true },
      { label: "cap off", cap: false, motionEnabled: true, keyframes: frames, expectV5: false },
      { label: "motion off", cap: true, motionEnabled: false, keyframes: frames, expectV5: false },
      { label: "no keyframes", cap: true, motionEnabled: true, keyframes: undefined, expectV5: false },
      { label: "single keyframe", cap: true, motionEnabled: true, keyframes: [frames[0]!], expectV5: false },
      {
        label: "malformed",
        cap: true,
        motionEnabled: true,
        keyframes: [{ offsetMs: "bad" } as unknown as MediaMotionKeyframe],
        expectV5: false,
      },
    ];
    for (const entry of cases) {
      const result = manifest(entry.keyframes, entry.cap, entry.motionEnabled);
      assert.equal(result.version, entry.expectV5 ? 5 : 4, entry.label);
      if (entry.expectV5) {
        assert.ok(result.version === 5);
        assert.deepEqual(
          result.version === 5 ? result.requiredCapabilities : null,
          ["keyframed-visual-effects-v1"],
        );
      } else {
        assert.ok(!("requiredCapabilities" in result), entry.label);
        assert.doesNotMatch(JSON.stringify(result), /"keyframes"/);
      }
    }
  });

  test("malformed or single keyframes retain v4 and no required capability", () => {
    const malformed = buildExportManifest({
      story: story([{ offsetMs: "bad" } as unknown as MediaMotionKeyframe]),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(malformed.version, 4);
    assert.ok(!("requiredCapabilities" in malformed));

    const single = manifest([frames[0]!], true);
    assert.equal(single.version, 4);
    assert.ok(!("requiredCapabilities" in single));
  });

  test("mixed scene may freeze keyframed and legacy items together on v5", () => {
    const keyed = media({ keyframes: frames, motionEnabled: true });
    const legacy: SceneMedia = {
      type: "image",
      url: "https://example.com/legacy.jpg",
      source: "upload",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        easing: "linear",
        intensity: 1,
        startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
        endTransform: { x: 0, y: 0, scale: 1.15, rotation: 0 },
      },
    };
    const scene: FootieScene = {
      id: "mixed",
      start: 0,
      end: 4,
      duration: 4,
      startMs: 0,
      endMs: 4000,
      durationMs: 4000,
      subtitle: "Mixed",
      narration: "Mixed",
      media: keyed,
      mediaTimeline: {
        version: 1,
        items: [
          { id: "a", media: keyed, durationWeight: 1 },
          { id: "b", media: legacy, durationWeight: 1 },
        ],
      },
      visualSequence: {
        version: 1,
        items: [
          {
            id: "a",
            media: keyed,
            startOffsetMs: 0,
            durationMs: 2000,
          },
          {
            id: "b",
            media: legacy,
            startOffsetMs: 2000,
            durationMs: 2000,
          },
        ],
      },
      image: {
        url: keyed.url!,
        x: 10,
        y: -5,
        scale: 1.1,
        rotation: 3,
        fitMode: "fill",
      },
    };
    const result = buildExportManifest({
      story: syncFootieScript({
        title: "Mixed keyframes",
        narration: "Mixed",
        totalDuration: 4,
        scenes: [scene],
      }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(result.version, 5);
    const items = result.scenes[0]!.mediaTimeline.items;
    assert.ok(items.length >= 2);
    const first = items[0]!.media;
    const second = items[1]!.media;
    assert.ok(first.type !== "placeholder" && second.type !== "placeholder");
    assert.ok(first.motion?.keyframes && first.motion.keyframes.length >= 2);
    assert.equal(second.motion?.keyframes, undefined);
    assert.equal(validateExportManifest(result).ok, true);
  });

  test("v5 fingerprint excludes timestamps and supportedCapabilities negotiation", () => {
    const one = manifest(frames, true);
    const two = manifest(frames, true);
    assert.notEqual(one.manifestId, two.manifestId);
    assert.equal(one.fingerprint, two.fingerprint);

    const browserCtx = JSON.parse(JSON.stringify(one));
    browserCtx.capabilities.supportedCapabilities = ["keyframed-visual-effects-v1"];
    const headlessCtx = JSON.parse(JSON.stringify(one));
    headlessCtx.capabilities.supportedCapabilities = [];
    assert.equal(
      buildExportManifestFingerprint(browserCtx),
      buildExportManifestFingerprint(headlessCtx),
    );
    assert.deepEqual(browserCtx.scenes, headlessCtx.scenes);
    assert.equal(
      buildExportManifestFingerprint(browserCtx),
      one.fingerprint,
    );
  });

  test("Browser and Headless capability contexts share canonical v5 media/fingerprint", () => {
    const browser = buildExportManifest({
      story: story(frames, true),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: false },
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    const headlessPreferred = buildExportManifest({
      story: story(frames, true),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    // Existing contract fingerprints env renderer availability; media payload must match.
    assert.deepEqual(
      JSON.stringify(browser.scenes),
      JSON.stringify(headlessPreferred.scenes),
    );
    assert.ok(browser.version === 5 && headlessPreferred.version === 5);
    assert.deepEqual(
      browser.version === 5 ? browser.requiredCapabilities : null,
      headlessPreferred.version === 5 ? headlessPreferred.requiredCapabilities : null,
    );
    // Same story/env-capability advertisement variance must not change fingerprint.
    const browserNeg = JSON.parse(JSON.stringify(browser));
    const headlessNeg = JSON.parse(JSON.stringify(browser));
    browserNeg.capabilities.supportedCapabilities = ["keyframed-visual-effects-v1"];
    headlessNeg.capabilities.supportedCapabilities = undefined;
    delete headlessNeg.capabilities.supportedCapabilities;
    assert.equal(
      buildExportManifestFingerprint(browserNeg),
      buildExportManifestFingerprint(headlessNeg),
    );
  });

  test("strict validator matrix rejects downgrade and malformed v5 payloads", () => {
    const valid = manifest(frames, true);
    assert.equal(validateExportManifest(valid).ok, true);

    assert.equal(
      validateExportManifest({ ...valid, rendererContractVersion: "9D" }).ok,
      false,
    );
    assert.equal(
      validateExportManifest({ ...valid, rendererContractVersion: "unknown" }).ok,
      false,
    );
    assert.equal(validateExportManifest({ ...valid, version: 999 }).ok, false);

    const forged = JSON.parse(JSON.stringify(valid));
    delete forged.requiredCapabilities;
    assert.equal(validateExportManifest(forged).ok, false);

    const noPayload = JSON.parse(JSON.stringify(valid));
    for (const scene of noPayload.scenes) {
      for (const item of scene.mediaTimeline.items) {
        if (item.media?.motion) {
          delete item.media.motion.keyframes;
          delete item.media.motion.keyframeSchemaVersion;
        }
      }
    }
    assert.equal(validateExportManifest(noPayload).ok, false);

    const badSchema = JSON.parse(JSON.stringify(valid));
    badSchema.scenes[0].mediaTimeline.items[0].media.motion.keyframeSchemaVersion = 2;
    assert.equal(validateExportManifest(badSchema).ok, false);

    const nonFinite = JSON.parse(JSON.stringify(valid));
    nonFinite.scenes[0].mediaTimeline.items[0].media.motion.keyframes[0].x = Number.NaN;
    assert.equal(validateExportManifest(nonFinite).ok, false);

    const outOfRange = JSON.parse(JSON.stringify(valid));
    outOfRange.scenes[0].mediaTimeline.items[0].media.motion.keyframes[0].x = 99999;
    assert.equal(validateExportManifest(outOfRange).ok, false);

    const badEasing = JSON.parse(JSON.stringify(valid));
    badEasing.scenes[0].mediaTimeline.items[0].media.motion.keyframes[0].easing = "bounce";
    assert.equal(validateExportManifest(badEasing).ok, false);

    const nonMono = JSON.parse(JSON.stringify(valid));
    nonMono.scenes[0].mediaTimeline.items[0].media.motion.keyframes[1].offsetMs = 0;
    assert.equal(validateExportManifest(nonMono).ok, false);

    const v4WithKeys = JSON.parse(JSON.stringify(manifest(undefined, false)));
    v4WithKeys.scenes[0].mediaTimeline.items[0].media.motion = {
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "linear",
      intensity: 1,
      keyframes: frames,
      keyframeSchemaVersion: 1,
    };
    assert.equal(validateExportManifest(v4WithKeys).ok, false);
  });

  test("validation and preflight reject unsupported v5 contracts and capabilities", () => {
    const valid = manifest(frames, true);
    const unsupported = JSON.parse(JSON.stringify(valid));
    unsupported.capabilities.supportedCapabilities = [];
    unsupported.fingerprint = buildExportManifestFingerprint(unsupported);
    const preflight = runExportCapabilityPreflight(unsupported);
    assert.ok(
      preflight.blockers.some(
        (blocker) => blocker.code === "UNSUPPORTED_RENDERER_CAPABILITY",
      ),
    );
  });

  test("a capable browser remains selectable for v5 including headless-available envs", () => {
    const browserOnly = runExportCapabilityPreflight(manifest(frames, true));
    assert.equal(browserOnly.renderer, "browser");

    const withServer = buildExportManifest({
      story: story(frames, true),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    const preflight = runExportCapabilityPreflight(withServer);
    assert.equal(preflight.renderer, "browser");
  });

  console.log(`\n${passed} passed\n`);
}
main();
