"use client";

/**
 * Client-only browser image metadata probing.
 *
 * Decodes images to capture intrinsic dimensions. Pure normalization and
 * asset-result extraction live in domain/source-media-metadata.
 */

import {
  normalizeSourceMediaMetadataFacts,
  type SourceMediaMetadataFacts,
} from "@/features/source-quality/domain/source-media-metadata";

const IMAGE_METADATA_PROBE_TIMEOUT_MS = 15_000;

function assertBrowserImageProbeEnvironment(options: {
  readonly requireObjectUrl: boolean;
}): void {
  if (typeof window === "undefined") {
    throw new Error("Image metadata probe requires a browser environment");
  }

  const ImageCtor =
    typeof window.Image === "function"
      ? window.Image
      : typeof Image === "function"
        ? Image
        : undefined;
  if (!ImageCtor) {
    throw new Error("Image metadata probe requires Image support");
  }

  if (typeof window.setTimeout !== "function" || typeof window.clearTimeout !== "function") {
    throw new Error("Image metadata probe requires timer support");
  }

  if (options.requireObjectUrl) {
    if (
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function" ||
      typeof URL.revokeObjectURL !== "function"
    ) {
      throw new Error("Image metadata probe requires object URL support");
    }
  }
}

/**
 * Probe intrinsic image metadata from an already-created object URL.
 * Uses the same decoded Image that validates the upload; does not revoke the URL.
 */
export function probeImageObjectUrlMetadata(
  objectUrl: string,
  mimeType?: string,
): Promise<SourceMediaMetadataFacts> {
  return new Promise((resolve, reject) => {
    try {
      assertBrowserImageProbeEnvironment({ requireObjectUrl: false });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Image metadata probe failed"));
      return;
    }

    const trimmedUrl = objectUrl.trim();
    if (!trimmedUrl) {
      reject(new Error("Image URL is unavailable"));
      return;
    }

    const ImageCtor =
      typeof window.Image === "function" ? window.Image : Image;
    const image = new ImageCtor();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      fn();
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => {
        reject(new Error("Image metadata probe timed out"));
      });
    }, IMAGE_METADATA_PROBE_TIMEOUT_MS);

    image.onload = () => {
      finish(() => {
        resolve(
          normalizeSourceMediaMetadataFacts({
            width: image.naturalWidth,
            height: image.naturalHeight,
            mimeType,
          }),
        );
      });
    };

    image.onerror = () => {
      finish(() => {
        reject(new Error("Unable to read image metadata"));
      });
    };

    image.src = trimmedUrl;
  });
}

/**
 * Probe intrinsic image metadata from a File.
 * Creates a temporary object URL that is always revoked before settle.
 */
export function probeImageFileMetadata(file: File): Promise<SourceMediaMetadataFacts> {
  return new Promise((resolve, reject) => {
    try {
      assertBrowserImageProbeEnvironment({ requireObjectUrl: true });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Image metadata probe failed"));
      return;
    }

    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      reject(new Error("Unable to read image file"));
      return;
    }

    const ownedUrl = objectUrl;
    void probeImageObjectUrlMetadata(ownedUrl, file.type)
      .then((facts) => {
        URL.revokeObjectURL(ownedUrl);
        resolve(facts);
      })
      .catch((error: unknown) => {
        URL.revokeObjectURL(ownedUrl);
        reject(error instanceof Error ? error : new Error("Unable to read image metadata"));
      });
  });
}

export type { SourceMediaMetadataFacts };
