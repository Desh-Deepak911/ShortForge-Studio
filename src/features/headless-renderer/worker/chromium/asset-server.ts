/**
 * Private loopback asset server — serves only workspace files.
 * Serve-time realpath rejects symlink escapes.
 * Supports single-range GET/HEAD for Chrome MP4 byte-range seeking.
 */

import {
  createReadStream,
  existsSync,
  lstatSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export type HeadlessAssetRangeSelection =
  | { readonly kind: "full" }
  | { readonly kind: "partial"; readonly start: number; readonly end: number }
  | { readonly kind: "unsatisfiable" }
  | { readonly kind: "invalid" };

/**
 * Parse a single HTTP Range header for byte ranges (RFC 7233 subset).
 * Rejects multiple ranges, malformed syntax, and unsafe values.
 */
export function parseHeadlessAssetByteRange(
  rangeHeader: string | undefined | null,
  fileSize: number,
): HeadlessAssetRangeSelection {
  if (fileSize < 0 || !Number.isSafeInteger(fileSize)) {
    return { kind: "invalid" };
  }
  if (rangeHeader == null || rangeHeader.trim() === "") {
    return { kind: "full" };
  }
  const trimmed = rangeHeader.trim();
  if (!/^bytes=/i.test(trimmed)) {
    return { kind: "invalid" };
  }
  const spec = trimmed.slice(trimmed.indexOf("=") + 1).trim();
  if (spec === "" || spec.includes(",")) {
    return { kind: "invalid" };
  }
  const dash = spec.indexOf("-");
  if (dash < 0) {
    return { kind: "invalid" };
  }
  const left = spec.slice(0, dash).trim();
  const right = spec.slice(dash + 1).trim();
  if (left === "" && right === "") {
    return { kind: "invalid" };
  }

  if (left === "") {
    const suffixLength = Number(right);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "invalid" };
    }
    if (fileSize === 0) {
      return { kind: "unsatisfiable" };
    }
    if (suffixLength >= fileSize) {
      return { kind: "full" };
    }
    return {
      kind: "partial",
      start: fileSize - suffixLength,
      end: fileSize - 1,
    };
  }

  const start = Number(left);
  if (!Number.isSafeInteger(start) || start < 0) {
    return { kind: "invalid" };
  }

  if (right === "") {
    if (fileSize === 0 || start >= fileSize) {
      return { kind: "unsatisfiable" };
    }
    return { kind: "partial", start, end: fileSize - 1 };
  }

  const end = Number(right);
  if (!Number.isSafeInteger(end) || end < 0) {
    return { kind: "invalid" };
  }
  if (start > end) {
    return { kind: "invalid" };
  }
  if (fileSize === 0 || start >= fileSize) {
    return { kind: "unsatisfiable" };
  }
  return {
    kind: "partial",
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export function buildHeadlessAssetResponseHeaders(input: {
  readonly filePath: string;
  readonly fileSize: number;
  readonly selection: HeadlessAssetRangeSelection;
}): {
  readonly status: 200 | 206 | 416;
  readonly headers: Record<string, string>;
  readonly bodyLength: number;
} {
  const base = {
    "Content-Type": contentType(input.filePath),
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (input.selection.kind === "unsatisfiable") {
    return {
      status: 416,
      headers: {
        ...base,
        "Content-Range": `bytes */${input.fileSize}`,
      },
      bodyLength: 0,
    };
  }

  if (input.selection.kind === "invalid") {
    return {
      status: 416,
      headers: {
        ...base,
        "Content-Range": `bytes */${input.fileSize}`,
      },
      bodyLength: 0,
    };
  }

  if (input.selection.kind === "full") {
    return {
      status: 200,
      headers: {
        ...base,
        "Content-Length": String(input.fileSize),
      },
      bodyLength: input.fileSize,
    };
  }

  const { start, end } = input.selection;
  const length = end - start + 1;
  return {
    status: 206,
    headers: {
      ...base,
      "Content-Range": `bytes ${start}-${end}/${input.fileSize}`,
      "Content-Length": String(length),
    },
    bodyLength: length,
  };
}

export interface HeadlessAssetServer {
  readonly origin: string;
  readonly port: number;
  close(): Promise<void>;
}

export async function startHeadlessAssetServer(input: {
  rootDir: string;
}): Promise<HeadlessAssetServer> {
  const rootReal = realpathSync(resolve(input.rootDir));
  const server: Server = createServer((req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const rawUrl = req.url ?? "/";
      const questionIndex = rawUrl.indexOf("?");
      const pathOnly =
        questionIndex >= 0 ? rawUrl.slice(0, questionIndex) : rawUrl;
      let rel: string;
      try {
        rel = decodeURIComponent(pathOnly.replace(/^\//, ""));
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (!rel || rel.includes("\0") || rel.split("/").includes("..")) {
        res.writeHead(400);
        res.end();
        return;
      }
      const abs = resolve(join(rootReal, rel));
      const relCheck = relative(rootReal, abs);
      if (relCheck.startsWith("..") || resolve(rootReal, relCheck) !== abs) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(abs)) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (lstatSync(abs).isSymbolicLink()) {
        res.writeHead(403);
        res.end();
        return;
      }
      let realFile: string;
      try {
        realFile = realpathSync(abs);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
      const realRel = relative(rootReal, realFile);
      if (
        realRel.startsWith("..") ||
        realRel.includes(`..${sep}`) ||
        (!realFile.startsWith(rootReal + sep) && realFile !== rootReal)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const fileStat = statSync(realFile);
      if (!fileStat.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }

      const fileSize = fileStat.size;
      const rangeHeader = req.headers.range;
      const selection = parseHeadlessAssetByteRange(
        typeof rangeHeader === "string" ? rangeHeader : undefined,
        fileSize,
      );
      const response = buildHeadlessAssetResponseHeaders({
        filePath: realFile,
        fileSize,
        selection,
      });

      if (selection.kind === "invalid") {
        res.writeHead(400);
        res.end();
        return;
      }

      if (response.status === 416) {
        res.writeHead(416, response.headers);
        res.end();
        return;
      }

      res.writeHead(response.status, response.headers);
      if (req.method === "HEAD") {
        res.end();
        return;
      }

      if (selection.kind === "full") {
        createReadStream(realFile).pipe(res);
        return;
      }

      if (selection.kind === "partial") {
        createReadStream(realFile, {
          start: selection.start,
          end: selection.end,
        }).pipe(res);
      }
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });

  const addr = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${addr.port}`;

  return {
    origin,
    port: addr.port,
    async close() {
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      });
    },
  };
}
