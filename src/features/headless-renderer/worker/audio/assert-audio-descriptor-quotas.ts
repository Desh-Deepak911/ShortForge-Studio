/**
 * Enforce audio asset ceilings from bundle descriptors before any storage open/write.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";
import {
  HEADLESS_ALLOWED_AUDIO_MIME_TYPES,
} from "../../domain/headless-render-constants";
import {
  headlessSourceDigest,
  headlessSourceSlotKey,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
} from "../../domain";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";
import type { HeadlessAudioPlan } from "./audio-plan.types";

function isSafePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}

function safeAdd(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
    return null;
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < a) return null;
  return sum;
}

function isAllowedAudioMime(mime: string): boolean {
  return (HEADLESS_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

function findAudioDescriptor(
  bundle: HeadlessAssetBundleV1,
  role: "voiceover" | "music",
  source: string,
): HeadlessAssetDescriptorV1 | null {
  const key = headlessSourceSlotKey({
    role,
    sceneId: null,
    mediaItemId: null,
    sourceDigest: headlessSourceDigest(source.trim()),
  });
  for (const asset of bundle.assets) {
    if (headlessSourceSlotKey(asset.sourceIdentity) === key) {
      return asset;
    }
  }
  return null;
}

export type AudioDescriptorQuotaFailureReason =
  | "WORKSPACE_QUOTA_EXCEEDED"
  | "UNSUPPORTED_CAPABILITY";

/**
 * Resolve voiceover/music descriptors from canonical slots and enforce
 * MIME + single/aggregate audio byte ceilings without opening storage.
 */
export function assertAudioDescriptorQuotas(input: {
  manifest: ExportManifest;
  plan: HeadlessAudioPlan;
  bundle: HeadlessAssetBundleV1;
  maxSingleAudioAssetBytes: number;
  maxAggregateAudioBytes: number;
}):
  | {
      readonly ok: true;
      readonly voiceoverBytes: number;
      readonly musicBytes: number;
    }
  | {
      readonly ok: false;
      readonly reasonId: AudioDescriptorQuotaFailureReason;
      readonly message: string;
    } {
  if (
    !isSafePositiveInt(input.maxSingleAudioAssetBytes) ||
    !isSafePositiveInt(input.maxAggregateAudioBytes)
  ) {
    return {
      ok: false,
      reasonId: "WORKSPACE_QUOTA_EXCEEDED",
      message: scrubWorkerMessage("quota"),
    };
  }

  let voiceoverBytes = 0;
  let musicBytes = 0;

  if (input.plan.voiceover) {
    const source = input.manifest.audio.voiceover?.source?.trim();
    if (!source) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    const desc = findAudioDescriptor(input.bundle, "voiceover", source);
    if (!desc) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (!isAllowedAudioMime(desc.mimeType) || desc.mediaKind !== "audio") {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (!isSafePositiveInt(desc.byteLength)) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (desc.byteLength > input.maxSingleAudioAssetBytes) {
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
      };
    }
    voiceoverBytes = desc.byteLength;
  }

  if (input.plan.music) {
    const source = input.manifest.audio.music?.source?.trim();
    if (!source) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    const desc = findAudioDescriptor(input.bundle, "music", source);
    if (!desc) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (!isAllowedAudioMime(desc.mimeType) || desc.mediaKind !== "audio") {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (!isSafePositiveInt(desc.byteLength)) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
      };
    }
    if (desc.byteLength > input.maxSingleAudioAssetBytes) {
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
      };
    }
    musicBytes = desc.byteLength;
  }

  const aggregate = safeAdd(voiceoverBytes, musicBytes);
  if (aggregate == null || aggregate > input.maxAggregateAudioBytes) {
    return {
      ok: false,
      reasonId: "WORKSPACE_QUOTA_EXCEEDED",
      message: scrubWorkerMessage("quota"),
    };
  }

  return { ok: true, voiceoverBytes, musicBytes };
}
