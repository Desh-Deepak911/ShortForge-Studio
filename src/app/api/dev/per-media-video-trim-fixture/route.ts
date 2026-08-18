import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";

import { ensurePerMediaVideoTrimFixture } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";

/**
 * Dev-only 6s timecode MP4 for per-media trim certification.
 * Unavailable in production.
 */

export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const ensured = ensurePerMediaVideoTrimFixture();
  if (!ensured.ok) {
    return new Response(ensured.message, { status: 503 });
  }
  if (!existsSync(ensured.filePath)) {
    return new Response("Fixture missing", { status: 404 });
  }

  const size = statSync(ensured.filePath).size;
  const nodeStream = createReadStream(ensured.filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    },
  });
}
