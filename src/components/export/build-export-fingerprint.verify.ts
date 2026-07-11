/**
 * Export fingerprint SceneMedia authority — 4.2A-5D-1
 * Run: npm run test:export-fingerprint
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportFingerprint,
  buildSceneMediaExportFingerprintKey,
} from "@/components/export/build-export-fingerprint.utils";
import type { ExportSettings, FootieScene, FootieScript } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const defaultSettings: ExportSettings = {
  format: "mp4",
  quality: "standard",
  includeSubtitles: true,
  includeWatermark: false,
};

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    startMs: 0,
    endMs: 5000,
    subtitle: "Scene caption",
    ...overrides,
  };
}

function baseScript(scenes: FootieScene[]): FootieScript {
  return {
    title: "Fingerprint Story",
    narration: "Scene caption.",
    totalDuration: 5,
    scenes,
  };
}

function fingerprint(script: FootieScript): string {
  return buildExportFingerprint({
    script,
    exportSettings: defaultSettings,
    includeNarration: true,
    includeBackgroundMusic: false,
  });
}

test("Image fingerprint parity — dual-write image uses SceneMedia fields", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/still.jpg",
      scale: 1.2,
      x: 10,
      y: -5,
      rotation: 0,
      fitMode: "fill",
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
    media: {
      type: "image",
      url: "https://example.com/still.jpg",
      fitMode: "cover",
      transform: { x: 10, y: -5, scale: 1.2, rotation: 0 },
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  });

  const key = buildSceneMediaExportFingerprintKey(scene);
  assert.match(key, /^image\|/);
  assert.match(key, /still\.jpg/);
  assert.match(key, /cover/);
  assert.match(key, /slow-zoom-in/);
});

test("Video fingerprint includes type url duration trim poster fit transform muted", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip-a",
      durationMs: 8000,
      trimStartMs: 500,
      trimEndMs: 7000,
      posterUrl: "https://example.com/poster.jpg",
      fitMode: "contain",
      transform: { x: 1, y: 2, scale: 1.1, rotation: 3 },
      muted: true,
    },
  });

  const key = buildSceneMediaExportFingerprintKey(scene);
  assert.match(key, /^video\|/);
  assert.match(key, /blob:clip-a/);
  assert.match(key, /8000/);
  assert.match(key, /500/);
  assert.match(key, /7000/);
  assert.match(key, /poster\.jpg/);
  assert.match(key, /contain/);
  assert.match(key, /1,2,1\.1,3/);
  assert.match(key, /"p":"static"/);
});

test("Trim fingerprint — trimStart/trimEnd changes invalidate export", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        trimStartMs: 0,
        trimEndMs: 5000,
        muted: true,
      },
    }),
  ]);

  const trimmed = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: {
          ...base.scenes[0]!.media!,
          trimStartMs: 1000,
          trimEndMs: 4000,
        },
      },
    ],
  };

  assert.notEqual(fingerprint(base), fingerprint(trimmed));
});

test("Poster fingerprint — posterUrl change invalidates export", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        muted: true,
        posterUrl: "https://example.com/a.jpg",
      },
    }),
  ]);

  const next = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: {
          ...base.scenes[0]!.media!,
          posterUrl: "https://example.com/b.jpg",
        },
      },
    ],
  };

  assert.notEqual(fingerprint(base), fingerprint(next));
});

test("Legacy fallback — scene.image without scene.media still fingerprints", () => {
  const legacy = baseScene({
    image: {
      url: "https://example.com/legacy.jpg",
      scale: 1,
      x: 0,
      y: 0,
      fitMode: "fit",
      imageMotion: { type: "none", intensity: "subtle" },
    },
  });

  const key = buildSceneMediaExportFingerprintKey(legacy);
  assert.match(key, /^image\|/);
  assert.match(key, /legacy\.jpg/);

  const withUrlChange = baseScene({
    image: {
      url: "https://example.com/legacy-2.jpg",
      scale: 1,
      x: 0,
      y: 0,
      fitMode: "fit",
    },
  });

  assert.notEqual(
    fingerprint(baseScript([legacy])),
    fingerprint(baseScript([withUrlChange])),
  );
});

test("Placeholder fingerprint", () => {
  const scene = baseScene({
    media: { type: "placeholder" },
  });
  assert.equal(buildSceneMediaExportFingerprintKey(scene), "placeholder");
});

test("Mixed story — video and image media keys differ and both invalidate", () => {
  const mixed = baseScript([
    baseScene({
      id: "img",
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    }),
    baseScene({
      id: "vid",
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 3000,
        trimStartMs: 0,
        trimEndMs: 3000,
        muted: true,
      },
    }),
  ]);

  const changedVideo = {
    ...mixed,
    scenes: [
      mixed.scenes[0]!,
      {
        ...mixed.scenes[1]!,
        media: {
          ...mixed.scenes[1]!.media!,
          url: "blob:v2",
        },
      },
    ],
  };

  const changedImage = {
    ...mixed,
    scenes: [
      {
        ...mixed.scenes[0]!,
        media: {
          ...mixed.scenes[0]!.media!,
          url: "https://example.com/b.jpg",
        },
      },
      mixed.scenes[1]!,
    ],
  };

  assert.notEqual(fingerprint(mixed), fingerprint(changedVideo));
  assert.notEqual(fingerprint(mixed), fingerprint(changedImage));
});

test("Fit mode and transform changes invalidate export", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    }),
  ]);

  const fitChanged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: { ...base.scenes[0]!.media!, fitMode: "contain" as const },
      },
    ],
  };

  const transformChanged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: {
          ...base.scenes[0]!.media!,
          transform: { x: 20, y: 0, scale: 1.5, rotation: 0 },
        },
      },
    ],
  };

  assert.notEqual(fingerprint(base), fingerprint(fitChanged));
  assert.notEqual(fingerprint(base), fingerprint(transformChanged));
});

test("Image motion change invalidates export", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        imageMotion: { type: "none", intensity: "subtle" },
      },
    }),
  ]);

  const next = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: {
          ...base.scenes[0]!.media!,
          imageMotion: { type: "zoom-in" as const, intensity: "strong" as const },
        },
      },
    ],
  };

  assert.notEqual(fingerprint(base), fingerprint(next));
});

test("Shared media.motion change invalidates export", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "video",
        url: "https://example.com/a.mp4",
        durationMs: 5000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        motion: {
          version: 1,
          enabled: true,
          presetId: "static",
          intensity: 0,
        },
      },
    }),
  ]);

  const next = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        media: {
          ...base.scenes[0]!.media!,
          motion: {
            version: 1 as const,
            enabled: true,
            presetId: "slow-zoom-in",
            intensity: 1.25,
            easing: "ease-out" as const,
          },
        },
      },
    ],
  };

  assert.notEqual(fingerprint(base), fingerprint(next));
});

test("Caption layout / style / animation edits do not invalidate fingerprint", () => {
  const base = baseScript([
    baseScene({
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        fitMode: "cover",
      },
      captionLayout: { x: 0.5, y: 0.8, scale: 1 },
    }),
  ]);

  const layoutChanged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        captionLayout: { x: 0.4, y: 0.7, scale: 1.2 },
      },
    ],
  };

  const styleChanged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        captionStyle: { fontSize: 42, color: "#ff0000" } as FootieScene["captionStyle"],
      },
    ],
  };

  const animationChanged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        captionAnimation: { type: "fade" } as FootieScene["captionAnimation"],
      },
    ],
  };

  assert.equal(fingerprint(base), fingerprint(layoutChanged));
  assert.equal(fingerprint(base), fingerprint(styleChanged));
  assert.equal(fingerprint(base), fingerprint(animationChanged));
});

test("Fingerprint module uses getSceneMedia — no direct scene.image media key", () => {
  const source = readSrc("src/components/export/build-export-fingerprint.utils.ts");
  assert.match(source, /getSceneMedia/);
  assert.match(source, /buildSceneMediaExportFingerprintKey/);
  assert.doesNotMatch(source, /scene\.image\s*\?/);
  assert.doesNotMatch(source, /scene\.uploadedImage/);
});

console.log(`\nexport-fingerprint: ${passed} passed`);
