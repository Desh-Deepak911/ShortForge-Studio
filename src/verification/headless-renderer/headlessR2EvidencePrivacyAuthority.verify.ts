/**
 * Sprint 11E Phase 2C.1B — R2 evidence privacy authority (deterministic).
 * Run: npm run test:headless-r2-evidence-privacy
 */

import assert from "node:assert/strict";

import { assertR2EvidencePrivacyStructure } from "./r2-live/evidence-privacy-authority";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1B — R2 evidence privacy authority\n");

  await test("accepts uploadCapabilityIssued + public view + safe case fields", () => {
    const ok = assertR2EvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "PASS",
      uploadCapabilityIssued: true,
      publicObject: {
        objectId: "obj_1",
        purpose: "manifest",
        slotKey: null,
        stage: "finalized",
        expiresAtMs: 9_000_000,
      },
    });
    assert.equal(ok.ok, true);

    const withFailCategory = assertR2EvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "FAIL",
      failureCategory: "EVIDENCE_PRIVACY_FAILED",
      uploadCapabilityIssued: false,
    });
    assert.equal(withFailCategory.ok, true);
  });

  await test("rejects putUrl / getUrl / downloadUrl", () => {
    for (const key of ["putUrl", "getUrl", "downloadUrl"] as const) {
      const result = assertR2EvidencePrivacyStructure({
        caseId: "evidence.privacy",
        status: "PASS",
        [key]: "https://example.invalid/presigned",
      });
      assert.equal(result.ok, false, `expected reject for ${key}`);
    }
  });

  await test("rejects nested presigned URL string values", () => {
    const result = assertR2EvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "PASS",
      publicObject: {
        objectId: "https://evil.example/presigned?X-Amz-Signature=abc",
        purpose: "manifest",
        slotKey: null,
        stage: "finalized",
        expiresAtMs: 1,
      },
    });
    assert.equal(result.ok, false);
  });

  await test("rejects X-Amz-* signature patterns", () => {
    const result = assertR2EvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "PASS",
      failureCategory: "X-Amz-Signature=deadbeef",
    });
    assert.equal(result.ok, false);
  });

  await test("rejects endpoint / bucket / key / storeId / digest / secret keys", () => {
    for (const key of [
      "endpoint",
      "bucket",
      "objectKey",
      "storeId",
      "contentDigest",
      "secretAccessKey",
      "accessKeyId",
    ] as const) {
      const result = assertR2EvidencePrivacyStructure({
        caseId: "evidence.privacy",
        status: "PASS",
        [key]: "leaked",
      });
      assert.equal(result.ok, false, `expected reject for ${key}`);
    }
  });

  await test("rejects sha256 digest value patterns", () => {
    const digest = `sha256:${"ab".repeat(32)}`;
    const result = assertR2EvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "PASS",
      failureCategory: digest,
    });
    assert.equal(result.ok, false);
  });

  await test("rejects hostile Proxy getters", () => {
    const hostile = new Proxy(
      { caseId: "evidence.privacy", status: "PASS" },
      {
        get(_t, prop) {
          if (prop === "putUrl") return "https://evil.example/put";
          if (prop === "caseId") return "evidence.privacy";
          if (prop === "status") return "PASS";
          throw new Error("hostile");
        },
        ownKeys() {
          return ["caseId", "status", "putUrl"];
        },
        getOwnPropertyDescriptor(_t, prop) {
          return {
            enumerable: true,
            configurable: true,
            value:
              prop === "putUrl"
                ? "https://evil.example/put"
                : prop === "caseId"
                  ? "evidence.privacy"
                  : "PASS",
          };
        },
      },
    );
    const result = assertR2EvidencePrivacyStructure(hostile);
    assert.equal(result.ok, false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
