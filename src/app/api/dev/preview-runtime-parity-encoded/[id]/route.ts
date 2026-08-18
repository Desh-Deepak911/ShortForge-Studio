import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";

import {
  ensurePreviewRuntimeParityEncodedFixtures,
  PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS,
  previewRuntimeParityEncodedFilePath,
  type PreviewRuntimeParityEncodedFixtureId,
} from "@/features/preview/runtime-parity/ensure-preview-runtime-parity-encoded-fixtures";

/**
 * Dev-only encoded fixtures for Prompt 6 Preview/Browser/Headless certification.
 * Unavailable in production.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await context.params;
  if (
    !(PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS as readonly string[]).includes(id)
  ) {
    return new Response("Unknown fixture", { status: 404 });
  }

  const ensured = ensurePreviewRuntimeParityEncodedFixtures();
  if (!ensured.ok) {
    return new Response(ensured.message, { status: 503 });
  }

  const path = previewRuntimeParityEncodedFilePath(
    id as PreviewRuntimeParityEncodedFixtureId,
  );
  if (!existsSync(path)) {
    return new Response(`Fixture missing: ${id}`, { status: 404 });
  }

  const size = statSync(path).size;
  const nodeStream = createReadStream(path);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const contentType = id.startsWith("image") ? "image/png" : "video/mp4";

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    },
  });
}
