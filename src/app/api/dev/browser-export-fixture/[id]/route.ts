import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

/**
 * Dev-only fixture stream for Browser export certification.
 * Serves synthesized motion MP4s from `.tmp/realistic-motion-fixtures/`.
 * Unavailable in production.
 */

const ALLOWED_IDS = [
  "native_vertical_motion",
  "landscape_motion",
  "slower_camera_tracking",
] as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await context.params;
  if (!(ALLOWED_IDS as readonly string[]).includes(id)) {
    return new Response("Unknown fixture", { status: 404 });
  }

  const path = join(
    process.cwd(),
    ".tmp/realistic-motion-fixtures",
    `${id}.mp4`,
  );
  if (!existsSync(path)) {
    return new Response(
      `Fixture missing: ${id}.mp4 — run realistic-motion fixture ensure first.`,
      { status: 404 },
    );
  }

  const size = statSync(path).size;
  const nodeStream = createReadStream(path);
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
