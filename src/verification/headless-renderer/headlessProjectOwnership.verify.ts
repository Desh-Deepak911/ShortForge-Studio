/**
 * Sprint 11E Phase 2B.1A / 2B.1B — project ownership port verification.
 * Run: npm run test:headless-project-ownership
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { UnavailableHeadlessProjectAuthorizationAdapter } from "@/features/headless-renderer/control-plane/adapters/unavailable-project-authorization.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import { TestHeadlessProjectAuthorizationAdapter } from "@/features/headless-renderer/control-plane/testing";
import {
  validateHeadlessClaimableProjectId,
  isHeadlessClaimableProjectId,
  type HeadlessProjectAuthorizationPort,
} from "@/features/headless-renderer/control-plane";
import { HEADLESS_MAX_ID_LENGTH } from "@/features/headless-renderer/domain/headless-render-constants";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function principal(ownerId: string) {
  return { ownerId, sessionId: null as string | null };
}

/** Lowercase RFC 4122 samples with explicit version nibbles (non-v4). */
function sampleUuidWithVersion(versionNibble: string): string {
  return `00000000-0000-${versionNibble}000-8000-000000000000`;
}

async function rejectProjectId(auth: MemoryHeadlessProjectOwnershipAdapter, projectId: string) {
  const claim = await auth.claimUnownedProject(principal("owner-a"), projectId);
  assert.equal(claim.ok, false);
  const access = await auth.assertProjectAccess(principal("owner-a"), projectId);
  assert.equal(access.ok, false);
}

async function main() {
  console.log("\nSprint 11E Phase 2B.1B — project ownership\n");

  // Future migration seam: legacy non-UUID owned projects require an explicit
  // ownership migration — memory/production first-claim enforces UUID only.

  await test("async authorization: await claimUnownedProject + assertProjectAccess", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    const claim = await auth.claimUnownedProject(principal("owner-a"), projectId);
    assert.equal(claim.ok, true);
    const access = await auth.assertProjectAccess(principal("owner-a"), projectId);
    assert.equal(access.ok, true);
  });

  await test("UUID first-claim accepted (randomUUID)", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    const result = await auth.claimUnownedProject(principal("owner-a"), projectId);
    assert.equal(result.ok, true);
    assert.equal(auth.testingGetOwner(projectId), "owner-a");
  });

  await test("same-owner idempotent reclaim", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    assert.equal(
      (await auth.claimUnownedProject(principal("owner-a"), projectId)).ok,
      true,
    );
    assert.equal(
      (await auth.claimUnownedProject(principal("owner-a"), projectId)).ok,
      true,
    );
    assert.equal(auth.testingGetOwner(projectId), "owner-a");
  });

  await test("different owner claim is FORBIDDEN", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    assert.equal(
      (await auth.claimUnownedProject(principal("owner-a"), projectId)).ok,
      true,
    );
    const blocked = await auth.claimUnownedProject(principal("owner-b"), projectId);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.issues[0]?.code, "FORBIDDEN");
    }
    assert.equal(auth.testingGetOwner(projectId), "owner-a");
  });

  await test("assertProjectAccess allows bound owner", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    await auth.claimUnownedProject(principal("owner-a"), projectId);
    assert.equal(
      (await auth.assertProjectAccess(principal("owner-a"), projectId)).ok,
      true,
    );
  });

  await test("assertProjectAccess rejects unbound / wrong owner FORBIDDEN", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    await auth.claimUnownedProject(principal("owner-a"), projectId);
    assert.equal(
      (await auth.assertProjectAccess(principal("owner-b"), projectId)).ok,
      false,
    );
    assert.equal(
      (await auth.assertProjectAccess(principal("owner-a"), randomUUID())).ok,
      false,
    );
  });

  await test("memory adapter: blank, project-1, malformed UUID, oversized fail closed", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const reject = async (projectId: unknown) => {
      const claim = await auth.claimUnownedProject(
        principal("owner-a"),
        projectId as string,
      );
      assert.equal(claim.ok, false);
      const access = await auth.assertProjectAccess(
        principal("owner-a"),
        projectId as string,
      );
      assert.equal(access.ok, false);
    };

    await reject("");
    await reject("   ");
    await reject("project-1");
    await reject("not-a-uuid");
    await reject("00000000-0000-0000-0000-000000000000");
    await reject("x".repeat(HEADLESS_MAX_ID_LENGTH + 1));
  });

  await test("memory adapter: hostile projectId objects fail closed", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const hostile = new Proxy(
      { toString: () => randomUUID() },
      {
        get(target, prop) {
          if (prop === "then") return undefined;
          throw new Error("hostile projectId getter");
        },
      },
    );
    const claim = await auth.claimUnownedProject(
      principal("owner-a"),
      hostile as unknown as string,
    );
    assert.equal(claim.ok, false);
  });

  await test("unavailable adapter returns CONFIGURATION_UNAVAILABLE", async () => {
    const auth: HeadlessProjectAuthorizationPort =
      new UnavailableHeadlessProjectAuthorizationAdapter();
    const claim = await auth.claimUnownedProject(principal("owner-a"), randomUUID());
    assert.equal(claim.ok, false);
    if (!claim.ok) {
      assert.equal(claim.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
    const access = await auth.assertProjectAccess(
      principal("owner-a"),
      randomUUID(),
    );
    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  await test("testingSnapshot is deeply frozen array; mutation does not change adapter", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    await auth.claimUnownedProject(principal("owner-a"), projectId);
    const snap = auth.testingSnapshot();
    assert.equal(Array.isArray(snap), true);
    assert.equal(Object.isFrozen(snap), true);
    assert.equal(snap.length, 1);
    assert.equal(Object.isFrozen(snap[0]), true);
    assert.equal(snap[0]?.projectId, projectId);
    assert.equal(snap[0]?.ownerId, "owner-a");

    assert.throws(() => {
      (snap as unknown as Array<{ projectId: string; ownerId: string }>).push({
        projectId: "evil",
        ownerId: "evil",
      });
    });
    const ownerBefore = auth.testingGetOwner(projectId);
    try {
      (snap[0] as { ownerId: string }).ownerId = "evil-owner";
    } catch {
      /* strict mode throw */
    }
    assert.equal(auth.testingGetOwner(projectId), ownerBefore);

    assert.equal(auth.testingGetOwner(projectId), "owner-a");
    const snap2 = auth.testingSnapshot();
    assert.equal(snap2.length, 1);
    assert.equal(snap2[0]?.ownerId, "owner-a");
  });

  await test("principal ownerId comes from auth only — not client-supplied binding", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const projectId = randomUUID();
    const claim = await auth.claimUnownedProject(
      { ownerId: "server-bound-owner", sessionId: null },
      projectId,
    );
    assert.equal(claim.ok, true);
    assert.equal(auth.testingGetOwner(projectId), "server-bound-owner");
  });

  await test("TestHeadlessProjectAuthorizationAdapter accepts fixture IDs (async)", async () => {
    const auth = new TestHeadlessProjectAuthorizationAdapter({
      ownerId: "owner-a",
      allowedProjectIds: ["project-1", "fixture-local"],
    });
    assert.equal(
      (await auth.claimUnownedProject(principal("owner-a"), "project-1")).ok,
      true,
    );
    assert.equal(
      (await auth.assertProjectAccess(principal("owner-a"), "fixture-local")).ok,
      true,
    );
    assert.equal(
      (await auth.assertProjectAccess(principal("owner-b"), "project-1")).ok,
      false,
    );
    assert.equal(
      (await auth.claimUnownedProject(principal("owner-a"), randomUUID())).ok,
      false,
    );
  });

  await test("validateHeadlessClaimableProjectId: UUID v4 accepted (randomUUID)", async () => {
    const projectId = randomUUID();
    assert.equal(isHeadlessClaimableProjectId(projectId), true);
    const parsed = validateHeadlessClaimableProjectId(projectId);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const auth = new MemoryHeadlessProjectOwnershipAdapter();
      assert.equal(
        (await auth.claimUnownedProject(principal("owner-a"), parsed.projectId)).ok,
        true,
      );
    }
  });

  await test("validateHeadlessClaimableProjectId: UUID v1/v3/v5/v6/v7/v8 rejected", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    for (const version of ["1", "3", "5", "6", "7", "8"]) {
      const sample = sampleUuidWithVersion(version);
      assert.equal(isHeadlessClaimableProjectId(sample), false);
      assert.equal(validateHeadlessClaimableProjectId(sample).ok, false);
      await rejectProjectId(auth, sample);
    }
  });

  await test("validateHeadlessClaimableProjectId: uppercase UUID rejected", async () => {
    const upper = randomUUID().toUpperCase();
    assert.equal(isHeadlessClaimableProjectId(upper), false);
    const parsed = validateHeadlessClaimableProjectId(upper);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.message, /lowercase/i);
    }
    await rejectProjectId(new MemoryHeadlessProjectOwnershipAdapter(), upper);
  });

  await test("validateHeadlessClaimableProjectId: nil UUID rejected", async () => {
    const nil = "00000000-0000-0000-0000-000000000000";
    assert.equal(isHeadlessClaimableProjectId(nil), false);
    assert.equal(validateHeadlessClaimableProjectId(nil).ok, false);
    await rejectProjectId(new MemoryHeadlessProjectOwnershipAdapter(), nil);
  });

  await test("validateHeadlessClaimableProjectId: malformed IDs rejected", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const malformed = [
      "not-a-uuid",
      "1234",
      "00000000-0000-4000-8000",
      "00000000-0000-4000-8000-000000000000-extra",
      "00000000-0000-4000-8000-000000000000 ",
    ];
    for (const sample of malformed) {
      assert.equal(isHeadlessClaimableProjectId(sample), false);
      assert.equal(validateHeadlessClaimableProjectId(sample).ok, false);
      await rejectProjectId(auth, sample);
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
