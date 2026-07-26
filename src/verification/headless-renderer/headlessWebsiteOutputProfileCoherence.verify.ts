import assert from "node:assert/strict";

import { rendererProfileFromFrozenManifest } from "@/features/headless-renderer/product/snapshot/renderer-profile-from-manifest";

function output(
  overrides: Partial<{
    format: "webm" | "mp4";
    resolution: "720p" | "1080p";
    width: number;
    height: number;
    fps: 30;
    quality: "standard" | "high";
  }> = {},
) {
  return {
    format: "webm" as const,
    resolution: "720p" as const,
    width: 720,
    height: 1280,
    fps: 30 as const,
    quality: "high" as const,
    ...overrides,
  } as never;
}

const high720 = rendererProfileFromFrozenManifest(
  { resolution: "720p", format: "webm" },
  output(),
);
assert.deepEqual(high720, {
  resolution: "720p",
  format: "webm",
  fps: 30,
  quality: "high",
});

const elevated4k = rendererProfileFromFrozenManifest(
  { resolution: "4k", format: "mp4" },
  output({
    format: "mp4",
    resolution: "1080p",
    width: 1080,
    height: 1920,
    quality: "standard",
  }),
);
assert.deepEqual(elevated4k, {
  resolution: "4k",
  format: "mp4",
  fps: 30,
  quality: "standard",
});

assert.equal(
  rendererProfileFromFrozenManifest(
    { resolution: "720p", format: "webm" },
    output({ format: "mp4" }),
  ),
  null,
);
assert.equal(
  rendererProfileFromFrozenManifest(
    { resolution: "720p", format: "webm" },
    output({
      resolution: "1080p",
      width: 1080,
      height: 1920,
    }),
  ),
  null,
);
assert.equal(
  rendererProfileFromFrozenManifest(
    { resolution: "4k", format: "webm" },
    output(),
  ),
  null,
);

console.log("5 tests passed.");
