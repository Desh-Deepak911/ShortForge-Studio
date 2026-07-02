/**
 * Publishing assistant verification (run: npm run test:publishing-assistant).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublishingExportedAssetReference,
  createAndEnqueuePublishingPackageFromExport,
  createPublishingPackageFromExport,
  getPublishingAssistantPlatformOpenLabel,
  getPublishingAssistantPlatformUrl,
  resolveDefaultPublishingAssistantPlatforms,
} from "@/features/publishing/publishing-assistant";
import { getCopyAssets, updatePlatformStatus as applyPlatformStatusToPackage } from "@/features/publishing";
import {
  addPublishingPackage,
  createMemoryPublishingQueueStorageAdapter,
  getPublishingPackage,
  getPublishingPackages,
} from "@/features/publishing/queue";
import type { FootieScript } from "@/features/story/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSISTANT_ROOT = __dirname;
const REPO_ROOT = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectAssistantSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectAssistantSources(fullPath));
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

const script: FootieScript = {
  title: "Haaland Derby Winner",
  narration: "Haaland finishes the move in stoppage time.",
  totalDuration: 42,
  scenes: [{ id: "1", start: 0, end: 42, duration: 42, subtitle: "Goal" }],
};

const exportSettings = {
  fileName: "youtube-haaland-derby-winner",
  format: "mp4" as const,
  quality: "high" as const,
  resolution: "1080x1920" as const,
  exportProfileId: "youtube_shorts" as const,
};

const adapter = createMemoryPublishingQueueStorageAdapter();
const withAdapter = { adapter };

const baseContext = {
  draftId: "draft-assistant-1",
  script,
  exportSettings,
  exportFileName: "youtube-haaland-derby-winner.mp4",
  durationSec: 42,
  selectedPlatforms: ["youtube_shorts", "instagram_reels"] as const,
  creationBrief: {
    topic: "Manchester derby",
    tone: "dramatic" as const,
    duration: 45,
    qualityMode: "balanced" as const,
    sceneCount: 6,
    scriptMode: "match_recap" as const,
    templateId: "transfer_news" as const,
  },
};

console.log("publishing-assistant");

test("export success can create publishing package with metadata in queue", () => {
  const result = createAndEnqueuePublishingPackageFromExport(
    { ...baseContext, selectedPlatforms: [...baseContext.selectedPlatforms] },
    withAdapter,
  );

  assert.equal(result.ok, true);
  assert.ok(result.package);

  const stored = getPublishingPackage(result.package!.id, withAdapter);
  assert.ok(stored);
  assert.equal(stored.status, "exported");
  assert.ok(stored.metadata.youtube.title.length > 0);
  assert.equal(stored.checklist.length, 2);
});

test("createPublishingPackageFromExport generates package without enqueue", () => {
  const emptyAdapter = createMemoryPublishingQueueStorageAdapter();
  const result = createPublishingPackageFromExport({
    ...baseContext,
    selectedPlatforms: ["youtube_shorts"],
  });

  assert.equal(result.ok, true);
  assert.ok(result.package);
  assert.equal(getPublishingPackages({ adapter: emptyAdapter }).length, 0);
});

test("selected platforms are respected", () => {
  const result = createPublishingPackageFromExport({
    ...baseContext,
    selectedPlatforms: ["x_video"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.package?.platforms, ["x_video"]);
});

test("metadata copy assets available from generated package", () => {
  const result = createPublishingPackageFromExport({
    ...baseContext,
    selectedPlatforms: ["youtube_shorts"],
  });
  assert.ok(result.package);

  const assets = getCopyAssets(result.package!, "youtube_shorts");
  assert.ok(assets.assets.some((asset) => asset.id === "title"));
});

test("mark published updates package immutably", () => {
  const result = createPublishingPackageFromExport({
    ...baseContext,
    selectedPlatforms: ["youtube_shorts"],
  });
  assert.ok(result.package);

  const updated = applyPlatformStatusToPackage(result.package!, "youtube_shorts", "published");
  assert.notEqual(result.package, updated);
  assert.equal(
    updated.platformStatuses.find((entry) => entry.platform === "youtube_shorts")?.status,
    "published",
  );
});

test("save to queue works from generated package", () => {
  const result = createPublishingPackageFromExport({
    ...baseContext,
    selectedPlatforms: ["instagram_reels"],
  });
  assert.ok(result.package);

  const saved = addPublishingPackage(result.package!, withAdapter);
  assert.equal(saved.ok, true);
  assert.ok(getPublishingPackage(result.package!.id, withAdapter));
});

test("platform open labels and urls are manual-only", () => {
  assert.equal(getPublishingAssistantPlatformOpenLabel("youtube_shorts"), "Open YouTube Studio");
  assert.match(getPublishingAssistantPlatformUrl("youtube_shorts"), /^https:\/\//);
  assert.match(getPublishingAssistantPlatformUrl("instagram_reels"), /^https:\/\//);
  assert.match(getPublishingAssistantPlatformUrl("x_video"), /^https:\/\//);
});

test("no blob persistence in exported asset reference", () => {
  const asset = buildPublishingExportedAssetReference({
    draftId: "draft-1",
    durationSec: 42,
    exportFileName: "clip.mp4",
    exportSettings,
    objectUrl: "blob:http://localhost/session-123",
  });

  assert.equal(asset.fileName, "clip.mp4");
  assert.equal(asset.objectUrlTemporary, true);
  assert.ok(!("blob" in asset));
  assert.ok(!("data" in asset));
});

test("export panel shows Publish CTA and modal without forced navigation", () => {
  const exportPanel = readRepo("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /Publish/);
  assert.match(exportPanel, /PublishingAssistantModal/);
  assert.doesNotMatch(exportPanel, /PublishingAssistantCard/);
  assert.doesNotMatch(exportPanel, /router\.push\(["']\/publishing/);
  assert.match(exportPanel, /exportFootieShort/);
});

test("modal includes manual publishing UX and platform open links", () => {
  const modal = readRepo("src/features/publishing/publishing-assistant/PublishingAssistantModal.tsx");
  assert.match(modal, /Manual publishing assistant/);
  assert.match(modal, /Auto-posting is coming later/);
  assert.match(modal, /getPublishingAssistantPlatformOpenLabel/);
  assert.match(modal, /getPublishingAssistantPlatformUrl/);
  assert.match(modal, /Save to queue/);
  assert.match(modal, /CopyButton/);
  assert.match(modal, /Mark published/);
  assert.match(modal, /Open Publishing Queue/);
});

test("publishing page remains available for queue history", () => {
  const page = readRepo("src/app/publishing/page.tsx");
  assert.match(page, /PublishingQueuePanel/);
});

test("generic export profile defaults to no selected platforms", () => {
  assert.deepEqual(
    resolveDefaultPublishingAssistantPlatforms({ exportProfileId: "generic_mp4" }),
    [],
  );
  assert.deepEqual(
    resolveDefaultPublishingAssistantPlatforms({ exportProfileId: "youtube_shorts" }),
    ["youtube_shorts"],
  );
});

test("no platform SDK imports in publishing assistant module", () => {
  const forbidden = [/from\s+["']googleapis/, /oauth2?Client/i, /graph\.facebook\.com/];
  const sources = collectAssistantSources(ASSISTANT_ROOT);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay manual-only`);
    }
  }
});

console.log("publishing-assistant passed");
