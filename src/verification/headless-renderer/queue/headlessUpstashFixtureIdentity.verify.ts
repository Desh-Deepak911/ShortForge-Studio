/**
 * Sprint 11E Phase 2D.1B — Upstash fixture projectId / fingerprint identity.
 * Run: npm run test:headless-upstash-fixture-identity
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildExportManifestFingerprint,
  validateExportManifest,
} from "@/features/export/domain";

import {
  buildCanonicalFixtureExportManifestV2,
  buildCanonicalFixtureExportManifestV3,
  buildStaleProjectIdOverwrittenFixtureManifest,
  createQueuedCanonicalJob,
} from "../upstash-live/dual-lease-test-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1B — Upstash fixture identity\n");

  await test("UUID projectId binds before fingerprint (v3/9C)", () => {
    const projectId = randomUUID();
    const manifest = buildCanonicalFixtureExportManifestV3(projectId);
    assert.equal(manifest.project.projectId, projectId);
    assert.equal(validateExportManifest(manifest).ok, true);
    const draft = { ...manifest };
    delete (draft as { fingerprint?: string }).fingerprint;
    assert.equal(
      buildExportManifestFingerprint(
        draft as Parameters<typeof buildExportManifestFingerprint>[0],
      ),
      manifest.fingerprint,
    );
  });

  await test("UUID projectId binds before fingerprint (v2/8D)", () => {
    const projectId = randomUUID();
    const manifest = buildCanonicalFixtureExportManifestV2(projectId);
    assert.equal(manifest.project.projectId, projectId);
    assert.equal(manifest.version, 2);
    assert.equal(manifest.rendererContractVersion, "8D");
    assert.equal(validateExportManifest(manifest).ok, true);
  });

  await test("post-fingerprint projectId replacement fails closed", () => {
    const projectId = randomUUID();
    const stale = buildStaleProjectIdOverwrittenFixtureManifest(projectId);
    assert.equal(stale.project.projectId, projectId);
    assert.equal(validateExportManifest(stale).ok, false);
    const draft = { ...stale };
    delete (draft as { fingerprint?: string }).fingerprint;
    const expected = buildExportManifestFingerprint(
      draft as Parameters<typeof buildExportManifestFingerprint>[0],
    );
    assert.notEqual(stale.fingerprint, expected);
  });

  await test(
    "createQueuedCanonicalJob uses input projectId in sealed manifest",
    async () => {
      const projectId = randomUUID();
      const fx = await createQueuedCanonicalJob({ projectId });
      assert.equal(fx.projectId, projectId);
      assert.equal(fx.manifest.project.projectId, projectId);
      assert.equal(
        fx.record.canonicalRequest!.ownership.projectId,
        projectId,
      );
      assert.equal(validateExportManifest(fx.manifest).ok, true);
    },
  );

  await test(
    "createQueuedCanonicalJob v2 path preserves 8D with bound projectId",
    async () => {
      const projectId = randomUUID();
      const fx = await createQueuedCanonicalJob({
        projectId,
        manifestVersion: "v2",
      });
      assert.equal(fx.manifest.version, 2);
      assert.equal(fx.manifest.project.projectId, projectId);
      assert.equal(validateExportManifest(fx.manifest).ok, true);
    },
  );

  await test("different projectIds yield different fingerprints", () => {
    const a = buildCanonicalFixtureExportManifestV3(randomUUID());
    const b = buildCanonicalFixtureExportManifestV3(randomUUID());
    assert.notEqual(a.fingerprint, b.fingerprint);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
