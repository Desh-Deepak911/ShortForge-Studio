/**
 * Exact asset-source coverage from a frozen ExportManifest.
 * Never returns or logs raw source URL strings.
 */

import type { ExportManifest, ExportMediaManifest } from "@/features/export/domain/headless-safe";

import type {
  HeadlessRequiredSourceSlot,
  HeadlessSourceClassification,
} from "./headless-render.types";
import { headlessSourceDigest } from "./headless-stable-hash";
import { headlessMediaItemDedupeKey } from "./headless-source-slot-key";

export { headlessSourceDigest as buildHeadlessSourceDigest };

export {
  HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  HEADLESS_SOURCE_SLOT_KEY_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_VERSION,
  headlessMediaItemDedupeKey,
  headlessSourceSlotKey,
  isCanonicalHeadlessSourceSlotKey,
  parseHeadlessSourceSlotKey,
} from "./headless-source-slot-key";

export function classifyHeadlessSource(source: string): HeadlessSourceClassification {
  const trimmed = source.trim();
  if (trimmed.startsWith("blob:")) return "blob";
  if (trimmed.startsWith("data:")) return "data";
  if (trimmed.startsWith("https://")) return "https";
  if (trimmed.startsWith("http://")) return "http";
  if (
    trimmed.startsWith("file:") ||
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  ) {
    return "local";
  }
  return "other";
}

function collectMediaSource(
  media: ExportMediaManifest,
  sceneId: string,
  mediaItemId: string,
  slots: HeadlessRequiredSourceSlot[],
  seenItemKeys: Set<string>,
): void {
  if (media.type === "placeholder") return;
  if (media.type !== "image" && media.type !== "video") return;
  const source = typeof media.source === "string" ? media.source.trim() : "";
  if (!source) return;

  const itemKey = headlessMediaItemDedupeKey(sceneId, mediaItemId);
  if (seenItemKeys.has(itemKey)) return;
  seenItemKeys.add(itemKey);

  slots.push({
    role: "scene_media",
    sceneId,
    mediaItemId,
    sourceDigest: headlessSourceDigest(source),
    classification: classifyHeadlessSource(source),
    expectedMediaKind: media.type,
  });
}

/**
 * Extract required non-placeholder media/audio source slots.
 * First-item `scene.media` is covered by timeline item 0 — not a second slot.
 */
export function extractRequiredHeadlessSourceSlots(
  manifest: ExportManifest,
): readonly HeadlessRequiredSourceSlot[] {
  const slots: HeadlessRequiredSourceSlot[] = [];
  const seenItemKeys = new Set<string>();

  for (const scene of manifest.scenes) {
    for (const item of scene.mediaTimeline.items) {
      collectMediaSource(item.media, scene.id, item.id, slots, seenItemKeys);
    }
  }

  const voice = manifest.audio.voiceover;
  if (voice && typeof voice.source === "string" && voice.source.trim()) {
    const source = voice.source.trim();
    slots.push({
      role: "voiceover",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: headlessSourceDigest(source),
      classification: classifyHeadlessSource(source),
      expectedMediaKind: "audio",
    });
  }

  const music = manifest.audio.music;
  if (music && typeof music.source === "string" && music.source.trim()) {
    const source = music.source.trim();
    slots.push({
      role: "music",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: headlessSourceDigest(source),
      classification: classifyHeadlessSource(source),
      expectedMediaKind: "audio",
    });
  }

  return slots;
}
