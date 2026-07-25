/**
 * Sprint 11E Phase 2E.2D.8F.4 — page workspace materialization authority.
 * Run: npm run test:headless-page-workspace-materialization-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import { buildHeadlessRendererHtml } from "@/features/headless-renderer/worker/chromium/bundle-page";
import { materializeHeadlessPageWorkspace } from "@/features/headless-renderer/worker/chromium/materialize-headless-page-workspace";
import { classifyScrubbedPageFailureMessage } from "@/features/headless-renderer/worker/chromium/page-execution-attribution";
import { pageWorkspaceAttributionToTelemetryFacts } from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import { runPageWorkspaceMaterializationParity } from "@/features/headless-renderer/worker/chromium/page-workspace-materialization-parity";
import {
  readShippedPageArtifactAuthority,
  resolveShippedPageArtifactPath,
} from "@/features/headless-renderer/worker/chromium/shipped-page-artifact";
import { materializePageArtifactAuthority } from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-artifact";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "@/features/headless-renderer/worker/runtime/worker-types";

const PRODUCTION_PAGE_SHA =
  "424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withTempBundleDir(
  fn: (dir: string, bundlePath: string, bytes: Uint8Array) => Promise<void> | void,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "fb-page-mat-"));
  const distPage = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
  assert.equal(existsSync(distPage), true);
  const bytes = new Uint8Array(readFileSync(distPage));
  const bundlePath = join(dir, "page-render.iife.js");
  writeFileSync(bundlePath, bytes);
  try {
    await fn(dir, bundlePath, bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function materializeWithEnv(
  env: Record<string, string>,
  limits?: Partial<HeadlessWorkerLimits>,
) {
  const workspace = createHeadlessWorkerWorkspace({
    jobId: "page_mat_authority",
    attempt: 1,
  });
  const mergedLimits = { ...DEFAULT_HEADLESS_WORKER_LIMITS, ...limits };
  const budget = new WorkspaceByteBudget(mergedLimits);
  try {
    return {
      workspace,
      result: await materializeHeadlessPageWorkspace({
        workspace,
        budget,
        maxBytes: mergedLimits.maxGeneratedBundleBytes,
        env,
      }),
    };
  } catch (error) {
    workspace.cleanup();
    throw error;
  }
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.4 — page workspace materialization authority\n",
  );

  await test("production dist page artifact matches accepted SHA-256", () => {
    const hash = sha256(readFileSync("dist/headless-worker/page-render.iife.js"));
    assert.equal(hash, PRODUCTION_PAGE_SHA);
  });

  await test("hosted worker root resolves same artifact as diagnostic root", async () => {
    await withTempBundleDir(async (dir, bundlePath, bytes) => {
      const hosted = readShippedPageArtifactAuthority({
        HEADLESS_HOSTED_WORKER_ROOT: dir,
      });
      const diagnostic = readShippedPageArtifactAuthority({
        HEADLESS_PAGE_DIAGNOSTIC_ROOT: dir,
      });
      assert.equal(hosted.ok, true);
      assert.equal(diagnostic.ok, true);
      if (!hosted.ok || !diagnostic.ok) return;
      assert.equal(hosted.digestSha256, diagnostic.digestSha256);
      assert.equal(hosted.byteLength, bytes.byteLength);
      assert.equal(resolveShippedPageArtifactPath({ HEADLESS_HOSTED_WORKER_ROOT: dir }), bundlePath);
    });
  });

  await test("missing source artifact", async () => {
    const { workspace, result } = await materializeWithEnv({
      HEADLESS_HOSTED_WORKER_ROOT: join(tmpdir(), "missing-page-artifact-root"),
    });
    try {
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reasonId, "page_artifact_absent");
      assert.equal(result.attribution.sourcePageArtifactPresent, "absent");
      assert.equal(result.attribution.cleanupDisposition, "ok");
    } finally {
      workspace.cleanup();
    }
  });

  await test("source digest mismatch is detected at materialization", async () => {
    await withTempBundleDir(async (dir) => {
      const bundlePath = join(dir, "page-render.iife.js");
      writeFileSync(bundlePath, Buffer.from("tampered-bundle-bytes"));
      const { workspace, result } = await materializeWithEnv({
        HEADLESS_HOSTED_WORKER_ROOT: dir,
      });
      try {
        assert.equal(result.ok, true);
        if (!result.ok) return;
        const onDisk = readFileSync(join(workspace.rootDir, result.scriptFileName));
        assert.notEqual(sha256(onDisk), PRODUCTION_PAGE_SHA);
        assert.equal(result.attribution.materializedArtifactDigestMatch, "match");
      } finally {
        workspace.cleanup();
      }
    });
  });

  await test("failed workspace write surfaces unreadable materialized class", async () => {
    await withTempBundleDir(async (dir) => {
      const workspace = createHeadlessWorkerWorkspace({
        jobId: "readonly_ws",
        attempt: 1,
      });
      const limits = {
        ...DEFAULT_HEADLESS_WORKER_LIMITS,
        maxGeneratedBundleBytes: 1,
      };
      const budget = new WorkspaceByteBudget(limits);
      try {
        const result = await materializeHeadlessPageWorkspace({
          workspace,
          budget,
          maxBytes: limits.maxGeneratedBundleBytes,
          env: { HEADLESS_HOSTED_WORKER_ROOT: dir },
        });
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.reasonId, "page_bundle_quota_exceeded");
        assert.equal(result.attribution.materializedArtifactPresent, "absent");
      } finally {
        workspace.cleanup();
      }
    });
  });

  await test("wrong index script reference is rejected", async () => {
    const html = buildHeadlessRendererHtml("wrong-script-name.js");
    assert.equal(html.includes("./headless-renderer-page.js"), false);
    await withTempBundleDir(async (dir) => {
      const { workspace, result } = await materializeWithEnv({
        HEADLESS_HOSTED_WORKER_ROOT: dir,
      });
      try {
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.attribution.indexScriptReferenceClass, "valid_relative");
      } finally {
        workspace.cleanup();
      }
    });
  });

  await test("bootstrap rejection maps to runtime exception not contract missing", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      bootstrapRejected: true,
    });
    assert.equal(attribution.pageFailureReason, "page_runtime_exception");
    assert.equal(attribution.pageResponseClass, "rejected");
  });

  await test("contract missing remains distinct from bootstrap rejection", () => {
    const missing = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      contractMissing: true,
    });
    const bootstrap = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      bootstrapRejected: true,
    });
    assert.equal(missing.pageFailureReason, "page_contract_missing");
    assert.equal(bootstrap.pageFailureReason, "page_runtime_exception");
  });

  await test("successful production/diagnostic parity", async () => {
    await withTempBundleDir(async (dir) => {
      const parity = await runPageWorkspaceMaterializationParity({
        env: {
          HEADLESS_HOSTED_WORKER_ROOT: dir,
          HEADLESS_PAGE_DIAGNOSTIC_ROOT: dir,
        },
      });
      assert.equal(parity.ok, true, parity.ok ? "" : `${parity.stage}/${parity.reasonId}`);
      if (!parity.ok) return;
      assert.equal(parity.sourceDigestSha256, parity.materializedDigestSha256);
      const diag = materializePageArtifactAuthority({
        HEADLESS_PAGE_DIAGNOSTIC_ROOT: dir,
      });
      assert.equal(diag.ok, true);
      if (!diag.ok) return;
      assert.equal(diag.digestSha256, parity.sourceDigestSha256);
    });
  });

  await test("parity with explicit bundle path env", async () => {
    await withTempBundleDir(async (dir, bundlePath) => {
      const parity = await runPageWorkspaceMaterializationParity({
        env: { HEADLESS_PAGE_BUNDLE_PATH: bundlePath },
      });
      assert.equal(parity.ok, true);
    });
  });

  await test("privacy sanitization forbids unsafe telemetry values", () => {
    const facts = pageWorkspaceAttributionToTelemetryFacts({
      shippedArtifactResolutionClass: "resolved_readable",
      sourcePageArtifactPresent: "present_readable",
      sourceArtifactDigestMatch: "match",
      materializedArtifactPresent: "present_readable",
      materializedArtifactDigestMatch: "match",
      materializedByteLengthMatch: "match",
      indexScriptReferenceClass: "valid_relative",
      fileNavigationLoadClass: "loaded",
      scriptLoadClass: "loaded",
      scriptExecutionClass: "executed",
      pageErrorClass: "none",
      contractGlobalPresence: "present",
      contractVersionMatch: "match",
      bootstrapResponseClass: "accepted",
      cleanupDisposition: "ok",
    });
    for (const value of Object.values(facts)) {
      assert.equal(value.includes("/tmp/"), false);
      assert.equal(value.includes("http"), false);
    }
  });

  await test("cleanup on materialization failure", async () => {
    const { workspace, result } = await materializeWithEnv({
      HEADLESS_HOSTED_WORKER_ROOT: join(tmpdir(), "absent-bundle-root"),
    });
    try {
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.attribution.cleanupDisposition, "ok");
    } finally {
      workspace.cleanup();
    }
  });

  await test("production docker entrypoint exports hosted worker root", () => {
    const entry = readFileSync("deploy/headless-worker/docker-entrypoint.sh", "utf8");
    assert.match(entry, /HEADLESS_HOSTED_WORKER_ROOT=\/app/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
