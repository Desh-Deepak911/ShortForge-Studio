/**
 * Subject-aware Apply / Undo / Keep / set-clear + staleness verification.
 * Run via: npm run test:subject-aware-framing
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applySubjectAwareFramingSuggestion,
  buildManualSubjectFocusFromGrid,
  buildSubjectFocusFramingSuggestion,
  clearSubjectFocus,
  evaluateSubjectFramingStaleness,
  keepOrDismissSubjectAwareFraming,
  setSubjectFocus,
  undoSubjectAwareFraming,
} from "@/features/source-quality";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";

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
    readonly url?: string;
    readonly x?: number;
    readonly y?: number;
    readonly scale?: number;
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/landscape.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
    fitMode: "cover",
    transform: {
      x: options.x ?? 0,
      y: options.y ?? 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
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
    image: {
      url: media.url!,
      fitMode: "fill",
      x: media.transform?.x ?? 0,
      y: media.transform?.y ?? 0,
      scale: media.transform?.scale ?? 1,
      rotation: media.transform?.rotation ?? 0,
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as object)) {
      deepFreeze(child);
    }
  }
  return value;
}

function main(): void {
  console.log("\nSubject-aware framing commands\n");

  test("setSubjectFocus writes metadata only; clear removes focus + provenance", () => {
    const scene = singleScene(landscapeMedia());
    const framingBefore = resolveSceneMediaFraming(scene);
    const focus = buildManualSubjectFocusFromGrid("top-right")!;
    const set = setSubjectFocus({
      scene: deepFreeze(structuredClone(scene)),
      subjectFocus: focus,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(set.ok, true);
    if (!set.ok) return;
    const media = getSceneMedia(set.scene)!;
    assert.deepEqual(media.subjectFocus, focus);
    const framingAfter = resolveSceneMediaFraming(set.scene);
    assert.equal(framingAfter.positionX, framingBefore.positionX);
    assert.equal(framingAfter.positionY, framingBefore.positionY);
    assert.equal(framingAfter.zoom, framingBefore.zoom);

    const cleared = clearSubjectFocus({
      scene: set.scene,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(getSceneMedia(cleared.scene)?.subjectFocus, undefined);
  });

  test("capability off refuses subject commands and leaves framing", () => {
    const scene = singleScene(landscapeMedia());
    const result = setSubjectFocus({
      scene,
      subjectFocus: buildManualSubjectFocusFromGrid("center"),
      subjectAwareReframingEnabled: false,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SUBJECT_AWARE_CAPABILITY_OFF");
    assert.equal(getSceneMedia(result.scene)?.subjectFocus, undefined);
  });

  test("Apply / Undo restores exact previous framing; Keep strips provenance", () => {
    let scene = singleScene(landscapeMedia());
    const focus = buildManualSubjectFocusFromGrid("top-left")!;
    const focused = setSubjectFocus({
      scene,
      subjectFocus: focus,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(focused.ok, true);
    if (!focused.ok) return;
    scene = focused.scene;

    const media = getSceneMedia(scene)!;
    const framing = resolveSceneMediaFraming(scene);
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framing,
      subjectFocus: media.subjectFocus,
    });
    assert.equal(suggestion.available, true);

    const applied = applySubjectAwareFramingSuggestion({
      scene: deepFreeze(structuredClone(scene)),
      suggestion,
      expectedRecommendationFingerprint: suggestion.recommendationFingerprint,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const appliedMedia = getSceneMedia(applied.scene)!;
    assert.ok(appliedMedia.subjectAwareFramingProvenance);
    assert.equal(
      appliedMedia.subjectAwareFramingProvenance!.previousFraming.positionX,
      framing.positionX,
    );
    assert.equal(
      appliedMedia.subjectAwareFramingProvenance!.previousFraming.fitMode,
      framing.fitMode,
    );
    const appliedFraming = resolveSceneMediaFraming(applied.scene);
    assert.ok(
      appliedFraming.fitMode !== framing.fitMode ||
        appliedFraming.positionX !== framing.positionX ||
        appliedFraming.positionY !== framing.positionY ||
        appliedFraming.zoom !== framing.zoom,
      "Apply must change ordinary framing",
    );

    const undone = undoSubjectAwareFraming({
      scene: applied.scene,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    const restored = resolveSceneMediaFraming(undone.scene);
    assert.equal(restored.positionX, framing.positionX);
    assert.equal(restored.positionY, framing.positionY);
    assert.equal(restored.zoom, framing.zoom);
    assert.equal(
      getSceneMedia(undone.scene)?.subjectAwareFramingProvenance,
      undefined,
    );
    assert.ok(getSceneMedia(undone.scene)?.subjectFocus);

    // Re-apply then Keep
    const reapplied = applySubjectAwareFramingSuggestion({
      scene: undone.scene,
      suggestion: buildSubjectFocusFramingSuggestion({
        media: getSceneMedia(undone.scene),
        currentFraming: resolveSceneMediaFraming(undone.scene),
        subjectFocus: getSceneMedia(undone.scene)?.subjectFocus,
      }),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(reapplied.ok, true);
    if (!reapplied.ok) return;
    const kept = keepOrDismissSubjectAwareFraming({
      scene: reapplied.scene,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(kept.ok, true);
    if (!kept.ok) return;
    assert.equal(
      getSceneMedia(kept.scene)?.subjectAwareFramingProvenance,
      undefined,
    );
    assert.deepEqual(
      resolveSceneMediaFraming(kept.scene),
      resolveSceneMediaFraming(reapplied.scene),
    );
  });

  test("staleness reasons cover media/focus/framing/recommendation/provenance", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("bottom-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const scene = setResult.scene;
    const media = getSceneMedia(scene)!;
    const framing = resolveSceneMediaFraming(scene);
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framing,
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const fresh = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(applied.scene)?.subjectAwareFramingProvenance,
      media: getSceneMedia(applied.scene),
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.equal(fresh.effectiveStatus, "applied");
    assert.equal(fresh.undoAllowed, true);

    const focusChangedMedia = {
      ...getSceneMedia(applied.scene)!,
      subjectFocus: buildManualSubjectFocusFromGrid("center")!,
    };
    const focusStale = evaluateSubjectFramingStaleness({
      provenance: focusChangedMedia.subjectAwareFramingProvenance,
      media: focusChangedMedia,
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.ok(focusStale.reasons.includes("SUBJECT_FOCUS_CHANGED"));
    assert.equal(focusStale.undoAllowed, false);

    const framingChanged = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(applied.scene)?.subjectAwareFramingProvenance,
      media: getSceneMedia(applied.scene),
      framing: {
        ...resolveSceneMediaFraming(applied.scene),
        positionX: 123,
      },
      mediaItemId: null,
    });
    assert.ok(framingChanged.reasons.includes("FRAMING_CHANGED"));

    const mediaChanged = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(applied.scene)?.subjectAwareFramingProvenance,
      media: {
        ...getSceneMedia(applied.scene)!,
        url: "https://example.com/other.jpg",
      },
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.ok(mediaChanged.reasons.includes("MEDIA_CHANGED"));

    const invalid = evaluateSubjectFramingStaleness({
      provenance: { version: 1, broken: true },
      media: getSceneMedia(applied.scene),
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.equal(invalid.effectiveStatus, "invalid");
    assert.ok(invalid.reasons.includes("PROVENANCE_INVALID"));

    const itemMismatch = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(applied.scene)?.subjectAwareFramingProvenance,
      media: getSceneMedia(applied.scene),
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: "other-item",
    });
    assert.ok(itemMismatch.reasons.includes("MEDIA_ITEM_CHANGED"));
  });

  test("mixed-media Apply targets winning item via dual-write path", () => {
    let scene = singleScene(landscapeMedia({ url: "https://example.com/a.jpg" }));
    scene = appendMixedMediaSequenceItem(
      scene,
      landscapeMedia({ url: "https://example.com/b.jpg" }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
    ).scene;
    scene = appendMixedMediaSequenceItem(
      scene,
      landscapeMedia({ url: "https://example.com/c.jpg" }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-c" },
    ).scene;
    const items = readMixedMediaSequenceItems(scene);
    assert.ok(items.length >= 2);
    const targetId = "item-c";
    assert.ok(items.some((item) => item.id === targetId));

    const focused = setSubjectFocus({
      scene,
      mediaItemId: targetId,
      subjectFocus: buildManualSubjectFocusFromGrid("top-right"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(focused.ok, true);
    if (!focused.ok) return;
    const targetMedia = readMixedMediaSequenceItems(focused.scene).find(
      (item) => item.id === targetId,
    )!.media;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media: targetMedia,
      mediaItemId: targetId,
      currentFraming: resolveSceneMediaFraming(
        { media: targetMedia },
        { media: targetMedia },
      ),
      subjectFocus: targetMedia.subjectFocus,
    });
    assert.equal(suggestion.available, true);
    const applied = applySubjectAwareFramingSuggestion({
      scene: focused.scene,
      mediaItemId: targetId,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const after = readMixedMediaSequenceItems(applied.scene).find(
      (item) => item.id === targetId,
    )!.media;
    assert.ok(after.subjectAwareFramingProvenance);
    assert.equal(after.subjectAwareFramingProvenance!.mediaItemId, targetId);
  });

  test("narration-only scene edits do not stale subject provenance", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const framing = resolveSceneMediaFraming(setResult.scene);
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framing,
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const narrated = {
      ...applied.scene,
      narration: "Completely different narration that should not matter.",
      subtitle: "Other subtitle",
    };
    const staleness = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(narrated)?.subjectAwareFramingProvenance,
      media: getSceneMedia(narrated),
      framing: resolveSceneMediaFraming(narrated),
      mediaItemId: null,
    });
    assert.equal(staleness.effectiveStatus, "applied");
    assert.equal(staleness.reasons.length, 0);
  });

  test("fingerprint-only Apply is refused with zero mutation", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const scene = deepFreeze(structuredClone(setResult.scene));
    const media = getSceneMedia(scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(scene),
      subjectFocus: media.subjectFocus,
    });
    const framingBefore = resolveSceneMediaFraming(scene);
    const result = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: undefined,
      expectedRecommendationFingerprint: suggestion.recommendationFingerprint,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE");
    assert.deepEqual(resolveSceneMediaFraming(scene), framingBefore);
    assert.equal(scene.media?.subjectAwareFramingProvenance, undefined);
  });

  test("altered patch with copied valid fingerprint is refused", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const scene = setResult.scene;
    const media = getSceneMedia(scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(scene),
      subjectFocus: media.subjectFocus,
    });
    assert.equal(suggestion.available, true);
    const forged = {
      ...suggestion,
      proposedFramingPatch: { positionX: 999, positionY: 999, zoom: 3 },
    };
    const framingBefore = resolveSceneMediaFraming(scene);
    const result = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forged,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SUBJECT_AWARE_SUGGESTION_INVALID");
    assert.deepEqual(resolveSceneMediaFraming(scene), framingBefore);
    assert.equal(scene.media?.subjectAwareFramingProvenance, undefined);
  });

  test("forged media fingerprint / applicability / item identity refused", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const scene = setResult.scene;
    const media = getSceneMedia(scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      mediaItemId: null,
      currentFraming: resolveSceneMediaFraming(scene),
      subjectFocus: media.subjectFocus,
    });

    const forgedMediaFp = {
      ...suggestion,
      mediaFingerprint: "forged-media-fp",
    };
    const mediaFpResult = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forgedMediaFp,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(mediaFpResult.ok, false);
    if (!mediaFpResult.ok) {
      assert.equal(mediaFpResult.terminalCode, "SUBJECT_AWARE_SUGGESTION_INVALID");
    }

    const forgedFocusFp = {
      ...suggestion,
      focusFingerprint: "forged-focus-fp",
    };
    const focusFpResult = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forgedFocusFp,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(focusFpResult.ok, false);
    if (!focusFpResult.ok) {
      assert.equal(focusFpResult.terminalCode, "SUBJECT_AWARE_SUGGESTION_INVALID");
    }

    const forgedAvailable = { ...suggestion, available: false };
    const availableResult = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forgedAvailable,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(availableResult.ok, false);
    if (!availableResult.ok) {
      assert.equal(
        availableResult.terminalCode,
        "SUBJECT_AWARE_SUGGESTION_INVALID",
      );
    }

    const forgedProjected = {
      ...suggestion,
      projectedFraming: {
        ...suggestion.projectedFraming,
        positionX: suggestion.projectedFraming.positionX + 50,
      },
    };
    const projectedResult = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forgedProjected,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(projectedResult.ok, false);
    if (!projectedResult.ok) {
      assert.equal(
        projectedResult.terminalCode,
        "SUBJECT_AWARE_SUGGESTION_INVALID",
      );
    }

    const forgedItem = { ...suggestion, mediaItemId: "other-item" };
    const itemResult = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: forgedItem,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(itemResult.ok, false);
    if (!itemResult.ok) {
      assert.equal(itemResult.terminalCode, "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH");
    }

    // Apply executes canonical framing — forged summary alone must not mutate path.
    const withForgedSummary = { ...suggestion, summary: "forged summary copy" };
    const appliedCanonical = applySubjectAwareFramingSuggestion({
      scene,
      suggestion: withForgedSummary,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(appliedCanonical.ok, true);
    if (appliedCanonical.ok) {
      assert.equal(
        getSceneMedia(appliedCanonical.scene)?.subjectAwareFramingProvenance
          ?.recommendationFingerprint,
        suggestion.recommendationFingerprint,
      );
      assert.deepEqual(
        {
          fitMode: resolveSceneMediaFraming(appliedCanonical.scene).fitMode,
          positionX: resolveSceneMediaFraming(appliedCanonical.scene).positionX,
          positionY: resolveSceneMediaFraming(appliedCanonical.scene).positionY,
          zoom: resolveSceneMediaFraming(appliedCanonical.scene).zoom,
        },
        {
          fitMode: suggestion.projectedFraming.fitMode,
          positionX: suggestion.projectedFraming.positionX,
          positionY: suggestion.projectedFraming.positionY,
          zoom: suggestion.projectedFraming.zoom,
        },
      );
    }
  });

  test("stale expected fingerprint is refused", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(setResult.scene),
      subjectFocus: media.subjectFocus,
    });
    const result = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      expectedRecommendationFingerprint: "stale-expected-fingerprint",
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SUBJECT_AWARE_SUGGESTION_STALE");
  });

  test("capability omitted/false refuses at command boundary", () => {
    const scene = singleScene(landscapeMedia());
    for (const enabled of [false, undefined] as const) {
      const result = setSubjectFocus({
        scene,
        subjectFocus: buildManualSubjectFocusFromGrid("center"),
        subjectAwareReframingEnabled: enabled as unknown as boolean,
        mixedMediaScenesEnabled: false,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.terminalCode, "SUBJECT_AWARE_CAPABILITY_OFF");
      }
    }
  });

  test("Clear focus never silently undoes framing; preserves SQ provenance", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(setResult.scene),
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const withSq = {
      ...applied.scene,
      media: {
        ...getSceneMedia(applied.scene)!,
        sourceQualityAdjustmentProvenance: {
          version: 1 as const,
          recommendationFingerprint: "sq-fp",
          mediaFingerprint: "sq-media",
          recommendationCodes: ["RESET_EXCESSIVE_ZOOM" as const],
          previousFraming: {
            fitMode: "fill" as const,
            positionX: 0,
            positionY: 0,
            zoom: 1.2,
            rotationDeg: 0,
          },
          appliedFraming: {
            fitMode: "fill" as const,
            positionX: 0,
            positionY: 0,
            zoom: 1,
            rotationDeg: 0,
          },
          mediaItemId: null,
        },
      },
    };
    const framingBefore = resolveSceneMediaFraming(withSq);
    const cleared = clearSubjectFocus({
      scene: withSq,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(getSceneMedia(cleared.scene)?.subjectFocus, undefined);
    assert.equal(
      getSceneMedia(cleared.scene)?.subjectAwareFramingProvenance,
      undefined,
    );
    assert.ok(getSceneMedia(cleared.scene)?.sourceQualityAdjustmentProvenance);
    assert.deepEqual(resolveSceneMediaFraming(cleared.scene), framingBefore);
  });

  test("manual framing change blocks Undo; Keep strips provenance only", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(setResult.scene),
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const manuallyEdited = {
      ...applied.scene,
      media: {
        ...getSceneMedia(applied.scene)!,
        transform: {
          ...getSceneMedia(applied.scene)!.transform!,
          x: 321,
        },
      },
      image: applied.scene.image
        ? { ...applied.scene.image, x: 321 }
        : undefined,
    };
    const framing = resolveSceneMediaFraming(manuallyEdited);
    const stale = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(manuallyEdited)?.subjectAwareFramingProvenance,
      media: getSceneMedia(manuallyEdited),
      framing,
      mediaItemId: null,
    });
    assert.ok(stale.reasons.includes("FRAMING_CHANGED"));
    assert.equal(stale.undoAllowed, false);

    const undo = undoSubjectAwareFraming({
      scene: manuallyEdited,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undo.ok, false);

    const kept = keepOrDismissSubjectAwareFraming({
      scene: manuallyEdited,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(kept.ok, true);
    if (!kept.ok) return;
    assert.equal(
      getSceneMedia(kept.scene)?.subjectAwareFramingProvenance,
      undefined,
    );
    assert.ok(getSceneMedia(kept.scene)?.subjectFocus);
    assert.equal(resolveSceneMediaFraming(kept.scene).positionX, 321);
  });

  test("RECOMMENDATION_CHANGED alone still allows Undo; exact applied framing stays applied", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const framing = resolveSceneMediaFraming(setResult.scene);
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: framing,
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const fresh = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(applied.scene)?.subjectAwareFramingProvenance,
      media: getSceneMedia(applied.scene),
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.equal(fresh.effectiveStatus, "applied");
    assert.equal(fresh.reasons.length, 0);
    assert.equal(fresh.undoAllowed, true);

    const withAlteredRec = {
      ...getSceneMedia(applied.scene)!,
      subjectAwareFramingProvenance: {
        ...getSceneMedia(applied.scene)!.subjectAwareFramingProvenance!,
        recommendationFingerprint: "older-recommendation-fingerprint",
      },
    };
    const recStale = evaluateSubjectFramingStaleness({
      provenance: withAlteredRec.subjectAwareFramingProvenance,
      media: withAlteredRec,
      framing: resolveSceneMediaFraming(applied.scene),
      mediaItemId: null,
    });
    assert.deepEqual(recStale.reasons, ["RECOMMENDATION_CHANGED"]);
    assert.equal(recStale.undoAllowed, true);

    const undo = undoSubjectAwareFraming({
      scene: {
        ...applied.scene,
        media: withAlteredRec,
      },
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undo.ok, true);
    if (!undo.ok) return;
    assert.deepEqual(resolveSceneMediaFraming(undo.scene), framing);
  });

  test("timing/music/effects/motion edits do not stale subject provenance", () => {
    const setResult = setSubjectFocus({
      scene: singleScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(setResult.ok, true);
    if (!setResult.ok) return;
    const media = getSceneMedia(setResult.scene)!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media,
      currentFraming: resolveSceneMediaFraming(setResult.scene),
      subjectFocus: media.subjectFocus,
    });
    const applied = applySubjectAwareFramingSuggestion({
      scene: setResult.scene,
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const decorated = {
      ...applied.scene,
      narration: "Other narration",
      subtitle: "Other subtitle",
      startMs: 1_000,
      endMs: 7_000,
      durationMs: 6_000,
      start: 1,
      end: 7,
      duration: 6,
      media: {
        ...getSceneMedia(applied.scene)!,
        motion: {
          version: 1 as const,
          enabled: true,
          presetId: "slow-pan",
          keyframes: [
            {
              offsetMs: 0,
              x: 0,
              y: 0,
              scale: 1,
              rotation: 0,
              opacity: 1,
              easing: "linear" as const,
            },
          ],
        },
        visualEffect: {
          version: 1 as const,
          presetId: "cinematic" as const,
          intensity: 0.5,
        },
      },
    };
    const staleness = evaluateSubjectFramingStaleness({
      provenance: getSceneMedia(decorated)?.subjectAwareFramingProvenance,
      media: getSceneMedia(decorated),
      framing: resolveSceneMediaFraming(decorated),
      mediaItemId: null,
    });
    assert.equal(staleness.effectiveStatus, "applied");
    assert.equal(staleness.reasons.length, 0);
    assert.equal(staleness.undoAllowed, true);
  });

  test("deleted media item during Apply is not recreated", () => {
    let scene = singleScene(landscapeMedia({ url: "https://example.com/a.jpg" }));
    scene = appendMixedMediaSequenceItem(
      scene,
      landscapeMedia({ url: "https://example.com/b.jpg" }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
    ).scene;
    const focused = setSubjectFocus({
      scene,
      mediaItemId: "item-b",
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(focused.ok, true);
    if (!focused.ok) return;
    const target = readMixedMediaSequenceItems(focused.scene).find(
      (item) => item.id === "item-b",
    )!;
    const suggestion = buildSubjectFocusFramingSuggestion({
      media: target.media,
      mediaItemId: "item-b",
      currentFraming: resolveSceneMediaFraming(
        { media: target.media },
        { media: target.media },
      ),
      subjectFocus: target.media.subjectFocus,
    });
    const withoutItem = {
      ...focused.scene,
      visualSequence: {
        ...focused.scene.visualSequence!,
        items: focused.scene.visualSequence!.items.filter(
          (item) => item.id !== "item-b",
        ),
      },
      mediaTimeline: focused.scene.mediaTimeline
        ? {
            ...focused.scene.mediaTimeline,
            items: focused.scene.mediaTimeline.items.filter(
              (item) => item.id !== "item-b",
            ),
          }
        : undefined,
    };
    const result = applySubjectAwareFramingSuggestion({
      scene: withoutItem,
      mediaItemId: "item-b",
      suggestion,
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      readMixedMediaSequenceItems(withoutItem).some((item) => item.id === "item-b"),
      false,
    );
  });

  test("command module has no network / clock / random", () => {
    const src = readSrc(
      "src/features/source-quality/editor/subject-aware-framing.commands.ts",
    );
    assert.doesNotMatch(src, /\bfetch\b/);
    assert.doesNotMatch(src, /\bDate\b/);
    assert.doesNotMatch(src, /Math\.random/);
    assert.match(src, /subjectFocusSuggestionsSemanticallyEqual/);
    assert.match(src, /value === true/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
