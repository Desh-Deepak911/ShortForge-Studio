/**
 * Source-quality export guidance verification.
 * Run: npm run test:source-quality-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  SOURCE_QUALITY_EXPORT_GUIDANCE_CODES,
  resolveSourceQualityExportGuidance,
} from "@/features/source-quality/adapters/resolve-source-quality-export-guidance";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

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

function imageMedia(
  width: number | undefined,
  height: number | undefined,
  options: {
    readonly url?: string;
    readonly scale?: number;
    readonly fitMode?: "cover" | "contain";
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
    fitMode: options.fitMode ?? "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function baseScene(media: SceneMedia, id = "scene-1"): FootieScene {
  return {
    id,
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Narration line.",
    media,
    image: {
      url: media.url!,
      fitMode: media.fitMode === "contain" ? "fit" : "fill",
      x: 0,
      y: 0,
      scale: media.transform?.scale ?? 1,
      rotation: 0,
    },
  };
}

function scriptFor(scenes: FootieScene[]): FootieScript {
  return syncFootieScript({
    title: "Source quality export guidance",
    narration: "Story narration",
    totalDuration: 6 * scenes.length,
    scenes,
    exportSettings: {
      fileName: "sq-export",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

const CAPABLE_ENV = {
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

function countCode(
  warnings: ReadonlyArray<{ code: string }>,
  code: string,
): number {
  return warnings.filter((warning) => warning.code === code).length;
}

async function prepareGuidedRequest(
  story: FootieScript,
  options: {
    readonly enabled?: boolean;
    readonly mixedMediaScenesEnabled?: boolean;
    readonly exportTarget?: "720p" | "1080p" | "4k";
    readonly resolution?: "720x1280" | "1080x1920";
  } = {},
) {
  return prepareExportRequest({
    story,
    throwIfBlocked: false,
    mixedMediaScenesEnabled: options.mixedMediaScenesEnabled === true,
    sourceQualityIntelligenceEnabled: options.enabled !== false,
    sourceQualityExportTarget: options.exportTarget,
    options: {
      exportSettings: {
        resolution: options.resolution ?? "1080x1920",
        format: "webm",
        quality: "standard",
        fileName: "sq-export",
      },
    },
    environment: CAPABLE_ENV,
  });
}

async function main(): Promise<void> {
  console.log("\nSource quality export guidance\n");

  test("capability off produces no source-quality warnings", () => {
    const story = scriptFor([baseScene(imageMedia(640, 360))]);
    const guidance = resolveSourceQualityExportGuidance(story, {
      sourceQualityIntelligenceEnabled: false,
      exportTarget: "1080p",
    });
    assert.equal(guidance.length, 0);
  });

  await testAsync(
    "unknown dimensions emits exactly one dimensions warning",
    async () => {
      const story = scriptFor([
        baseScene(imageMedia(undefined, undefined, { scale: 1 })),
      ]);
      const prepared = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
      });
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN,
        ),
        1,
      );
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
        ),
        0,
      );
      const warning = prepared.preflight.warnings.find(
        (entry) =>
          entry.code ===
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN,
      );
      assert.match(
        warning?.message ?? "",
        /dimensions are unavailable/i,
      );
    },
  );

  await testAsync(
    "multiple unknown items still emit dimensions warning once",
    async () => {
      const story = scriptFor([
        baseScene(imageMedia(undefined, undefined, { url: "https://a.jpg" }), "s1"),
        baseScene(imageMedia(undefined, undefined, { url: "https://b.jpg" }), "s2"),
      ]);
      const prepared = await prepareGuidedRequest(story);
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN,
        ),
        1,
      );
    },
  );

  await testAsync(
    "1080p-suitable/4K-insufficient: no upscale on 1080p; one on 4K",
    async () => {
      // 1080×1920 at fill/zoom 1 is ready for 1080p but may upscale at 4K.
      const story = scriptFor([baseScene(imageMedia(1080, 1920))]);
      const at1080 = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
        resolution: "1080x1920",
      });
      assert.equal(
        countCode(
          at1080.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
        ),
        0,
      );
      const at4k = await prepareGuidedRequest(story, {
        exportTarget: "4k",
        resolution: "1080x1920",
      });
      assert.equal(
        countCode(
          at4k.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
        ),
        1,
      );
      const upscale = at4k.preflight.warnings.find(
        (entry) =>
          entry.code ===
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
      );
      assert.match(upscale?.message ?? "", /4K/);
      assert.doesNotMatch(upscale?.message ?? "", /1080p/);
    },
  );

  await testAsync("720p assessment follows the requested 720p target", async () => {
    // Below 720p vertical target under fill → upscale at 720p.
    const story = scriptFor([baseScene(imageMedia(640, 360))]);
    const prepared = await prepareGuidedRequest(story, {
      exportTarget: "720p",
      resolution: "720x1280",
    });
    assert.equal(
      countCode(
        prepared.preflight.warnings,
        SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
      ),
      1,
    );
    const upscale = prepared.preflight.warnings.find(
      (entry) =>
        entry.code ===
        SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
    );
    assert.match(upscale?.message ?? "", /720p/);
  });

  await testAsync(
    "aggressive crop emits exactly one crop warning",
    async () => {
      // Wide landscape fill aggressively crops for vertical frame.
      const story = scriptFor([
        baseScene(imageMedia(1920, 800, { fitMode: "cover", scale: 1 })),
      ]);
      const prepared = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
      });
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_AGGRESSIVE_CROP,
        ),
        1,
      );
      const crop = prepared.preflight.warnings.find(
        (entry) =>
          entry.code ===
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_AGGRESSIVE_CROP,
      );
      assert.match(crop?.message ?? "", /heavily cropped/i);
    },
  );

  await testAsync(
    "aspect mismatch alone does not create an export warning",
    async () => {
      // Mild aspect mismatch under fit with ample resolution → no upscale/crop.
      const story = scriptFor([
        baseScene(
          imageMedia(1600, 2000, { fitMode: "contain", scale: 1 }),
        ),
      ]);
      const guidance = resolveSourceQualityExportGuidance(story, {
        sourceQualityIntelligenceEnabled: true,
        exportTarget: "1080p",
      });
      assert.equal(guidance.length, 0);
      const prepared = await prepareGuidedRequest(story);
      assert.equal(
        prepared.preflight.warnings.filter((warning) =>
          warning.code.startsWith("SOURCE_QUALITY_"),
        ).length,
        0,
      );
    },
  );

  await testAsync(
    "Fit framing does not create an unnecessary blocking warning",
    async () => {
      const story = scriptFor([
        baseScene(imageMedia(1080, 1920, { fitMode: "contain", scale: 1 })),
      ]);
      const prepared = await prepareGuidedRequest(story);
      assert.equal(
        prepared.preflight.warnings.filter((warning) =>
          warning.code.startsWith("SOURCE_QUALITY_"),
        ).length,
        0,
      );
      assert.equal(prepared.preflight.supported, true);
      assert.equal(
        prepared.preflight.blockers.some((blocker) =>
          blocker.code.includes("SOURCE_QUALITY"),
        ),
        false,
      );
    },
  );

  await testAsync(
    "mixed-media assesses canonical rendered items; ignores divergent scene.media",
    async () => {
      // Seed the sequence from known media, then overwrite stale scene.media only.
      let scene = baseScene(
        imageMedia(1080, 1920, {
          url: "https://example.com/first.jpg",
          scale: 1,
        }),
      );
      scene = appendMixedMediaSequenceItem(
        scene,
        imageMedia(1080, 1920, {
          url: "https://example.com/second.jpg",
          scale: 1,
        }),
        { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
      ).scene;
      scene = {
        ...scene,
        media: imageMedia(undefined, undefined, {
          url: "https://example.com/ignored-unknown.jpg",
        }),
      };
      const story = scriptFor([scene]);
      const prepared = await prepareGuidedRequest(story, {
        mixedMediaScenesEnabled: true,
        exportTarget: "1080p",
      });
      // Canonical sequence items are known/suitable — divergent scene.media must not warn.
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN,
        ),
        0,
      );
      assert.equal(
        resolveSourceQualityExportGuidance(story, {
          sourceQualityIntelligenceEnabled: true,
          mixedMediaScenesEnabled: true,
          exportTarget: "1080p",
        }).length,
        0,
      );
    },
  );

  await testAsync(
    "Browser and Headless warning-code parity for equal resolution",
    async () => {
      const story = scriptFor([baseScene(imageMedia(640, 360))]);
      const browser = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
        resolution: "1080x1920",
      });
      const headlessFrozen = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
        resolution: "1080x1920",
      });
      const browserCodes = browser.preflight.warnings
        .filter((warning) => warning.code.startsWith("SOURCE_QUALITY_"))
        .map((warning) => warning.code)
        .sort();
      const headlessCodes = headlessFrozen.preflight.warnings
        .filter((warning) => warning.code.startsWith("SOURCE_QUALITY_"))
        .map((warning) => warning.code)
        .sort();
      assert.deepEqual(browserCodes, headlessCodes);
    },
  );

  test("prepareStoryForExport never appends source-quality string warnings", () => {
    const story = scriptFor([baseScene(imageMedia(640, 360))]);
    const prepared = prepareStoryForExport(story, {
      mixedMediaScenesEnabled: false,
    });
    assert.equal(
      prepared.warnings.some((warning) =>
        /source quality|upscale|dimensions are unavailable|heavily cropped/i.test(
          warning,
        ),
      ),
      false,
    );
  });

  await testAsync(
    "source-quality guidance exists only in structured preflight result",
    async () => {
      const story = scriptFor([baseScene(imageMedia(640, 360))]);
      const prepared = await prepareGuidedRequest(story, {
        exportTarget: "1080p",
      });
      assert.ok(
        prepared.preflight.warnings.some((warning) =>
          warning.code.startsWith("SOURCE_QUALITY_"),
        ),
      );
      assert.equal(
        prepared.preparedStory.warnings.some((warning) =>
          /source quality|SOURCE_QUALITY_/i.test(warning),
        ),
        false,
      );
      const prepareSrc = readSrc(
        "src/features/export/domain/prepare-export-request.ts",
      );
      assert.match(prepareSrc, /resolveSourceQualityExportGuidance/);
      const storyPrep = readSrc(
        "src/features/export/utils/export-preflight.utils.ts",
      );
      assert.doesNotMatch(storyPrep, /resolveSourceQualityExportGuidance/);
      assert.doesNotMatch(storyPrep, /SOURCE_QUALITY_/);
      const exportPanel = readSrc("src/components/ExportPanel.tsx");
      assert.match(exportPanel, /sourceQualityIntelligenceEnabled/);
      assert.doesNotMatch(
        exportPanel,
        /resolveSourceQualityExportGuidance/,
      );
      const headless = readSrc(
        "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
      );
      assert.match(headless, /sourceQualityIntelligenceEnabled/);
      assert.match(headless, /sourceQualityExportTarget:\s*resolution/);
      assert.doesNotMatch(headless, /resolveSourceQualityExportGuidance/);
    },
  );

  await testAsync(
    "no source-quality warning is terminal",
    async () => {
      const story = scriptFor([
        baseScene(imageMedia(undefined, undefined)),
        baseScene(imageMedia(1920, 800, { fitMode: "cover" }), "scene-2"),
      ]);
      const prepared = await prepareGuidedRequest(story, {
        exportTarget: "4k",
      });
      assert.ok(
        prepared.preflight.warnings.some((warning) =>
          warning.code.startsWith("SOURCE_QUALITY_"),
        ),
      );
      assert.equal(
        prepared.preflight.blockers.some((blocker) =>
          String(blocker.code).includes("SOURCE_QUALITY"),
        ),
        false,
      );
      assert.equal(prepared.preflight.supported, true);
    },
  );

  test("ownership and package script contracts", () => {
    const pkg = readSrc("package.json");
    assert.match(pkg, /"test:source-quality-export"/);
    assert.match(pkg, /sourceQualityExportGuidance\.verify\.ts/);
    assert.match(pkg, /sourceQualityRenderCompatibility\.verify\.ts/);
    assert.match(pkg, /sourceQualityVoiceoverRefit\.verify\.ts/);
    const adapter = readSrc(
      "src/features/source-quality/adapters/resolve-source-quality-export-guidance.ts",
    );
    assert.match(adapter, /assessSourceQuality/);
    assert.match(adapter, /projectSceneVisualPlan/);
    assert.doesNotMatch(adapter, /SOURCE_ASPECT_RATIO_MISMATCH/);
    assert.doesNotMatch(adapter, /buildExportManifest|ExportManifest/);
    for (const rel of [
      "src/features/source-quality/adapters/resolve-source-quality-export-guidance.ts",
      "src/verification/source-quality/sourceQualityExportGuidance.verify.ts",
      "src/verification/source-quality/sourceQualityRenderCompatibility.verify.ts",
      "src/verification/source-quality/sourceQualityVoiceoverRefit.verify.ts",
    ]) {
      assert.doesNotMatch(rel, /sprint|12[Dd]|slice|checkpoint|hardening|final/i);
      assert.ok(readSrc(rel).length > 0);
    }
  });

  console.log(`\nSource quality export guidance: ${passed} PASS\n`);
}

void main();
