/**
 * Resolve owned local absolute paths for voiceover/music slots.
 * FFmpeg must never fetch remote URLs — only workspace files.
 */

import { HEADLESS_ALLOWED_AUDIO_MIME_TYPES } from "../../domain/headless-render-constants";
import {
  headlessSourceDigest,
  headlessSourceSlotKey,
} from "../../domain";
import type { ExportManifest } from "@/features/export/domain/headless-safe";

import type { StagedWorkerAsset } from "../assets/materialize-owned-assets";
import type { HeadlessAudioPlan } from "./audio-plan.types";

export interface OwnedAudioBindings {
  readonly voiceoverPath: string | null;
  readonly musicPath: string | null;
  readonly voiceoverBytes: number;
  readonly musicBytes: number;
}

function isAllowedAudioMime(mime: string): boolean {
  return (HEADLESS_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

export function resolveOwnedAudioBindings(input: {
  manifest: ExportManifest;
  plan: HeadlessAudioPlan;
  staged: readonly StagedWorkerAsset[];
}):
  | { readonly ok: true; readonly bindings: OwnedAudioBindings }
  | { readonly ok: false; readonly message: string } {
  const bySlot = new Map<string, StagedWorkerAsset>();
  for (const asset of input.staged) {
    bySlot.set(asset.slotKey, asset);
  }

  let voiceoverPath: string | null = null;
  let musicPath: string | null = null;
  let voiceoverBytes = 0;
  let musicBytes = 0;

  if (input.plan.voiceover) {
    const source = input.manifest.audio.voiceover?.source?.trim();
    if (!source) {
      return { ok: false, message: "Missing voiceover binding source." };
    }
    const key = headlessSourceSlotKey({
      role: "voiceover",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: headlessSourceDigest(source),
    });
    const asset = bySlot.get(key);
    if (!asset) {
      return { ok: false, message: "Missing owned voiceover binding." };
    }
    if (!isAllowedAudioMime(asset.mimeType)) {
      return { ok: false, message: "Unsupported voiceover MIME." };
    }
    if (
      asset.absolutePath.includes("://") ||
      asset.absolutePath.startsWith("http")
    ) {
      return { ok: false, message: "Voiceover path must be local." };
    }
    voiceoverPath = asset.absolutePath;
    voiceoverBytes = asset.byteLength;
  }

  if (input.plan.music) {
    const source = input.manifest.audio.music?.source?.trim();
    if (!source) {
      return { ok: false, message: "Missing music binding source." };
    }
    const key = headlessSourceSlotKey({
      role: "music",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: headlessSourceDigest(source),
    });
    const asset = bySlot.get(key);
    if (!asset) {
      return { ok: false, message: "Missing owned music binding." };
    }
    if (!isAllowedAudioMime(asset.mimeType)) {
      return { ok: false, message: "Unsupported music MIME." };
    }
    if (
      asset.absolutePath.includes("://") ||
      asset.absolutePath.startsWith("http")
    ) {
      return { ok: false, message: "Music path must be local." };
    }
    musicPath = asset.absolutePath;
    musicBytes = asset.byteLength;
  }

  return {
    ok: true,
    bindings: {
      voiceoverPath,
      musicPath,
      voiceoverBytes,
      musicBytes,
    },
  };
}
