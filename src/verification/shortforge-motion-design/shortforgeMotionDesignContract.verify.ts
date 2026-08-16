/**
 * Prompt 1 shared engagement / outro motion-design contract.
 * Run via: npm run test:shortforge-motion-contract
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createDefaultShortForgeBrandSting,
  resolveBrandStingFinalElapsedMs,
  resolveBrandStingFrame,
  resolveBrandStingMarkRevealClip,
  resolveBrandStingTerminalElapsedMs,
  scaleBrandStingMarkGeometry,
  BRAND_STING_COLORS,
  BRAND_STING_LEAD_IN,
  BRAND_STING_LEAD_IN_DISPLAY,
  BRAND_STING_LOCKUP_CENTER_Y_RATIO,
  BRAND_STING_MARK_REVEAL_DIRECTION,
  BRAND_STING_MARK_SIZE_REF,
} from "@/features/brand-sting";
import {
  ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT,
  ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH,
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  ENGAGEMENT_OVERLAY_MOTION,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
  ENGAGEMENT_OVERLAY_STYLE,
  engagementOverlayIconsForKind,
  engagementOverlayLabelsForKind,
  resolveEngagementOverlayCenteredIconLabel,
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays";
import {
  SHORTFORGE_MOTION_FONT_STACK,
  SHORTFORGE_MOTION_PALETTE,
  shortforgeMotionHexToRgba,
} from "@/features/shortforge-motion-design";
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
    id: "motion-contract",
    kind: "combined",
    startOffsetMs: 0,
    durationMs: 2500,
    position: "top-right",
    presetId: "compact-pill-v1",
    size: "medium",
    scale: 1,
    ...partial,
  };
}

function engagementFrame(
  partial: Partial<SceneEngagementOverlayV1> = {},
  sceneElapsedMs = 1000,
  frameWidth = 1080,
  frameHeight = 1920,
) {
  return resolveEngagementOverlayFrame({
    overlay: overlay(partial),
    sceneDurationMs: 5000,
    sceneElapsedMs,
    frameWidth,
    frameHeight,
  });
}

function assertFiniteValue(value: unknown, label: string): void {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${label} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteValue(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertFiniteValue(nested, `${label}.${key}`);
    }
  }
}

function assertEqualColumns(
  frame: ReturnType<typeof resolveEngagementOverlayFrame>,
): void {
  const { layout, chrome } = frame;
  assert.ok(
    Math.abs(
      chrome.paddingX * 2 + chrome.columnWidth * chrome.columnCount - layout.width,
    ) < 1e-9,
    "equal outer padding plus equal columns must reconstruct layout.width",
  );
  assert.ok(chrome.paddingX > 0);
  assert.ok(chrome.paddingY > 0);
  assert.equal(chrome.columnCentersX.length, chrome.columnCount);
  assert.equal(chrome.columnBoxes.length, chrome.columnCount);
  assert.ok(chrome.iconSize > 0);
  assert.ok(chrome.iconLabelGap > 0);
  assert.ok(chrome.fontSize >= 12);
  assert.equal(chrome.fontWeight, 600);
  if (chrome.columnCount > 1) {
    const gaps = chrome.columnCentersX
      .slice(1)
      .map((center, index) => center - chrome.columnCentersX[index]!);
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - gaps[0]!) < 1e-9);
    }
    const widths = chrome.columnBoxes.map((box) => box.width);
    for (const width of widths) {
      assert.ok(Math.abs(width - widths[0]!) < 1e-9);
    }
    const leftPad = chrome.columnCentersX[0]! - layout.x - chrome.columnWidth / 2;
    const rightPad =
      layout.x + layout.width - chrome.columnCentersX[chrome.columnCount - 1]! -
      chrome.columnWidth / 2;
    assert.ok(Math.abs(leftPad - chrome.paddingX) < 1e-9);
    assert.ok(Math.abs(rightPad - chrome.paddingX) < 1e-9);
    assert.equal(chrome.separatorXs.length, chrome.columnCount - 1);
    for (const separatorX of chrome.separatorXs) {
      assert.ok(separatorX > layout.x + chrome.paddingX);
      assert.ok(separatorX < layout.x + layout.width - chrome.paddingX);
    }
  } else {
    assert.deepEqual(chrome.separatorXs, []);
  }
  const columnYs = new Set(chrome.columnBoxes.map((box) => box.y));
  assert.equal(columnYs.size, 1);
  assert.ok(Number.isFinite(chrome.labelCenterY));
  chrome.columnBoxes.forEach((box) => {
    assert.ok(box.y < chrome.labelCenterY);
    assert.ok(box.y + box.height > chrome.labelCenterY);
    assert.ok(Math.abs(box.x + box.width / 2 - chrome.columnCentersX[chrome.columnBoxes.indexOf(box)]!) < 1e-9);
  });
}

console.log("\nshortforge-motion-design-contract\n");

test("shared palette and local font stack are exact and provider-free", () => {
  assert.deepEqual({ ...SHORTFORGE_MOTION_PALETTE }, {
    backgroundPrimary: "#07111F",
    backgroundSecondary: "#0B1728",
    softWhite: "#F8FAFC",
    slateText: "#94A3B8",
    borderSubtle: "#334155",
    accentActive: "#C8FF3D",
  });
  assert.equal(SHORTFORGE_MOTION_FONT_STACK, "Arial, Helvetica, sans-serif");
  assert.equal(
    shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.accentActive, 0.98),
    "rgba(200, 255, 61, 0.98)",
  );
  const paletteSrc = readSrc(
    "src/features/shortforge-motion-design/domain/shortforge-motion-palette.ts",
  );
  assert.doesNotMatch(paletteSrc, /fetch\(|https?:\/\/|Date\.now|Math\.random/);
  assert.doesNotMatch(
    readSrc("src/features/shortforge-motion-design/index.ts"),
    /resolveEngagementOverlayFrame|resolveBrandStingFrame/,
  );
});

test("engagement tokens consume the shared palette without orange or a bell", () => {
  assert.equal(
    ENGAGEMENT_OVERLAY_STYLE.cardFill,
    shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.backgroundSecondary, 0.88),
  );
  assert.equal(
    ENGAGEMENT_OVERLAY_STYLE.accentFill,
    shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.accentActive, 0.98),
  );
  assert.equal(
    ENGAGEMENT_OVERLAY_STYLE.confirmationFill,
    shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.accentActive, 1),
  );
  assert.doesNotMatch(ENGAGEMENT_OVERLAY_STYLE.accentFill, /232,\s*160,\s*74|amber|orange/i);
  assert.deepEqual(engagementOverlayLabelsForKind("combined"), [
    "Like",
    "Share",
    "Subscribe",
  ]);
  assert.deepEqual(engagementOverlayIconsForKind("combined"), [
    "heart",
    "share",
    "circle-plus",
  ]);
  assert.deepEqual(engagementOverlayIconsForKind("subscribe"), ["circle-plus"]);
  assert.equal(engagementOverlayLabelsForKind("subscribe")[0], "Subscribe");
  assert.equal(ENGAGEMENT_OVERLAY_MOTION.entranceScaleFrom, 0.94);
  assert.equal(ENGAGEMENT_OVERLAY_MOTION.entranceScaleTo, 1);
  const presets = readSrc(
    "src/features/engagement-overlays/domain/engagement-overlay.presets.ts",
  );
  assert.doesNotMatch(presets, /"bell"/);
  assert.doesNotMatch(presets, /from ["']@\/features\/brand-sting/);
});

test("equal CTA column geometry, padding, icon boxes, and baselines", () => {
  const frame = engagementFrame();
  assert.equal(frame.layout.width, ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH);
  assert.equal(frame.layout.height, ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT);
  assert.equal(frame.chrome.columnCount, 3);
  assertEqualColumns(frame);
  assert.deepEqual(frame.labels, ["Like", "Share", "Subscribe"]);
  assert.ok(frame.segments.every((segment) => segment.label !== "Subscribed"));
  assert.equal("iconBoxes" in frame.chrome, false);
  assert.equal("labelXs" in frame.chrome, false);
});

test("icon-label groups center in equal columns without crowding Subscribe", () => {
  const sizes = ["small", "medium", "large"] as const;
  const frames = [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const;
  for (const size of sizes) {
    for (const [width, height] of frames) {
      const frame = engagementFrame({ size }, 1000, width, height);
      for (const [index, label] of frame.labels.entries()) {
        const columnBox = frame.chrome.columnBoxes[index]!;
        const estimatedWidth = frame.chrome.fontSize * 0.62 * label.length;
        const origin = resolveEngagementOverlayCenteredIconLabel({
          columnBox,
          iconSize: frame.chrome.iconSize,
          iconLabelGap: frame.chrome.iconLabelGap,
          labelWidth: estimatedWidth,
          labelCenterY: frame.chrome.labelCenterY,
        });
        assert.ok(
          origin.groupWidth <= columnBox.width + 1e-6,
          `${size} ${width}x${height} ${label} must fit its column`,
        );
        const groupCenter = origin.iconCx + (origin.groupWidth - frame.chrome.iconSize) / 2;
        assert.ok(Math.abs(groupCenter - frame.chrome.columnCentersX[index]!) < 1e-6);
        assert.equal(origin.labelY, frame.chrome.labelCenterY);
      }
    }
  }
});

test("single-action overlays keep the same chrome language without fabricating actions", () => {
  for (const kind of ["like", "share", "subscribe"] as const) {
    const frame = engagementFrame({ kind });
    assert.equal(frame.chrome.columnCount, 1);
    assert.equal(frame.segments.length, 1);
    assert.equal(frame.labels.length, 1);
    assert.equal(frame.segments[0]!.confirmation, false);
    assert.doesNotMatch(frame.segments[0]!.label, /Subscribed/);
    assertEqualColumns(frame);
  }
});

test("CTA entrance/hold/exit samples, Like→Share→Subscribe, and seek determinism", () => {
  const entrance = engagementFrame({}, 80);
  assert.equal(entrance.phase, "entrance");
  assert.ok(entrance.opacity < 1);
  assert.ok(entrance.scale >= ENGAGEMENT_OVERLAY_MOTION.entranceScaleFrom);
  assert.ok(entrance.scale < ENGAGEMENT_OVERLAY_MOTION.entranceScaleTo);
  assert.ok(entrance.segments.every((segment) => !segment.active));

  const like = engagementFrame({}, 500);
  const share = engagementFrame({}, 1200);
  const subscribe = engagementFrame({}, 1900);
  assert.equal(like.phase, "hold");
  assert.equal(like.segments[0]!.active, true);
  assert.equal(like.segments[0]!.label, "Like");
  assert.equal(share.segments[1]!.active, true);
  assert.equal(share.segments[1]!.label, "Share");
  assert.equal(subscribe.segments[2]!.active, true);
  assert.equal(subscribe.segments[2]!.label, "Subscribe");
  assert.equal(subscribe.segments[2]!.confirmation, true);
  assert.equal(subscribe.segments[0]!.settled, true);
  assert.equal(subscribe.segments[1]!.settled, true);
  assert.ok(subscribe.segments[2]!.pulseScale > 1);
  assert.ok(subscribe.segments[2]!.glowOpacity > 0);
  assert.equal(like.segments.filter((segment) => segment.active).length, 1);

  const exit = engagementFrame({}, 2400);
  assert.equal(exit.phase, "exit");
  assert.ok(exit.opacity < 1);
  assert.ok(exit.scale < 1);
  assert.ok(exit.scale >= 1 - ENGAGEMENT_OVERLAY_MOTION.exitScaleDelta);

  const seekA = engagementFrame({}, 1900);
  const seekB = engagementFrame({}, 1900);
  assert.deepEqual(seekA, seekB);
});

test("short windows compress without NaN, jumps, or incomplete terminal state", () => {
  const samples = [0, 40, 120, 200, 249, 250, 400];
  for (const sceneElapsedMs of samples) {
    const frame = engagementFrame({ durationMs: 250 }, sceneElapsedMs);
    assertFiniteValue(frame, `short@${sceneElapsedMs}`);
    if (sceneElapsedMs >= 250) {
      assert.equal(frame.visible, false);
      assert.equal(frame.phase, "hidden");
      assert.equal(frame.opacity, 0);
    }
  }
});

test("720p, 1080p, and 4K CTA geometry scales with equal columns", () => {
  for (const [width, height] of [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const) {
    const scale = Math.min(width / 1080, height / 1920);
    const frame = engagementFrame({}, 1000, width, height);
    assertFiniteValue(frame, `${width}x${height}`);
    assert.ok(Math.abs(frame.layout.width - 680 * scale) < 1e-9);
    assert.ok(Math.abs(frame.layout.height - 112 * scale) < 1e-9);
    assertEqualColumns(frame);
  }
});

test("all seven positions, size presets, fine-scale bounds, and caption-safe bottom", () => {
  for (const position of ENGAGEMENT_OVERLAY_POSITION_OPTIONS.map((option) => option.id)) {
    const frame = engagementFrame({ position });
    assert.equal(frame.position, position);
    assertEqualColumns(frame);
    assert.ok(frame.layout.x >= 0);
    assert.ok(frame.layout.y >= 0);
    assert.ok(frame.layout.x + frame.layout.width <= 1080 + 1e-6);
    assert.ok(frame.layout.y + frame.layout.height <= 1920 + 1e-6);
  }

  const widths = (["small", "medium", "large"] as const).map(
    (size) => engagementFrame({ size }).layout.width,
  );
  assert.ok(widths[0]! < widths[1]! && widths[1]! < widths[2]!);

  const min = engagementFrame({ scale: ENGAGEMENT_OVERLAY_MIN_SCALE });
  const max = engagementFrame({ scale: ENGAGEMENT_OVERLAY_MAX_SCALE });
  assert.ok(min.layout.width < max.layout.width);
  assertEqualColumns(min);
  assertEqualColumns(max);

  for (const [width, height] of [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const) {
    for (const position of ["bottom-left", "bottom-center", "bottom-right"] as const) {
      const frame = engagementFrame({ position }, 1000, width, height);
      const scale = Math.min(width / 1080, height / 1920);
      assert.ok(
        frame.layout.y + frame.layout.height <= height - 360 * scale + 1e-6,
      );
    }
  }
});

test("brand-sting tokens stay navy/lime and keep the locked Made with copy", () => {
  assert.equal(BRAND_STING_COLORS.backgroundTop, "#07111F");
  assert.equal(BRAND_STING_COLORS.backgroundBottom, "#07111F");
  assert.equal(
    BRAND_STING_COLORS.accentLine,
    shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.accentActive, 0.92),
  );
  assert.equal(BRAND_STING_LEAD_IN, "Made with");
  assert.equal(BRAND_STING_LEAD_IN_DISPLAY, "MADE WITH");
  assert.equal(BRAND_STING_LOCKUP_CENTER_Y_RATIO, 0.415);
  assert.equal(BRAND_STING_MARK_SIZE_REF, 128);
  const presets = readSrc("src/features/brand-sting/domain/brand-sting.presets.ts");
  assert.match(presets, /BRAND_STING_LEAD_IN = "Made with"/);
  assert.match(presets, /Arial, Helvetica, sans-serif/);
  assert.doesNotMatch(presets, /from ["']@\/features\/engagement-overlays/);
});

test("outro lockup is vertically centered and resolution-aware", () => {
  for (const [width, height] of [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const) {
    const plan = resolveBrandStingFrame({
      sting: createDefaultShortForgeBrandSting(2500),
      elapsedMs: 1200,
      frameWidth: width,
      frameHeight: height,
    });
    const scale = Math.min(width / 1080, height / 1920);
    assert.equal(plan.lockupCenterY, height * 0.415);
    assert.ok(plan.lockupCenterY / height >= 0.4);
    assert.ok(plan.lockupCenterY / height <= 0.43);
    assert.equal(plan.mark.size, 128 * scale);
    assert.equal(plan.mark.cx, width / 2);
    assert.ok(plan.mark.cy < plan.lockupCenterY);
    assert.ok(plan.leadInY > plan.mark.cy);
    assert.ok(plan.titleY > plan.leadInY);
    assert.ok(plan.subtitleY > plan.titleY);
    assert.ok(plan.accentLine.y > plan.subtitleY);
    assert.equal(plan.leadIn, "Made with");
    assert.equal(plan.leadInDisplay, "MADE WITH");
    assert.equal(plan.titlePrimary, "ShortForge");
    assert.equal(plan.titleSecondary, "Studio");
    assertFiniteValue(plan, `${width}x${height}`);
  }
});

test("ring, glow, beam, and accent-line plans are finite and seek-stable", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  const a = resolveBrandStingFrame({ sting, elapsedMs: 900 });
  const b = resolveBrandStingFrame({ sting, elapsedMs: 900 });
  assert.deepEqual(a, b);
  assert.equal(a.rings.length, 3);
  assert.equal(a.beams.length, 2);
  assert.ok(a.rings.every((ring) => ring.radius > 0 && ring.opacity >= 0));
  assert.ok(
    a.rings.every(
      (ring) =>
        ring.cx === a.mark.cx &&
        ring.cy === a.lockupCenterY &&
        ring.markers.length === 2 &&
        ring.markers.every(
          (marker) =>
            Number.isFinite(marker.x) &&
            Number.isFinite(marker.y) &&
            marker.radius > 0,
        ),
    ),
  );
  assert.equal(a.glow.cx, a.mark.cx);
  assert.equal(a.glow.cy, a.lockupCenterY);
  assert.equal(a.glow.color, BRAND_STING_COLORS.accentGlow);
  assert.equal(a.frameWidth, 1080);
  assert.equal(a.frameHeight, 1920);
  assert.ok(a.accentLine.reveal > 0);
  assert.ok(a.accentLine.width > 0);
  assert.ok(a.glow.radius > 0);
  assert.ok(a.glow.opacity > 0 && a.glow.opacity < 0.4);
});

test("2s/2.5s/3s timing stays proportional and never restarts", () => {
  const fractions = [0.12, 0.4, 0.62, 0.9] as const;
  const phases = fractions.map((fraction) => {
    const plans = ([2000, 2500, 3000] as const).map((durationMs) =>
      resolveBrandStingFrame({
        sting: createDefaultShortForgeBrandSting(durationMs),
        elapsedMs: fraction * durationMs,
      }),
    );
    assert.equal(new Set(plans.map((plan) => plan.phase)).size, 1);
    assert.ok(
      Math.abs(plans[0]!.leadInOpacity - plans[1]!.leadInOpacity) < 1e-9,
    );
    assert.ok(Math.abs(plans[0]!.titleOpacity - plans[2]!.titleOpacity) < 1e-9);
    return plans[0]!.phase;
  });
  assert.equal(phases[0], "entrance");
  assert.equal(phases[1], "hold");
  assert.equal(phases[2], "hold");
  assert.equal(phases[3], "exit");

  const entrance = resolveBrandStingFrame({
    sting: createDefaultShortForgeBrandSting(2500),
    elapsedMs: 300,
  });
  assert.equal(entrance.phase, "entrance");
  assert.ok(entrance.mark.reveal > entrance.leadInOpacity);
  assert.ok(entrance.leadInOpacity >= entrance.titleOpacity);
  assert.ok(entrance.titleOpacity >= entrance.subtitleOpacity);
});

test("last visible sting sample stays branded; terminal frame is neutral", () => {
  for (const durationMs of [2000, 2500, 3000] as const) {
    const sting = createDefaultShortForgeBrandSting(durationMs);
    const last = resolveBrandStingFrame({
      sting,
      elapsedMs: resolveBrandStingFinalElapsedMs(durationMs),
    });
    assert.equal(last.visible, true);
    assert.notEqual(last.phase, "hidden");
    assert.ok(
      last.titleOpacity > 0 || last.mark.opacity > 0 || last.leadInOpacity > 0,
    );
    assert.equal(last.leadIn, "Made with");
    assert.equal(last.titleSecondary, "Studio");

    const exit = resolveBrandStingFrame({
      sting,
      elapsedMs: Math.round(durationMs * 0.9),
    });
    assert.equal(exit.phase, "exit");
    assert.equal(exit.mark.reveal, 1);
    assert.ok(exit.mark.opacity < 1);
    assert.ok(Math.abs(exit.mark.opacity - exit.lockupOpacity) < 1e-9);
    const lateExit = resolveBrandStingFrame({
      sting,
      elapsedMs: resolveBrandStingFinalElapsedMs(durationMs),
    });
    assert.ok(lateExit.mark.opacity < 0.05);

    const terminal = resolveBrandStingFrame({
      sting,
      elapsedMs: resolveBrandStingTerminalElapsedMs(durationMs),
    });
    assert.equal(terminal.visible, false);
    assert.equal(terminal.phase, "hidden");
    assert.equal(terminal.leadInOpacity, 0);
    assert.equal(terminal.titleOpacity, 0);
    assert.equal(terminal.subtitleOpacity, 0);
    assert.equal(terminal.accentGlowOpacity, 0);
    assert.equal(terminal.mark.reveal, 0);
    assert.equal(terminal.mark.opacity, 0);
    assert.equal(terminal.lockupOpacity, 0);
    assert.equal(terminal.accentLine.reveal, 0);
    assert.ok(terminal.rings.every((ring) => ring.opacity === 0));
    assert.ok(terminal.beams.every((beam) => beam.opacity === 0));
    assert.equal(terminal.glow.opacity, 0);
    assertFiniteValue(terminal, `terminal-${durationMs}`);
  }
});

test("shared mark geometry is renderer-neutral and left-to-right", () => {
  const geometry = scaleBrandStingMarkGeometry(128);
  assert.equal(BRAND_STING_MARK_REVEAL_DIRECTION, "left-to-right");
  assert.equal(geometry.diamond.length, 4);
  assert.equal(geometry.forgeLines.length, 2);
  assert.equal(geometry.revealDirection, "left-to-right");
  assert.ok(geometry.strokeWidth > 0);
  const closed = resolveBrandStingMarkRevealClip(128, 0);
  const open = resolveBrandStingMarkRevealClip(128, 1);
  assert.equal(closed.width, 0);
  assert.equal(open.width, 256);
  assert.equal(open.x, -128);
  assert.equal(open.y, -128);
  const preview = readSrc(
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
  );
  const draw = readSrc("src/features/brand-sting/render/draw-brand-sting.ts");
  assert.match(preview, /from ["']\.\.\/domain\/brand-sting-mark-geometry["']/);
  assert.match(draw, /from ["']\.\.\/domain\/brand-sting-mark-geometry["']/);
  assert.doesNotMatch(
    readSrc("src/features/brand-sting/domain/brand-sting-mark-geometry.ts"),
    /use client|createContext|fetch\(|https?:\/\//,
  );
});

test("capability-off and legacy contracts stay fail-closed and un-reinterpreted", () => {
  const off = resolveBrandStingFrame({
    sting: { ...createDefaultShortForgeBrandSting(2500), enabled: false },
    elapsedMs: 1200,
  });
  assert.equal(off.visible, false);
  assert.equal(off.phase, "hidden");
  assert.equal(off.leadIn, "Made with");

  const missing = resolveEngagementOverlayFrame({
    overlay: undefined,
    sceneDurationMs: 5000,
    sceneElapsedMs: 1000,
  });
  assert.equal(missing.visible, false);
  assert.equal(missing.phase, "hidden");
  assertFiniteValue(missing, "missing-overlay");

  const contracts = readSrc(
    "src/features/visual-retention/domain/visual-retention-extension-contracts.ts",
  );
  assert.match(contracts, /SceneEngagementOverlayV1/);
  assert.match(contracts, /title: "ShortForge Studio"/);
  assert.match(contracts, /durationMs: 2000 \| 2500 \| 3000/);
  assert.doesNotMatch(contracts, /circle-plus|leadInDisplay|lockupCenterY/);

  const frameSrc = readSrc(
    "src/features/engagement-overlays/domain/resolve-engagement-overlay-frame.ts",
  );
  const stingSrc = readSrc(
    "src/features/brand-sting/domain/resolve-brand-sting-frame.ts",
  );
  assert.doesNotMatch(frameSrc, /Date\.now|Math\.random|requestAnimationFrame|fetch\(/);
  assert.doesNotMatch(stingSrc, /Date\.now|Math\.random|requestAnimationFrame|fetch\(/);
});

console.log(`\n${passed} passed\n`);
