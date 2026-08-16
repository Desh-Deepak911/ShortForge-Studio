/**
 * Brand Sting commands must not rewrite engagement overlays.
 * Run via: npm run test:brand-sting-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  disableBrandSting,
  enableBrandSting,
  setBrandStingDurationMs,
} from "@/features/brand-sting";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function story(sceneIds: readonly string[] = ["scene-a"]): FootieScript {
  return syncFootieScript({
    title: "Immutability",
    narration: "Hello world",
    totalDuration: sceneIds.length * 4,
    scenes: sceneIds.map((id, index) => ({
      id,
      start: index * 4,
      end: (index + 1) * 4,
      duration: 4,
      startMs: index * 4000,
      endMs: (index + 1) * 4000,
      durationMs: 4000,
      subtitle: "Hello",
      narration: "Hello",
      media: {
        type: "image",
        url: "https://example.com/i.jpg",
        source: "upload",
      },
    })),
  });
}

const LEGACY_OVERLAY = {
  version: 1 as const,
  id: "keep-overlay",
  kind: "subscribe" as const,
  startOffsetMs: 500,
  durationMs: 1500,
  position: "top-right" as const,
  presetId: "compact-pill-v1",
};

const MODERN_OVERLAY = {
  ...LEGACY_OVERLAY,
  id: "modern-overlay",
  size: "large" as const,
  scale: 1.1,
};

function withOverlays(
  script: FootieScript,
  overlaysBySceneId: Record<string, readonly object[]>,
  sting?: unknown,
): FootieScript {
  return {
    ...script,
    visualRetentionExtensions: {
      version: 1,
      engagementOverlaysBySceneId: overlaysBySceneId as never,
      ...(sting ? { shortForgeBrandSting: sting as never } : {}),
    },
  };
}

function overlayJson(script: FootieScript): string {
  return JSON.stringify(
    script.visualRetentionExtensions?.engagementOverlaysBySceneId,
  );
}

function extensionsJson(script: FootieScript): string {
  return JSON.stringify(script.visualRetentionExtensions ?? null);
}

console.log("\nbrand-sting-command-immutability\n");

test("commands do not import or call the engagement overlay normalizer", () => {
  const commands = readSrc(
    "src/features/brand-sting/editor/brand-sting.commands.ts",
  );
  assert.doesNotMatch(commands, /normalizeVisualRetentionProjectExtensions/);
  assert.doesNotMatch(commands, /normalizeSceneEngagementOverlay/);
  assert.doesNotMatch(
    commands,
    /from ["']@\/features\/engagement-overlays/,
  );
});

test("legacy overlay without size/scale stays byte-identical across enable/duration/disable", () => {
  const script = withOverlays(story(), { "scene-a": [LEGACY_OVERLAY] });
  const before = overlayJson(script);
  assert.doesNotMatch(before, /"size"/);
  assert.doesNotMatch(before, /"scale"/);

  const enabled = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  assert.equal(enabled.status, "ok");
  assert.equal(overlayJson(enabled.script), before);

  const duration = setBrandStingDurationMs(enabled.script, 3000, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(duration.status, "ok");
  assert.equal(overlayJson(duration.script), before);

  const disabled = disableBrandSting(duration.script, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(disabled.status, "ok");
  assert.equal(overlayJson(disabled.script), before);
  assert.equal(disabled.script.visualRetentionExtensions?.shortForgeBrandSting, undefined);
});

test("modern overlay with size/scale stays byte-identical", () => {
  const script = withOverlays(story(), { "scene-a": [MODERN_OVERLAY] });
  const before = overlayJson(script);
  const enabled = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  assert.equal(overlayJson(enabled.script), before);
  assert.match(before, /"size":"large"/);
  assert.match(before, /"scale":1\.1/);
});

test("multiple scenes and overlays stay byte-identical", () => {
  const script = withOverlays(story(["scene-a", "scene-b"]), {
    "scene-a": [LEGACY_OVERLAY],
    "scene-b": [{ ...MODERN_OVERLAY, id: "scene-b-overlay", kind: "combined" }],
  });
  const before = overlayJson(script);
  const enabled = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  const duration = setBrandStingDurationMs(enabled.script, 2000, {
    shortForgeBrandStingEnabled: true,
  });
  const disabled = disableBrandSting(duration.script, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(overlayJson(enabled.script), before);
  assert.equal(overlayJson(duration.script), before);
  assert.equal(overlayJson(disabled.script), before);
});

test("capability refusal preserves overlays and does not enable a sting", () => {
  const script = withOverlays(story(), { "scene-a": [LEGACY_OVERLAY] });
  const before = extensionsJson(script);
  const refused = enableBrandSting(script, {
    shortForgeBrandStingEnabled: false,
  });
  assert.equal(refused.status, "terminal");
  assert.equal(refused.brandSting, undefined);
  assert.equal(extensionsJson(refused.script), before);
  assert.equal(overlayJson(refused.script), overlayJson(script));
});

test("malformed Brand Sting does not corrupt valid engagement overlays", () => {
  const script = withOverlays(
    story(),
    { "scene-a": [LEGACY_OVERLAY] },
    {
      version: 1,
      enabled: true,
      title: "Not ShortForge",
      durationMs: 2500,
    },
  );
  const before = overlayJson(script);
  const enabled = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  assert.equal(enabled.status, "ok");
  assert.equal(overlayJson(enabled.script), before);
  assert.equal(enabled.brandSting?.title, "ShortForge Studio");
});

test("input script is not mutated; repeated commands stay byte-stable", () => {
  const script = withOverlays(story(), { "scene-a": [LEGACY_OVERLAY] });
  const inputSnapshot = JSON.stringify(script);
  const first = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  const second = enableBrandSting(script, { shortForgeBrandStingEnabled: true });
  assert.equal(JSON.stringify(script), inputSnapshot);
  assert.equal(overlayJson(first.script), overlayJson(second.script));
  assert.equal(
    JSON.stringify(first.script.visualRetentionExtensions?.shortForgeBrandSting),
    JSON.stringify(second.script.visualRetentionExtensions?.shortForgeBrandSting),
  );
  assert.notEqual(first.script, script);
});

test("removing Brand Sting drops extensions only when no other data remains", () => {
  const stingOnly = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  });
  const removed = disableBrandSting(stingOnly.script, {
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(removed.script.visualRetentionExtensions, undefined);

  const withOverlay = withOverlays(story(), { "scene-a": [LEGACY_OVERLAY] });
  const enabled = enableBrandSting(withOverlay, {
    shortForgeBrandStingEnabled: true,
  });
  const disabled = disableBrandSting(enabled.script, {
    shortForgeBrandStingEnabled: true,
  });
  assert.ok(disabled.script.visualRetentionExtensions);
  assert.equal(overlayJson(disabled.script), overlayJson(withOverlay));
});

console.log(`\n${passed} passed\n`);
