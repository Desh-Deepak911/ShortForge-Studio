/**
 * Exact nested-field validators for ownership, profile, progress, terminal reason.
 */

import {
  HEADLESS_MAX_CODEC_LENGTH,
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_PROGRESS_STAGE_LENGTH,
  HEADLESS_PROGRESS_STAGE_IDS,
} from "./headless-render-constants";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import { isHeadlessReasonId } from "./headless-reason-registry";
import type {
  HeadlessAdvisoryProgress,
  HeadlessOwnershipBinding,
  HeadlessRendererProfile,
  HeadlessTerminalReason,
} from "./headless-render.types";
import { hasUnknownFields, isPlainObject } from "./headless-hostile-guard";

const OWNERSHIP_FIELDS = ["ownerId", "projectId"] as const;
const PROFILE_FIELDS = ["resolution", "format", "fps", "quality"] as const;
const PROGRESS_FIELDS = ["percent", "stage", "updatedAtMs"] as const;
const TERMINAL_FIELDS = ["reasonId", "retryable"] as const;

export function isNonEmptyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim()
  );
}

export function parseHeadlessOwnership(value: unknown):
  | { ok: true; ownership: HeadlessOwnershipBinding }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_OWNERSHIP", "ownership must be a plain object."),
      ],
    };
  }
  if (hasUnknownFields(value, OWNERSHIP_FIELDS)) {
    return {
      ok: false,
      issues: [headlessIssue("UNKNOWN_FIELD", "ownership has an unknown field.")],
    };
  }
  if (!isNonEmptyId(value.ownerId) || !isNonEmptyId(value.projectId)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_OWNERSHIP",
          "ownerId and projectId are required server-bound ids.",
        ),
      ],
    };
  }
  return {
    ok: true,
    ownership: { ownerId: value.ownerId, projectId: value.projectId },
  };
}

export function parseHeadlessRendererProfile(value: unknown):
  | { ok: true; profile: HeadlessRendererProfile }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_RENDERER_PROFILE",
          "rendererProfile must be a plain object.",
        ),
      ],
    };
  }
  if (hasUnknownFields(value, PROFILE_FIELDS)) {
    return {
      ok: false,
      issues: [
        headlessIssue("UNKNOWN_FIELD", "rendererProfile has an unknown field."),
      ],
    };
  }
  if (
    value.resolution !== "720p" &&
    value.resolution !== "1080p" &&
    value.resolution !== "4k"
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_RENDERER_PROFILE", "Invalid resolution."),
      ],
    };
  }
  if (value.format !== "webm" && value.format !== "mp4") {
    return {
      ok: false,
      issues: [headlessIssue("INVALID_RENDERER_PROFILE", "Invalid format.")],
    };
  }
  if (value.fps !== 30) {
    return {
      ok: false,
      issues: [headlessIssue("INVALID_RENDERER_PROFILE", "fps must be 30.")],
    };
  }
  if (value.quality !== "standard" && value.quality !== "high") {
    return {
      ok: false,
      issues: [headlessIssue("INVALID_RENDERER_PROFILE", "Invalid quality.")],
    };
  }
  return {
    ok: true,
    profile: {
      resolution: value.resolution,
      format: value.format,
      fps: 30,
      quality: value.quality,
    },
  };
}

export function parseHeadlessProgress(
  value: unknown,
):
  | { ok: true; progress: HeadlessAdvisoryProgress | null }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (value === null) return { ok: true, progress: null };
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [headlessIssue("INVALID_PROGRESS", "progress must be object or null.")],
    };
  }
  if (hasUnknownFields(value, PROGRESS_FIELDS)) {
    return {
      ok: false,
      issues: [headlessIssue("UNKNOWN_FIELD", "progress has an unknown field.")],
    };
  }

  let percent: number | null = null;
  if (value.percent !== null) {
    if (
      typeof value.percent !== "number" ||
      !Number.isInteger(value.percent) ||
      value.percent < 0 ||
      value.percent > 100
    ) {
      return {
        ok: false,
        issues: [
          headlessIssue(
            "INVALID_PROGRESS",
            "percent must be an integer 0–100 or null.",
          ),
        ],
      };
    }
    percent = value.percent;
  }

  let stage: string | null = null;
  if (value.stage !== null) {
    if (
      typeof value.stage !== "string" ||
      value.stage.length === 0 ||
      value.stage.length > HEADLESS_MAX_PROGRESS_STAGE_LENGTH ||
      !(HEADLESS_PROGRESS_STAGE_IDS as readonly string[]).includes(value.stage)
    ) {
      return {
        ok: false,
        issues: [
          headlessIssue(
            "INVALID_PROGRESS",
            "stage must be a bounded registry id or null.",
          ),
        ],
      };
    }
    stage = value.stage;
  }

  let updatedAtMs: number | null = null;
  if (value.updatedAtMs !== null) {
    if (
      typeof value.updatedAtMs !== "number" ||
      !Number.isInteger(value.updatedAtMs) ||
      value.updatedAtMs < 0 ||
      !Number.isSafeInteger(value.updatedAtMs)
    ) {
      return {
        ok: false,
        issues: [
          headlessIssue(
            "INVALID_PROGRESS",
            "updatedAtMs must be a safe non-negative integer or null.",
          ),
        ],
      };
    }
    updatedAtMs = value.updatedAtMs;
  }

  return { ok: true, progress: { percent, stage, updatedAtMs } };
}

export function parseHeadlessTerminalReason(
  value: unknown,
):
  | { ok: true; reason: HeadlessTerminalReason }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_TERMINAL_REASON",
          "terminalReason must be a plain object.",
        ),
      ],
    };
  }
  if (hasUnknownFields(value, TERMINAL_FIELDS)) {
    return {
      ok: false,
      issues: [
        headlessIssue("UNKNOWN_FIELD", "terminalReason has an unknown field."),
      ],
    };
  }
  if (!isHeadlessReasonId(value.reasonId)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_TERMINAL_REASON",
          "reasonId is not in the Headless reason registry.",
        ),
      ],
    };
  }
  if (typeof value.retryable !== "boolean") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_TERMINAL_REASON",
          "retryable must be a boolean.",
        ),
      ],
    };
  }
  return {
    ok: true,
    reason: { reasonId: value.reasonId, retryable: value.retryable },
  };
}

export function isBoundedCodec(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= HEADLESS_MAX_CODEC_LENGTH &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(value)
  );
}
