/**
 * Publishing metadata generator verification (run: npm run test:publishing-metadata).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplatePromptHints, getCreatorTemplate } from "@/features/creator-templates";
import {
  applyPublishingMetadataToPackage,
  createPublishingPackage,
  generatePublishingMetadata,
  getCopyAssets,
  X_POST_CHAR_LIMIT,
  YOUTUBE_TAG_MAX,
  YOUTUBE_TAG_MIN,
} from "@/features/publishing";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METADATA_GENERATOR_ROOT = __dirname;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectMetadataGeneratorSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMetadataGeneratorSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const basePlatforms = ["youtube_shorts", "instagram_reels", "x_video"] as const;

console.log("publishing-metadata");

test("educational bullet template generates educational-style metadata", () => {
  const template = getCreatorTemplate("educational_bullet_points");
  assert.ok(template);

  const result = generatePublishingMetadata({
    title: "Offside rule explained",
    topic: "Offside rule basics",
    narration: "Offside is one of football's most debated rules. Here is a quick guide.",
    templateId: "educational_bullet_points",
    templatePromptHints: buildTemplatePromptHints(template) ?? undefined,
    scriptMode: "story",
    platforms: [...basePlatforms],
  });

  const combined = [
    result.metadata.common.hook,
    result.metadata.youtube.title,
    result.metadata.youtube.description,
    result.metadata.instagram.caption,
  ]
    .join(" ")
    .toLowerCase();

  assert.match(combined, /guide|explained|learn|football explained/);
  assert.equal(result.diagnostics.usedTemplatePromptHints, true);
});

test("top 10 template generates countdown-style metadata", () => {
  const template = getCreatorTemplate("top_10_countdown");
  assert.ok(template);

  const result = generatePublishingMetadata({
    title: "Best Premier League goals",
    topic: "Premier League goal rankings",
    narration: "Starting at number ten, here are the strikes that changed games.",
    templateId: "top_10_countdown",
    templatePromptHints: buildTemplatePromptHints(template) ?? undefined,
    scriptMode: "top_5",
    platforms: [...basePlatforms],
  });

  const combined = [
    result.metadata.common.hook,
    result.metadata.youtube.title,
    result.metadata.x.post,
  ]
    .join(" ")
    .toLowerCase();

  assert.match(combined, /top 10|counting down|countdown|top picks/);
  assert.ok(result.metadata.youtube.tags.includes("top10"));
});

test("transfer news template generates news-style metadata", () => {
  const template = getCreatorTemplate("transfer_news");
  assert.ok(template);

  const result = generatePublishingMetadata({
    title: "Star striker linked with move",
    topic: "Transfer rumor roundup",
    narration: "Reports suggest talks are ongoing ahead of the window deadline.",
    templateId: "transfer_news",
    templatePromptHints: buildTemplatePromptHints(template) ?? undefined,
    scriptMode: "match_recap",
    platforms: [...basePlatforms],
  });

  const combined = [
    result.metadata.common.hook,
    result.metadata.youtube.title,
    result.metadata.youtube.description,
  ]
    .join(" ")
    .toLowerCase();

  assert.match(combined, /transfer|update|news/);
  assert.ok(result.metadata.youtube.tags.includes("transfernews"));
});

test("X post stays within platform character limit", () => {
  const result = generatePublishingMetadata({
    title: "A very long title about every possible detail in the Manchester derby and every moment that changed the game forever",
    topic: "Manchester derby extended recap with every talking point",
    narration:
      "This is an intentionally long narration line meant to test truncation behavior for social metadata generation without inventing any new facts beyond the provided script context.",
    templateId: "transfer_news",
    platforms: [...basePlatforms],
  });

  assert.ok(result.metadata.x.post.length <= X_POST_CHAR_LIMIT);
});

test("YouTube tags are returned as a 5–10 item array", () => {
  const result = generatePublishingMetadata({
    title: "Haaland derby winner",
    topic: "Manchester derby",
    narration: "Haaland finishes the move in stoppage time.",
    platforms: ["youtube_shorts"],
  });

  assert.ok(Array.isArray(result.metadata.youtube.tags));
  assert.ok(result.metadata.youtube.tags.length >= YOUTUBE_TAG_MIN);
  assert.ok(result.metadata.youtube.tags.length <= YOUTUBE_TAG_MAX);
});

test("Instagram hashtags are hash formatted", () => {
  const result = generatePublishingMetadata({
    title: "Haaland derby winner",
    topic: "Manchester derby",
    narration: "Haaland finishes the move in stoppage time.",
    platforms: ["instagram_reels"],
  });

  assert.ok(result.metadata.instagram.hashtags.length > 0);
  assert.ok(result.metadata.instagram.hashtags.every((tag) => tag.startsWith("#")));
});

test("applyPublishingMetadataToPackage updates package immutably", () => {
  const pkg = createPublishingPackage({
    draftId: "draft-1",
    storyTitle: "Haaland Derby Winner",
    platforms: [...basePlatforms],
  });

  const generated = generatePublishingMetadata({
    title: pkg.storyTitle,
    topic: "Manchester derby",
    narration: "Haaland scores the winner.",
    platforms: [...basePlatforms],
  });

  const updated = applyPublishingMetadataToPackage(pkg, generated.metadata);

  assert.notEqual(pkg, updated);
  assert.equal(pkg.metadata.youtube.title, "");
  assert.ok(updated.metadata.youtube.title.length > 0);
  assert.ok(updated.updatedAt >= pkg.updatedAt);
});

test("copy assets include generated metadata for each platform", () => {
  const generated = generatePublishingMetadata({
    title: "Haaland derby winner",
    topic: "Manchester derby",
    narration: "Haaland finishes the move in stoppage time.",
    templateId: "transfer_news",
    platforms: [...basePlatforms],
  });

  const pkg = applyPublishingMetadataToPackage(
    createPublishingPackage({
      draftId: "draft-copy",
      storyTitle: "Haaland derby winner",
      platforms: [...basePlatforms],
    }),
    generated.metadata,
  );

  const youtube = getCopyAssets(pkg, "youtube_shorts");
  const instagram = getCopyAssets(pkg, "instagram_reels");
  const x = getCopyAssets(pkg, "x_video");

  assert.ok(youtube.assets.some((asset) => asset.id === "title"));
  assert.ok(instagram.assets.some((asset) => asset.id === "caption"));
  assert.ok(x.assets.some((asset) => asset.id === "post"));
});

test("missing narration handled safely without invented facts", () => {
  const result = generatePublishingMetadata({
    title: "Haaland derby winner",
    topic: "Manchester derby",
    platforms: [...basePlatforms],
  });

  assert.equal(result.diagnostics.narrationAvailable, false);
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes("Narration missing")));
  assert.ok(result.metadata.common.hook.length > 0);
  assert.doesNotMatch(result.metadata.youtube.description, /confirmed|official|breaking news/i);
});

test("no platform SDK or OAuth imports in metadata generator", () => {
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

  const sources = collectMetadataGeneratorSources(METADATA_GENERATOR_ROOT);
  assert.ok(sources.length >= 3);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay metadata-only`);
    }
  }
});

test("no export renderer imports in metadata generator", () => {
  const forbidden = [
    /video-render\.service/,
    /exportFootieShort/,
    /MediaRecorder/,
    /ffmpeg/i,
    /exportSettingsToQualityPreset/,
  ];

  const sources = collectMetadataGeneratorSources(METADATA_GENERATOR_ROOT);
  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must not import render pipeline`);
    }
  }
});

console.log("publishing-metadata passed");
