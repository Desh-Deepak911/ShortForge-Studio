"use client";

import {
  buildExportManifestFingerprint,
  deepFreezeExportManifest,
  validateExportManifest,
  type ExportManifestV3,
  type PrepareExportRequestResult,
} from "@/features/export/domain";
import type { ExportManifestV3Draft } from "@/features/export/domain/export-manifest.types";
import {
  buildHeadlessAssetBundleFingerprint,
  extractRequiredHeadlessSourceSlots,
  headlessSourceSlotKey,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
  type HeadlessRequiredSourceSlot,
} from "@/features/headless-renderer/domain";
import { headlessSha256HexBytes } from "@/features/headless-renderer/domain/headless-sha256";

const MAX_SINGLE_SOURCE_BYTES = 768 * 1024 * 1024;
const MAX_AGGREGATE_SOURCE_BYTES = 1536 * 1024 * 1024;
const SOURCE_LEASE_MS = 4 * 60 * 60 * 1000;

export type PreparedOwnedSource = {
  readonly slotKey: string;
  readonly bytes: Uint8Array;
  readonly contentDigest: string;
  readonly mimeType: string;
  readonly descriptor: HeadlessAssetDescriptorV1;
};

export type PreparedOwnedUpload = {
  readonly manifest: ExportManifestV3;
  readonly manifestBytes: Uint8Array;
  readonly bundle: HeadlessAssetBundleV1;
  readonly bundleBytes: Uint8Array;
  readonly sources: readonly PreparedOwnedSource[];
};

function sourceForSlot(
  manifest: ExportManifestV3,
  slot: HeadlessRequiredSourceSlot,
): string | null {
  if (slot.role === "voiceover") {
    return manifest.audio.voiceover?.source?.trim() || null;
  }
  if (slot.role === "music") {
    return manifest.audio.music?.source?.trim() || null;
  }
  const scene = manifest.scenes.find((item) => item.id === slot.sceneId);
  const media = scene?.mediaTimeline.items.find(
    (item) => item.id === slot.mediaItemId,
  )?.media;
  return media && media.type !== "placeholder"
    ? media.source.trim() || null
    : null;
}

function normalizeMime(value: string, slot: HeadlessRequiredSourceSlot): string {
  const mime = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime)) {
    return mime;
  }
  if (slot.expectedMediaKind === "image") return "image/png";
  if (slot.expectedMediaKind === "video") return "video/mp4";
  return "audio/mpeg";
}

async function readSource(
  source: string,
  slot: HeadlessRequiredSourceSlot,
  signal?: AbortSignal,
): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }> {
  if (slot.classification === "http" || slot.classification === "local" || slot.classification === "other") {
    throw new Error("INVALID_SOURCE");
  }
  const response = await fetch(source, {
    method: "GET",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("INVALID_SOURCE");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1 || buffer.byteLength > MAX_SINGLE_SOURCE_BYTES) {
    throw new Error("INVALID_SOURCE");
  }
  return {
    bytes: new Uint8Array(buffer),
    mimeType: normalizeMime(response.headers.get("content-type") ?? "", slot),
  };
}

function rebindProject(
  manifest: ExportManifestV3,
  projectId: string,
): ExportManifestV3 {
  const clone = JSON.parse(JSON.stringify(manifest)) as ExportManifestV3;
  const { fingerprint: _oldFingerprint, ...withoutFingerprint } = clone;
  void _oldFingerprint;
  const draft: ExportManifestV3Draft = {
    ...withoutFingerprint,
    project: { ...withoutFingerprint.project, projectId },
  };
  const rebound: ExportManifestV3 = {
    ...draft,
    fingerprint: buildExportManifestFingerprint(draft),
  };
  if (!validateExportManifest(rebound).ok) {
    throw new Error("INVALID_MANIFEST");
  }
  return deepFreezeExportManifest(rebound);
}

export async function prepareOwnedHeadlessUpload(input: {
  readonly prepared: PrepareExportRequestResult;
  readonly projectId: string;
  readonly signal?: AbortSignal;
}): Promise<PreparedOwnedUpload> {
  if (input.prepared.manifest.version !== 3) {
    throw new Error("INVALID_MANIFEST");
  }
  const manifest = rebindProject(input.prepared.manifest, input.projectId);
  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const expiresAtMs = Date.now() + SOURCE_LEASE_MS;
  const sources: PreparedOwnedSource[] = [];
  let aggregateBytes = 0;

  for (const slot of slots) {
    const source = sourceForSlot(manifest, slot);
    if (source == null) throw new Error("INVALID_SOURCE");
    const materialized = await readSource(source, slot, input.signal);
    aggregateBytes += materialized.bytes.byteLength;
    if (aggregateBytes > MAX_AGGREGATE_SOURCE_BYTES) {
      throw new Error("INVALID_SOURCE");
    }
    const assetId = crypto.randomUUID();
    const descriptor: HeadlessAssetDescriptorV1 = {
      version: 1,
      assetId,
      sourceIdentity: {
        role: slot.role,
        sceneId: slot.sceneId,
        mediaItemId: slot.mediaItemId,
        sourceDigest: slot.sourceDigest,
        classification: slot.classification,
      },
      contentDigest: `sha256:${headlessSha256HexBytes(materialized.bytes)}`,
      byteLength: materialized.bytes.byteLength,
      mimeType: materialized.mimeType,
      mediaKind: slot.expectedMediaKind,
      storageLocator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: `pending/${assetId}`,
      },
      expiresAtMs,
    };
    sources.push({
      slotKey: headlessSourceSlotKey(slot),
      bytes: materialized.bytes,
      contentDigest: descriptor.contentDigest,
      mimeType: descriptor.mimeType,
      descriptor,
    });
  }

  const bundleId = crypto.randomUUID();
  const fingerprint = buildHeadlessAssetBundleFingerprint(
    bundleId,
    sources.map((source) => source.descriptor),
  );
  if (!fingerprint.ok) throw new Error("INVALID_SOURCE");
  const bundle: HeadlessAssetBundleV1 = Object.freeze({
    version: 1,
    bundleId,
    assets: Object.freeze(sources.map((source) => source.descriptor)),
    fingerprint: fingerprint.fingerprint,
  });

  return Object.freeze({
    manifest,
    manifestBytes: new TextEncoder().encode(JSON.stringify(manifest)),
    bundle,
    bundleBytes: new TextEncoder().encode(JSON.stringify(bundle)),
    sources: Object.freeze(sources),
  });
}
