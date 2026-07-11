/**
 * Export pipeline forensics (4.2C-8D).
 * Run: npm run test:export-pipeline-forensics
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_STAGES,
  ExportPipelineError,
  assessImageSequenceViability,
  assertExtractedFrameSet,
  createFailureMatrixCases,
  estimateJpegFrameBytes,
  getExportStageEvents,
  isExportPipelineError,
  resetExportStageEvents,
  resolveExportUserFacingErrorMessage,
  resolveStageDefaultUserMessage,
  runExportStage,
  summarizeExtractedJpegFiles,
  toExportPipelineError,
} from "@/features/export/utils/export-pipeline-forensics.utils";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

async function main() {
  console.log("\nexport-pipeline-forensics\n");

  await test("every export stage has a stable ID", () => {
    assert.ok(EXPORT_STAGES.includes("extract-frame-sequence"));
    assert.ok(EXPORT_STAGES.includes("encode-normalized-visual"));
    assert.ok(EXPORT_STAGES.includes("mux-audio"));
    assert.equal(new Set(EXPORT_STAGES).size, EXPORT_STAGES.length);
  });

  await test("errors preserve stage and cause", () => {
    const cause = new Error("libvpx aborted");
    const err = new ExportPipelineError({
      stage: "encode-normalized-visual",
      code: "EXPORT_ENCODE_FAILED",
      message: resolveStageDefaultUserMessage("encode-normalized-visual"),
      detail: "exit 1",
      cause,
      context: { exitCode: 1 },
    });
    assert.equal(err.stage, "encode-normalized-visual");
    assert.equal(err.code, "EXPORT_ENCODE_FAILED");
    assert.equal(err.cause, cause);
    assert.equal(err.context?.exitCode, 1);
    assert.ok(isExportPipelineError(err));
  });

  await test("generic UI mapping does not destroy internal diagnostics", () => {
    const err = new ExportPipelineError({
      stage: "extract-frame-sequence",
      code: "EXPORT_EXTRACT_FAILED",
      message: resolveStageDefaultUserMessage("extract-frame-sequence"),
      detail: "FFmpeg extract exit 1\nstderr: OOM",
      context: { stderrTail: "memory access out of bounds" },
    });
    const ui = resolveExportUserFacingErrorMessage(err);
    assert.equal(ui, err.message);
    assert.ok(!ui.includes("stderr"));
    assert.ok(err.detail?.includes("OOM"));
  });

  await test("non-Error throw maps to worker/retry-safe UI message", () => {
    const mapped = toExportPipelineError("Aborted", "extract-frame-sequence");
    assert.equal(mapped.stage, "extract-frame-sequence");
    assert.ok(
      mapped.code === "EXPORT_WORKER" || mapped.code === "EXPORT_MEMORY",
    );
    assert.match(mapped.message, /export engine|memory/i);
  });

  await test("missing JPEG first/last frame produces extraction-stage error", () => {
    assert.throws(
      () =>
        assertExtractedFrameSet({
          expectedFrameCount: 952,
          fileNames: ["norm-frame-000002.jpg"],
        }),
      (error: unknown) =>
        isExportPipelineError(error) &&
        error.stage === "validate-extracted-frames" &&
        error.code === "EXPORT_EXTRACT_FRAME_MISSING",
    );
  });

  await test("JPEG count mismatch produces validation-stage error", () => {
    const names = Array.from({ length: 900 }, (_, i) =>
      `norm-frame-${String(i + 1).padStart(6, "0")}.jpg`,
    );
    assert.throws(
      () => assertExtractedFrameSet({ expectedFrameCount: 952, fileNames: names }),
      (error: unknown) =>
        isExportPipelineError(error) &&
        (error.code === "EXPORT_EXTRACT_COUNT_MISMATCH" ||
          error.code === "EXPORT_EXTRACT_FRAME_MISSING"),
    );
  });

  await test("runExportStage records success and failure events", async () => {
    resetExportStageEvents();
    await runExportStage("prepare-story", async () => 1, { ok: true });
    await assert.rejects(
      () =>
        runExportStage("mux-audio", async () => {
          throw new ExportPipelineError({
            stage: "mux-audio",
            code: "EXPORT_MUX_FAILED",
            message: resolveStageDefaultUserMessage("mux-audio"),
          });
        }),
      (error: unknown) =>
        isExportPipelineError(error) && error.stage === "mux-audio",
    );
    const events = getExportStageEvents();
    assert.ok(events.some((e) => e.stage === "prepare-story" && e.status === "success"));
    assert.ok(events.some((e) => e.stage === "mux-audio" && e.status === "failure"));
  });

  await test("1080p ~952-frame sequence viability is not full-MEMFS viable", () => {
    const assessment = assessImageSequenceViability({
      width: 1080,
      height: 1920,
      frameCount: 952,
    });
    assert.ok(
      assessment.viability === "Not viable for production 1080p browser export" ||
        assessment.viability === "Viable only with bounded chunking",
    );
    assert.ok(assessment.estimatedSequenceBytes > 150 * 1024 * 1024);
    const perFrame = estimateJpegFrameBytes(1080, 1920);
    assert.ok(perFrame > 50_000);
  });

  await test("720p short exports remain within viable / chunked band", () => {
    const short = assessImageSequenceViability({
      width: 720,
      height: 1280,
      frameCount: 150,
    });
    assert.ok(
      short.viability === "Viable" ||
        short.viability === "Viable only with bounded chunking",
    );
  });

  await test("failure matrix cases cover A–F", () => {
    const cases = createFailureMatrixCases();
    assert.deepEqual(
      cases.map((c) => c.id),
      ["A", "B", "C", "D", "E", "F"],
    );
    const f = cases.find((c) => c.id === "F")!;
    assert.equal(f.width, 1080);
    assert.equal(f.narration, true);
  });

  await test("summarizeExtractedJpegFiles orders first/last", () => {
    const summary = summarizeExtractedJpegFiles([
      "norm-frame-000003.jpg",
      "norm-frame-000001.jpg",
      "norm-frame-000002.jpg",
    ]);
    assert.equal(summary.count, 3);
    assert.equal(summary.first, "norm-frame-000001.jpg");
    assert.equal(summary.last, "norm-frame-000003.jpg");
  });

  await test("production wires forensics + preserves UI mapping", () => {
    const panel = readSrc("src/components/ExportPanel.tsx");
    const render = readSrc("src/features/export/services/video-render.service.ts");
    const ffmpeg = readSrc("src/features/export/utils/ffmpeg.utils.ts");
    assert.match(panel, /resolveExportUserFacingErrorMessage/);
    assert.match(panel, /logExportPipelineFailure/);
    assert.match(render, /resetExportStageEvents/);
    assert.match(render, /toExportPipelineError/);
    assert.match(render, /assessImageSequenceViability/);
    assert.match(ffmpeg, /ExportPipelineError/);
    assert.match(ffmpeg, /createFfmpegLogCapture/);
    assert.match(ffmpeg, /assertExtractedFrameSet/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
