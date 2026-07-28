/**
 * Sprint 11E Phase 2E.2D.8I.6B — 720p smoke frame-plan authority.
 * Run: npm run test:headless-fly-render-smoke-frame-plan-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  resolveExportContentEndMs,
  resolveExportRenderEndMs,
  resolveExportTotalFrames,
} from "@/features/export/timing";
import { headlessMaxFramesForRenderDurationMs } from "@/features/headless-renderer/worker/runtime/output-profiles";

import {
  buildHeadlessFlyRenderLiveSmokeBoundary,
  HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS,
} from "../fly-render-live/smoke-workload";
import {
  buildHeadlessFlyRenderSmokeFramePlanAuthority,
  resolveHeadlessContentFrameCount,
  resolveHeadlessRenderedFrameCount,
} from "../fly-render-live/smoke-frame-plan-authority";
import { buildLiveDraft } from "../neon-live/live-fixtures";
import { classifyDatabaseUrlSafe } from "../fly-render-live/run-fly-8i6b-schema-preflight-once";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8I.6B — Fly render smoke frame-plan authority\n",
  );

  await test("content frame count for 2000ms @ 30fps is 60", () => {
    assert.equal(
      resolveHeadlessContentFrameCount({ contentDurationMs: 2000 }),
      60,
    );
  });

  await test("rendered frame count for 2400ms render budget @ 30fps is 72", () => {
    assert.equal(
      resolveHeadlessRenderedFrameCount({ renderDurationMs: 2400 }),
      72,
    );
  });

  await test("smoke live draft separates content duration from render budget", async () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    const draft = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "fep_owner_frameplan",
      contentDurationMs: smoke.contentDurationMs,
    });
    assert.equal(smoke.contentDurationMs, HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS);
    assert.equal(draft.manifest.project.contentDurationMs, 2000);
    assert.equal(draft.manifest.project.renderDurationMs, 2400);
    assert.equal(draft.manifest.project.endBufferMs, 400);

    const plan = buildHeadlessFlyRenderSmokeFramePlanAuthority(draft.manifest);
    assert.equal(plan.contentFrames, 60);
    assert.equal(plan.renderedFrames, 72);
    assert.equal(plan.paddingTailFrames, 12);
    assert.equal(plan.endBufferMs, 400);
    assert.equal(resolveExportTotalFrames(draft.manifest), 72);
    assert.equal(resolveExportContentEndMs(draft.manifest), 2000);
    assert.equal(resolveExportRenderEndMs(draft.manifest), 2400);
  });

  await test("profile operational ceiling from content ms alone is not rendered frame count", () => {
    const ceilingFromContent = headlessMaxFramesForRenderDurationMs(2000);
    assert.equal(ceilingFromContent, 60);
    assert.notEqual(ceilingFromContent, 72);
  });

  await test("padding tail frames freeze visual time during end buffer", async () => {
    const draft = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "fep_owner_tail",
      contentDurationMs: 2000,
    });
    const plan = buildHeadlessFlyRenderSmokeFramePlanAuthority(draft.manifest);
    assert.equal(plan.paddingTailFrames, plan.renderedFrames - plan.contentFrames);
    assert.ok(plan.paddingTailFrames > 0);
  });

  await test("quoted pooled DATABASE_URL classifies without exposing secrets", () => {
    assert.equal(
      classifyDatabaseUrlSafe(
        "'postgresql://user:pass@ep-example-pooler.c-12.us-east-1.aws.neon.tech/neondb'",
      ),
      "pooled_postgresql",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
