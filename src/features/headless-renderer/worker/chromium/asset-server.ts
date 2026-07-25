/**
 * Private loopback asset server — serves only workspace files.
 * Serve-time realpath rejects symlink escapes.
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
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.replace(/^\//, ""));
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
      if (!statSync(realFile).isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType(realFile),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(realFile).pipe(res);
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
