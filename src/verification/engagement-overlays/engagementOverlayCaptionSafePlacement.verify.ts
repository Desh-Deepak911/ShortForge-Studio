/**
 * Caption-safe CTA placement + Preview/export plan parity.
 * Run via: npm run test:engagement-overlays
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { CaptionLayout } from "@/features/caption-layout";
import {
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  ENGAGEMENT_OVERLAY_PRESET_ID,
  resolveEngagementOverlayCaptionExclusion,
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays";
import type { EngagementOverlayPosition } from "@/features/visual-retention/domain/visual-retention-extension-contracts";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function overlay(
  partial: Partial<SceneEngagementOverlayV1> = {},
): SceneEngagementOverlayV1 {
  return {
    version: 1,
    id: "caption-safe-cta",
    kind: "combined",
    startOffsetMs: 0,
    durationMs: 2500,
    position: "bottom-center",
    size: "large",
    scale: 1,
    presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
    ...partial,
  };
}

function captionLayout(anchor: CaptionLayout["anchor"]): CaptionLayout {
  return {
    version: 2,
    anchor,
    textAlign: "center",
    offsetX: 0,
    offsetY: 0,
    maxWidthPercent: 90,
    safeAreaEnabled: true,
  };
}

function boxesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 0,
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function resolveAt(
  partial: Partial<SceneEngagementOverlayV1>,
  frameWidth: number,
  frameHeight: number,
  caption?: {
    present?: boolean;
    anchor?: CaptionLayout["anchor"];
  },
) {
  return resolveEngagementOverlayFrame({
    overlay: overlay(partial),
    sceneDurationMs: 5000,
    sceneElapsedMs: 1000,
    frameWidth,
    frameHeight,
    captionCollision: caption
      ? {
          present: caption.present !== false,
          sceneLayout: captionLayout(caption.anchor ?? "bottom_center"),
          projectLayout: null,
        }
      : undefined,
  });
}

function main(): void {
  console.log("\nengagement-overlay-caption-safe-placement\n");

  test("Large Bottom center does not intersect a bottom caption", () => {
    const frame = resolveAt(
      { position: "bottom-center", size: "large" },
      1080,
      1920,
      { anchor: "bottom_center" },
    );
    const exclusion = frame.captionSafePlacement.captionExclusion;
    assert.ok(exclusion);
    assert.equal(frame.captionSafePlacement.translated, true);
    assert.equal(frame.position, "bottom-center");
    assert.ok(
      !boxesIntersect(frame.layout, exclusion, frame.captionSafePlacement.gapPx),
    );
    assert.ok(frame.layout.y + frame.layout.height <= 1920 + 1e-6);
    assert.ok(frame.layout.y >= 0);
  });

  test("Large Top center does not intersect a top caption", () => {
    const frame = resolveAt(
      { position: "top-center", size: "large" },
      1080,
      1920,
      { anchor: "top_center" },
    );
    const exclusion = frame.captionSafePlacement.captionExclusion;
    assert.ok(exclusion);
    assert.equal(frame.position, "top-center");
    assert.ok(
      !boxesIntersect(frame.layout, exclusion, frame.captionSafePlacement.gapPx),
    );
  });

  test("Center placement handles a center caption deterministically", () => {
    const a = resolveAt({ position: "center", size: "large" }, 1080, 1920, {
      anchor: "center",
    });
    const b = resolveAt({ position: "center", size: "large" }, 1080, 1920, {
      anchor: "center",
    });
    const exclusion = a.captionSafePlacement.captionExclusion;
    assert.ok(exclusion);
    assert.deepEqual(a.layout, b.layout);
    assert.equal(a.captionSafePlacement.slot, b.captionSafePlacement.slot);
    assert.ok(
      a.captionSafePlacement.slot === "above-caption" ||
        a.captionSafePlacement.slot === "below-caption" ||
        a.captionSafePlacement.slot === "nearest-safe",
    );
    assert.ok(
      !boxesIntersect(a.layout, exclusion, a.captionSafePlacement.gapPx) ||
        a.captionSafePlacement.unresolved,
    );
    assert.equal(a.position, "center");
  });

  test("Bottom-left and bottom-right remain caption-safe", () => {
    for (const position of ["bottom-left", "bottom-right"] as const) {
      const frame = resolveAt({ position, size: "large" }, 1080, 1920, {
        anchor: "bottom_center",
      });
      const exclusion = frame.captionSafePlacement.captionExclusion;
      assert.ok(exclusion);
      assert.equal(frame.position, position);
      assert.ok(
        !boxesIntersect(frame.layout, exclusion, frame.captionSafePlacement.gapPx),
      );
    }
  });

  test("Small/Medium/Large and min/max fine scale stay inside the canvas", () => {
    const sizes = ["small", "medium", "large"] as const;
    const scales = [ENGAGEMENT_OVERLAY_MIN_SCALE, 1, ENGAGEMENT_OVERLAY_MAX_SCALE];
    const positions: readonly EngagementOverlayPosition[] = [
      "top-left",
      "top-center",
      "top-right",
      "center",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    for (const size of sizes) {
      for (const scale of scales) {
        for (const position of positions) {
          const frame = resolveAt({ position, size, scale }, 1080, 1920, {
            anchor: "bottom_center",
          });
          assert.ok(frame.layout.x >= 0, `${position}/${size}/${scale} x`);
          assert.ok(frame.layout.y >= 0, `${position}/${size}/${scale} y`);
          assert.ok(
            frame.layout.x + frame.layout.width <= 1080 + 1e-6,
            `${position}/${size}/${scale} right`,
          );
          assert.ok(
            frame.layout.y + frame.layout.height <= 1920 + 1e-6,
            `${position}/${size}/${scale} bottom`,
          );
        }
      }
    }
  });

  test("720p, 1080p, and 4K produce proportional geometry", () => {
    const frames = (
      [
        [720, 1280],
        [1080, 1920],
        [2160, 3840],
      ] as const
    ).map(([width, height]) =>
      resolveAt({ position: "bottom-center", size: "large" }, width, height, {
        anchor: "bottom_center",
      }),
    );
    const [p720, p1080, p4k] = frames;
    assert.ok(p720 && p1080 && p4k);
    const ratio1080 = 1080 / 720;
    const ratio4k = 2160 / 1080;
    assert.ok(Math.abs(p1080.layout.width / p720.layout.width - ratio1080) < 1e-6);
    assert.ok(Math.abs(p1080.layout.height / p720.layout.height - ratio1080) < 1e-6);
    assert.ok(Math.abs(p4k.layout.width / p1080.layout.width - ratio4k) < 1e-6);
    assert.ok(Math.abs(p4k.layout.height / p1080.layout.height - ratio4k) < 1e-6);
    assert.ok(Math.abs(p720.layout.y / 1280 - p1080.layout.y / 1920) < 1e-3);
    assert.ok(Math.abs(p1080.layout.y / 1920 - p4k.layout.y / 3840) < 1e-3);
    assert.ok(Math.abs(p720.layout.x / 720 - p1080.layout.x / 1080) < 1e-6);
    assert.ok(Math.abs(p1080.layout.x / 1080 - p4k.layout.x / 2160) < 1e-6);
  });

  test("no-caption layouts preserve previous coordinates", () => {
    const positions: readonly EngagementOverlayPosition[] = [
      "top-left",
      "top-center",
      "top-right",
      "center",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    for (const position of positions) {
      const omitted = resolveAt({ position, size: "large" }, 1080, 1920);
      const explicitOff = resolveAt({ position, size: "large" }, 1080, 1920, {
        present: false,
      });
      assert.deepEqual(omitted.layout, explicitOff.layout);
      assert.equal(omitted.captionSafePlacement.slot, "requested");
      assert.equal(omitted.captionSafePlacement.translated, false);
      assert.equal(omitted.captionSafePlacement.applied, omitted.layout);
      if (position.startsWith("bottom")) {
        const scale = 1;
        assert.ok(
          omitted.layout.y + omitted.layout.height <= 1920 - 360 * scale + 1e-6,
        );
      }
    }
  });

  test("Preview and canvas consume identical collision-adjusted plans", () => {
    const plan = resolveAt(
      { position: "bottom-center", size: "large" },
      1080,
      1920,
      { anchor: "bottom_center" },
    );
    const again = resolveAt(
      { position: "bottom-center", size: "large" },
      1080,
      1920,
      { anchor: "bottom_center" },
    );
    assert.deepEqual(plan.layout, again.layout);
    assert.deepEqual(plan.captionSafePlacement, again.captionSafePlacement);
    assert.deepEqual(plan.chrome.columnBoxes, again.chrome.columnBoxes);

    const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
    const overlayPreview = readSrc(
      "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    );
    const draw = readSrc(
      "src/features/export/runtime/draw-prepared-export-frame.ts",
    );
    assert.match(preview, /captionCollision=/);
    assert.match(overlayPreview, /captionCollision: props.captionCollision/);
    assert.match(draw, /captionCollision/);
    assert.match(draw, /sceneCaption/);
    const collisionAt = draw.indexOf("const captionCollision");
    const drawCallAt = draw.lastIndexOf("drawEngagementOverlay(ctx, plan)");
    assert.ok(collisionAt >= 0 && drawCallAt > collisionAt);
  });

  test("placement stays stable across the scene clock and does not resize", () => {
    const hold = resolveAt(
      { position: "bottom-center", size: "large" },
      1080,
      1920,
      { anchor: "bottom_center" },
    );
    const entrance = resolveEngagementOverlayFrame({
      overlay: overlay({ position: "bottom-center", size: "large" }),
      sceneDurationMs: 5000,
      sceneElapsedMs: 80,
      frameWidth: 1080,
      frameHeight: 1920,
      captionCollision: {
        present: true,
        sceneLayout: captionLayout("bottom_center"),
      },
    });
    const exit = resolveEngagementOverlayFrame({
      overlay: overlay({ position: "bottom-center", size: "large" }),
      sceneDurationMs: 5000,
      sceneElapsedMs: 2400,
      frameWidth: 1080,
      frameHeight: 1920,
      captionCollision: {
        present: true,
        sceneLayout: captionLayout("bottom_center"),
      },
    });
    assert.deepEqual(entrance.layout, hold.layout);
    assert.deepEqual(exit.layout, hold.layout);
    assert.equal(hold.layout.width, entrance.captionSafePlacement.requested.width);
    assert.equal(hold.layout.height, entrance.captionSafePlacement.requested.height);
    assert.equal(hold.segments[0]!.label, "Like");
    assert.equal(hold.segments[1]!.label, "Share");
    assert.equal(hold.segments[2]!.label, "Subscribe");
    const unconstrained = resolveAt(
      { position: "bottom-center", size: "large" },
      1080,
      1920,
    );
    assert.deepEqual(hold.segments, unconstrained.segments);
    assert.equal(hold.phase, unconstrained.phase);
    assert.equal(hold.opacity, unconstrained.opacity);
    assert.equal(hold.window.startOffsetMs, unconstrained.window.startOffsetMs);
    assert.equal(hold.window.durationMs, unconstrained.window.durationMs);
  });

  test("exclusion reuses resolveCaptionLayout and stays provider-free", () => {
    const exclusion = resolveEngagementOverlayCaptionExclusion({
      present: true,
      frameWidth: 1080,
      frameHeight: 1920,
      sceneLayout: captionLayout("bottom_center"),
    });
    assert.ok(exclusion);
    assert.ok(exclusion.height > 1);
    const authority = readSrc(
      "src/features/engagement-overlays/domain/resolve-engagement-overlay-caption-safe-placement.ts",
    );
    assert.match(authority, /resolveCaptionLayout/);
    assert.doesNotMatch(authority, /fetch\(|localStorage|process\.env/);
    assert.doesNotMatch(authority, /from ["']@\/features\/brand-sting/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
