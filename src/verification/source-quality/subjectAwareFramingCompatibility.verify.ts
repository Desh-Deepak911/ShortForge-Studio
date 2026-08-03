/**
 * Subject-aware framing compatibility / no-manifest / capability isolation.
 * Run via: npm run test:subject-aware-framing
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildManualSubjectFocusFromGrid,
  setSubjectFocus,
} from "@/features/source-quality";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
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

function landscapeMedia(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/landscape.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function singleScene(media: SceneMedia): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Narration line.",
    media,
  };
}

function main(): void {
  console.log("\nSubject-aware framing compatibility\n");

  test("ExportManifest has no subject-aware field", () => {
    const manifest = readSrc(
      "src/features/export/domain/export-manifest.types.ts",
    );
    assert.doesNotMatch(manifest, /subjectFocus|subjectAware|subject-aware/);
  });

  test("metadata alone does not require ExportManifest v5 capability", () => {
    const capability = readSrc(
      "src/features/visual-retention/domain/subject-aware-reframing-capability.ts",
    );
    assert.doesNotMatch(capability, /EXPORT_MANIFEST_V5|requiredCapabilities/);
    assert.match(capability, /must not be inferred from source-quality/i);
  });

  test("subjectFocus normalize round-trips and strips malformed provenance", () => {
    const focus = buildManualSubjectFocusFromGrid("middle-right")!;
    const media = normalizeSceneMedia({
      ...landscapeMedia(),
      subjectFocus: focus,
      subjectAwareFramingProvenance: {
        version: 1,
        mediaFingerprint: "abc",
        mediaItemId: null,
        focusFingerprint: "def",
        recommendationFingerprint: "ghi",
        generatorVersion: 1,
        previousFraming: {
          fitMode: "fill",
          positionX: 0,
          positionY: 0,
          zoom: 1,
          rotationDeg: 0,
        },
        appliedFraming: {
          fitMode: "fill",
          positionX: 10,
          positionY: 20,
          zoom: 1,
          rotationDeg: 0,
        },
        subjectFocus: focus,
      },
    });
    assert.ok(media?.subjectFocus);
    assert.ok(media?.subjectAwareFramingProvenance);
    assert.equal(media!.subjectFocus!.source, "manual");

    const bad = normalizeSceneMedia({
      ...landscapeMedia(),
      subjectAwareFramingProvenance: {
        version: 1,
        mediaFingerprint: "abc",
      },
    });
    assert.equal(bad?.subjectAwareFramingProvenance, undefined);
  });

  test("set focus does not invent ExportManifest or renderer capability writes", () => {
    const result = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("center"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, true);
    const commands = readSrc(
      "src/features/source-quality/editor/subject-aware-framing.commands.ts",
    );
    assert.doesNotMatch(commands, /buildExportManifest|requiredCapabilities/);
    assert.doesNotMatch(commands, /brandSting|engagementOverlay|keyframes/);
  });

  test("no second capability fetch introduced for subject-aware", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.equal(
      (
        provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ??
        []
      ).length,
      1,
    );
    assert.match(provider, /useSubjectAwareReframingEnabled/);

    const summary = readSrc(
      "src/features/source-quality/editor/SourceQualitySummary.tsx",
    );
    assert.doesNotMatch(summary, /fetch\(/);
  });

  test("preview/export/headless paths ignore subjectFocus metadata fields", () => {
    const roots = [
      "src/features/export",
      "src/features/preview",
      "src/features/headless-renderer",
    ];
    for (const root of roots) {
      const full = path.join(process.cwd(), root);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const file of walkFiles(full)) {
        const rel = path.relative(process.cwd(), file);
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /subjectFocus|subjectAwareFramingProvenance/,
          `${rel} must not consume subject-aware authoring metadata`,
        );
      }
    }
  });

  test("story owns subject-focus types without importing source-quality for them", () => {
    const leaf = readSrc("src/features/story/types/subject-focus.types.ts");
    assert.doesNotMatch(leaf, /from ["']@\/features\/source-quality/);
    assert.doesNotMatch(leaf, /from ["']\.\.\/\.\.\/source-quality/);
    const storyTypes = readSrc("src/features/story/types/story.types.ts");
    assert.match(storyTypes, /subject-focus\.types/);
    assert.match(storyTypes, /subjectFocus\?:/);
    assert.match(storyTypes, /subjectAwareFramingProvenance\?:/);
  });

  test("filenames are responsibility-based without sprint markers", () => {
    const files = [
      "src/features/source-quality/domain/subject-focus.ts",
      "src/features/source-quality/domain/subject-focus-framing-suggestion.ts",
      "src/features/source-quality/domain/evaluate-subject-framing-staleness.ts",
      "src/features/source-quality/editor/subject-aware-framing.commands.ts",
      "src/features/source-quality/editor/SubjectAwareFramingControls.tsx",
      "src/features/source-quality/editor/SubjectFocusPicker.tsx",
      "src/features/story/types/subject-focus.types.ts",
    ];
    for (const file of files) {
      assert.doesNotMatch(file, /sprint|phase|12[A-Z]|hardening|final/i);
      assert.ok(statSync(path.join(process.cwd(), file)).isFile());
    }
  });

  test("pure suggestion domain has no provider/browser/network import", () => {
    const suggestion = readSrc(
      "src/features/source-quality/domain/subject-focus-framing-suggestion.ts",
    );
    const focus = readSrc(
      "src/features/source-quality/domain/subject-focus.ts",
    );
    const staleness = readSrc(
      "src/features/source-quality/domain/evaluate-subject-framing-staleness.ts",
    );
    for (const src of [suggestion, focus, staleness]) {
      assert.doesNotMatch(src, /from ["']react["']/);
      assert.doesNotMatch(src, /from ["']react-dom["']/);
      assert.doesNotMatch(src, /\bfetch\s*\(/);
      assert.doesNotMatch(src, /XMLHttpRequest|WebSocket/);
      assert.doesNotMatch(src, /from ["']@\/features\/export/);
      assert.doesNotMatch(src, /from ["']@\/features\/preview/);
      assert.doesNotMatch(src, /from ["']@\/features\/headless/);
      assert.doesNotMatch(src, /openai|anthropic|FaceDetector/i);
      assert.doesNotMatch(src, /window\.|document\./);
    }
  });

  test("commands dual-write sequence items and never recreate deleted targets", () => {
    const commands = readSrc(
      "src/features/source-quality/editor/subject-aware-framing.commands.ts",
    );
    assert.match(commands, /writeMixedMediaSequenceItems/);
    assert.match(commands, /updateSceneMediaItemMedia/);
    assert.match(commands, /!items\.some\(\(item\) => item\.id === mediaItemId\)/);
    assert.match(commands, /return null/);
    assert.doesNotMatch(commands, /sourceQualityAdjustmentProvenance:\s*undefined/);
  });

  test("existing projects without subject provenance remain openable", () => {
    const media = normalizeSceneMedia(landscapeMedia());
    assert.ok(media);
    assert.equal(media!.subjectFocus, undefined);
    assert.equal(media!.subjectAwareFramingProvenance, undefined);
  });

  console.log(`\n${passed} passed\n`);
}

main();
