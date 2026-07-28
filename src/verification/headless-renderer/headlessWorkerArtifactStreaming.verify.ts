/**
 * Sprint 11D Phase 3.3 — Streamed artifact hash + upload authority fixtures.
 * Run: npm run test:headless-worker-artifact-streaming
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  truncateSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoryHeadlessStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-storage.adapter";
import { authorizeArtifactFile } from "@/features/headless-renderer/worker/artifact/artifact-file-authority";
import { createArtifactFileLease } from "@/features/headless-renderer/worker/artifact/artifact-file-lease";
import { hashArtifactFileIncremental } from "@/features/headless-renderer/worker/artifact/incremental-sha256";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function writePayload(path: string, bytes: Uint8Array) {
  writeFileSync(path, bytes);
}

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function collectChunks(
  chunks: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const c of chunks) {
    parts.push(c);
    total += c.byteLength;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

async function* chunkBytes(
  bytes: Uint8Array,
  size: number,
): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.byteLength; i += size) {
    yield bytes.subarray(i, Math.min(bytes.byteLength, i + size));
  }
}

async function* throwingChunks(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([1, 2, 3]);
  throw new Error("source boom");
}

async function main() {
  console.log("\nSprint 11D Phase 3.3 — Artifact streaming authority\n");

  test("production path: no whole-artifact readFile(Sync) for artifacts", () => {
    const executeSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
      ),
      "utf8",
    );
    assert.equal(executeSrc.includes("readFileSync"), false);
    assert.equal(/\breadFile\b/.test(executeSrc), false);
    assert.equal(executeSrc.includes("hashArtifactFileIncremental"), true);
    assert.equal(executeSrc.includes("createArtifactFileLease"), true);
    assert.equal(executeSrc.includes("authorizeArtifactFile"), true);

    const runnerSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/local-worker-runner.ts",
      ),
      "utf8",
    );
    assert.equal(runnerSrc.includes("executeClaimedRender"), true);
    assert.equal(runnerSrc.includes("writeUploadBytes"), false);

    const claimedSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/execute-claimed-render.ts",
      ),
      "utf8",
    );
    assert.equal(claimedSrc.includes("writeUploadStream"), true);
    assert.equal(claimedSrc.includes("writeUploadBytes"), false);
    assert.equal(claimedSrc.includes("artifactLease.dispose"), true);

    const buildSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/artifact/build-validated-artifact.ts",
      ),
      "utf8",
    );
    assert.equal(buildSrc.includes("input.artifactBytes"), false);
    assert.equal(/artifactBytes\s*:/.test(buildSrc) && buildSrc.includes("Uint8Array"), false);
    assert.equal(buildSrc.includes("contentDigest"), true);
  });

  test("testing adapters absent from production barrels", () => {
    const cp = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.equal(/export\s*\{[^}]*MemoryHeadlessStorageAdapter/.test(cp), false);
    assert.equal(cp.includes('from "./adapters/memory-storage'), false);

    const worker = readFileSync(
      join(process.cwd(), "src/features/headless-renderer/worker/index.ts"),
      "utf8",
    );
    assert.equal(worker.includes('from "./testing/reference-encode'), false);
    assert.equal(/export\s*\{[^}]*encodePngSequence/.test(worker), false);
  });

  test("local paths never appear in domain public artifact shape", () => {
    const types = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/domain/headless-render.types.ts",
      ),
      "utf8",
    );
    assert.equal(types.includes("absolutePath"), false);
    assert.equal(types.includes("outputPath"), false);
    assert.equal(types.includes("workspaceDir"), false);
  });

  await testAsync("incremental hash matches whole-buffer digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-hash-"));
    const path = join(dir, "a.bin");
    const bytes = new Uint8Array(50_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    writePayload(path, bytes);
    const auth = authorizeArtifactFile({
      absolutePath: path,
      maxBytes: bytes.byteLength,
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;
    const hashed = await hashArtifactFileIncremental({
      identity: auth.identity,
      maxChunkBytes: 4096,
    });
    assert.equal(hashed.ok, true);
    if (!hashed.ok) return;
    assert.equal(hashed.contentDigest, digestOf(bytes));
    assert.equal(hashed.bytesHashed, bytes.byteLength);
    assert.ok(hashed.chunkCount > 1);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("multi-chunk ordering preserved through storage stream", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const bytes = new Uint8Array(10_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const session = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(bytes),
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: bytes.byteLength,
      maxBytes: bytes.byteLength,
      chunks: chunkBytes(bytes, 1500),
    });
    assert.equal(written.ok, true);
    if (!written.ok) return;
    assert.ok(written.value.chunkCount > 1);
    const finalized = await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digestOf(bytes),
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    const opened = await storage.openOwnedObject(
      finalized.value.locator,
      "o1",
    );
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal(digestOf(opened.value.bytes), digestOf(bytes));
  });

  await testAsync("cancellation before first chunk fails closed", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const abortBytes = new Uint8Array(100);
    const session = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(abortBytes),
      expectedByteLength: abortBytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const ac = new AbortController();
    ac.abort();
    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: abortBytes.byteLength,
      maxBytes: abortBytes.byteLength,
      signal: ac.signal,
      chunks: chunkBytes(abortBytes, 10),
    });
    assert.equal(written.ok, false);
    if (!written.ok) {
      assert.equal(written.issues[0]?.code, "OPERATION_ABORTED");
    }
  });

  await testAsync("cancellation mid-stream fails closed", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const midBytes = new Uint8Array(80);
    midBytes.fill(1, 0, 40);
    midBytes.fill(2, 40, 80);
    const session = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(midBytes),
      expectedByteLength: midBytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const ac = new AbortController();
    async function* midAbort(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array(40).fill(1);
      ac.abort();
      yield new Uint8Array(40).fill(2);
    }
    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: midBytes.byteLength,
      maxBytes: midBytes.byteLength,
      signal: ac.signal,
      chunks: midAbort(),
    });
    assert.equal(written.ok, false);
    if (!written.ok) {
      assert.equal(written.issues[0]?.code, "OPERATION_ABORTED");
    }
  });

  await testAsync("abort mid-hash fails closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-hash-ab-"));
    const path = join(dir, "slow.bin");
    writePayload(path, new Uint8Array(8_000_000).fill(9));
    const auth = authorizeArtifactFile({
      absolutePath: path,
      maxBytes: 8_000_000,
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;
    const ac = new AbortController();
    const hashPromise = hashArtifactFileIncremental({
      identity: auth.identity,
      maxChunkBytes: 256,
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 5);
    const hashed = await hashPromise;
    assert.equal(hashed.ok, false);
    if (!hashed.ok) {
      assert.equal(hashed.reason, "aborted");
    }
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("source stream throws → storage rejects", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const throwBytes = new Uint8Array(3);
    const session = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(throwBytes),
      expectedByteLength: throwBytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: throwBytes.byteLength,
      maxBytes: throwBytes.byteLength,
      chunks: throwingChunks(),
    });
    assert.equal(written.ok, false);
    if (!written.ok) {
      assert.equal(written.issues[0]?.code, "INTERNAL_ERROR");
    }
  });

  await testAsync("byte underflow / overflow rejected", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const underClaim = new Uint8Array(100);
    const underSession = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(underClaim),
      expectedByteLength: underClaim.byteLength,
    });
    assert.equal(underSession.ok, true);
    if (!underSession.ok) return;
    const under = await storage.writeUploadStream({
      capabilityToken: underSession.value.capabilityToken,
      expectedByteLength: underClaim.byteLength,
      maxBytes: underClaim.byteLength,
      chunks: chunkBytes(new Uint8Array(40), 10),
    });
    assert.equal(under.ok, false);

    const overClaim = new Uint8Array(20);
    const overSession = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(overClaim),
      expectedByteLength: overClaim.byteLength,
    });
    assert.equal(overSession.ok, true);
    if (!overSession.ok) return;
    const over = await storage.writeUploadStream({
      capabilityToken: overSession.value.capabilityToken,
      expectedByteLength: overClaim.byteLength,
      maxBytes: overClaim.byteLength,
      chunks: chunkBytes(new Uint8Array(40), 10),
    });
    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.equal(over.issues[0]?.code, "BODY_TOO_LARGE");
    }

    const zeroClaim = new Uint8Array(1);
    const zeroSession = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(zeroClaim),
      expectedByteLength: zeroClaim.byteLength,
    });
    assert.equal(zeroSession.ok, true);
    if (!zeroSession.ok) return;
    async function* empty(): AsyncGenerator<Uint8Array> {
      /* no chunks */
    }
    const zero = await storage.writeUploadStream({
      capabilityToken: zeroSession.value.capabilityToken,
      expectedByteLength: zeroClaim.byteLength,
      maxBytes: zeroClaim.byteLength,
      chunks: empty(),
    });
    assert.equal(zero.ok, false);
  });

  await testAsync("file changes between validation and upload fail closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-mut-"));
    const path = join(dir, "art.bin");
    const bytes = new Uint8Array(4096).fill(5);
    writePayload(path, bytes);
    const auth = authorizeArtifactFile({
      absolutePath: path,
      maxBytes: 4096,
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;
    const hashed = await hashArtifactFileIncremental({
      identity: auth.identity,
      maxChunkBytes: 512,
    });
    assert.equal(hashed.ok, true);
    if (!hashed.ok) return;

    // Mutate file after hash — lease must fail on open.
    truncateSync(path, 100);
    const lease = createArtifactFileLease({
      identity: auth.identity,
      contentDigest: hashed.contentDigest,
      mimeType: "application/octet-stream",
      onDispose: () => rmSync(dir, { recursive: true, force: true }),
    });
    let threw = false;
    try {
      await collectChunks(
        lease.openUploadChunks({ maxChunkBytes: 256 }),
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
    lease.dispose();
    assert.equal(lease.disposed, true);
  });

  await testAsync("upload succeeds but finalization digest mismatch fails", async () => {
    const storage = new MemoryHeadlessStorageAdapter();
    const bytes = new Uint8Array(200).fill(8);
    const session = await storage.createUploadSession({
      ownerId: "o1",
      projectId: "p1",
      purpose: "artifact",
      mimeType: "video/webm",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digestOf(bytes),
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: bytes.byteLength,
      maxBytes: bytes.byteLength,
      chunks: chunkBytes(bytes, 50),
    });
    assert.equal(written.ok, true);
    const finalized = await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digestOf(new Uint8Array(200).fill(1)),
    });
    assert.equal(finalized.ok, false);
    if (!finalized.ok) {
      assert.equal(finalized.issues[0]?.code, "MANIFEST_DIGEST_MISMATCH");
    }
  });

  await testAsync("lease: one consume; dispose cleans; use-after-dispose fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-lease-"));
    const path = join(dir, "art.bin");
    const bytes = new Uint8Array(1024).fill(2);
    writePayload(path, bytes);
    const auth = authorizeArtifactFile({
      absolutePath: path,
      maxBytes: 1024,
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;
    let cleaned = false;
    const lease = createArtifactFileLease({
      identity: auth.identity,
      contentDigest: digestOf(bytes),
      mimeType: "application/octet-stream",
      onDispose: () => {
        cleaned = true;
        rmSync(dir, { recursive: true, force: true });
      },
    });
    const once = await collectChunks(
      lease.openUploadChunks({ maxChunkBytes: 128 }),
    );
    assert.equal(once.byteLength, 1024);
    let secondThrow = false;
    try {
      lease.openUploadChunks({ maxChunkBytes: 128 });
    } catch {
      secondThrow = true;
    }
    assert.equal(secondThrow, true);
    lease.dispose();
    assert.equal(cleaned, true);
    assert.equal(existsSync(dir), false);
    let afterDispose = false;
    try {
      lease.openUploadChunks({ maxChunkBytes: 128 });
    } catch {
      afterDispose = true;
    }
    assert.equal(afterDispose, true);
  });

  await testAsync(
    "end-to-end streamed WebM upload (short) — lease + metrics",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33-webm-stream",
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 1);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob!.state, "succeeded");
      const ev = result.value.lastEvidence;
      assert.ok(ev);
      assert.equal(ev!.byteLength, stored.value.canonicalJob!.artifact!.byteLength);
      assert.equal(ev!.metrics.artifactBytesStreamed, ev!.byteLength);
      assert.ok((ev!.metrics.artifactUploadChunkCount ?? 0) >= 1);
      assert.ok((ev!.metrics.peakArtifactUploadChunkBytes ?? 0) >= 1);
      assert.ok((ev!.metrics.artifactHashElapsedMs ?? 0) >= 0);
      assert.ok((ev!.metrics.artifactUploadElapsedMs ?? 0) >= 0);
      const blob = JSON.stringify(ev);
      assert.equal(blob.includes("/var/"), false);
      assert.equal(blob.includes("footiebitz-headless"), false);
      assert.equal(blob.includes("capabilityToken"), false);
    },
  );

  await testAsync(
    "end-to-end streamed MP4 upload (short) — lease + metrics",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "with-voice",
        rendererProfile: {
          resolution: "720p",
          format: "mp4",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33-mp4-stream",
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 1);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob!.state, "succeeded");
      assert.equal(stored.value.canonicalJob!.artifact!.format, "mp4");
      const ev = result.value.lastEvidence!;
      assert.equal(ev.metrics.artifactBytesStreamed, ev.byteLength);
      assert.equal(ev.videoCodec, "h264");
    },
  );

  await testAsync(
    "stale/cancelled before succeeded CAS is covered by test:headless-artifact-binding",
    async () => {
      // Real cancel/stale post-finalization races live in headlessArtifactBinding.verify.ts
      // (Phase 3.3A). Keep a local lease dispose proof here for stream boundary ownership.
      const dir = mkdtempSync(join(tmpdir(), "hf-lease-dispose-"));
      const path = join(dir, "art.bin");
      writePayload(path, new Uint8Array(512).fill(3));
      const auth = authorizeArtifactFile({ absolutePath: path, maxBytes: 512 });
      assert.equal(auth.ok, true);
      if (!auth.ok) return;
      let disposed = false;
      const lease = createArtifactFileLease({
        identity: auth.identity,
        contentDigest: digestOf(new Uint8Array(512).fill(3)),
        mimeType: "video/webm",
        onDispose: () => {
          disposed = true;
          rmSync(dir, { recursive: true, force: true });
        },
      });
      lease.dispose();
      assert.equal(disposed, true);
      assert.equal(existsSync(dir), false);
    },
  );

  test("browser export utils unchanged (no headless artifact stream import)", () => {
    const exportPanel = readFileSync(
      join(process.cwd(), "src/components/ExportPanel.tsx"),
      "utf8",
    );
    assert.equal(exportPanel.includes("writeUploadStream"), false);
    assert.equal(exportPanel.includes("artifact-file-lease"), false);
    assert.equal(exportPanel.includes("headless-renderer/worker"), false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
