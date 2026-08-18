/**
 * Writes deterministic Preview parity fixtures under gitignored `.tmp`.
 * Never requires network media. Optional ffmpeg is unused.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewRuntimeParitySvgFixture } from "./build-preview-runtime-parity-svg-fixture";
import {
  PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES,
  PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
} from "./preview-runtime-parity-fixture-identities";

export const PREVIEW_RUNTIME_PARITY_TMP_DIR = ".tmp/preview-runtime-parity" as const;

export interface WrittenPreviewRuntimeParityFixture {
  readonly id: string;
  readonly kind: "video" | "image";
  readonly relativePath: string;
}

export function buildPreviewRuntimeParityLocalFixtures(
  cwd: string = process.cwd(),
): readonly WrittenPreviewRuntimeParityFixture[] {
  const directory = join(cwd, PREVIEW_RUNTIME_PARITY_TMP_DIR);
  mkdirSync(directory, { recursive: true });
  const written: WrittenPreviewRuntimeParityFixture[] = [];

  for (const identity of PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES) {
    const relativePath = join(PREVIEW_RUNTIME_PARITY_TMP_DIR, identity.fileName);
    writeFileSync(
      join(cwd, relativePath),
      buildPreviewRuntimeParitySvgFixture({
        marker: identity.marker,
        fill: identity.fill,
        kind: "video",
      }),
      "utf8",
    );
    written.push({ id: identity.id, kind: "video", relativePath });
  }

  for (const identity of PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES) {
    const relativePath = join(PREVIEW_RUNTIME_PARITY_TMP_DIR, identity.fileName);
    writeFileSync(
      join(cwd, relativePath),
      buildPreviewRuntimeParitySvgFixture({
        marker: identity.marker,
        fill: identity.fill,
        kind: "image",
      }),
      "utf8",
    );
    written.push({ id: identity.id, kind: "image", relativePath });
  }

  writeFileSync(
    join(directory, "manifest.json"),
    `${JSON.stringify(
      {
        generatedBy: "build-preview-runtime-parity-local-fixtures",
        fixtures: written,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return written;
}
