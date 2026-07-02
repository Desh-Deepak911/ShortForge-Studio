/**
 * Publishing package verification (run: npm run test:publishing-package).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildManualChecklist,
  createPublishingPackage,
  getCopyAssets,
  normalizePublishingMetadata,
  updatePlatformStatus,
  updatePublishingPackageStatus,
} from "@/features/publishing";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLISHING_ROOT = __dirname;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectPublishingSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectPublishingSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const baseInput = {
  draftId: "draft-123",
  storyTitle: "Haaland Derby Winner",
  topic: "Manchester derby highlights",
  scriptMode: "match_recap" as const,
  templateId: "transfer_news" as const,
  exportProfileId: "youtube_shorts" as const,
  platforms: ["youtube_shorts", "instagram_reels", "x_video"] as const,
};

console.log("publishing-package");

test("createPublishingPackage builds package for YouTube, Instagram, and X", () => {
  const pkg = createPublishingPackage(baseInput);

  assert.ok(pkg.id.length > 0);
  assert.equal(pkg.draftId, "draft-123");
  assert.equal(pkg.storyTitle, "Haaland Derby Winner");
  assert.equal(pkg.exportProfileId, "youtube_shorts");
  assert.deepEqual(pkg.platforms, ["youtube_shorts", "instagram_reels", "x_video"]);
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.source.topic, "Manchester derby highlights");
  assert.equal(pkg.source.scriptMode, "match_recap");
  assert.equal(pkg.source.templateId, "transfer_news");
  assert.equal(pkg.checklist.length, 3);
});

test("checklist generated per platform with required steps", () => {
  const youtube = buildManualChecklist("youtube_shorts");
  assert.equal(youtube.platform, "youtube_shorts");
  assert.equal(youtube.items.length, 6);
  assert.deepEqual(
    youtube.items.map((item) => item.label),
    [
      "Download MP4",
      "Copy title/caption",
      "Copy description/tags",
      "Open YouTube Studio",
      "Upload manually",
      "Mark published",
    ],
  );
  assert.ok(youtube.items.every((item) => item.completed === false));
});

test("copy assets returned per platform from metadata", () => {
  const pkg = createPublishingPackage({
    ...baseInput,
    metadata: {
      common: { hook: "What a finish!", keywords: ["haaland", "derby"], callToAction: "Follow for more" },
      youtube: {
        title: "Haaland wins the derby",
        description: "Full recap of the Manchester derby.",
        tags: ["shorts", "football"],
      },
      instagram: {
        caption: "Derby day magic from Haaland.",
        hashtags: ["football", "reels"],
      },
      x: {
        post: "Haaland did it again.",
        hashtags: ["MCFC"],
      },
    },
  });

  const youtubeAssets = getCopyAssets(pkg, "youtube_shorts");
  assert.ok(youtubeAssets.assets.some((asset) => asset.id === "title" && asset.value.includes("Haaland")));
  assert.ok(youtubeAssets.assets.some((asset) => asset.id === "tags"));

  const instagramAssets = getCopyAssets(pkg, "instagram_reels");
  assert.ok(instagramAssets.assets.some((asset) => asset.id === "caption"));
  assert.ok(instagramAssets.assets.some((asset) => asset.id === "hashtags" && asset.value.includes("#football")));

  const xAssets = getCopyAssets(pkg, "x_video");
  assert.ok(xAssets.assets.some((asset) => asset.id === "post"));
  assert.ok(xAssets.assets.some((asset) => asset.id === "hashtags"));
});

test("missing metadata resolves to safe empty strings and arrays", () => {
  const normalized = normalizePublishingMetadata(undefined);
  assert.equal(normalized.common.hook, "");
  assert.deepEqual(normalized.common.keywords, []);
  assert.equal(normalized.youtube.title, "");
  assert.deepEqual(normalized.instagram.hashtags, []);
  assert.equal(normalized.x.post, "");

  const emptyCopy = getCopyAssets(
    createPublishingPackage({ ...baseInput, platforms: ["youtube_shorts"] }),
    "youtube_shorts",
  );
  assert.deepEqual(emptyCopy.assets, []);
});

test("status updates are immutable", () => {
  const pkg = createPublishingPackage(baseInput);
  const statusUpdated = updatePublishingPackageStatus(pkg, "ready");
  const platformUpdated = updatePlatformStatus(pkg, "youtube_shorts", "published");

  assert.equal(pkg.status, "draft");
  assert.equal(statusUpdated.status, "ready");
  assert.notEqual(pkg, statusUpdated);
  assert.equal(getPlatformStatusFrom(pkg, "youtube_shorts"), "pending");
  assert.equal(getPlatformStatusFrom(platformUpdated, "youtube_shorts"), "published");
  assert.notEqual(pkg, platformUpdated);

  const markPublished = platformUpdated.checklist.find((entry) => entry.platform === "youtube_shorts");
  assert.ok(markPublished?.items.find((item) => item.id === "mark_published")?.completed);
});

function getPlatformStatusFrom(
  pkg: ReturnType<typeof createPublishingPackage>,
  platform: (typeof baseInput.platforms)[number],
): string | undefined {
  return pkg.platformStatuses.find((entry) => entry.platform === platform)?.status;
}

test("exported asset reference does not persist blobs", () => {
  const pkg = createPublishingPackage({
    ...baseInput,
    exportedAsset: {
      fileName: "youtube-haaland-derby-winner.mp4",
      objectUrl: "blob:http://localhost/abc-123",
      exportId: "export-001",
      mimeType: "video/mp4",
      durationSec: 42,
    },
  });

  assert.equal(pkg.status, "exported");
  assert.equal(pkg.exportedAsset?.fileName, "youtube-haaland-derby-winner.mp4");
  assert.ok(!("blob" in (pkg.exportedAsset ?? {})));
  assert.ok(!("data" in (pkg.exportedAsset ?? {})));

  const sources = collectPublishingSources(PUBLISHING_ROOT);
  const forbiddenBlobPatterns = [/\bBlob\b/, /\bArrayBuffer\b/, /\bUint8Array\b/];

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenBlobPatterns) {
      assert.doesNotMatch(source, pattern, `${filePath} must not persist video blobs`);
    }
  }
});

test("no platform SDK or OAuth imports in publishing module", () => {
  const forbidden = [
    /from\s+["']googleapis/,
    /from\s+["']@google\//,
    /from\s+["']instagram/,
    /from\s+["']twitter-api/,
    /from\s+["']@x\.dev/,
    /oauth2?Client/i,
    /graph\.facebook\.com/,
    /api\.x\.com\/2/,
  ];

  const sources = collectPublishingSources(PUBLISHING_ROOT);
  assert.ok(sources.length >= 3);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay foundation-only`);
    }
  }
});

test("no export render pipeline imports in publishing module", () => {
  const forbidden = [
    /video-render\.service/,
    /exportFootieShort/,
    /MediaRecorder/,
    /ffmpeg/i,
    /exportSettingsToQualityPreset/,
  ];

  const sources = collectPublishingSources(PUBLISHING_ROOT);
  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must not import render pipeline`);
    }
  }
});

console.log("publishing-package passed");
