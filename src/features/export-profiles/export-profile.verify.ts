/**
 * Export profile verification (run: npm run test:export-profiles).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyExportProfileToSettings,
  buildExportFileName,
  DEFAULT_EXPORT_PROFILE_ID,
  EXPORT_PROFILE_IDS,
  getExportProfile,
  getExportProfileNotices,
  getExportProfiles,
  resolveExportProfileId,
} from "@/features/export-profiles";
import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_QUALITY_TIER,
  DEFAULT_EXPORT_RESOLUTION,
  normalizeExportSettings,
  resolveExportSettings,
} from "@/features/export/utils/export-settings.utils";
import type { FootieScript } from "@/features/story/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_PROFILES_ROOT = __dirname;
const REPO_ROOT = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectExportProfileSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectExportProfileSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

const baseScript: FootieScript = {
  title: "Haaland Derby Winner",
  narration: "A classic finish.",
  totalDuration: 45,
  scenes: [{ id: "1", start: 0, end: 45, duration: 45, subtitle: "Goal" }],
};

console.log("export-profiles");

test("all presets registered with unique ids", () => {
  assert.equal(EXPORT_PROFILE_IDS.length, 4);
  assert.equal(getExportProfiles().length, 4);
  assert.equal(new Set(EXPORT_PROFILE_IDS).size, EXPORT_PROFILE_IDS.length);
});

test("generic_mp4 matches legacy default export settings", () => {
  const generic = getExportProfile("generic_mp4");
  assert.ok(generic);

  const legacyDefaults = normalizeExportSettings(undefined, baseScript.title);
  const applied = applyExportProfileToSettings(legacyDefaults, generic, baseScript);

  assert.equal(applied.format, DEFAULT_EXPORT_FORMAT);
  assert.equal(applied.quality, DEFAULT_EXPORT_QUALITY_TIER);
  assert.equal(applied.resolution, DEFAULT_EXPORT_RESOLUTION);
  assert.equal(applied.exportProfileId, "generic_mp4");
});

test("platform presets resolve to vertical 1080x1920 MP4 high", () => {
  for (const profileId of ["youtube_shorts", "instagram_reels", "x_video"] as const) {
    const profile = getExportProfile(profileId);
    assert.ok(profile);

    const applied = applyExportProfileToSettings(
      normalizeExportSettings(undefined, baseScript.title),
      profile,
      baseScript,
    );

    assert.equal(applied.format, "mp4");
    assert.equal(applied.resolution, "1080x1920");
    assert.equal(applied.quality, "high");
    assert.equal(applied.exportProfileId, profileId);
  }
});

test("applyExportProfileToSettings preserves user overrides on subsequent patches", () => {
  const profile = getExportProfile("youtube_shorts");
  assert.ok(profile);

  let settings = applyExportProfileToSettings(
    normalizeExportSettings(undefined, baseScript.title),
    profile,
    baseScript,
  );

  settings = { ...settings, resolution: "720x1280", quality: "standard" };
  assert.equal(settings.resolution, "720x1280");
  assert.equal(settings.quality, "standard");
  assert.equal(settings.exportProfileId, "youtube_shorts");
});

test("buildExportFileName applies platform prefix patterns", () => {
  const youtube = getExportProfile("youtube_shorts");
  assert.ok(youtube);
  assert.equal(buildExportFileName(youtube, baseScript), "youtube-haaland-derby-winner");
});

test("getExportProfileNotices includes safe area and duration hints", () => {
  const instagram = getExportProfile("instagram_reels");
  assert.ok(instagram);

  const notices = getExportProfileNotices(instagram, { totalDuration: 120 });
  assert.ok(notices.some((notice) => notice.kind === "safe_area"));
  assert.ok(notices.some((notice) => notice.kind === "upload"));
  assert.ok(notices.some((notice) => notice.kind === "duration"));
});

test("resolveExportProfileId defaults to generic when missing", () => {
  assert.equal(resolveExportProfileId(undefined), DEFAULT_EXPORT_PROFILE_ID);
  assert.equal(resolveExportProfileId({}), DEFAULT_EXPORT_PROFILE_ID);
});

test("legacy exports without exportProfileId resolve unchanged", () => {
  assert.deepEqual(resolveExportSettings(baseScript), {
    fileName: "haaland-derby-winner",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });
});

test("no platform SDK or OAuth imports in export-profiles module", () => {
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

  const sources = collectExportProfileSources(EXPORT_PROFILES_ROOT);
  assert.ok(sources.length >= 3);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay preset-only`);
    }
  }
});

test("ExportPanel wires export profile selector", () => {
  const panel = readRepo("src/components/ExportPanel.tsx");
  assert.match(panel, /Export for/);
  assert.match(panel, /getExportProfiles/);
  assert.match(panel, /applyExportProfileToSettings/);
  assert.match(panel, /getExportProfileNotices/);
  assert.doesNotMatch(panel, /video-render\.service/);
});

console.log("export-profiles passed");
