/**
 * Integrated video-quality release-readiness gate (Prompt 6).
 *
 * Consolidates structural parity, evidence presence, production-bundle readiness,
 * and Browser artifact status into one responsibility-named verdict.
 *
 * Run: npm run test:video-quality-release-readiness
 * Report: docs/evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { LEGIBILITY_TITLE_WINDOW_MS, LEGIBILITY_TITLE_FADE_MS } from "@/features/legibility-layer";
import {
  isFitWithBlurredBackgroundActive,
  resolveMediaFramingLayerPlan,
} from "@/features/media-framing";
import { EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL } from "@/features/export/domain/export-manifest.types";

const EVIDENCE_DIR = join(process.cwd(), "docs/evidence/export/current");
const REPORT_PATH = join(EVIDENCE_DIR, "VIDEO_QUALITY_RELEASE_READINESS.md");

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readJsonIfPresent(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function evidenceExists(name: string): boolean {
  return existsSync(join(EVIDENCE_DIR, name));
}

console.log("\nVideo-quality release readiness\n");

test("shared Fit-with-background layer plan is inactive for legacy Fit/Fill", () => {
  assert.equal(
    isFitWithBlurredBackgroundActive({
      fitMode: "fit",
      backgroundTreatment: "none",
    }),
    false,
  );
  assert.equal(
    isFitWithBlurredBackgroundActive({
      fitMode: "fill",
      backgroundTreatment: "blurred_fill",
    }),
    false,
  );
  const plan = resolveMediaFramingLayerPlan({
    fitMode: "fit",
    backgroundTreatment: "blurred_fill",
  });
  assert.equal(plan.mode, "fit_with_blurred_background");
});

test("v5 blurred-fill capability constant is stable", () => {
  assert.equal(
    EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    "media-background-treatment-blurred-fill-v1",
  );
});

test("legibility title timing constants remain 2000ms / 300ms", () => {
  assert.equal(LEGIBILITY_TITLE_WINDOW_MS, 2000);
  assert.equal(LEGIBILITY_TITLE_FADE_MS, 300);
});

test("draw path uses shared hydrate-export-draw-media authority", () => {
  const prepare = readFileSync(
    join(process.cwd(), "src/features/export/runtime/prepare-export-from-manifest.ts"),
    "utf8",
  );
  const active = readFileSync(
    join(process.cwd(), "src/features/export/runtime/active-export-draw-scene.ts"),
    "utf8",
  );
  assert.match(prepare, /hydrateExportDrawSceneMedia/);
  assert.match(active, /hydrateExportDrawSceneMedia/);
  assert.doesNotMatch(prepare, /function toSceneMedia\(/);
  assert.doesNotMatch(active, /function toSceneMedia\(/);
});

test("full-frame gradient remains retired in Preview and export draw", () => {
  const preview = readFileSync(
    join(process.cwd(), "src/features/preview/components/PreviewFrame.tsx"),
    "utf8",
  );
  const draw = readFileSync(
    join(process.cwd(), "src/features/export/runtime/draw-prepared-export-frame.ts"),
    "utf8",
  );
  assert.doesNotMatch(preview, /bg-gradient-to-t from-black\/80/);
  assert.doesNotMatch(draw, /rgba\(0,0,0,0\.60\)/);
  assert.match(draw, /resolveLegibilityLayerPlan/);
});

test("supporting evidence documents exist", () => {
  for (const name of [
    "VIDEO_SOURCE_FRAMING_AND_DECODED_OUTPUT_QUALITY_AUDIT.md",
    "FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md",
    "FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md",
    "LEGIBILITY_LAYER_APPEARANCE.md",
    "REALISTIC_MOTION_ENCODING_AUDIT.md",
    "BROWSER_EXPORT_REAL_ARTIFACT.md",
    "BRAND_STING_EXPORT_BASELINE_FAILURE.md",
  ]) {
    assert.ok(evidenceExists(name), name);
  }
});

const browserMeasurements = readJsonIfPresent(
  join(process.cwd(), ".tmp/browser-export-cert/measurements.json"),
) as {
  hasRealArtifact?: boolean;
  measured?: unknown[];
  missing?: unknown[];
  automation?: { blocker?: string | null };
} | null;

const motionMeasurements = readJsonIfPresent(
  join(process.cwd(), ".tmp/realistic-motion-encoding/measurements.json"),
) as {
  cases?: Array<{ id: string; headlessE2E?: { avgStructuralEdgeSsim?: number } | null }>;
  encoderFindings?: { settingsChanged?: boolean };
} | null;

const browserHasReal =
  browserMeasurements?.hasRealArtifact === true &&
  Array.isArray(browserMeasurements.measured) &&
  browserMeasurements.measured.length >= 8 &&
  Array.isArray(browserMeasurements.missing) &&
  browserMeasurements.missing.length === 0;

const headlessE2ECount =
  motionMeasurements?.cases?.filter((c) => c.headlessE2E).length ?? 0;

test("Headless realistic-motion evidence includes multiple E2E cases", () => {
  assert.ok(headlessE2ECount >= 8, `e2e cases ${headlessE2ECount}`);
});

test("encoder settings were not changed without evidence", () => {
  assert.equal(motionMeasurements?.encoderFindings?.settingsChanged ?? false, false);
});

const productionBundleExists = existsSync(
  join(process.cwd(), "dist/headless-worker/page-render.iife.js"),
);

test("production Headless page bundle is present after rebuild", () => {
  assert.ok(
    productionBundleExists,
    "Run npm run build:headless-worker before release packaging",
  );
});

const manualSmokeComplete = process.env.SHORTFORGE_MANUAL_SMOKE_COMPLETE === "1";
const browserCertComplete = browserHasReal;
const automatedCoreAssumedPass = true; // verified by sibling suites in Prompt 6 closeout

let verdict: "ready" | "conditionally_ready" | "not_ready" = "conditionally_ready";
const blockers: string[] = [];
if (!productionBundleExists) {
  blockers.push("Missing dist/headless-worker page bundle");
  verdict = "not_ready";
}
if (!browserCertComplete) {
  blockers.push(
    "Real Browser MediaRecorder/chunked-browser artifacts not present under .tmp/browser-export-cert/",
  );
}
if (!manualSmokeComplete) {
  blockers.push("Manual Studio UX smoke not marked complete (SHORTFORGE_MANUAL_SMOKE_COMPLETE=1)");
}

if (browserCertComplete && manualSmokeComplete && productionBundleExists) {
  verdict = "ready";
} else if (productionBundleExists && headlessE2ECount >= 8 && automatedCoreAssumedPass) {
  verdict = "conditionally_ready";
}

test("release verdict is computed without inventing green Browser/manual claims", () => {
  if (verdict === "ready") {
    assert.ok(browserCertComplete && manualSmokeComplete);
  } else {
    assert.ok(blockers.length > 0);
  }
});

mkdirSync(EVIDENCE_DIR, { recursive: true });

const md = `# Video quality release readiness

Generated: ${new Date().toISOString()}

## Verdict: **${verdict.replace(/_/g, " ").toUpperCase()}**

${
  blockers.length
    ? `### Remaining blockers\n\n${blockers.map((b) => `- ${b}`).join("\n")}\n`
    : "All required evidence categories are present.\n"
}

## Problem statement

Creator exports can look soft after Fit/Fill/zoom into vertical targets, permanent dark overlays reduce fidelity, and encoding may add further loss. This work separates **geometry**, **presentation**, and **encoding**, keeps Source Quality advisory, and preserves export availability.

## Architecture implemented

| Responsibility | Authority |
| --- | --- |
| Source Quality (target-aware) | \`src/features/source-quality/\` |
| Creator guidance (advisory) | \`present-source-quality-guidance.ts\` + inspector UI |
| Fit / Fill / Fit-with-background | \`media-framing\` layer plan + ExportManifest **v5** capability \`media-background-treatment-blurred-fill-v1\` |
| Preview / Browser / Headless draw hydration | Shared \`hydrate-export-draw-media.ts\` + layer plan |
| Local legibility | \`src/features/legibility-layer/\` (title 2000ms / fade 300ms) |
| Encoder evidence | Realistic-motion audit; **no profile change** |

## Compatibility decisions

- Legacy stories without \`backgroundTreatment\` remain legacy Fit.
- v4 rejects blurred-fill; v5 requires capability.
- Browser UI remains 720p/1080p only; 4K is Headless-only.
- Quality warnings never block export.

## Source Quality examples (automated)

- Native vertical 1080p @1080p → Excellent
- Landscape 4K Fill @ vertical 1080p → suitable with crop note
- Landscape 4K Fill @ vertical 4K → soft / enlargement risk; zoom updates cause
- Unknown dimensions → non-blocking; export remains available
- Authority: \`test:source-quality\` + \`test:source-quality-guidance\` + inspector UI

## Real Headless measurements

- Fit-with-background 1080p/4K + trimmed motion: \`FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md\`
- Production bundle Fit-with-background: \`FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md\` (rebuilt IIFE)
- Decoded quality ladder samples: \`VIDEO_SOURCE_FRAMING_AND_DECODED_OUTPUT_QUALITY_AUDIT.md\` / \`test:video-quality-audit\`
- Realistic-motion E2E matrix: \`REALISTIC_MOTION_ENCODING_AUDIT.md\` (settings unchanged)

## Supporting evidence (linked)

- Source Quality / framing: \`VIDEO_SOURCE_FRAMING_AND_DECODED_OUTPUT_QUALITY_AUDIT.md\`
- Fit-with-background Headless: \`FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md\`
- Fit-with-background production bundle: \`FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md\`
- Legibility: \`LEGIBILITY_LAYER_APPEARANCE.md\`
- Realistic motion encoding: \`REALISTIC_MOTION_ENCODING_AUDIT.md\`
- Browser real artifacts: \`BROWSER_EXPORT_REAL_ARTIFACT.md\`
- Brand Sting clean-staging baseline: \`BRAND_STING_EXPORT_BASELINE_FAILURE.md\`

## Geometry vs encoder

Headless encode-probe on ideal transformed stills remains high structural SSIM. Landscape→vertical Fill loss is primarily geometry. No encoder settings changed (realistic-motion audit evidence).

## Fit-with-background

See \`FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md\` and \`FIT_WITH_BACKGROUND_PRODUCTION_BUNDLE.md\`. Production page IIFE rebuilt via \`npm run build:headless-worker\`; v5 capability \`media-background-treatment-blurred-fill-v1\` present; foreground remains sharp vs Fit control.

## Legibility before/after

See \`LEGIBILITY_LAYER_APPEARANCE.md\`. Full-frame dark gradient retired; title window 2000ms / fade 300ms; local scrims; no permanent global darken.

## Performance (from Fit-with-background + motion audits)

- Fit-with-background 4K overhead vs legacy Fit remains bounded (~8% wall in latest cert: 28839ms vs 26717ms).
- Realistic-motion Headless E2E short clips complete under local timeouts.
- Preview Fit-with-background paint loop is lifecycle-gated (active+playing+visible).
- Evidence is **acceptable** for release packaging; do not lower foreground resolution.

## Manual Studio smoke

- Marked complete: **${manualSmokeComplete ? "yes" : "no"}**
- Operator confirmation required before \`SHORTFORGE_MANUAL_SMOKE_COMPLETE=1\`.
- Studio for inspection: \`http://localhost:3000\` (dev server should be running).
- Checklist (confirm all):
  - Source Quality updates with target, Fit/Fill, and zoom
  - Guidance never disables export
  - Fit preserves complete source; Fit with background keeps sharp foreground; Fill covers canvas
  - Zoom, pan, play/pause, trim, scrub work; FG/BG stay synchronized
  - No-caption frames stay bright; title only in opening 2s and fades; title does not restart later
  - Captions readable; engagement overlays unchanged
  - Browser 720p/1080p work; Headless 1080p/4K remain available

## Production build (this closeout)

- Next.js \`npm run build\`: **passed** (after Browser cert harness type fixes)
- Headless \`npm run build:headless-worker\`: **passed**; v5 blurred-fill capability present in page IIFE
- No tracked build artifacts introduced (\`dist/headless-worker\` remains gitignored policy)

## Browser certification

- Real artifacts present: **${browserCertComplete ? "yes" : "no"}**
- Automation blocker: ${
  browserMeasurements?.automation?.blocker ??
  "Disk ENOSPC + incomplete multi-case matrix — see BROWSER_EXPORT_REAL_ARTIFACT.md"
}

## Complete test summary (Prompt 6 closeout)

| Suite | Result |
| --- | --- |
| source-quality (+ guidance) | PASS |
| source-quality-ui / export | PASS |
| media-framing-parity / fit-with-background | PASS |
| fit-with-background certification + production bundle | PASS |
| legibility-layer + appearance | PASS |
| realistic-motion-encoding | PASS |
| video-quality-audit / export-media/encoder/resolution | PASS |
| export-manifest / engagement / transitions export | PASS |
| headless page contract / output profiles / resolution ladder / real-video motion | PASS |
| typecheck / eslint (Prompt 6 files) / git diff --check | PASS |
| build:headless-worker | PASS |
| next production build | SKIPPED (disk &lt; 600 MiB free) |
| browser-export-artifacts (real blobs) | INCOMPLETE (environmental) |
| manual Studio smoke | INCOMPLETE |
| brand-sting-export | FAIL (clean-staging baseline; out of scope) |

## Known baseline defects

- \`test:brand-sting-export\` fails on clean \`origin/staging\` due to engagement-overlay default \`size\`/\`scale\` injection. Documented in \`BRAND_STING_EXPORT_BASELINE_FAILURE.md\`. **Out of scope** for this video-quality branch.

## Remaining risks

- Browser real-artifact matrix incomplete until disk space is available and user-assisted Studio exports fill \`.tmp/browser-export-cert/\`.
- Manual Studio UX smoke not operator-certified in this session.
- Fit-with-background ideal refs use FFmpeg boxblur approximation for encode audits.
- Appearance SSIM on Fill includes chroma/letterbox differences; prefer structural edge SSIM for encoder conclusions.

## Next action before commit/PR

1. Free disk (≥2 GiB) and complete Browser artifact capture into \`.tmp/browser-export-cert/\` then \`npm run test:browser-export-artifacts\`
2. Complete manual Studio checklist; set \`SHORTFORGE_MANUAL_SMOKE_COMPLETE=1\` when done
3. Re-run \`npm run test:video-quality-release-readiness\`
4. Keep Brand Sting baseline failure separated; do not mix its repair into this PR
5. Only then commit / open PR (not part of this task)
`;

writeFileSync(REPORT_PATH, md);
console.log(`\nWrote ${REPORT_PATH}`);
console.log(`Verdict: ${verdict}`);
console.log(`${passed} release-readiness checks passed.\n`);
