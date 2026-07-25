/**
 * Sprint 11E Phase 1 — safe active-job persistence verification.
 */
import assert from "node:assert/strict";

import {
  clearActiveJobReference,
  HEADLESS_ACTIVE_JOB_STORAGE_KEY,
  readActiveJobReference,
  reconcileActiveJobReference,
  validateActiveJobReference,
  writeActiveJobReference,
  type HeadlessActiveJobReferenceV1,
} from "@/features/headless-renderer/product/persistence/active-job-reference";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const valid: HeadlessActiveJobReferenceV1 = {
  version: 1,
  draftId: "draft-abc",
  jobId: "job-12345678",
  createdAtMs: Date.now(),
  operationId: "op-12345678",
  output: { resolution: "1080p", format: "webm" },
};

function main(): void {
  test("validates safe shape", () => {
    assert.ok(validateActiveJobReference(valid));
  });

  test("rejects forbidden secret fields", () => {
    assert.equal(
      validateActiveJobReference({
        ...valid,
        manifest: { evil: true },
      }),
      null,
    );
    assert.equal(
      validateActiveJobReference({
        ...valid,
        signedUrl: "https://evil.example/x",
      }),
      null,
    );
    assert.equal(
      validateActiveJobReference({
        ...valid,
        fingerprint: "abc",
      }),
      null,
    );
  });

  test("round-trip write/read for matching draft", () => {
    const storage = new MemoryStorage();
    writeActiveJobReference(storage, valid);
    const read = readActiveJobReference(storage, "draft-abc");
    assert.ok(read);
    assert.equal(read.jobId, valid.jobId);
    assert.equal(storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY) != null, true);
  });

  test("cross-draft reference cleared / not returned", () => {
    const storage = new MemoryStorage();
    writeActiveJobReference(storage, valid);
    assert.equal(readActiveJobReference(storage, "other-draft"), null);
    const reconciled = reconcileActiveJobReference(storage, "other-draft");
    assert.equal(reconciled, null);
    assert.equal(storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY), null);
  });

  test("malformed JSON cleared", () => {
    const storage = new MemoryStorage();
    storage.setItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY, "{not-json");
    assert.equal(reconcileActiveJobReference(storage, "draft-abc"), null);
    assert.equal(storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY), null);
  });

  test("expired reference cleared", () => {
    const storage = new MemoryStorage();
    writeActiveJobReference(storage, {
      ...valid,
      createdAtMs: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    assert.equal(reconcileActiveJobReference(storage, "draft-abc"), null);
  });

  test("clear removes key", () => {
    const storage = new MemoryStorage();
    writeActiveJobReference(storage, valid);
    clearActiveJobReference(storage);
    assert.equal(storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY), null);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
