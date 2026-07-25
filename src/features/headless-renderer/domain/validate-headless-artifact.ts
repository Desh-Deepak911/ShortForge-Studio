/**
 * Total fail-closed HeadlessRenderArtifact v1 validation.
 * Invalid audio/video fields are rejected — never silently normalized to null.
 */

import {
  HEADLESS_ALLOWED_ARTIFACT_MIME_TYPES,
  HEADLESS_MAX_ARTIFACT_BYTES,
} from "./headless-render-constants";
import {
  HEADLESS_CONTENT_DIGEST_PREFIX,
  HEADLESS_RENDER_ARTIFACT_VERSION,
  type HeadlessRenderArtifactV1,
} from "./headless-render.types";
import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import { isBoundedCodec, isNonEmptyId } from "./headless-field-validators";
import { buildHeadlessArtifactMetadataFingerprint } from "./headless-fingerprints";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "./headless-hostile-guard";
import {
  HEADLESS_CONTENT_DIGEST_RE,
  isHeadlessAuthorityFingerprint,
} from "./headless-stable-hash";

const ARTIFACT_FIELDS = [
  "version",
  "artifactId",
  "contentDigest",
  "byteLength",
  "mimeType",
  "format",
  "width",
  "height",
  "fps",
  "durationMs",
  "audio",
  "video",
  "rendererBuildId",
  "manifestFingerprint",
  "assetBundleFingerprint",
  "renderJobFingerprint",
  "expiresAtMs",
  "fingerprint",
] as const;

const AUDIO_FIELDS = ["present", "codec", "channels", "sampleRateHz"] as const;
const VIDEO_FIELDS = ["present", "codec", "width", "height", "fps"] as const;

export type ValidateHeadlessRenderArtifactResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly artifact: HeadlessRenderArtifactV1;
    }
  | { readonly ok: false; readonly issues: ReturnType<typeof headlessFail>["issues"] };

function parseAudio(value: unknown):
  | { ok: true; audio: HeadlessRenderArtifactV1["audio"] }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (!isPlainObject(value) || hasUnknownFields(value, AUDIO_FIELDS)) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "Invalid probed audio facts."),
      ],
    };
  }
  if (typeof value.present !== "boolean") {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "audio.present must be boolean."),
      ],
    };
  }
  if (value.present === false) {
    if (
      value.codec !== null ||
      value.channels !== null ||
      value.sampleRateHz !== null
    ) {
      return {
        ok: false,
        issues: [
          headlessIssue(
            "INVALID_ARTIFACT",
            "audio absent requires codec/channels/sampleRateHz null.",
          ),
        ],
      };
    }
    return {
      ok: true,
      audio: { present: false, codec: null, channels: null, sampleRateHz: null },
    };
  }
  if (!isBoundedCodec(value.codec)) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "audio.codec must be a bounded string."),
      ],
    };
  }
  if (
    typeof value.channels !== "number" ||
    !Number.isInteger(value.channels) ||
    value.channels < 1 ||
    value.channels > 8
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ARTIFACT",
          "audio.channels must be a positive integer.",
        ),
      ],
    };
  }
  if (
    typeof value.sampleRateHz !== "number" ||
    !Number.isInteger(value.sampleRateHz) ||
    value.sampleRateHz < 8000 ||
    value.sampleRateHz > 192000
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ARTIFACT",
          "audio.sampleRateHz must be a bounded positive integer.",
        ),
      ],
    };
  }
  return {
    ok: true,
    audio: {
      present: true,
      codec: value.codec,
      channels: value.channels,
      sampleRateHz: value.sampleRateHz,
    },
  };
}

function parseVideo(
  value: unknown,
  width: number,
  height: number,
  fps: number,
):
  | { ok: true; video: HeadlessRenderArtifactV1["video"] }
  | { ok: false; issues: ReturnType<typeof headlessFail>["issues"] } {
  if (!isPlainObject(value) || hasUnknownFields(value, VIDEO_FIELDS)) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "Invalid probed video facts."),
      ],
    };
  }
  if (value.present !== true) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "Artifact video stream must be present."),
      ],
    };
  }
  if (!isBoundedCodec(value.codec)) {
    return {
      ok: false,
      issues: [
        headlessIssue("INVALID_ARTIFACT", "video.codec must be a bounded string."),
      ],
    };
  }
  if (value.width !== width || value.height !== height || value.fps !== fps) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ARTIFACT",
          "Probed video facts must match artifact dimensions/fps.",
        ),
      ],
    };
  }
  return {
    ok: true,
    video: {
      present: true,
      codec: value.codec,
      width,
      height,
      fps,
    },
  };
}

export function validateHeadlessRenderArtifact(
  value: unknown,
): ValidateHeadlessRenderArtifactResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return hostile;

    if (!isPlainObject(value)) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Artifact must be a plain object."),
      );
    }
    if (hasUnknownFields(value, ARTIFACT_FIELDS)) {
      return headlessFail(
        headlessIssue("UNKNOWN_FIELD", "Artifact has an unknown field."),
      );
    }
    if (value.version !== HEADLESS_RENDER_ARTIFACT_VERSION) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Unsupported artifact version."),
      );
    }
    if (!isNonEmptyId(value.artifactId)) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Invalid artifactId."),
      );
    }
    if (
      typeof value.contentDigest !== "string" ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.contentDigest)
    ) {
      return headlessFail(
        headlessIssue(
          "INVALID_DIGEST",
          `contentDigest must be ${HEADLESS_CONTENT_DIGEST_PREFIX}<64 hex>.`,
        ),
      );
    }
    if (
      typeof value.byteLength !== "number" ||
      !Number.isInteger(value.byteLength) ||
      value.byteLength < 1 ||
      value.byteLength > HEADLESS_MAX_ARTIFACT_BYTES
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "byteLength out of bounds."),
      );
    }
    if (
      typeof value.mimeType !== "string" ||
      !(HEADLESS_ALLOWED_ARTIFACT_MIME_TYPES as readonly string[]).includes(
        value.mimeType,
      )
    ) {
      return headlessFail(headlessIssue("INVALID_MIME", "Invalid artifact MIME."));
    }
    if (value.format !== "webm" && value.format !== "mp4") {
      return headlessFail(headlessIssue("INVALID_ARTIFACT", "Invalid format."));
    }
    if (
      (value.format === "webm" && value.mimeType !== "video/webm") ||
      (value.format === "mp4" && value.mimeType !== "video/mp4")
    ) {
      return headlessFail(
        headlessIssue("INVALID_MIME", "Artifact MIME/format mismatch."),
      );
    }
    if (
      typeof value.width !== "number" ||
      typeof value.height !== "number" ||
      !Number.isInteger(value.width) ||
      !Number.isInteger(value.height) ||
      value.width < 16 ||
      value.height < 16 ||
      value.width > 7680 ||
      value.height > 7680
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Invalid dimensions."),
      );
    }
    if (value.fps !== 30) {
      return headlessFail(headlessIssue("INVALID_ARTIFACT", "fps must be 30."));
    }
    if (
      typeof value.durationMs !== "number" ||
      !Number.isInteger(value.durationMs) ||
      value.durationMs < 1
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Invalid durationMs."),
      );
    }

    const audioParsed = parseAudio(value.audio);
    if (!audioParsed.ok) return { ok: false, issues: audioParsed.issues };
    const videoParsed = parseVideo(
      value.video,
      value.width,
      value.height,
      value.fps,
    );
    if (!videoParsed.ok) return { ok: false, issues: videoParsed.issues };

    if (
      !isNonEmptyId(value.rendererBuildId) ||
      typeof value.manifestFingerprint !== "string" ||
      !isHeadlessAuthorityFingerprint(value.assetBundleFingerprint, "hab") ||
      !isHeadlessAuthorityFingerprint(value.renderJobFingerprint, "hrj")
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Missing linked fingerprint identity."),
      );
    }
    if (
      typeof value.expiresAtMs !== "number" ||
      !Number.isSafeInteger(value.expiresAtMs) ||
      value.expiresAtMs < 0
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Invalid expiresAtMs."),
      );
    }

    const draft: Omit<HeadlessRenderArtifactV1, "fingerprint"> = {
      version: HEADLESS_RENDER_ARTIFACT_VERSION,
      artifactId: value.artifactId,
      contentDigest: value.contentDigest,
      byteLength: value.byteLength,
      mimeType: value.mimeType,
      format: value.format,
      width: value.width,
      height: value.height,
      fps: 30,
      durationMs: value.durationMs,
      audio: audioParsed.audio,
      video: videoParsed.video,
      rendererBuildId: value.rendererBuildId,
      manifestFingerprint: value.manifestFingerprint,
      assetBundleFingerprint: value.assetBundleFingerprint,
      renderJobFingerprint: value.renderJobFingerprint,
      expiresAtMs: value.expiresAtMs,
    };

    const fingerprintResult = buildHeadlessArtifactMetadataFingerprint(draft);
    if (!fingerprintResult.ok) return fingerprintResult;
    if (
      !isHeadlessAuthorityFingerprint(value.fingerprint, "hra") ||
      value.fingerprint !== fingerprintResult.fingerprint
    ) {
      return headlessFail(
        headlessIssue("INVALID_ARTIFACT", "Artifact metadata fingerprint mismatch."),
      );
    }

    return {
      ok: true,
      issues: [],
      artifact: deepFreezeHeadlessValue({
        ...draft,
        fingerprint: fingerprintResult.fingerprint,
      }),
    };
  } catch {
    return headlessFail(
      headlessIssue("HOSTILE_INPUT", "Hostile artifact input rejected."),
    );
  }
}

export function finalizeHeadlessRenderArtifact(
  draft: Omit<HeadlessRenderArtifactV1, "fingerprint">,
): ValidateHeadlessRenderArtifactResult {
  const fingerprintResult = buildHeadlessArtifactMetadataFingerprint(draft);
  if (!fingerprintResult.ok) return fingerprintResult;
  return validateHeadlessRenderArtifact({
    ...draft,
    fingerprint: fingerprintResult.fingerprint,
  });
}
