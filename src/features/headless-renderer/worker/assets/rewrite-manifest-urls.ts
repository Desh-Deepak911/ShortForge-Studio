/**
 * Rewrite drawable media sources to the private local asset server.
 * Working copy only — maps by full source-slot identity, not digest alone.
 */

import {
  buildExportManifestFingerprint,
  type ExportManifest,
  type ExportMediaManifest,
} from "@/features/export/domain/headless-safe";

import { headlessSourceDigest, headlessSourceSlotKey } from "../../domain";
import type { StagedWorkerAsset } from "./materialize-owned-assets";

export function rewriteManifestMediaToLocalAssets(input: {
  manifest: ExportManifest;
  staged: readonly StagedWorkerAsset[];
  origin: string; // http://127.0.0.1:port
}):
  | { readonly ok: true; readonly manifest: ExportManifest }
  | { readonly ok: false; readonly message: string } {
  const bySlot = new Map<string, string>();
  for (const asset of input.staged) {
    bySlot.set(asset.slotKey, `${input.origin}/${asset.relativeUrlPath}`);
  }

  const rewriteMedia = (
    media: ExportMediaManifest,
    slot: {
      role: "scene_media";
      sceneId: string;
      mediaItemId: string;
    },
  ): ExportMediaManifest | { error: string } => {
    if (media.type === "placeholder") return media;
    if (media.type !== "image" && media.type !== "video") return media;
    const source = typeof media.source === "string" ? media.source.trim() : "";
    if (!source) return { error: "Media source missing for rewrite." };
    const digest = headlessSourceDigest(source);
    const key = headlessSourceSlotKey({
      role: slot.role,
      sceneId: slot.sceneId,
      mediaItemId: slot.mediaItemId,
      sourceDigest: digest,
    });
    const mapped = bySlot.get(key);
    if (!mapped) {
      return { error: "No staged asset for media source slot." };
    }
    return { ...media, source: mapped };
  };

  const scenes: Array<(typeof input.manifest.scenes)[number]> = [];
  for (const scene of input.manifest.scenes) {
    // Scene-level media uses the first timeline item identity when present.
    const primaryItem = scene.mediaTimeline.items[0];
    if (!primaryItem) {
      return { ok: false, message: "Scene missing media timeline item." };
    }
    const mediaResult = rewriteMedia(scene.media, {
      role: "scene_media",
      sceneId: scene.id,
      mediaItemId: primaryItem.id,
    });
    if ("error" in mediaResult) {
      return { ok: false, message: mediaResult.error };
    }
    const items = [];
    for (const item of scene.mediaTimeline.items) {
      const itemMedia = rewriteMedia(item.media, {
        role: "scene_media",
        sceneId: scene.id,
        mediaItemId: item.id,
      });
      if ("error" in itemMedia) {
        return { ok: false, message: itemMedia.error };
      }
      items.push({ ...item, media: itemMedia });
    }
    scenes.push({
      ...scene,
      media: mediaResult,
      mediaTimeline: { ...scene.mediaTimeline, items },
    });
  }

  let audio = input.manifest.audio;
  if (audio.voiceover?.source) {
    const digest = headlessSourceDigest(audio.voiceover.source.trim());
    const key = headlessSourceSlotKey({
      role: "voiceover",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: digest,
    });
    const mapped = bySlot.get(key);
    if (!mapped) {
      return { ok: false, message: "No staged asset for voiceover source." };
    }
    audio = {
      ...audio,
      voiceover: { ...audio.voiceover, source: mapped },
    };
  }
  if (audio.music?.source) {
    const digest = headlessSourceDigest(audio.music.source.trim());
    const key = headlessSourceSlotKey({
      role: "music",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: digest,
    });
    const mapped = bySlot.get(key);
    if (!mapped) {
      return { ok: false, message: "No staged asset for music source." };
    }
    audio = {
      ...audio,
      music: { ...audio.music, source: mapped },
    };
  }

  const draft = {
    ...input.manifest,
    scenes,
    audio,
  };
  const { fingerprint: _drop, ...withoutFp } = draft as ExportManifest & {
    fingerprint?: string;
  };
  void _drop;
  const fingerprint = buildExportManifestFingerprint(
    withoutFp as Omit<ExportManifest, "fingerprint">,
  );

  return {
    ok: true,
    manifest: {
      ...draft,
      fingerprint,
    } as ExportManifest,
  };
}
