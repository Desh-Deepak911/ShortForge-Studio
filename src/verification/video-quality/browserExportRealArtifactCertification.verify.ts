/**
 * Real Browser export artifact certification.
 *
 * Preferred: measure production Browser blobs already captured under
 * `.tmp/browser-export-cert/`, or drive `/dev/scene-media-qa` via Chromium when
 * the local Studio is running (`npm run dev` on :3000).
 *
 * Does NOT substitute FFmpeg JPEG encode-probe for Browser certification.
 *
 * Run: npm run test:browser-export-artifacts
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

import {
  measureSsimPsnr,
  probeMedia,
  runCmd,
  textSafeCrop,
} from "./encodeQualityMeasure";
import {
  buildIdealTransformedReferenceFrame,
  ensureRealisticMotionFixtures,
} from "./realisticMotionFixtureCorpus";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/browser-export-cert");
const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/export/current/BROWSER_EXPORT_REAL_ARTIFACT.md",
);
const STUDIO_ORIGIN = process.env.SHORTFORGE_STUDIO_ORIGIN ?? "http://localhost:3000";

type MeasuredBrowserArtifact = {
  readonly filename: string;
  readonly bytes: number;
  readonly probe: ReturnType<typeof probeMedia>;
  readonly structuralEdgeSsim: number | null;
  readonly appearanceSsim: number | null;
  readonly notes: string;
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const REQUIRED_MATRIX_FILES = [
  "01-native-vertical-1080-fill.webm",
  "02-landscape-4k-to-1080-fill-1x.webm",
  "03-landscape-4k-to-1080-fill-1_25x.webm",
  "04-landscape-fit.webm",
  "05-landscape-fit-with-background.webm",
  "06-trimmed-moving.webm",
  "07-captioned.webm",
  "08-post-title-no-caption.webm",
] as const;

async function studioReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${STUDIO_ORIGIN}/dev/browser-export-cert`, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function tryAutomateBrowserExportCertMatrix(): Promise<{
  readonly attempted: boolean;
  readonly produced: string[];
  readonly blocker: string | null;
}> {
  const reachable = await studioReachable();
  if (!reachable) {
    return {
      attempted: false,
      produced: [],
      blocker: `Studio not reachable at ${STUDIO_ORIGIN}. Start with \`npm run dev\` then re-run.`,
    };
  }

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return {
      attempted: true,
      produced: [],
      blocker: chrome.message,
    };
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    return {
      attempted: true,
      produced: [],
      blocker: "puppeteer-core unavailable",
    };
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    await page.goto(`${STUDIO_ORIGIN}/dev/browser-export-cert`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    // Always drive via the explicit Run control (avoids effect-autorun lint/races).
    await page.waitForSelector("[data-browser-export-cert-run]", {
      timeout: 60_000,
    });
    await page.click("[data-browser-export-cert-run]");

    const deadline = Date.now() + 1_200_000; // 20 min for 8×1080p Browser exports
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const snapshot = await page.evaluate(() => {
        const payload = (
          window as Window & {
            __BROWSER_EXPORT_CERT__?: {
              status: string;
              results: Array<{
                id: string;
                filename: string;
                ok: boolean;
                bytes: number;
                mimeType: string;
                base64: string;
                error: string | null;
              }>;
            };
          }
        ).__BROWSER_EXPORT_CERT__;
        return payload ?? null;
      });

      if (!snapshot) continue;
      if (snapshot.status === "done") {
        const produced: string[] = [];
        const failures: string[] = [];
        for (const result of snapshot.results) {
          if (!result.ok || !result.base64) {
            failures.push(`${result.id}: ${result.error ?? "empty"}`);
            continue;
          }
          writeFileSync(
            join(ARTIFACT_DIR, result.filename),
            Buffer.from(result.base64, "base64"),
          );
          produced.push(result.filename);
        }
        if (failures.length > 0) {
          return {
            attempted: true,
            produced,
            blocker: `Browser matrix failures: ${failures.join("; ")}`,
          };
        }
        return { attempted: true, produced, blocker: null };
      }
    }

    return {
      attempted: true,
      produced: [],
      blocker:
        "Timed out waiting for /dev/browser-export-cert matrix (20m). Check Studio logs / disk.",
    };
  } finally {
    await browser.close();
  }
}


function listArtifactFiles(): string[] {
  if (!existsSync(ARTIFACT_DIR)) return [];
  return readdirSync(ARTIFACT_DIR).filter((name) => /\.(webm|mp4)$/i.test(name));
}

function measureArtifact(
  ffmpeg: string,
  ffprobe: string,
  filename: string,
): MeasuredBrowserArtifact {
  const path = join(ARTIFACT_DIR, filename);
  const probe = probeMedia(ffprobe, path);
  const bytes = statSync(path).size;

  // Best-effort ideal compare when dimensions match a known vertical ladder.
  let structuralEdgeSsim: number | null = null;
  let appearanceSsim: number | null = null;
  let notes = "probe-only";
  if (
    (probe.width === 720 && probe.height === 1280) ||
    (probe.width === 1080 && probe.height === 1920)
  ) {
    try {
      const { byId } = ensureRealisticMotionFixtures(ffmpeg);
      const fixture = byId.get("landscape_motion")!;
      const workIdeal = join(ARTIFACT_DIR, `_ideal_${filename}.png`);
      const workActual = join(ARTIFACT_DIR, `_actual_${filename}.png`);
      buildIdealTransformedReferenceFrame({
        ffmpeg,
        sourcePath: fixture.path,
        outputPath: workIdeal,
        sourceWidth: fixture.width,
        sourceHeight: fixture.height,
        targetWidth: probe.width,
        targetHeight: probe.height,
        fitMode: "fill",
        zoom: 1,
        seekSec: 0.25,
      });
      runCmd(ffmpeg, [
        "-y",
        "-ss",
        "0.25",
        "-i",
        path,
        "-frames:v",
        "1",
        workActual,
      ]);
      const mask = textSafeCrop(probe.width, probe.height);
      structuralEdgeSsim = measureSsimPsnr({
        ffmpeg,
        actualPath: workActual,
        referencePath: workIdeal,
        maskCrop: mask,
        structuralEdges: true,
      }).ssim;
      appearanceSsim = measureSsimPsnr({
        ffmpeg,
        actualPath: workActual,
        referencePath: workIdeal,
        maskCrop: mask,
        structuralEdges: false,
      }).ssim;
      notes =
        "Compared against landscape→Fill ideal (fixture may differ from artifact source — treat as relative decode health)";
    } catch (error) {
      notes = `Ideal compare skipped: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return {
    filename,
    bytes,
    probe,
    structuralEdgeSsim,
    appearanceSsim,
    notes,
  };
}

async function main(): Promise<void> {
  console.log("\nBrowser export real-artifact certification\n");
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true);
  if (!binaries.ok) throw new Error(binaries.message);

  ensureRealisticMotionFixtures(binaries.ffmpegExecutable);
  console.log("  … realistic-motion fixtures ensured for Browser matrix");

  test("Browser production path is chunked-browser renderExport (not encode-probe)", () => {
    const renderExport = readFileSync(
      join(process.cwd(), "src/features/export/runtime/render-export.ts"),
      "utf8",
    );
    assert.match(renderExport, /renderChunkedSilentVisual|renderExportSilentVisual/);
    const panel = readFileSync(
      join(process.cwd(), "src/components/ExportPanel.tsx"),
      "utf8",
    );
    assert.match(panel, /720x1280/);
    assert.match(panel, /1080x1920/);
    assert.match(panel, /4K is available/);
  });

  const existingMatrix = REQUIRED_MATRIX_FILES.every((name) =>
    existsSync(join(ARTIFACT_DIR, name)),
  );

  let automation: {
    readonly attempted: boolean;
    readonly produced: string[];
    readonly blocker: string | null;
  } = {
    attempted: false,
    produced: [],
    blocker: existingMatrix
      ? null
      : "Matrix incomplete; will attempt Studio automation.",
  };

  if (!existingMatrix) {
    automation = await tryAutomateBrowserExportCertMatrix();
    console.log(
      automation.attempted
        ? `  … automation attempted; produced=${automation.produced.length}`
        : `  … automation skipped: ${automation.blocker}`,
    );
  } else {
    console.log("  … required Browser matrix files already present under .tmp/browser-export-cert/");
  }

  const files = listArtifactFiles().filter((name) =>
    (REQUIRED_MATRIX_FILES as readonly string[]).includes(name),
  );
  const measured = files.map((name) =>
    measureArtifact(
      binaries.ffmpegExecutable,
      binaries.ffprobeExecutable,
      name,
    ),
  );

  const missing = REQUIRED_MATRIX_FILES.filter(
    (name) => !existsSync(join(ARTIFACT_DIR, name)),
  );
  const hasRealArtifact = missing.length === 0 && measured.length >= 8;

  test("required Browser matrix files are present", () => {
    assert.equal(
      missing.length,
      0,
      `missing: ${missing.join(", ") || "(none)"}; blocker=${automation.blocker ?? "n/a"}`,
    );
  });

  test("captured Browser artifacts have exact 1080p vertical dimensions", () => {
    assert.ok(measured.length >= 8, `measured=${measured.length}`);
    for (const row of measured) {
      assert.equal(row.probe.width, 1080, row.filename);
      assert.equal(row.probe.height, 1920, row.filename);
      assert.ok(row.bytes > 1000, row.filename);
      assert.ok(row.probe.frameCount == null || row.probe.frameCount > 0, row.filename);
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    studioOrigin: STUDIO_ORIGIN,
    automation,
    hasRealArtifact,
    requiredMatrix: REQUIRED_MATRIX_FILES,
    missing,
    measured,
    userAssistedProcedure: [
      "1. npm run dev",
      "2. Ensure fixtures: npm run test:realistic-motion-encoding (or open /dev/browser-export-cert which uses /api/dev/browser-export-fixture/*).",
      "3. Open http://localhost:3000/dev/browser-export-cert and click Run 1080p Browser matrix.",
      "4. Artifacts write under .tmp/browser-export-cert/ via the cert automation / window.__BROWSER_EXPORT_CERT__.",
      "5. npm run test:browser-export-artifacts",
    ],
    measurementCommand: "npm run test:browser-export-artifacts",
  };

  writeFileSync(
    join(ARTIFACT_DIR, "measurements.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const md = `# Browser export real-artifact certification

Generated: ${report.generatedAt}

## Status

${
  hasRealArtifact
    ? "**Real Browser matrix complete** — eight production Browser Blobs probed below."
    : "**Real Browser matrix incomplete.**"
}

${
  automation.blocker
    ? `### Blocker\n\n${automation.blocker}\n`
    : automation.attempted
      ? `### Automation\n\nAttempted against ${STUDIO_ORIGIN}; produced: ${automation.produced.join(", ") || "(none)"}\n`
      : ""
}

Missing: ${missing.length ? missing.join(", ") : "(none)"}

## Production authority

Browser silent visual uses \`renderExport\` → \`renderChunkedSilentVisual\` (canvas JPEG → libvpx chunks). Encode-probe substitutes are **not** Browser certification.

UI exposes 720p/1080p only; 4K is Headless-only. Matrix exports are **1080p WebM**.

## Measured artifacts

${
  measured.length === 0
    ? "_None yet._"
    : `| File | Bytes | Size | Codec | FPS | Frames | Duration | Bitrate | Edge SSIM | Appearance SSIM | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${measured
  .map(
    (m) =>
      `| ${m.filename} | ${m.bytes} | ${m.probe.width}×${m.probe.height} | ${m.probe.codec}/${m.probe.pixelFormat} | ${m.probe.fps ?? "n/a"} | ${m.probe.frameCount ?? "n/a"} | ${
        m.probe.durationSec != null ? m.probe.durationSec.toFixed(3) : "n/a"
      } | ${m.probe.bitRate ?? "n/a"} | ${
        m.structuralEdgeSsim?.toFixed(4) ?? "—"
      } | ${m.appearanceSsim?.toFixed(4) ?? "—"} | ${m.notes} |`,
  )
  .join("\n")}`
}

## User-assisted procedure

${report.userAssistedProcedure.map((step) => `- ${step}`).join("\n")}

## Measurement command

\`\`\`bash
${report.measurementCommand}
\`\`\`
`;

  mkdirSync(join(process.cwd(), "docs/evidence/export/current"), {
    recursive: true,
  });
  writeFileSync(EVIDENCE_PATH, md);
  console.log(`\nWrote ${EVIDENCE_PATH}`);
  console.log(
    hasRealArtifact
      ? `${passed} checks passed; ${measured.length} real Browser artifact(s).\n`
      : `${passed} checks passed; Browser certification incomplete.\n`,
  );

  if (!hasRealArtifact) {
    process.exitCode = 1;
  }
}


main().catch((error) => {
  console.error(error);
  process.exit(1);
});
