import { isExportProfileId } from "@/features/export-profiles";

import {
  normalizePublishingMetadata,
  updatePlatformStatus as applyPlatformStatusToPackage,
  updatePublishingPackageStatus as applyPackageStatusToPackage,
} from "../publishing-package.utils";
import {
  clearPublishingSchedule,
  normalizePublishingSchedule,
  updatePublishingSchedule,
} from "../publishing-schedule.utils";
import type {
  PublishingAssetReference,
  PublishingPackage,
  PublishingPackageStatus,
  PublishingPlatform,
  PublishingPlatformStatus,
  PublishingSchedule,
} from "../publishing.types";

import {
  readPublishingQueueStore,
  resolvePublishingQueueAdapter,
  writePublishingQueueStore,
} from "./publishing-queue.store";
import type {
  PublishingQueueMutationResult,
  PublishingQueueStorageOptions,
} from "./publishing-queue.types";

const FORBIDDEN_ASSET_KEYS = new Set(["blob", "data", "base64", "content", "buffer", "arrayBuffer"]);

export function assetReferenceContainsForbiddenBlobFields(
  asset: Record<string, unknown>,
): boolean {
  return Object.keys(asset).some((key) => FORBIDDEN_ASSET_KEYS.has(key));
}

const VALID_PACKAGE_STATUSES = new Set<PublishingPackageStatus>([
  "draft",
  "exported",
  "ready",
  "partially_published",
  "published",
  "archived",
]);

const VALID_PLATFORM_STATUSES = new Set<PublishingPlatformStatus>([
  "pending",
  "ready_to_publish",
  "published",
  "skipped",
]);

const VALID_PLATFORMS = new Set<PublishingPlatform>([
  "generic",
  "youtube_shorts",
  "instagram_reels",
  "x_video",
]);

function clonePackage(pkg: PublishingPackage): PublishingPackage {
  return structuredClone(pkg);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sortPackagesNewestFirst(packages: PublishingPackage[]): PublishingPackage[] {
  return [...packages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Strips binary-like fields and keeps lightweight export references only. */
export function sanitizePublishingAssetReference(
  asset: PublishingAssetReference | undefined,
): PublishingAssetReference | undefined {
  if (!asset || typeof asset !== "object") {
    return undefined;
  }

  const sanitized: PublishingAssetReference = {};

  if (typeof asset.fileName === "string" && asset.fileName.trim()) {
    sanitized.fileName = asset.fileName.trim().slice(0, 180);
  }

  if (typeof asset.exportId === "string" && asset.exportId.trim()) {
    sanitized.exportId = asset.exportId.trim().slice(0, 120);
  }

  if (typeof asset.mimeType === "string" && asset.mimeType.trim()) {
    sanitized.mimeType = asset.mimeType.trim().slice(0, 80);
  }

  if (typeof asset.durationSec === "number" && Number.isFinite(asset.durationSec)) {
    sanitized.durationSec = Math.max(0, Math.round(asset.durationSec));
  }

  if (typeof asset.objectUrlTemporary === "boolean") {
    sanitized.objectUrlTemporary = asset.objectUrlTemporary;
  }

  if (typeof asset.objectUrl === "string") {
    const objectUrl = asset.objectUrl.trim();
    if (objectUrl.length > 0 && objectUrl.length <= 512 && !objectUrl.startsWith("data:")) {
      sanitized.objectUrl = objectUrl;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/** Normalizes persisted queue packages and drops invalid entries safely. */
export function normalizePublishingQueuePackage(value: unknown): PublishingPackage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PublishingPackage>;
  const id = asString(candidate.id);
  const draftId = asString(candidate.draftId);
  const storyTitle = asString(candidate.storyTitle);
  const createdAt = asString(candidate.createdAt);
  const updatedAt = asString(candidate.updatedAt);

  if (!id || !draftId || !storyTitle || !createdAt || !updatedAt) {
    return null;
  }

  const exportProfileId =
    candidate.exportProfileId && isExportProfileId(candidate.exportProfileId)
      ? candidate.exportProfileId
      : "generic_mp4";

  const platforms = Array.isArray(candidate.platforms)
    ? candidate.platforms.filter((platform): platform is PublishingPlatform =>
        typeof platform === "string" && VALID_PLATFORMS.has(platform as PublishingPlatform),
      )
    : [];

  const status = VALID_PACKAGE_STATUSES.has(candidate.status as PublishingPackageStatus)
    ? (candidate.status as PublishingPackageStatus)
    : "draft";

  const platformStatuses = Array.isArray(candidate.platformStatuses)
    ? candidate.platformStatuses
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const platform = entry.platform;
          const platformStatus = entry.status;
          if (
            typeof platform !== "string" ||
            !VALID_PLATFORMS.has(platform as PublishingPlatform) ||
            typeof platformStatus !== "string" ||
            !VALID_PLATFORM_STATUSES.has(platformStatus as PublishingPlatformStatus)
          ) {
            return null;
          }
          return {
            platform: platform as PublishingPlatform,
            status: platformStatus as PublishingPlatformStatus,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  const checklist = Array.isArray(candidate.checklist) ? candidate.checklist : [];

  return {
    id,
    draftId,
    storyTitle,
    exportProfileId,
    platforms,
    exportedAsset: sanitizePublishingAssetReference(candidate.exportedAsset),
    metadata: normalizePublishingMetadata(candidate.metadata),
    checklist,
    platformStatuses,
    schedule: normalizePublishingSchedule(
      candidate.schedule as PublishingSchedule | undefined,
    ),
    status,
    createdAt,
    updatedAt,
    source:
      candidate.source && typeof candidate.source === "object"
        ? {
            templateId: candidate.source.templateId,
            scriptMode: candidate.source.scriptMode,
            topic: asString(candidate.source.topic) || undefined,
            exportProfileId:
              candidate.source.exportProfileId &&
              isExportProfileId(candidate.source.exportProfileId)
                ? candidate.source.exportProfileId
                : exportProfileId,
          }
        : { exportProfileId },
  };
}

function readNormalizedPackages(options?: PublishingQueueStorageOptions): PublishingPackage[] {
  const adapter = resolvePublishingQueueAdapter(options);
  if (!adapter) {
    return [];
  }

  const store = readPublishingQueueStore(adapter);
  return sortPackagesNewestFirst(
    store.packages
      .map((entry) => normalizePublishingQueuePackage(entry))
      .filter((entry): entry is PublishingPackage => entry !== null),
  );
}

function persistPackages(
  packages: PublishingPackage[],
  options?: PublishingQueueStorageOptions,
): PublishingQueueMutationResult {
  const adapter = resolvePublishingQueueAdapter(options);
  if (!adapter) {
    return { ok: false, error: "Publishing queue storage is unavailable." };
  }

  const normalized = packages
    .map((entry) => normalizePublishingQueuePackage(entry))
    .filter((entry): entry is PublishingPackage => entry !== null)
    .map((entry) => clonePackage(entry));

  const ok = writePublishingQueueStore(adapter, {
    version: 1,
    packages: normalized,
  });

  if (!ok) {
    return { ok: false, error: "Failed to persist publishing queue." };
  }

  return { ok: true };
}

/** Adds a publishing package to the local queue. */
export function addPublishingPackage(
  pkg: PublishingPackage,
  options?: PublishingQueueStorageOptions,
): PublishingQueueMutationResult {
  const normalized = normalizePublishingQueuePackage(pkg);
  if (!normalized) {
    return { ok: false, error: "Invalid publishing package." };
  }

  const packages = readNormalizedPackages(options).filter((entry) => entry.id !== normalized.id);
  packages.unshift(clonePackage(normalized));

  const result = persistPackages(packages, options);
  if (!result.ok) {
    return result;
  }

  return { ok: true, package: normalized };
}

/** Updates an existing publishing package in the queue. */
export function updatePublishingPackage(
  pkg: PublishingPackage,
  options?: PublishingQueueStorageOptions,
): PublishingQueueMutationResult {
  const normalized = normalizePublishingQueuePackage(pkg);
  if (!normalized) {
    return { ok: false, error: "Invalid publishing package." };
  }

  const packages = readNormalizedPackages(options);
  const index = packages.findIndex((entry) => entry.id === normalized.id);
  if (index === -1) {
    return { ok: false, error: "Publishing package not found." };
  }

  packages[index] = clonePackage(normalized);
  const result = persistPackages(packages, options);
  if (!result.ok) {
    return result;
  }

  return { ok: true, package: normalized };
}

/** Removes a publishing package from the queue. */
export function removePublishingPackage(
  id: string,
  options?: PublishingQueueStorageOptions,
): boolean {
  const packages = readNormalizedPackages(options).filter((entry) => entry.id !== id);
  const currentCount = readNormalizedPackages(options).length;
  if (packages.length === currentCount) {
    return false;
  }

  return persistPackages(packages, options).ok;
}

/** Returns all packages in the local queue, newest first. */
export function getPublishingPackages(options?: PublishingQueueStorageOptions): PublishingPackage[] {
  return readNormalizedPackages(options).map((entry) => clonePackage(entry));
}

/** Returns one queue package by id. */
export function getPublishingPackage(
  id: string,
  options?: PublishingQueueStorageOptions,
): PublishingPackage | null {
  const match = readNormalizedPackages(options).find((entry) => entry.id === id);
  return match ? clonePackage(match) : null;
}

/** Updates overall package status immutably and persists the result. */
export function updatePackageStatus(
  id: string,
  status: PublishingPackageStatus,
  options?: PublishingQueueStorageOptions,
): PublishingPackage | null {
  const existing = getPublishingPackage(id, options);
  if (!existing) {
    return null;
  }

  const next = applyPackageStatusToPackage(existing, status);
  const result = updatePublishingPackage(next, options);
  return result.ok ? (result.package ?? null) : null;
}

/** Updates one platform status immutably and persists the result. */
export function updatePlatformStatus(
  id: string,
  platform: PublishingPlatform,
  status: PublishingPlatformStatus,
  options?: PublishingQueueStorageOptions,
): PublishingPackage | null {
  const existing = getPublishingPackage(id, options);
  if (!existing) {
    return null;
  }

  let next = applyPlatformStatusToPackage(existing, platform, status);

  const publishedCount = next.platformStatuses.filter((entry) => entry.status === "published").length;
  const totalPlatforms = next.platforms.length;

  if (totalPlatforms > 0 && publishedCount === totalPlatforms) {
    next = applyPackageStatusToPackage(next, "published");
  } else if (publishedCount > 0) {
    next = applyPackageStatusToPackage(next, "partially_published");
  }

  const result = updatePublishingPackage(next, options);
  return result.ok ? (result.package ?? null) : null;
}

/** Saves reminder-only schedule metadata for a queued package. */
export function savePublishingPackageSchedule(
  id: string,
  schedule: PublishingSchedule,
  options?: PublishingQueueStorageOptions,
): PublishingPackage | null {
  const existing = getPublishingPackage(id, options);
  if (!existing) {
    return null;
  }

  const normalizedSchedule = normalizePublishingSchedule(schedule);
  if (!normalizedSchedule) {
    return null;
  }

  const next = updatePublishingSchedule(existing, normalizedSchedule);
  const result = updatePublishingPackage(next, options);
  return result.ok ? (result.package ?? null) : null;
}

/** Clears reminder schedule metadata for a queued package. */
export function clearPublishingPackageSchedule(
  id: string,
  options?: PublishingQueueStorageOptions,
): PublishingPackage | null {
  const existing = getPublishingPackage(id, options);
  if (!existing) {
    return null;
  }

  const next = clearPublishingSchedule(existing);
  const result = updatePublishingPackage(next, options);
  return result.ok ? (result.package ?? null) : null;
}
