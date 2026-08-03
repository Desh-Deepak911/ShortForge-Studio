/**
 * source-quality-intelligence-v1 capability plumbing verification.
 * Run: npm run test:source-quality
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isAllowedVisualRetentionStagingDevelopmentBranch,
  isSourceQualityIntelligenceCapabilityEnabled,
  resolveVisualRetentionGatesFromEnvironment,
  resolveVisualRetentionPhaseGates,
  SOURCE_QUALITY_INTELLIGENCE_CAPABILITY_ID,
  VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES,
} from "@/features/visual-retention";
import { parseVisualRetentionCapabilitiesResponse } from "@/features/visual-retention/client/parse-visual-retention-capabilities";
import { resolveSourceQualityIntelligenceEnabledFromEnvironment } from "@/features/visual-retention/server/resolve-source-quality-intelligence-enabled";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function stagingEnv(input: {
  readonly phases?: string;
  readonly branch?: string;
  readonly vercelEnv?: string;
}): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: input.vercelEnv ?? "preview",
    VERCEL_GIT_COMMIT_REF: input.branch ?? "staging",
    ...(input.phases
      ? { SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: input.phases }
      : {}),
  };
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log("\nSource quality capability\n");

  test("capability id and allowlisted staging branch", () => {
    assert.equal(
      SOURCE_QUALITY_INTELLIGENCE_CAPABILITY_ID,
      "source-quality-intelligence-v1",
    );
    assert.ok(
      VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES.includes(
        "staging-source-quality-intelligence",
      ),
    );
    assert.equal(
      isAllowedVisualRetentionStagingDevelopmentBranch(
        "staging-source-quality-intelligence",
      ),
      true,
    );
  });

  test("activation requires ordered phases 12A–12D on staging", () => {
    const enabled = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D",
        branch: "staging-source-quality-intelligence",
      }),
    );
    assert.equal(enabled.valid, true);
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(enabled), true);

    const missing12D = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C",
        branch: "staging-source-quality-intelligence",
      }),
    );
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(missing12D), false);

    const gap = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12D",
        branch: "staging-source-quality-intelligence",
      }),
    );
    assert.equal(gap.valid, false);
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(gap), false);
  });

  test("rejects main, production, missing branch, and unknown phases", () => {
    const main = resolveVisualRetentionPhaseGates({
      deploymentTarget: "staging",
      sourceBranch: "main",
      requestedPhases: "12A,12B,12C,12D",
    });
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(main), false);

    const production = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D",
        branch: "staging-source-quality-intelligence",
        vercelEnv: "production",
      }),
    );
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(production), false);

    const missingBranch = resolveVisualRetentionPhaseGates({
      deploymentTarget: "staging",
      requestedPhases: "12A,12B,12C,12D",
    });
    assert.equal(
      isSourceQualityIntelligenceCapabilityEnabled(missingBranch),
      false,
    );

    const unknown = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D,12Z",
        branch: "staging-source-quality-intelligence",
      }),
    );
    assert.equal(unknown.valid, false);
    assert.equal(isSourceQualityIntelligenceCapabilityEnabled(unknown), false);
  });

  test("creator snapshot + server helper + API shape", () => {
    const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D",
        branch: "staging-source-quality-intelligence",
      }),
    );
    assert.deepEqual(snapshot, {
      version: 1,
      mixedMediaScenesEnabled: true,
      visualBeatDensityEnabled: true,
      sourceQualityIntelligenceEnabled: true,
      phasesValid: true,
    });
    assert.equal(
      resolveSourceQualityIntelligenceEnabledFromEnvironment(
        stagingEnv({
          phases: "12A,12B,12C,12D",
          branch: "staging-source-quality-intelligence",
        }),
      ),
      true,
    );
    assert.equal(
      resolveSourceQualityIntelligenceEnabledFromEnvironment(
        stagingEnv({ phases: "12A,12B,12C" }),
      ),
      false,
    );

    const route = readSrc("src/app/api/visual-retention/capabilities/route.ts");
    assert.match(route, /sourceQualityIntelligenceEnabled/);
    assert.match(route, /version:\s*snapshot\.version|version:\s*1/);
    assert.doesNotMatch(route, /version:\s*2/);
  });

  test("parser fail-closed + single shared capability fetch", () => {
    assert.deepEqual(parseVisualRetentionCapabilitiesResponse(null), {
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
      sourceQualityIntelligenceEnabled: false,
    });
    assert.deepEqual(
      parseVisualRetentionCapabilitiesResponse({
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: "true",
      }),
      {
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: false,
      },
    );
    assert.deepEqual(
      parseVisualRetentionCapabilitiesResponse({
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
      }),
      {
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
      },
    );

    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.match(provider, /sourceQualityIntelligenceEnabled/);
    assert.match(provider, /useSourceQualityIntelligenceEnabled/);
    assert.equal(
      (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ?? [])
        .length,
      1,
    );
  });

  test("API version stays 1; only new allowlist entry is this branch", () => {
    const route = readSrc("src/app/api/visual-retention/capabilities/route.ts");
    assert.match(route, /version:\s*snapshot\.version/);
    assert.doesNotMatch(route, /version:\s*2/);
    const gates = readSrc(
      "src/features/visual-retention/domain/visual-retention-phase-gates.ts",
    );
    const branchMatches =
      gates.match(/"[^"]*staging[^"]*"|'[^']*staging[^']*'/g) ?? [];
    assert.ok(
      branchMatches.some((entry) =>
        entry.includes("staging-source-quality-intelligence"),
      ),
    );
    // Prior allowlist entries remain; this branch is the only Source-quality addition.
    assert.match(gates, /sprint12-staging-compat-safety-foundation/);
    assert.match(gates, /sprint12c-staging-visual-beat-density/);
    assert.equal(
      (gates.match(/staging-source-quality-intelligence/g) ?? []).length,
      1,
    );
  });

  test("responsibility-based filenames without sprint markers", () => {
    const files = [
      "src/features/source-quality/domain/source-quality-assessment.ts",
      "src/features/source-quality/domain/source-quality-thresholds.ts",
      "src/features/source-quality/domain/source-quality-effective-geometry.ts",
      "src/features/source-quality/domain/assess-source-quality.ts",
      "src/features/source-quality/adapters/resolve-source-quality-media.ts",
      "src/features/source-quality/editor/SourceQualitySummary.tsx",
      "src/features/source-quality/index.ts",
      "src/features/visual-retention/domain/source-quality-intelligence-capability.ts",
      "src/features/visual-retention/server/resolve-source-quality-intelligence-enabled.ts",
      "src/verification/source-quality/sourceQualityAssessment.verify.ts",
      "src/verification/source-quality/sourceQualityInspectorUi.verify.tsx",
      "src/verification/source-quality/sourceQualityCapability.verify.ts",
    ];
    for (const file of files) {
      assert.doesNotMatch(file, /sprint|12[Dd]|slice|checkpoint|hardening|final/i);
      assert.ok(readSrc(file).length > 0);
    }
  });

  console.log(`\nSource quality capability: ${passed} PASS\n`);
}

main();
