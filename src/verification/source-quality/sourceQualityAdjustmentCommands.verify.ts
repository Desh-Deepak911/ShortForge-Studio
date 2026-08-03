/**
 * Source-quality Apply / Undo / Dismiss command verification.
 * Run via: npm run test:source-quality-adjustments
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  writeMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applySourceQualityAdjustmentRecommendation,
  dismissSourceQualityAdjustmentProvenance,
  undoSourceQualityAdjustmentRecommendation,
} from "@/features/source-quality/editor/source-quality-adjustment.commands";
import { evaluateSourceQualityAdjustmentStaleness } from "@/features/source-quality/domain/evaluate-source-quality-adjustment-staleness";
import { recommendSafeVisualAdjustment } from "@/features/source-quality/domain/safe-visual-adjustment-recommendation";
import { normalizeSourceQualityAdjustmentProvenance } from "@/features/source-quality/domain/source-quality-adjustment-provenance";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia, normalizeSceneMedia } from "@/features/story/utils/scene.utils";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(
  width: number,
  height: number,
  options: {
    readonly url?: string;
    readonly scale?: number;
    readonly fitMode?: "cover" | "contain";
    readonly mimeType?: string;
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: options.mimeType ?? "image/jpeg",
    width,
    height,
    fitMode: options.fitMode ?? "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function singleScene(media: SceneMedia, narration = "Narration line."): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration,
    media,
    image:
      media.type === "image" && media.url
        ? {
            url: media.url,
            fitMode: media.fitMode === "contain" ? "fit" : "fill",
            x: media.transform?.x ?? 0,
            y: media.transform?.y ?? 0,
            scale: media.transform?.scale ?? 1,
            rotation: media.transform?.rotation ?? 0,
          }
        : undefined,
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
  console.log("\nSource quality adjustment commands\n");

  test("single-media Apply/Undo restores exact previous framing", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const framing = resolveSceneMediaFraming(scene);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing,
      mediaItemId: null,
    });
    assert.equal(recommendation.applicable, true);

    const frozen = deepFreeze(structuredClone(scene));
    const applied = applySourceQualityAdjustmentRecommendation({
      scene: frozen,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.notEqual(frozen.media?.transform?.scale, 1);
    const afterMedia = getSceneMedia(applied.scene)!;
    assert.equal(afterMedia.transform?.scale, 1);
    assert.ok(afterMedia.sourceQualityAdjustmentProvenance);
    assert.equal(
      afterMedia.sourceQualityAdjustmentProvenance!.previousFraming.zoom,
      1.4,
    );

    const undone = undoSourceQualityAdjustmentRecommendation({
      scene: applied.scene,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    const restored = getSceneMedia(undone.scene)!;
    assert.equal(restored.transform?.scale, 1.4);
    assert.equal(restored.sourceQualityAdjustmentProvenance, undefined);
    assert.equal(undone.scene.narration, scene.narration);
  });

  test("mixed-media selected-item Apply/Undo and dual-write parity", () => {
    let scene = singleScene(imageMedia(640, 640, { url: "https://example.com/a.jpg" }));
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1080, 1920, {
        url: "https://example.com/b.jpg",
        scale: 1.5,
      }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-a" },
    ).scene;
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1920, 1080, {
        url: "https://example.com/c.jpg",
        scale: 1,
      }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
    ).scene;

    const target = readMixedMediaSequenceItems(scene).find(
      (item) => item.id === "item-a",
    )!;
    const framing = resolveSceneMediaFraming(
      { media: target.media },
      { media: target.media },
    );
    const recommendation = recommendSafeVisualAdjustment({
      media: target.media,
      framing,
      mediaItemId: "item-a",
    });
    assert.equal(recommendation.applicable, true);

    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      mediaItemId: "item-a",
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const seqItem = applied.scene.visualSequence!.items.find(
      (item) => item.id === "item-a",
    )!;
    const timelineItem = applied.scene.mediaTimeline!.items.find(
      (item) => item.id === "item-a",
    )!;
    assert.equal(seqItem.media.transform?.scale, 1);
    assert.equal(timelineItem.media.transform?.scale, 1);
    assert.deepEqual(
      seqItem.media.sourceQualityAdjustmentProvenance,
      timelineItem.media.sourceQualityAdjustmentProvenance,
    );
    const other = applied.scene.visualSequence!.items.find(
      (item) => item.id === "item-b",
    )!;
    assert.equal(other.media.sourceQualityAdjustmentProvenance, undefined);

    const undone = undoSourceQualityAdjustmentRecommendation({
      scene: applied.scene,
      mediaItemId: "item-a",
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    const restored = undone.scene.visualSequence!.items.find(
      (item) => item.id === "item-a",
    )!;
    assert.equal(restored.media.transform?.scale, 1.5);
    assert.equal(restored.media.sourceQualityAdjustmentProvenance, undefined);
  });

  test("fingerprint-only Apply is refused with zero mutation", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = deepFreeze(structuredClone(singleScene(media)));
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: undefined,
      expectedRecommendationFingerprint: recommendation.recommendationFingerprint,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE");
    assert.equal(scene.media?.transform?.scale, 1.4);
    assert.equal(scene.media?.sourceQualityAdjustmentProvenance, undefined);
  });

  test("missing recommendation plus matching expected fingerprint is refused", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: null,
      expectedRecommendationFingerprint: recommendation.recommendationFingerprint,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE");
    assert.equal(scene.media?.transform?.scale, 1.4);
  });

  test("canonical complete recommendation applies successfully", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      expectedRecommendationFingerprint: recommendation.recommendationFingerprint,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(getSceneMedia(applied.scene)!.transform?.scale, 1);
  });

  test("altered patch with copied valid fingerprint is refused", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const forged = {
      ...recommendation,
      proposedFramingPatch: { fitMode: "fit" as const, zoom: 1 },
    };
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: forged,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_INVALID");
    assert.equal(scene.media?.transform?.scale, 1.4);
    assert.equal(scene.media?.fitMode, "cover");
    assert.equal(scene.media?.sourceQualityAdjustmentProvenance, undefined);
  });

  test("altered codes/applicability/media fingerprint/item identity are refused", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
      mediaItemId: null,
    });

    const forgedCodes = {
      ...recommendation,
      recommendationCodes: ["USE_FIT_FRAMING" as const],
    };
    const codesResult = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: forgedCodes,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(codesResult.ok, false);
    if (!codesResult.ok) {
      assert.equal(codesResult.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_INVALID");
    }

    const forgedApplicable = {
      ...recommendation,
      applicable: false,
    };
    const applicableResult = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: forgedApplicable,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applicableResult.ok, false);
    if (!applicableResult.ok) {
      assert.equal(
        applicableResult.terminalCode,
        "SOURCE_QUALITY_RECOMMENDATION_INVALID",
      );
    }

    const forgedMediaFp = {
      ...recommendation,
      mediaFingerprint: "forged-media-fp",
    };
    const mediaFpResult = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: forgedMediaFp,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(mediaFpResult.ok, false);
    if (!mediaFpResult.ok) {
      assert.equal(mediaFpResult.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_INVALID");
    }

    const forgedItem = {
      ...recommendation,
      mediaItemId: "other-item",
    };
    const itemResult = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: forgedItem,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(itemResult.ok, false);
    if (!itemResult.ok) {
      assert.equal(itemResult.terminalCode, "SOURCE_QUALITY_MEDIA_ITEM_MISMATCH");
    }
    assert.equal(scene.media?.transform?.scale, 1.4);
  });

  test("stale expected fingerprint is refused", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      expectedRecommendationFingerprint: "stale-expected-fingerprint",
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_STALE");
    assert.equal(scene.media?.transform?.scale, 1.4);
  });

  test("malformed or incomplete recommendation never mutates", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation: {
        recommendationFingerprint: "x",
      } as never,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_INVALID");
    assert.equal(scene.media?.transform?.scale, 1.4);
    assert.equal(scene.media?.sourceQualityAdjustmentProvenance, undefined);
  });

  test("stale recommendation refusal", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const mutatedScene = singleScene(
      imageMedia(1080, 1920, { scale: 1.1 }),
    );
    const result = applySourceQualityAdjustmentRecommendation({
      scene: mutatedScene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_RECOMMENDATION_STALE");
    assert.equal(mutatedScene.media?.transform?.scale, 1.1);
  });

  test("provenance mediaItemId must be explicit; null and item ids work", () => {
    const missingId = normalizeSourceQualityAdjustmentProvenance({
      version: 1,
      recommendationFingerprint: "abc",
      mediaFingerprint: "def",
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      previousFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1.4,
        rotationDeg: 0,
      },
      appliedFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
    });
    assert.equal(missingId, undefined);

    const emptyId = normalizeSourceQualityAdjustmentProvenance({
      version: 1,
      recommendationFingerprint: "abc",
      mediaFingerprint: "def",
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      previousFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1.4,
        rotationDeg: 0,
      },
      appliedFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
      mediaItemId: "",
    });
    assert.equal(emptyId, undefined);

    const numericId = normalizeSourceQualityAdjustmentProvenance({
      version: 1,
      recommendationFingerprint: "abc",
      mediaFingerprint: "def",
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      previousFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1.4,
        rotationDeg: 0,
      },
      appliedFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
      mediaItemId: 12,
    });
    assert.equal(numericId, undefined);

    const single = normalizeSourceQualityAdjustmentProvenance({
      version: 1,
      recommendationFingerprint: "abc",
      mediaFingerprint: "def",
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      previousFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1.4,
        rotationDeg: 0,
      },
      appliedFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
      mediaItemId: null,
    });
    assert.equal(single?.mediaItemId, null);

    const item = normalizeSourceQualityAdjustmentProvenance({
      version: 1,
      recommendationFingerprint: "abc",
      mediaFingerprint: "def",
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      previousFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1.4,
        rotationDeg: 0,
      },
      appliedFraming: {
        fitMode: "fill",
        positionX: 0,
        positionY: 0,
        zoom: 1,
        rotationDeg: 0,
      },
      mediaItemId: "item-a",
    });
    assert.equal(item?.mediaItemId, "item-a");
  });

  test("current-generator provenance remains applied; recommendation-contract change is precise", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const afterMedia = getSceneMedia(applied.scene)!;
    const framing = resolveSceneMediaFraming(applied.scene);
    const fresh = evaluateSourceQualityAdjustmentStaleness({
      provenance: afterMedia.sourceQualityAdjustmentProvenance,
      media: afterMedia,
      framing,
      mediaItemId: null,
    });
    assert.equal(fresh.effectiveStatus, "applied");
    assert.deepEqual(fresh.reasons, []);
    assert.equal(fresh.undoAllowed, true);

    const contractChanged = {
      ...afterMedia.sourceQualityAdjustmentProvenance!,
      recommendationFingerprint: "deliberately-changed-contract",
    };
    const stale = evaluateSourceQualityAdjustmentStaleness({
      provenance: contractChanged,
      media: afterMedia,
      framing,
      mediaItemId: null,
    });
    assert.equal(stale.effectiveStatus, "stale");
    assert.deepEqual(stale.reasons, ["RECOMMENDATION_CHANGED"]);
    assert.equal(stale.undoAllowed, true);

    const sceneWithChangedContract: FootieScene = {
      ...applied.scene,
      media: {
        ...afterMedia,
        sourceQualityAdjustmentProvenance: contractChanged,
      },
    };
    const undone = undoSourceQualityAdjustmentRecommendation({
      scene: sceneWithChangedContract,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(getSceneMedia(undone.scene)!.transform?.scale, 1.4);
    assert.equal(
      getSceneMedia(undone.scene)!.sourceQualityAdjustmentProvenance,
      undefined,
    );
  });

  test("manual-edit Undo refusal", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const manual = singleScene({
      ...getSceneMedia(applied.scene)!,
      transform: {
        ...(getSceneMedia(applied.scene)!.transform ?? {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
        }),
        scale: 1.2,
      },
    });
    // Preserve provenance on manually edited media.
    manual.media = {
      ...manual.media!,
      sourceQualityAdjustmentProvenance:
        getSceneMedia(applied.scene)!.sourceQualityAdjustmentProvenance,
    };
    manual.image = {
      ...manual.image!,
      scale: 1.2,
    };

    const undone = undoSourceQualityAdjustmentRecommendation({
      scene: manual,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(undone.ok, false);
    if (undone.ok) return;
    assert.equal(undone.terminalCode, "SOURCE_QUALITY_UNDO_UNAVAILABLE");
    assert.equal(manual.media?.transform?.scale, 1.2);
  });

  test("dismiss provenance without framing mutation", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const dismissed = dismissSourceQualityAdjustmentProvenance({
      scene: applied.scene,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(dismissed.ok, true);
    if (!dismissed.ok) return;
    const after = getSceneMedia(dismissed.scene)!;
    assert.equal(after.transform?.scale, 1);
    assert.equal(after.sourceQualityAdjustmentProvenance, undefined);
  });

  test("malformed provenance fail-closed + dismiss", () => {
    const media = {
      ...imageMedia(1080, 1920),
      sourceQualityAdjustmentProvenance: { version: 99, broken: true },
    } as unknown as SceneMedia;
    const normalized = normalizeSceneMedia(media);
    assert.equal(normalized?.sourceQualityAdjustmentProvenance, undefined);

    const scene = singleScene(media);
    // Keep raw malformed field on scene.media for dismiss path.
    (scene.media as SceneMedia).sourceQualityAdjustmentProvenance = {
      version: 99,
    } as never;

    const framing = resolveSceneMediaFraming(scene);
    const staleness = evaluateSourceQualityAdjustmentStaleness({
      provenance: scene.media!.sourceQualityAdjustmentProvenance,
      media: scene.media,
      framing,
    });
    assert.equal(staleness.effectiveStatus, "invalid");
    assert.ok(staleness.reasons.includes("PROVENANCE_INVALID"));
    assert.equal(staleness.undoAllowed, false);
    assert.equal(staleness.dismissAllowed, true);

    const dismissed = dismissSourceQualityAdjustmentProvenance({
      scene,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(dismissed.ok, true);
    if (!dismissed.ok) return;
    assert.equal(
      dismissed.scene.media?.sourceQualityAdjustmentProvenance,
      undefined,
    );
    assert.equal(dismissed.scene.media?.transform?.scale, 1);
  });

  test("media replacement staleness", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const replaced = singleScene(
      imageMedia(1080, 1920, {
        url: "https://example.com/replaced.jpg",
        scale: 1,
      }),
    );
    replaced.media = {
      ...replaced.media!,
      sourceQualityAdjustmentProvenance:
        getSceneMedia(applied.scene)!.sourceQualityAdjustmentProvenance,
    };
    const staleness = evaluateSourceQualityAdjustmentStaleness({
      provenance: replaced.media!.sourceQualityAdjustmentProvenance,
      media: replaced.media,
      framing: resolveSceneMediaFraming(replaced),
    });
    assert.ok(staleness.reasons.includes("MEDIA_CHANGED"));
    assert.equal(staleness.undoAllowed, false);
  });

  test("timing/order changes do not stale when media+framing unchanged", () => {
    let scene = singleScene(imageMedia(640, 640, { url: "https://example.com/a.jpg" }));
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1080, 1920, {
        url: "https://example.com/b.jpg",
        scale: 1.5,
      }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-a" },
    ).scene;
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(800, 800, { url: "https://example.com/c.jpg" }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
    ).scene;

    const target = readMixedMediaSequenceItems(scene).find(
      (item) => item.id === "item-a",
    )!;
    const recommendation = recommendSafeVisualAdjustment({
      media: target.media,
      framing: resolveSceneMediaFraming(
        { media: target.media },
        { media: target.media },
      ),
      mediaItemId: "item-a",
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      mediaItemId: "item-a",
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const reordered = writeMixedMediaSequenceItems(
      applied.scene,
      [
        {
          ...readMixedMediaSequenceItems(applied.scene).find(
            (item) => item.id === "item-b",
          )!,
          startOffsetMs: 0,
          durationMs: 3_000,
        },
        {
          ...readMixedMediaSequenceItems(applied.scene).find(
            (item) => item.id === "item-a",
          )!,
          startOffsetMs: 3_000,
          durationMs: 3_000,
        },
      ],
      { mixedMediaScenesEnabled: true },
    ).scene;

    const item = readMixedMediaSequenceItems(reordered).find(
      (entry) => entry.id === "item-a",
    )!;
    const staleness = evaluateSourceQualityAdjustmentStaleness({
      provenance: item.media.sourceQualityAdjustmentProvenance,
      media: item.media,
      framing: resolveSceneMediaFraming(
        { media: item.media },
        { media: item.media },
      ),
      mediaItemId: "item-a",
    });
    assert.equal(staleness.effectiveStatus, "applied");
    assert.deepEqual(staleness.reasons, []);
    assert.equal(staleness.undoAllowed, true);
  });

  test("narration/music independence", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media, "Original narration");
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const withNarration: FootieScene = {
      ...applied.scene,
      narration: "Changed narration text",
      subtitle: "Changed subtitle",
    };
    const framing = resolveSceneMediaFraming(withNarration);
    const staleness = evaluateSourceQualityAdjustmentStaleness({
      provenance: withNarration.media?.sourceQualityAdjustmentProvenance,
      media: withNarration.media,
      framing,
    });
    assert.equal(staleness.effectiveStatus, "applied");
    assert.deepEqual(staleness.reasons, []);

    const src = readSrc(
      "src/features/source-quality/domain/evaluate-source-quality-adjustment-staleness.ts",
    );
    assert.doesNotMatch(src, /backgroundMusic|scene\.narration|input\.narration/);
  });

  test("capability off ignores recommendation commands", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: false,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, false);
    if (applied.ok) return;
    assert.equal(applied.terminalCode, "SOURCE_QUALITY_CAPABILITY_OFF");
    assert.equal(scene.media?.transform?.scale, 1.4);
  });

  test("media item mismatch refusal", () => {
    let scene = singleScene(
      imageMedia(640, 640, { url: "https://example.com/a.jpg" }),
    );
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1080, 1920, {
        url: "https://example.com/b.jpg",
        scale: 1.5,
      }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-a" },
    ).scene;
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1080, 1920, {
        url: "https://example.com/c.jpg",
        scale: 1.5,
      }),
      { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
    ).scene;
    const target = readMixedMediaSequenceItems(scene).find(
      (item) => item.id === "item-a",
    )!;
    const recommendation = recommendSafeVisualAdjustment({
      media: target.media,
      framing: resolveSceneMediaFraming(
        { media: target.media },
        { media: target.media },
      ),
      mediaItemId: "item-a",
    });
    const result = applySourceQualityAdjustmentRecommendation({
      scene,
      mediaItemId: "item-b",
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "SOURCE_QUALITY_MEDIA_ITEM_MISMATCH");
  });

  test("deep immutability", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = deepFreeze(structuredClone(singleScene(media)));
    const recommendation = Object.freeze(
      recommendSafeVisualAdjustment({
        media,
        framing: resolveSceneMediaFraming(scene),
      }),
    );
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    assert.equal(scene.media?.transform?.scale, 1.4);
  });

  test("commands reuse framing write authority", () => {
    const src = readSrc(
      "src/features/source-quality/editor/source-quality-adjustment.commands.ts",
    );
    assert.match(src, /buildMediaFramingPatch/);
    assert.match(src, /buildTemporarySceneForMediaItemEdit/);
    assert.match(src, /updateSceneMediaItemMedia/);
    assert.match(src, /writeMixedMediaSequenceItems/);
    assert.doesNotMatch(src, /brightness|contrast|saturation/);
  });

  console.log(`\nSource quality adjustment commands: ${passed} PASS\n`);
}

void main();
