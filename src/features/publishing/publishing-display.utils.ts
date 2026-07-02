import type {
  PublishingPackageStatus,
  PublishingPlatformStatus,
} from "./publishing.types";

const PACKAGE_STATUS_LABELS: Record<PublishingPackageStatus, string> = {
  draft: "Draft",
  exported: "Exported",
  ready: "Ready",
  partially_published: "Partially published",
  published: "Published",
  archived: "Archived",
};

/** Human-readable label for a publishing package aggregate status. */
export function formatPublishingPackageStatus(status: PublishingPackageStatus): string {
  return PACKAGE_STATUS_LABELS[status] ?? status;
}

/** Human-readable label for a per-platform publishing status. */
export function formatPublishingPlatformStatus(
  status: PublishingPlatformStatus | string | undefined,
): string {
  switch (status) {
    case "published":
      return "Published";
    case "ready_to_publish":
      return "Ready";
    case "skipped":
      return "Skipped";
    case "pending":
      return "Pending";
    default:
      return "Pending";
  }
}
