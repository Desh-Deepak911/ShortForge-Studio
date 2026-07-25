import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { classifyStagingHeadlessControlPlaneActivation } from "@/features/headless-renderer/control-plane/runtime/staging-control-plane-activation";
import { HttpOwnedUploadAdapter } from "@/features/headless-renderer/product/upload/http-owned-upload.adapter";
import { STAGING_HEADLESS_RENDERER_BUILD_ID } from "@/features/headless-renderer/control-plane/runtime/staging-renderer-build-authority";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { toHeadlessProductJobViewFromStore } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import { validateHeadlessPublicJobView } from "@/features/headless-renderer/product/client/validate-public-job-view";

let passed = 0;
async function test(name: string, run: () => void | Promise<void>) {
  await run();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function main() {
await test("activation is staging-only and rejects Vercel production", () => {
  assert.equal(
    classifyStagingHeadlessControlPlaneActivation({
      HEADLESS_CONTROL_PLANE_ENABLED: "1",
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "preview",
    }),
    "active",
  );
  assert.equal(
    classifyStagingHeadlessControlPlaneActivation({
      HEADLESS_CONTROL_PLANE_ENABLED: "1",
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "production",
    }),
    "production_deployment_rejected",
  );
  assert.notEqual(
    classifyStagingHeadlessControlPlaneActivation({
      HEADLESS_CONTROL_PLANE_ENABLED: "1",
      HEADLESS_ENV_NAME: "production",
    }),
    "active",
  );
  assert.notEqual(
    classifyStagingHeadlessControlPlaneActivation({
      HEADLESS_ENV_NAME: "staging",
    }),
    "active",
  );
});

await test("staging renderer build authority matches the hosted worker", () => {
  assert.equal(
    STAGING_HEADLESS_RENDERER_BUILD_ID,
    HEADLESS_WORKER_RENDERER_BUILD_ID,
  );
});

await test("product UI uses real preparation and owned upload defaults", () => {
  const source = readFileSync(
    "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    "utf8",
  );
  assert.match(source, /prepareExportRequest/);
  assert.match(source, /prepareOwnedHeadlessUpload/);
  assert.match(source, /new HttpOwnedUploadAdapter/);
  assert.doesNotMatch(source, /new UnavailableOwnedUploadAdapter/);
  assert.doesNotMatch(source, /pending-prepare|pending-bundle|pending-auth/);
  assert.doesNotMatch(source, /worker\/runtime/);
});

await test("status and download routes are owner-bound", () => {
  const status = readFileSync(
    "src/app/api/headless-render/jobs/[jobId]/route.ts",
    "utf8",
  );
  const download = readFileSync(
    "src/app/api/headless-render/jobs/[jobId]/download/route.ts",
    "utf8",
  );
  const retry = readFileSync(
    "src/app/api/headless-render/jobs/[jobId]/retry/route.ts",
    "utf8",
  );
  assert.match(status, /getByJobIdAndOwner\(jobId, gate\.principal\.ownerId\)/);
  assert.match(status, /toHeadlessProductJobViewFromStore/);
  assert.match(download, /issueArtifactGetCapability/);
  assert.match(download, /ownerId: gate\.principal\.ownerId/);
  assert.match(retry, /getByJobIdAndOwner\(jobId, gate\.principal\.ownerId\)/);
  assert.match(retry, /NOT_RETRYABLE/);
});

await test("server product view is accepted by the browser validator", () => {
  const mapped = toHeadlessProductJobViewFromStore({
    stage: "provisional",
    jobId: "11111111-1111-4111-8111-111111111111",
    state: "materializing",
    createdAtMs: 1,
    updatedAtMs: 1,
    progress: null,
    terminalReason: null,
    requestedRendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
  } as never);
  const validated = validateHeadlessPublicJobView(mapped);
  assert.ok(validated);
  assert.equal(validated.cancelAccepted, true);
});

await test("browser owned-upload adapter PUTs then completes without exposing providers", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const view = {
    version: 1,
    jobId: "11111111-1111-4111-8111-111111111111",
    state: "materializing",
    progress: null,
    terminalReason: null,
    createdAtMs: 1,
    updatedAtMs: 1,
    artifactAvailable: false,
    cancelAccepted: true,
    output: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
  };
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url === "/api/headless-render/uploads") {
      const preparedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal("rendererBuildId" in preparedBody, false);
      return Response.json(
        {
          jobId: view.jobId,
          uploads: [
            {
              objectId: "obj-manifest",
              purpose: "manifest",
              slotKey: null,
              putUrl: "https://upload.invalid/manifest",
              requiredHeaders: { "Content-Type": "application/json" },
            },
            {
              objectId: "obj-bundle",
              purpose: "asset_bundle_record",
              slotKey: null,
              putUrl: "https://upload.invalid/bundle",
              requiredHeaders: { "Content-Type": "application/json" },
            },
          ],
        },
        { status: 201 },
      );
    }
    if (url.includes("/complete")) {
      return Response.json({ jobId: view.jobId, view });
    }
    return new Response(null, { status: 200 });
  };
  const adapter = new HttpOwnedUploadAdapter(fetchMock);
  const result = await adapter.uploadOwnedBundle({
    operationId: "22222222-2222-4222-8222-222222222222",
    draftId: "33333333-3333-4333-8333-333333333333",
    manifestBytes: new TextEncoder().encode("{}"),
    assetBundleBytes: new TextEncoder().encode("{}"),
    manifestFingerprint: `mf:${"a".repeat(64)}`,
    assetBundleFingerprint: `bf:${"b".repeat(64)}`,
    sourceObjects: [],
    rendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
    rendererBuildId: "renderer",
    idempotencyKey: "idempotency",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.createdJob?.jobId, view.jobId);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["POST", "PUT", "PUT", "POST"],
  );
});

console.log(`\n${passed} tests passed.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
