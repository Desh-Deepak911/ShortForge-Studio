/**
 * Sprint 11E Phase 2E.2D.8K — hosted 4K capacity authority entry.
 * Run: npm run test:headless-fly-render-4k-capacity-authority
 */

import assert from "node:assert/strict";

import {
  auditCapacity4kProductionProfiles,
  assertCapacity4kProfileAuditFrozen,
  CAPACITY_4K_OPERATIONAL_CONTENT_MS,
  CAPACITY_4K_OPERATIONAL_MAX_FRAMES,
  CAPACITY_4K_OPERATIONAL_RENDER_MS,
} from "../fly-render-4k-capacity/capacity-4k-profile-audit";
import {
  buildCapacity4kOperationalDurationFramePlan,
  buildCapacity4kShortFunctionalFramePlan,
} from "../fly-render-4k-capacity/capacity-4k-frame-plan-authority";
import { buildCapacity4kOperationalDurationBoundary } from "../fly-render-4k-capacity/capacity-4k-workload";
import {
  assertFlyRender4kCapacityEvidencePrivacyStructure,
} from "../fly-render-4k-capacity/capacity-4k-evidence-privacy-authority";
import { createNotTestedFlyRender4kCapacityEvidence } from "../fly-render-4k-capacity/capacity-4k-evidence";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K — Fly render 4K capacity authority\n",
  );

  await test("canonical 4K profiles audited", () => {
    const records = auditCapacity4kProductionProfiles();
    assert.equal(records.length, 2);
    const webm = records.find((r) => r.profileId === "4k-webm-30")!;
    const mp4 = records.find((r) => r.profileId === "4k-mp4-30")!;
    assert.equal(webm.width, 2160);
    assert.equal(webm.height, 3840);
    assert.equal(webm.videoCodec, "vp9");
    assert.equal(webm.audioCodec, "opus");
    assert.equal(mp4.videoCodec, "h264");
    assert.equal(mp4.audioCodec, "aac");
    assert.equal(webm.maxWorkspaceBytes, 1536 * 1024 * 1024);
    assert.equal(webm.maxArtifactBytes, 768 * 1024 * 1024);
    assert.equal(webm.maxSingleFrameBytes, 24 * 1024 * 1024);
    assert.equal(assertCapacity4kProfileAuditFrozen().ok, true);
  });

  await test("short functional vs operational frame plans distinct", () => {
    const short = buildCapacity4kShortFunctionalFramePlan("4k-webm-30");
    const op = buildCapacity4kOperationalDurationFramePlan("4k-webm-30");
    assert.equal(short.contentDurationMs, 2000);
    assert.equal(short.renderDurationMs, 2400);
    assert.equal(short.contentFrames, 60);
    assert.equal(short.renderedFrames, 72);
    assert.equal(short.infersFullOperationalCapacity, false);
    assert.equal(op.contentDurationMs, CAPACITY_4K_OPERATIONAL_CONTENT_MS);
    assert.equal(op.renderDurationMs, CAPACITY_4K_OPERATIONAL_RENDER_MS);
    assert.equal(op.renderedFrames, CAPACITY_4K_OPERATIONAL_MAX_FRAMES);
    assert.equal(op.infersFullOperationalCapacity, true);
  });

  await test("operational boundary does not claim short functional support", () => {
    const boundary = buildCapacity4kOperationalDurationBoundary("4k-mp4-30");
    assert.equal(boundary.claimsShortFunctional4kSupport, false);
    assert.equal(boundary.claimsOperationalDuration4kCapacity, true);
    assert.equal(boundary.infersFullOperationalCapacityFromShortSmoke, false);
  });

  await test("4K capacity evidence privacy structure rejects secrets", () => {
    const clean = assertFlyRender4kCapacityEvidencePrivacyStructure(
      createNotTestedFlyRender4kCapacityEvidence(),
    );
    assert.equal(clean.ok, true);
    const dirty = assertFlyRender4kCapacityEvidencePrivacyStructure({
      ...createNotTestedFlyRender4kCapacityEvidence(),
      notes: ["postgresql://user:pass@host/db"],
    });
    assert.equal(dirty.ok, false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
