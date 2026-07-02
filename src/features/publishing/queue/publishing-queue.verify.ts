/**
 * Publishing queue verification (run: npm run test:publishing-queue).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyPublishingMetadataToPackage,
  createPublishingPackage,
  generatePublishingMetadata,
  getCopyAssets,
} from "@/features/publishing";
import {
  buildDailyPublishingSchedule,
  clearPublishingSchedule,
  formatPublishingSchedule,
  getPublishingScheduleState,
  getZonedDateTimeParts,
  updatePublishingSchedule,
  zonedLocalDateTimeToUtcMs,
} from "@/features/publishing/publishing-schedule.utils";
import {
  addPublishingPackage,
  assetReferenceContainsForbiddenBlobFields,
  clearPublishingPackageSchedule,
  createMemoryPublishingQueueStorageAdapter,
  getPublishingPackage,
  getPublishingPackages,
  normalizePublishingQueuePackage,
  removePublishingPackage,
  safeParsePublishingQueueStore,
  sanitizePublishingAssetReference,
  savePublishingPackageSchedule,
  updatePackageStatus,
  updatePlatformStatus,
  updatePublishingPackage,
} from "@/features/publishing/queue";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_ROOT = __dirname;
const REPO_ROOT = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectQueueSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectQueueSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function createSamplePackage() {
  const generated = generatePublishingMetadata({
    title: "Haaland Derby Winner",
    topic: "Manchester derby",
    narration: "Haaland finishes the move in stoppage time.",
    templateId: "transfer_news",
    scriptMode: "match_recap",
    platforms: ["youtube_shorts", "instagram_reels", "x_video"],
  });

  return applyPublishingMetadataToPackage(
    createPublishingPackage({
      draftId: "draft-queue-1",
      storyTitle: "Haaland Derby Winner",
      topic: "Manchester derby",
      scriptMode: "match_recap",
      templateId: "transfer_news",
      exportProfileId: "youtube_shorts",
      platforms: ["youtube_shorts", "instagram_reels", "x_video"],
      exportedAsset: {
        fileName: "youtube-haaland-derby-winner.mp4",
        exportId: "export-001",
        mimeType: "video/mp4",
        durationSec: 42,
      },
    }),
    generated.metadata,
  );
}

const adapter = createMemoryPublishingQueueStorageAdapter();
const withAdapter = { adapter };

console.log("publishing-queue");

test("add/list/update/remove package", () => {
  const pkg = createSamplePackage();
  const added = addPublishingPackage(pkg, withAdapter);
  assert.equal(added.ok, true);

  const listed = getPublishingPackages(withAdapter);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, pkg.id);

  const updated = updatePublishingPackage(
    {
      ...pkg,
      storyTitle: "Updated Derby Winner",
    },
    withAdapter,
  );
  assert.equal(updated.ok, true);
  assert.equal(getPublishingPackage(pkg.id, withAdapter)?.storyTitle, "Updated Derby Winner");

  assert.equal(removePublishingPackage(pkg.id, withAdapter), true);
  assert.equal(getPublishingPackages(withAdapter).length, 0);
});

test("status update is immutable for stored package snapshots", () => {
  const pkg = createSamplePackage();
  addPublishingPackage(pkg, withAdapter);

  const before = getPublishingPackage(pkg.id, withAdapter);
  assert.ok(before);
  assert.equal(before.status, "exported");

  const updated = updatePackageStatus(pkg.id, "ready", withAdapter);
  assert.ok(updated);
  assert.equal(updated.status, "ready");
  assert.equal(before.status, "exported");
  assert.notEqual(before, updated);
});

test("platform status update persists checklist and aggregate status", () => {
  const pkg = createSamplePackage();
  addPublishingPackage(pkg, withAdapter);

  const updated = updatePlatformStatus(pkg.id, "youtube_shorts", "published", withAdapter);
  assert.ok(updated);
  assert.equal(
    updated.platformStatuses.find((entry) => entry.platform === "youtube_shorts")?.status,
    "published",
  );
  assert.equal(updated.status, "partially_published");

  updatePlatformStatus(pkg.id, "instagram_reels", "published", withAdapter);
  const afterInstagram = updatePlatformStatus(pkg.id, "x_video", "published", withAdapter);
  assert.ok(afterInstagram);
  assert.equal(afterInstagram.status, "published");
});

test("no blob persistence in sanitized asset references", () => {
  const sanitized = sanitizePublishingAssetReference({
    fileName: "clip.mp4",
    blob: new Blob(["video"]) as unknown as string,
    data: "base64-payload",
  } as unknown as Parameters<typeof sanitizePublishingAssetReference>[0]);

  assert.ok(sanitized);
  assert.equal(sanitized.fileName, "clip.mp4");
  assert.ok(!("blob" in (sanitized ?? {})));
  assert.ok(!("data" in (sanitized ?? {})));

  const normalized = normalizePublishingQueuePackage({
    ...createSamplePackage(),
    exportedAsset: {
      fileName: "clip.mp4",
      blob: "should-not-persist",
    },
  });
  assert.ok(normalized);
  assert.ok(!normalized.exportedAsset || !("blob" in normalized.exportedAsset));
  assert.equal(assetReferenceContainsForbiddenBlobFields({ blob: "x" }), true);
});

test("copy assets available for queued package metadata", () => {
  const pkg = createSamplePackage();
  addPublishingPackage(pkg, withAdapter);
  const stored = getPublishingPackage(pkg.id, withAdapter);
  assert.ok(stored);

  const youtube = getCopyAssets(stored, "youtube_shorts");
  const instagram = getCopyAssets(stored, "instagram_reels");
  assert.ok(youtube.assets.some((asset) => asset.id === "title"));
  assert.ok(instagram.assets.some((asset) => asset.id === "caption"));
});

test("old or empty queue loads safely", () => {
  assert.deepEqual(safeParsePublishingQueueStore(null).packages, []);
  assert.deepEqual(safeParsePublishingQueueStore("not-json").packages, []);
  assert.deepEqual(safeParsePublishingQueueStore("{}").packages, []);
  assert.deepEqual(safeParsePublishingQueueStore('{"version":2,"packages":[]}').packages, []);

  const corruptAdapter = createMemoryPublishingQueueStorageAdapter();
  corruptAdapter.setItem(
    "footiebitz:publishing-queue:v1",
    JSON.stringify({
      version: 1,
      packages: [{ id: "", draftId: "", storyTitle: "" }],
    }),
  );

  assert.deepEqual(getPublishingPackages({ adapter: corruptAdapter }), []);
});

test("no platform SDK imports in publishing queue module", () => {
  const forbidden = [
    /from\s+["']googleapis/,
    /from\s+["']@google\//,
    /from\s+["']instagram/,
    /from\s+["']twitter-api/,
    /oauth2?Client/i,
    /graph\.facebook\.com/,
  ];

  const sources = collectQueueSources(QUEUE_ROOT);
  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay local-only`);
    }
  }
});

test("no export renderer imports in publishing queue module", () => {
  const forbidden = [/video-render\.service/, /exportFootieShort/, /MediaRecorder/, /ffmpeg/i];

  const sources = collectQueueSources(QUEUE_ROOT);
  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must not import render pipeline`);
    }
  }
});

test("PublishingQueuePanel UI entry point exists", () => {
  const panel = readFileSync(join(QUEUE_ROOT, "components/PublishingQueuePanel.tsx"), "utf8");
  assert.match(panel, /Mark published/);
  assert.match(panel, /CopyButton/);
  assert.match(panel, /getPublishingScheduleState/);
  assert.match(panel, /scheduleState\.label/);
  assert.match(panel, /PublishingScheduleEditor/);
  assert.doesNotMatch(panel, /Start upload|Upload video|platform API/i);
});

test("schedule set and cleared immutably on package", () => {
  const pkg = createSamplePackage();
  const daily = buildDailyPublishingSchedule({ hour: 22, minute: 0, timezone: "Asia/Kolkata" });

  const scheduled = updatePublishingSchedule(pkg, daily);
  assert.notEqual(pkg.schedule, scheduled.schedule);
  assert.equal(scheduled.schedule?.recurrence, "daily");
  assert.equal(scheduled.schedule?.reminderOnly, true);

  const cleared = clearPublishingSchedule(scheduled);
  assert.equal(cleared.schedule, undefined);
  assert.equal(scheduled.schedule?.timezone, "Asia/Kolkata");
});

test("daily 10 PM IST stored correctly", () => {
  const from = new Date(
    zonedLocalDateTimeToUtcMs(
      { year: 2026, month: 6, day: 20, hour: 9, minute: 0 },
      "Asia/Kolkata",
    ),
  );

  const schedule = buildDailyPublishingSchedule({
    hour: 22,
    minute: 0,
    timezone: "Asia/Kolkata",
    from,
  });

  assert.equal(schedule.timezone, "Asia/Kolkata");
  assert.equal(schedule.recurrence, "daily");
  assert.equal(schedule.reminderOnly, true);

  const parts = getZonedDateTimeParts(new Date(schedule.scheduledForIso), "Asia/Kolkata");
  assert.equal(parts.hour, 22);
  assert.equal(parts.minute, 0);
  assert.match(formatPublishingSchedule({ ...createSamplePackage(), schedule }) ?? "", /Daily at .*10:00 PM/i);
});

test("due, upcoming, and overdue states resolve", () => {
  const pkg = createSamplePackage();
  const timezone = "Asia/Kolkata";
  const dueAt = zonedLocalDateTimeToUtcMs(
    { year: 2026, month: 6, day: 20, hour: 22, minute: 0 },
    timezone,
  );

  const scheduledPkg = updatePublishingSchedule(pkg, {
    scheduledForIso: new Date(dueAt).toISOString(),
    timezone,
    recurrence: "none",
    reminderOnly: true,
  });

  const upcoming = getPublishingScheduleState(
    scheduledPkg,
    new Date(dueAt - 60 * 60 * 1000),
  );
  assert.equal(upcoming.state, "upcoming");

  const dueToday = getPublishingScheduleState(scheduledPkg, new Date(dueAt + 5 * 60 * 1000));
  assert.equal(dueToday.state, "due_today");

  const overdue = getPublishingScheduleState(
    scheduledPkg,
    new Date(dueAt + 4 * 60 * 60 * 1000),
  );
  assert.equal(overdue.state, "overdue");
});

test("queue persists schedule via save and clear helpers", () => {
  const pkg = createSamplePackage();
  addPublishingPackage(pkg, withAdapter);

  const daily = buildDailyPublishingSchedule({ hour: 22, minute: 0, timezone: "Asia/Kolkata" });
  const saved = savePublishingPackageSchedule(pkg.id, daily, withAdapter);
  assert.ok(saved?.schedule);
  assert.equal(getPublishingPackage(pkg.id, withAdapter)?.schedule?.recurrence, "daily");

  const cleared = clearPublishingPackageSchedule(pkg.id, withAdapter);
  assert.equal(cleared?.schedule, undefined);
});

test("no cron or platform API imports in schedule utilities", () => {
  const scheduleSource = readFileSync(
    join(REPO_ROOT, "src/features/publishing/publishing-schedule.utils.ts"),
    "utf8",
  );
  assert.doesNotMatch(scheduleSource, /node-cron|cron\.schedule|googleapis|oauth/i);
});

console.log("publishing-queue passed");
