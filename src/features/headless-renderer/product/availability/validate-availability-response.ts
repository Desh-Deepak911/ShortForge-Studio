import {
  HEADLESS_AVAILABILITY_STATES,
  type HeadlessAvailabilityV1,
  type HeadlessAvailabilityState,
} from "./availability.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateHeadlessAvailabilityResponse(
  value: unknown,
): HeadlessAvailabilityV1 | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (
    typeof value.state !== "string" ||
    !(HEADLESS_AVAILABILITY_STATES as readonly string[]).includes(value.state)
  ) {
    return null;
  }
  if (typeof value.message !== "string" || value.message.length === 0) {
    return null;
  }
  if (typeof value.headlessSelectable !== "boolean") return null;
  if (typeof value.canCreateJob !== "boolean") return null;

  // Fail closed: available without canCreateJob is hostile/malformed.
  if (value.state === "available" && value.canCreateJob !== true) {
    return null;
  }

  return Object.freeze({
    version: 1 as const,
    state: value.state as HeadlessAvailabilityState,
    message: value.message.slice(0, 280),
    headlessSelectable: value.headlessSelectable,
    canCreateJob: value.canCreateJob,
  });
}
