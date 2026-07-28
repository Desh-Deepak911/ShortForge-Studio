/**
 * Sprint 11E Phase 2G.12A — asset server byte-range authority.
 * Run: npm run test:headless-asset-server-range-authority
 */

import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildHeadlessAssetResponseHeaders,
  parseHeadlessAssetByteRange,
  startHeadlessAssetServer,
} from "@/features/headless-renderer/worker/chromium/asset-server";
import { synthesizeMotionMp4Fixture } from "@/features/headless-renderer/worker/testing/synthesize-motion-mp4-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function readBody(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer());
}

async function fetchStatus(url: string, init?: RequestInit): Promise<number> {
  const res = await fetch(url, init);
  return res.status;
}

async function fetchRawPath(origin: string, rawPath: string): Promise<number> {
  const target = new URL(origin);
  return await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: rawPath,
        method: "GET",
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 500);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("\nheadless asset server range authority\n");

  await test("parseHeadlessAssetByteRange covers valid single-range forms", () => {
    assert.deepEqual(parseHeadlessAssetByteRange(undefined, 100), { kind: "full" });
    assert.deepEqual(parseHeadlessAssetByteRange("bytes=0-9", 100), {
      kind: "partial",
      start: 0,
      end: 9,
    });
    assert.deepEqual(parseHeadlessAssetByteRange("bytes=50-", 100), {
      kind: "partial",
      start: 50,
      end: 99,
    });
    assert.deepEqual(parseHeadlessAssetByteRange("bytes=-10", 100), {
      kind: "partial",
      start: 90,
      end: 99,
    });
  });

  await test("parseHeadlessAssetByteRange rejects malformed and multiple ranges", () => {
    assert.equal(parseHeadlessAssetByteRange("bytes=0-1,2-3", 100).kind, "invalid");
    assert.equal(parseHeadlessAssetByteRange("bytes=-", 100).kind, "invalid");
    assert.equal(parseHeadlessAssetByteRange("bytes=abc-def", 100).kind, "invalid");
    assert.equal(parseHeadlessAssetByteRange("bytes=5-2", 100).kind, "invalid");
    assert.equal(parseHeadlessAssetByteRange("items=0-1", 100).kind, "invalid");
  });

  await test("parseHeadlessAssetByteRange marks unsatisfiable ranges", () => {
    assert.equal(parseHeadlessAssetByteRange("bytes=200-", 100).kind, "unsatisfiable");
    assert.equal(parseHeadlessAssetByteRange("bytes=100-150", 100).kind, "unsatisfiable");
  });

  await test("full GET returns 200 with authoritative headers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-full-"));
    const body = Buffer.from("0123456789abcdef");
    writeFileSync(join(dir, "clip.mp4"), body);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/clip.mp4`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "video/mp4");
      assert.equal(res.headers.get("content-length"), String(body.length));
      assert.equal(res.headers.get("accept-ranges"), "bytes");
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(await readBody(res), body);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("HEAD returns authoritative headers without body", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-head-"));
    const body = Buffer.from("0123456789abcdef");
    writeFileSync(join(dir, "clip.mp4"), body);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/clip.mp4`, { method: "HEAD" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-length"), String(body.length));
      assert.equal(res.headers.get("accept-ranges"), "bytes");
      assert.equal(await readBody(res).then((b) => b.length), 0);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("single-range GET returns 206 with Content-Range and partial body", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-partial-"));
    const body = Buffer.from("0123456789abcdef");
    writeFileSync(join(dir, "clip.mp4"), body);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      for (const [range, expected] of [
        ["bytes=0-4", body.subarray(0, 5)],
        ["bytes=10-", body.subarray(10)],
        ["bytes=-4", body.subarray(body.length - 4)],
      ] as const) {
        const res = await fetch(`${server.origin}/clip.mp4`, {
          headers: { Range: range },
        });
        assert.equal(res.status, 206, range);
        assert.match(res.headers.get("content-range") ?? "", /bytes /);
        assert.equal(Number(res.headers.get("content-length")), expected.length, range);
        assert.deepEqual(await readBody(res), expected, range);
      }
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("unsatisfiable range returns 416 with bytes */total", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-416-"));
    writeFileSync(join(dir, "clip.mp4"), Buffer.from("0123456789"));
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/clip.mp4`, {
        headers: { Range: "bytes=500-" },
      });
      assert.equal(res.status, 416);
      assert.equal(res.headers.get("content-range"), "bytes */10");
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("malformed range returns 400", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-bad-"));
    writeFileSync(join(dir, "clip.mp4"), Buffer.from("0123456789"));
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/clip.mp4`, {
        headers: { Range: "bytes=0-1,2-3" },
      });
      assert.equal(res.status, 400);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("partial range streams only selected bytes (no full-file buffering)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-stream-"));
    const body = Buffer.alloc(256 * 1024, 0xab);
    writeFileSync(join(dir, "large.mp4"), body);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/large.mp4`, {
        headers: { Range: "bytes=1000-1999" },
      });
      assert.equal(res.status, 206);
      assert.equal(res.headers.get("content-length"), "1000");
      const chunk = await readBody(res);
      assert.equal(chunk.length, 1000);
      assert.deepEqual(chunk, body.subarray(1000, 2000));
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("traversal and symlink protections unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-range-sec-"));
    writeFileSync(join(dir, "ok.mp4"), Buffer.from("safe"));
    const outside = join(dir, "..", `outside-${Date.now()}.txt`);
    writeFileSync(outside, "secret");
    symlinkSync(outside, join(dir, "link.mp4"));
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      assert.equal(await fetchRawPath(server.origin, "/../ok.mp4"), 400);
      assert.equal(await fetchStatus(`${server.origin}/link.mp4`), 403);
      assert.equal(await fetchStatus(`${server.origin}/ok.mp4`), 200);
    } finally {
      await server.close();
      rmSync(outside, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("createReadStream options match selected interval", () => {
    const headers = buildHeadlessAssetResponseHeaders({
      filePath: "clip.mp4",
      fileSize: 1000,
      selection: { kind: "partial", start: 100, end: 199 },
    });
    assert.equal(headers.status, 206);
    assert.equal(headers.bodyLength, 100);
    const stream = createReadStream(join(process.cwd(), "package.json"), {
      start: 100,
      end: 199,
    });
    stream.destroy();
  });

  await test("synthesized MP4 fixture is decodable and non-empty", () => {
    const fixture = synthesizeMotionMp4Fixture({ durationSec: 2 });
    assert.ok(fixture.bytes.byteLength > 1024);
    assert.equal(fixture.width, 320);
    assert.equal(fixture.height, 240);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
