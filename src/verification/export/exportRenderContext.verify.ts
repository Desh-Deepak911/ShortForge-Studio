/**
 * Sprint 6C — ExportRenderContext lifecycle & semantic/runtime separation.
 * Run: npm run test:export-render-context
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createExportCancellationToken,
  ExportCancelledError,
  createExportProgressReporter,
} from "@/features/export/runtime";
import { deepFreezeExportManifest } from "@/features/export/domain";
import type { ExportManifest } from "@/features/export/domain";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

async function main() {
  console.log("\nexport-render-context (Sprint 6C)\n");

  await test("runtime modules exclude semantic scene/caption fields", () => {
    const types = read("src/features/export/runtime/export-render-context.types.ts");
    assert.doesNotMatch(types, /scenes:\s/);
    assert.doesNotMatch(types, /captions:\s/);
    assert.doesNotMatch(types, /StoryDocument|FootieScript/);
    assert.match(types, /canvas/);
    assert.match(types, /mediaCache/);
    assert.match(types, /cancellation/);
    assert.match(types, /ffmpeg/);
  });

  await test("progress reporter does not mutate manifest", () => {
    const manifest = deepFreezeExportManifest({
      fingerprint: "em:test",
    } as ExportManifest);
    const fp = manifest.fingerprint;
    const reports: string[] = [];
    const progress = createExportProgressReporter((update) => {
      reports.push(update.stage);
    });
    progress.report({ stage: "rendering", progress: 10, message: "x" });
    assert.equal(manifest.fingerprint, fp);
    assert.deepEqual(reports, ["rendering"]);
  });

  await test("cancellation token throws when cancelled", () => {
    const token = createExportCancellationToken();
    assert.equal(token.isCancelled, false);
    token.cancel("stop");
    assert.equal(token.isCancelled, true);
    assert.throws(() => token.throwIfCancelled(), ExportCancelledError);
  });

  await test("context create/dispose modules exist and wire cleanup", () => {
    const create = read("src/features/export/runtime/create-export-render-context.ts");
    const dispose = read("src/features/export/runtime/dispose-export-render-context.ts");
    assert.match(create, /createExportMediaCache/);
    assert.match(dispose, /disposeExportMediaCache/);
    assert.match(dispose, /revokeAll/);
    assert.match(create, /markExportFfmpegRuntimePoisoned|isExportFfmpegRuntimePoisoned/);
  });

  await test("renderExport disposes context via finally in entry", () => {
    const service = read("src/features/export/services/video-render.service.ts");
    assert.match(service, /createExportRenderContext/);
    assert.match(service, /disposeExportRenderContext/);
    assert.match(service, /finally/);
    assert.match(service, /renderExport/);
  });

  await test("poisoned FFmpeg is marked and reset on dispose path", () => {
    const render = read("src/features/export/runtime/render-export.ts");
    assert.match(render, /markPoisoned/);
    assert.match(render, /markExportFfmpegRuntimePoisoned/);
    const dispose = read("src/features/export/runtime/dispose-export-render-context.ts");
    assert.match(dispose, /isPoisoned/);
    assert.match(dispose, /\.reset\(/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
