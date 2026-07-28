/**
 * Sprint 6A — structural checks that audit docs and key export contracts exist.
 * Does not prove device export success.
 * Run: npm run test:export-capability-audit
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EXPORT_STAGES } from "@/features/export/utils/export-pipeline-forensics.utils";
import {
  assessImageSequenceViability,
  createFailureMatrixCases,
} from "@/features/export/utils/export-pipeline-forensics.utils";
import {
  isExportFormat,
  isExportResolution,
  normalizeExportSettings,
} from "@/features/export/utils/export-settings.utils";
import { resolveExportPath } from "@/features/export/utils/export-path.utils";
import { EXPORT_QUALITY_PRESETS } from "@/features/export/utils/export-quality.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function main() {
  console.log("\nexport-capability-audit (Sprint 6A)\n");

  const docs = [
    "docs/architecture/EXPORT_CONTRACT.md",
    "docs/qa/export-preview-parity-matrix.md",
    "docs/product/EXPORT_TIMING_MODEL.md",
    "docs/product/EXPORT_CAPABILITIES.md",
    "docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md",
    "docs/archive/sprints/EXPORT_RELIABILITY_SPRINT.md",
  ];

  test("required audit docs exist", () => {
    for (const doc of docs) {
      assert.ok(existsSync(join(process.cwd(), doc)), `missing ${doc}`);
    }
  });

  test("EXPORT_CONTRACT defines immutable manifest and Export Never Breaks", () => {
    const body = read("docs/architecture/EXPORT_CONTRACT.md");
    assert.match(body, /ExportManifest/);
    assert.match(body, /Export Never Breaks/);
    assert.match(body, /Capability Preflight/);
    assert.match(body, /immutable/i);
    assert.match(body, /SPRINT 6B|Sprint 6B/);
  });

  test("reliability sprint gates 6B on EXPORT_CONTRACT", () => {
    const body = read("docs/archive/sprints/EXPORT_RELIABILITY_SPRINT.md");
    assert.match(body, /EXPORT_CONTRACT\.md/);
    assert.match(body, /may begin only after/i);
  });

  test("parity matrix uses required status vocabulary", () => {
    const body = read("docs/qa/export-preview-parity-matrix.md");
    for (const status of [
      "Full",
      "Partial",
      "Missing",
      "Duplicated implementation",
      "Unsupported",
    ]) {
      assert.match(body, new RegExp(status));
    }
  });

  test("timing model documents renderDurationMs and frame-center sample", () => {
    const body = read("docs/product/EXPORT_TIMING_MODEL.md");
    assert.match(body, /renderDurationMs/);
    assert.match(body, /resolveTimelineFrameSampleTimeMs/);
    assert.match(body, /Model A/);
  });

  test("capabilities doc distinguishes WebM vs WebP", () => {
    const body = read("docs/product/EXPORT_CAPABILITIES.md");
    assert.match(body, /WebM/);
    assert.match(body, /WebP/);
    assert.match(body, /Not in Export UI|No/);
  });

  test("architecture audit recommends chunked/hybrid not full 1080p sequence", () => {
    const body = read("docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md");
    assert.match(body, /Chunked/);
    assert.match(body, /Hybrid|hybrid/);
    assert.match(body, /Not viable|not viable|Unsafe/);
  });

  test("reliability sprint lists 6B–6I phases", () => {
    const body = read("docs/archive/sprints/EXPORT_RELIABILITY_SPRINT.md");
    for (const phase of ["6B", "6C", "6D", "6E", "6F", "6G", "6H", "6I"]) {
      assert.match(body, new RegExp(phase));
    }
  });

  test("export format surface is webm|mp4 only", () => {
    assert.equal(isExportFormat("webm"), true);
    assert.equal(isExportFormat("mp4"), true);
    assert.equal(isExportFormat("webp"), false);
    assert.equal(isExportFormat("gif"), false);
    const settings = normalizeExportSettings(
      { format: "webp" } as unknown as Partial<{ format: "webm" | "mp4" }>,
      "Test",
    );
    // invalid formats fall back to default webm — must not become webp
    assert.equal(settings.format, "webm");
  });

  test("resolutions and quality presets are production-bounded", () => {
    assert.equal(isExportResolution("1080x1920"), true);
    assert.equal(isExportResolution("720x1280"), true);
    assert.equal(isExportResolution("2160x3840"), false);
    // Legacy quality presets may still list 4k for fallback APIs
    assert.ok(EXPORT_QUALITY_PRESETS.some((p) => p.id === "1080p"));
    assert.ok(EXPORT_QUALITY_PRESETS.every((p) => p.fps === 30));
  });

  test("resolveExportPath never rewrites format silently", () => {
    const webm = resolveExportPath(
      normalizeExportSettings({ format: "webm", resolution: "1080x1920" }, "A"),
    );
    const mp4 = resolveExportPath(
      normalizeExportSettings({ format: "mp4", resolution: "720x1280" }, "A"),
    );
    assert.equal(webm.path, "webm");
    assert.equal(mp4.path, "mp4");
  });

  test("forensics stages + failure matrix remain available for 6B preflight", () => {
    assert.ok(EXPORT_STAGES.includes("extract-frame-sequence"));
    assert.ok(EXPORT_STAGES.includes("encode-normalized-visual"));
    assert.equal(createFailureMatrixCases().length, 6);
    const unsafe = assessImageSequenceViability({
      width: 1080,
      height: 1920,
      frameCount: 952,
    });
    assert.ok(
      unsafe.viability === "Not viable for production 1080p browser export" ||
        unsafe.viability === "Viable only with bounded chunking",
    );
  });

  test("production export gates on prepareExportRequest before renderer side effects", () => {
    const render = read("src/features/export/services/video-render.service.ts");
    assert.match(render, /prepareExportRequest/);
    assert.match(render, /exportFootieShortFromManifest/);
    assert.match(render, /createExportRenderContext|renderExport/);
    assert.match(render, /toExportPipelineError|ExportPipelineError/);
    const panel = read("src/components/ExportPanel.tsx");
    assert.match(panel, /resolveExportUserFacingErrorMessage/);
    assert.match(panel, /prepareExportRequest/);
    assert.match(panel, /Checking export/);
  });

  test("export domain + runtime modules exist", () => {
    assert.ok(existsSync(join(process.cwd(), "src/features/export/domain/index.ts")));
    assert.ok(
      existsSync(join(process.cwd(), "src/features/export/domain/build-export-manifest.ts")),
    );
    assert.ok(
      existsSync(
        join(process.cwd(), "src/features/export/domain/run-export-capability-preflight.ts"),
      ),
    );
    assert.ok(existsSync(join(process.cwd(), "src/features/export/runtime/index.ts")));
    assert.ok(existsSync(join(process.cwd(), "src/features/export/timing/index.ts")));
    assert.ok(existsSync(join(process.cwd(), "docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md")));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
