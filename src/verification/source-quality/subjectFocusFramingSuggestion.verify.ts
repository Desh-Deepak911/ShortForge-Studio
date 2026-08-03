/**
 * Subject-focus framing suggestion + normalize + fingerprint verification.
 * Run via: npm run test:subject-aware-framing
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
  SUBJECT_FOCUS_GRID_OPTIONS,
  SUBJECT_FOCUS_SAFE_REGION_INSET,
  buildManualSubjectFocusFromGrid,
  buildSubjectFocusFramingSuggestion,
  fingerprintSubjectFocus,
  normalizeSceneMediaSubjectAwareFramingProvenance,
  normalizeSceneMediaSubjectFocus,
  projectSubjectFocusIntoFrame,
} from "@/features/source-quality";
import type { SceneMedia } from "@/features/story/types";
import {
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function landscapeMedia(
  options: {
    readonly x?: number;
    readonly y?: number;
    readonly scale?: number;
    readonly fitMode?: "cover" | "contain";
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/landscape.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
    fitMode: options.fitMode ?? "cover",
    transform: {
      x: options.x ?? 0,
      y: options.y ?? 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function framingOf(media: SceneMedia) {
  return {
    fitMode: (media.fitMode === "contain" ? "fit" : "fill") as "fit" | "fill",
    positionX: media.transform?.x ?? 0,
    positionY: media.transform?.y ?? 0,
    zoom: media.transform?.scale ?? 1,
    rotationDeg: media.transform?.rotation ?? 0,
  };
}

function main(): void {
  console.log("\nSubject-focus framing suggestion\n");

  test("normalizeSceneMediaSubjectFocus is fail-closed", () => {
    assert.equal(normalizeSceneMediaSubjectFocus(null), undefined);
    assert.equal(normalizeSceneMediaSubjectFocus({ version: 2 }), undefined);
    assert.equal(
      normalizeSceneMediaSubjectFocus({
        version: 1,
        centerX: 0.5,
        centerY: 1.5,
        source: "manual",
      }),
      undefined,
    );
    const ok = normalizeSceneMediaSubjectFocus({
      version: 1,
      centerX: 0.25,
      centerY: 0.75,
      source: "manual",
      width: 0.2,
    });
    assert.ok(ok);
    assert.equal(ok.centerX, 0.25);
    assert.equal(ok.width, 0.2);

    const media = normalizeSceneMedia({
      type: "image",
      url: "https://example.com/a.jpg",
      subjectFocus: { version: 1, centerX: 2, centerY: 0.5, source: "manual" },
      subjectAwareFramingProvenance: { version: 1, bogus: true },
    });
    assert.ok(media);
    assert.equal(media.subjectFocus, undefined);
    assert.equal(media.subjectAwareFramingProvenance, undefined);
  });

  test("3×3 grid covers nine named positions", () => {
    assert.equal(SUBJECT_FOCUS_GRID_OPTIONS.length, 9);
    const labels = SUBJECT_FOCUS_GRID_OPTIONS.map((o) => o.label);
    assert.ok(labels.includes("Top left"));
    assert.ok(labels.includes("Center"));
    assert.ok(labels.includes("Bottom right"));
    for (const option of SUBJECT_FOCUS_GRID_OPTIONS) {
      const focus = buildManualSubjectFocusFromGrid(option.id);
      assert.ok(focus);
      assert.equal(focus.source, "manual");
      assert.equal(focus.centerX, option.centerX);
      assert.equal(focus.centerY, option.centerY);
    }
  });

  test("safe-region inset is documented central ~70%", () => {
    assert.equal(SUBJECT_FOCUS_SAFE_REGION_INSET, 0.15);
    assert.ok(1 - 2 * SUBJECT_FOCUS_SAFE_REGION_INSET === 0.7);
  });

  test("unknown dimensions / missing focus → unavailable non-terminal", () => {
    const media = landscapeMedia();
    delete (media as { width?: number }).width;
    const noDims = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framingOf(media),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
    });
    assert.equal(noDims.available, false);
    assert.equal(noDims.unavailableReason, "UNKNOWN_DIMENSIONS");

    const noFocus = buildSubjectFocusFramingSuggestion({
      media: landscapeMedia(),
      currentFraming: framingOf(landscapeMedia()),
      subjectFocus: undefined,
    });
    assert.equal(noFocus.available, false);
    assert.equal(noFocus.unavailableReason, "NO_SUBJECT_FOCUS");
  });

  test("landscape top-left focus suggests framing into safe region", () => {
    const media = landscapeMedia();
    const focus = buildManualSubjectFocusFromGrid("top-left")!;
    const current = framingOf(media);
    const before = projectSubjectFocusIntoFrame({
      centerX: focus.centerX,
      centerY: focus.centerY,
      sourceWidth: 1920,
      sourceHeight: 1080,
      framing: current,
    });
    assert.ok(
      before.frameX < 1080 * SUBJECT_FOCUS_SAFE_REGION_INSET ||
        before.frameY < 1920 * SUBJECT_FOCUS_SAFE_REGION_INSET,
    );

    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      mediaItemId: null,
      currentFraming: current,
      subjectFocus: focus,
    });
    assert.equal(suggestion.available, true);
    assert.ok(
      suggestion.proposedFramingPatch.fitMode != null ||
        suggestion.proposedFramingPatch.positionX != null ||
        suggestion.proposedFramingPatch.positionY != null ||
        suggestion.proposedFramingPatch.zoom != null,
    );
    assert.equal(suggestion.projectedFraming.rotationDeg, 0);
    const after = projectSubjectFocusIntoFrame({
      centerX: focus.centerX,
      centerY: focus.centerY,
      sourceWidth: 1920,
      sourceHeight: 1080,
      framing: {
        fitMode: suggestion.projectedFraming.fitMode,
        positionX: suggestion.projectedFraming.positionX,
        positionY: suggestion.projectedFraming.positionY,
        zoom: suggestion.projectedFraming.zoom,
        rotationDeg: suggestion.projectedFraming.rotationDeg,
      },
    });
    assert.ok(after.frameX >= 1080 * SUBJECT_FOCUS_SAFE_REGION_INSET - 1e-6);
    assert.ok(
      after.frameX <= 1080 * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET) + 1e-6,
    );
    assert.ok(after.frameY >= 1920 * SUBJECT_FOCUS_SAFE_REGION_INSET - 1e-6);
    assert.ok(
      after.frameY <= 1920 * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET) + 1e-6,
    );
  });

  test("all nine grid positions produce deterministic fingerprints", () => {
    const media = landscapeMedia();
    const current = framingOf(media);
    const fingerprints = new Set<string>();
    for (const option of SUBJECT_FOCUS_GRID_OPTIONS) {
      const focus = buildManualSubjectFocusFromGrid(option.id)!;
      const suggestion = buildSubjectFocusFramingSuggestion({
        media,
        currentFraming: current,
        subjectFocus: focus,
        generatorVersion: SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
      });
      fingerprints.add(suggestion.recommendationFingerprint);
      const again = buildSubjectFocusFramingSuggestion({
        media,
        currentFraming: current,
        subjectFocus: focus,
        generatorVersion: SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
      });
      assert.equal(
        again.recommendationFingerprint,
        suggestion.recommendationFingerprint,
      );
      assert.equal(fingerprintSubjectFocus(focus), suggestion.focusFingerprint);
    }
    assert.equal(fingerprints.size, 9);
  });

  test("center focus on exact 9:16 fill is already in safe region", () => {
    const media: SceneMedia = {
      type: "image",
      url: "https://example.com/portrait.jpg",
      source: "upload",
      width: 1080,
      height: 1920,
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    };
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framingOf(media),
      subjectFocus: buildManualSubjectFocusFromGrid("center"),
    });
    assert.equal(suggestion.available, false);
    assert.equal(suggestion.unavailableReason, "ALREADY_IN_SAFE_REGION");
  });

  test("rotation-aware projection accounts for 0/90/180/270/non-right angles", () => {
    const media = landscapeMedia();
    const focus = buildManualSubjectFocusFromGrid("top-left")!;
    const angles = [0, 90, 180, 270, 33.3];
    const points = angles.map((rotationDeg) =>
      projectSubjectFocusIntoFrame({
        centerX: focus.centerX,
        centerY: focus.centerY,
        sourceWidth: 1920,
        sourceHeight: 1080,
        framing: {
          fitMode: "fill",
          positionX: 0,
          positionY: 0,
          zoom: 1,
          rotationDeg,
        },
      }),
    );
    // Rotations must change the projected point (not orientation AABB alone).
    assert.notEqual(points[0]!.frameX, points[1]!.frameX);
    assert.notEqual(points[0]!.frameY, points[2]!.frameY);
    assert.notDeepEqual(points[0], points[4]);

    for (const rotationDeg of angles) {
      const suggestion = buildSubjectFocusFramingSuggestion({
        media: {
          ...media,
          transform: { x: 0, y: 0, scale: 1, rotation: rotationDeg },
        },
        currentFraming: {
          fitMode: "fill",
          positionX: 0,
          positionY: 0,
          zoom: 1,
          rotationDeg,
        },
        subjectFocus: focus,
      });
      assert.equal(suggestion.projectedFraming.rotationDeg, rotationDeg);
      if (suggestion.available) {
        const landed = projectSubjectFocusIntoFrame({
          centerX: focus.centerX,
          centerY: focus.centerY,
          sourceWidth: 1920,
          sourceHeight: 1080,
          framing: {
            fitMode: suggestion.projectedFraming.fitMode,
            positionX: suggestion.projectedFraming.positionX,
            positionY: suggestion.projectedFraming.positionY,
            zoom: suggestion.projectedFraming.zoom,
            rotationDeg: suggestion.projectedFraming.rotationDeg,
          },
        });
        assert.ok(landed.frameX >= 1080 * SUBJECT_FOCUS_SAFE_REGION_INSET - 1e-6);
        assert.ok(
          landed.frameX <= 1080 * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET) + 1e-6,
        );
        assert.ok(landed.frameY >= 1920 * SUBJECT_FOCUS_SAFE_REGION_INSET - 1e-6);
        assert.ok(
          landed.frameY <= 1920 * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET) + 1e-6,
        );
      }
    }
  });

  test("fit mode with focus already visible does not invent movement", () => {
    const media: SceneMedia = {
      type: "image",
      url: "https://example.com/portrait.jpg",
      source: "upload",
      width: 1080,
      height: 1920,
      fitMode: "contain",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    };
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: {
        fitMode: "fit",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
      subjectFocus: buildManualSubjectFocusFromGrid("center"),
    });
    assert.equal(suggestion.available, false);
    assert.equal(suggestion.unavailableReason, "ALREADY_IN_SAFE_REGION");
    assert.deepEqual(suggestion.proposedFramingPatch, {});
  });

  test("prefer pan under fill before Fit when pan alone lands", () => {
    const media = landscapeMedia();
    const focus = buildManualSubjectFocusFromGrid("top-left")!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framingOf(media),
      subjectFocus: focus,
    });
    assert.equal(suggestion.available, true);
    // Pan-first policy: when reposition lands, do not force Fit.
    assert.equal(suggestion.proposedFramingPatch.fitMode, undefined);
    assert.ok(
      suggestion.proposedFramingPatch.positionX != null ||
        suggestion.proposedFramingPatch.positionY != null,
    );
  });

  test("suggested reposition stays in reference-frame units (720p/1080p/4K coherent)", () => {
    const media = landscapeMedia();
    const focus = buildManualSubjectFocusFromGrid("top-left")!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framingOf(media),
      subjectFocus: focus,
    });
    assert.equal(suggestion.available, true);
    const { positionX, positionY, zoom } = suggestion.projectedFraming;
    // Framing coordinates are reference-frame units (1080×1920), not export pixels.
    assert.ok(Math.abs(positionX) <= SCENE_IMAGE_REFERENCE_WIDTH);
    assert.ok(Math.abs(positionY) <= SCENE_IMAGE_REFERENCE_HEIGHT);
    assert.ok(zoom > 0 && zoom <= 4);
    const landed = projectSubjectFocusIntoFrame({
      centerX: focus.centerX,
      centerY: focus.centerY,
      sourceWidth: 1920,
      sourceHeight: 1080,
      framing: suggestion.projectedFraming,
    });
    assert.ok(landed.frameX >= 0 && landed.frameX <= SCENE_IMAGE_REFERENCE_WIDTH);
    assert.ok(
      landed.frameY >= 0 && landed.frameY <= SCENE_IMAGE_REFERENCE_HEIGHT,
    );
  });

  test("provenance normalize requires explicit mediaItemId and valid fingerprints", () => {
    const focus = buildManualSubjectFocusFromGrid("center")!;
    const framing = {
      fitMode: "fill" as const,
      positionX: 0,
      positionY: 0,
      zoom: 1,
      rotationDeg: 0,
    };
    const base = {
      version: 1 as const,
      mediaFingerprint: "media-fp",
      focusFingerprint: "focus-fp",
      recommendationFingerprint: "rec-fp",
      generatorVersion: 1,
      previousFraming: framing,
      appliedFraming: framing,
      subjectFocus: focus,
    };
    assert.ok(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: null,
      }),
    );
    assert.ok(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: "item-1",
      }),
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance(base),
      undefined,
      "missing mediaItemId key must be invalid",
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: "",
      }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: 12,
      }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: null,
        mediaFingerprint: "",
      }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: null,
        generatorVersion: 1.5,
      }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaSubjectAwareFramingProvenance({
        ...base,
        mediaItemId: null,
        previousFraming: { fitMode: "fill", positionX: 0 },
      }),
      undefined,
    );
  });

  test("suggestion module stays pure — no network / Date / Math.random / browser", () => {
    const src = readSrc(
      "src/features/source-quality/domain/subject-focus-framing-suggestion.ts",
    );
    assert.doesNotMatch(src, /\bfetch\b/);
    assert.doesNotMatch(src, /\bDate\b/);
    assert.doesNotMatch(src, /Math\.random/);
    assert.doesNotMatch(src, /\bcrypto\b/);
    assert.doesNotMatch(src, /\bopenai\b|\banthropic\b/i);
    assert.doesNotMatch(src, /\bFaceDetector\b|\bcreateDetector\b/);
    assert.doesNotMatch(src, /from ["']react["']/);
    assert.doesNotMatch(src, /window\.|document\.|HTMLImageElement|Image\(/);
    assert.doesNotMatch(src, /from ["']@\/features\/export/);
    assert.doesNotMatch(src, /from ["']@\/features\/preview/);
    assert.doesNotMatch(src, /from ["']@\/features\/headless/);
    assert.doesNotMatch(src, /from ["']openai["']|from ["']@anthropic/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
