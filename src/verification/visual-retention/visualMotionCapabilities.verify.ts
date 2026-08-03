/**
 * Visual-motion creator-capability foundation verification.
 * Covers keyframed effects, engagement overlays, brand sting, and
 * subject-aware reframing enablement — fail-closed, single fetch, no UI yet.
 *
 * Run via: npm run test:visual-motion-capabilities
 *
 * Keyframes must not become render-authoritative until a versioned
 * ExportManifest and all Preview/Browser/Headless consumers support them.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildEnabledVisualRetentionCapabilities,
  ENGAGEMENT_OVERLAYS_CAPABILITY_ID,
  evaluateVisualRetentionUiCoverage,
  isAllowedVisualRetentionStagingDevelopmentBranch,
  isEngagementOverlaysCapabilityEnabled,
  isKeyframedVisualEffectsCapabilityEnabled,
  isShortForgeBrandStingCapabilityEnabled,
  isSubjectAwareReframingCapabilityEnabled,
  KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID,
  resolveVisualRetentionGatesFromEnvironment,
  resolveVisualRetentionPhaseGates,
  SHORTFORGE_BRAND_STING_CAPABILITY_ID,
  SUBJECT_AWARE_REFRAMING_CAPABILITY_ID,
  VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES,
  VISUAL_RETENTION_UI_SURFACES,
} from "@/features/visual-retention";
import { parseVisualRetentionCapabilitiesResponse } from "@/features/visual-retention/client/parse-visual-retention-capabilities";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MOTION_OFF = {
  keyframedVisualEffectsEnabled: false,
  engagementOverlaysEnabled: false,
  shortForgeBrandStingEnabled: false,
  subjectAwareReframingEnabled: false,
} as const;

function stagingEnv(input: {
  readonly phases?: string;
  readonly branch?: string;
  readonly vercelEnv?: string;
  readonly headlessEnvName?: string;
}): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: input.headlessEnvName ?? "staging",
    VERCEL_ENV: input.vercelEnv ?? "preview",
    VERCEL_GIT_COMMIT_REF: input.branch ?? "staging",
    ...(input.phases
      ? { SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: input.phases }
      : {}),
  };
}

function assertAllMotion(
  gates: ReturnType<typeof resolveVisualRetentionGatesFromEnvironment>,
  expected: boolean,
): void {
  assert.equal(isKeyframedVisualEffectsCapabilityEnabled(gates), expected);
  assert.equal(isEngagementOverlaysCapabilityEnabled(gates), expected);
  assert.equal(isShortForgeBrandStingCapabilityEnabled(gates), expected);
  assert.equal(isSubjectAwareReframingCapabilityEnabled(gates), expected);
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log("\nvisual-motion-capabilities\n");

  test("capability ids and allowlisted development branch", () => {
    assert.equal(
      KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID,
      "keyframed-visual-effects-v1",
    );
    assert.equal(ENGAGEMENT_OVERLAYS_CAPABILITY_ID, "engagement-overlays-v1");
    assert.equal(
      SHORTFORGE_BRAND_STING_CAPABILITY_ID,
      "shortforge-brand-sting-v1",
    );
    assert.equal(
      SUBJECT_AWARE_REFRAMING_CAPABILITY_ID,
      "subject-aware-reframing-v1",
    );
    assert.ok(
      VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES.includes(
        "staging-keyframed-motion-overlays",
      ),
    );
    assert.equal(
      isAllowedVisualRetentionStagingDevelopmentBranch(
        "staging-keyframed-motion-overlays",
      ),
      true,
    );
    assert.equal(
      (readSrc(
        "src/features/visual-retention/domain/visual-retention-phase-gates.ts",
      ).match(/staging-keyframed-motion-overlays/g) ?? []).length,
      1,
    );
  });

  test("staging + ordered 12A–12E enables all four motion capabilities", () => {
    const gates = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D,12E",
        branch: "staging",
      }),
    );
    assert.equal(gates.valid, true);
    assertAllMotion(gates, true);
    const enabled = buildEnabledVisualRetentionCapabilities(gates);
    assert.ok(enabled.includes(KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID));
    assert.ok(enabled.includes(ENGAGEMENT_OVERLAYS_CAPABILITY_ID));
    assert.ok(enabled.includes(SHORTFORGE_BRAND_STING_CAPABILITY_ID));
    assert.ok(enabled.includes(SUBJECT_AWARE_REFRAMING_CAPABILITY_ID));

    const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D,12E", branch: "staging" }),
    );
    assert.deepEqual(snapshot, {
      version: 1,
      mixedMediaScenesEnabled: true,
      visualBeatDensityEnabled: true,
      sourceQualityIntelligenceEnabled: true,
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
      subjectAwareReframingEnabled: true,
      phasesValid: true,
    });
  });

  test("staging with only 12A–12D keeps motion false and 12B–12D true", () => {
    const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C,12D", branch: "staging" }),
    );
    assert.deepEqual(snapshot, {
      version: 1,
      mixedMediaScenesEnabled: true,
      visualBeatDensityEnabled: true,
      sourceQualityIntelligenceEnabled: true,
      ...MOTION_OFF,
      phasesValid: true,
    });
    assertAllMotion(
      resolveVisualRetentionGatesFromEnvironment(
        stagingEnv({ phases: "12A,12B,12C,12D", branch: "staging" }),
      ),
      false,
    );
  });

  test("development feature branch + valid phases enables all four", () => {
    const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D,12E",
        branch: "staging-keyframed-motion-overlays",
      }),
    );
    assert.equal(snapshot.keyframedVisualEffectsEnabled, true);
    assert.equal(snapshot.engagementOverlaysEnabled, true);
    assert.equal(snapshot.shortForgeBrandStingEnabled, true);
    assert.equal(snapshot.subjectAwareReframingEnabled, true);
    assert.equal(snapshot.phasesValid, true);
  });

  test("missing branch, main/master, and Vercel Production fail closed", () => {
    const missingBranch = resolveVisualRetentionPhaseGates({
      deploymentTarget: "staging",
      requestedPhases: "12A,12B,12C,12D,12E",
    });
    assertAllMotion(missingBranch, false);

    for (const branch of ["main", "master", "refs/heads/main"] as const) {
      const gates = resolveVisualRetentionPhaseGates({
        deploymentTarget: "staging",
        sourceBranch: branch,
        requestedPhases: "12A,12B,12C,12D,12E",
      });
      assertAllMotion(gates, false);
    }

    const production = resolveVisualRetentionGatesFromEnvironment(
      stagingEnv({
        phases: "12A,12B,12C,12D,12E",
        branch: "staging-keyframed-motion-overlays",
        vercelEnv: "production",
      }),
    );
    assertAllMotion(production, false);
  });

  test("malformed, unknown, and out-of-order phases fail closed", () => {
    for (const phases of [
      "12A,12B,12C,12D,12Z",
      "12A,12B,12C,12E",
      "12E",
      "12A,12B,12C,12D,12E,not-a-phase",
    ] as const) {
      const gates = resolveVisualRetentionGatesFromEnvironment(
        stagingEnv({
          phases,
          branch: "staging-keyframed-motion-overlays",
        }),
      );
      assert.equal(gates.valid, false);
      assertAllMotion(gates, false);
    }
  });

  test("parser fail-closed for missing/malformed motion fields", () => {
    assert.deepEqual(parseVisualRetentionCapabilitiesResponse(null), {
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
      sourceQualityIntelligenceEnabled: false,
      ...MOTION_OFF,
    });
    assert.deepEqual(
      parseVisualRetentionCapabilitiesResponse({
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        keyframedVisualEffectsEnabled: "true",
        engagementOverlaysEnabled: 1,
        shortForgeBrandStingEnabled: "yes",
        subjectAwareReframingEnabled: "true",
      }),
      {
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        ...MOTION_OFF,
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
        ...MOTION_OFF,
      },
    );
    assert.deepEqual(
      parseVisualRetentionCapabilitiesResponse({
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        subjectAwareReframingEnabled: true,
      }),
      {
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        subjectAwareReframingEnabled: true,
      },
    );
  });

  test("single shared capability fetch and hooks; API version stays 1", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.equal(
      (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ??
        []).length,
      1,
    );
    assert.match(provider, /useKeyframedVisualEffectsEnabled/);
    assert.match(provider, /useEngagementOverlaysEnabled/);
    assert.match(provider, /useShortForgeBrandStingEnabled/);
    assert.match(provider, /useSubjectAwareReframingEnabled/);
    assert.doesNotMatch(
      provider,
      /fetch\(\s*["']\/api\/(?!visual-retention\/capabilities)/,
    );

    const route = readSrc("src/app/api/visual-retention/capabilities/route.ts");
    assert.match(route, /version:\s*snapshot\.version/);
    assert.doesNotMatch(route, /version:\s*2/);
    assert.match(route, /keyframedVisualEffectsEnabled/);
    assert.match(route, /engagementOverlaysEnabled/);
    assert.match(route, /shortForgeBrandStingEnabled/);
    assert.match(route, /subjectAwareReframingEnabled/);
  });

  test("UI-surface coverage registered; no motion/CTA/outro controls rendered yet", () => {
    for (const capability of [
      KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID,
      ENGAGEMENT_OVERLAYS_CAPABILITY_ID,
      SHORTFORGE_BRAND_STING_CAPABILITY_ID,
      SUBJECT_AWARE_REFRAMING_CAPABILITY_ID,
    ] as const) {
      const coverage = evaluateVisualRetentionUiCoverage({
        capability,
        implementedSurfaces: VISUAL_RETENTION_UI_SURFACES,
      });
      assert.equal(
        coverage.complete,
        true,
        `${capability} must declare an intended surface set`,
      );
    }

    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.doesNotMatch(inspector, /useKeyframedVisualEffectsEnabled/);
    assert.doesNotMatch(inspector, /useEngagementOverlaysEnabled/);
    assert.doesNotMatch(inspector, /useSubjectAwareReframingEnabled/);
    assert.doesNotMatch(inspector, /EngagementOverlayControls/);

    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.doesNotMatch(exportPanel, /useShortForgeBrandStingEnabled/);
    assert.doesNotMatch(exportPanel, /BrandStingExportControls/);
  });

  test("keyframes are render-authoritative only through versioned ExportManifest v5", () => {
    const capability = readSrc(
      "src/features/visual-retention/domain/keyframed-visual-effects-capability.ts",
    );
    assert.match(capability, /render-authoritative/);
    assert.match(capability, /ExportManifest/);
    assert.match(capability, /Preview/);
    assert.match(capability, /Browser/);
    assert.match(capability, /Headless/);

    const manifest = readSrc(
      "src/features/export/domain/export-manifest.types.ts",
    );
    assert.match(manifest, /EXPORT_MANIFEST_VERSION = 4/);
    assert.match(manifest, /EXPORT_MANIFEST_V5_VERSION = 5/);
    assert.match(manifest, /EXPORT_RENDERER_CONTRACT_V5 = "9E"/);
    assert.match(manifest, /keyframed-visual-effects-v1/);
    assert.match(manifest, /keyframes\?:/);
    assert.doesNotMatch(manifest, /subjectAware/);
    assert.doesNotMatch(manifest, /engagementOverlay/);
  });

  test("subject-aware reframing is independent of source-quality alone", () => {
    const withSourceQualityOnly =
      resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
        stagingEnv({
          phases: "12A,12B,12C,12D",
          branch: "staging-keyframed-motion-overlays",
        }),
      );
    assert.equal(withSourceQualityOnly.sourceQualityIntelligenceEnabled, true);
    assert.equal(withSourceQualityOnly.subjectAwareReframingEnabled, false);

    const subjectModule = readSrc(
      "src/features/visual-retention/domain/subject-aware-reframing-capability.ts",
    );
    assert.match(subjectModule, /must not be inferred from source-quality/i);
  });

  test("responsibility-based filenames without sprint markers", () => {
    const files = [
      "src/features/visual-retention/domain/keyframed-visual-effects-capability.ts",
      "src/features/visual-retention/domain/engagement-overlays-capability.ts",
      "src/features/visual-retention/domain/shortforge-brand-sting-capability.ts",
      "src/features/visual-retention/domain/subject-aware-reframing-capability.ts",
      "src/verification/visual-retention/visualMotionCapabilities.verify.ts",
    ];
    for (const file of files) {
      assert.doesNotMatch(
        file,
        /sprint|12[Ee]|slice|checkpoint|hardening|followup|final/i,
      );
      assert.ok(readSrc(file).length > 0);
    }
    const pkg = readSrc("package.json");
    assert.match(pkg, /test:visual-motion-capabilities/);
    assert.doesNotMatch(pkg, /test:.*12[Ee]/);
  });

  test("future staging activation value is documented and env unchanged in this slice", () => {
    const foundation = readSrc(
      "docs/architecture/VISUAL_RETENTION_CAPABILITY_FOUNDATION.md",
    );
    assert.match(
      foundation,
      /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES=12A,12B,12C,12D,12E/,
    );
    assert.match(foundation, /keyframed-visual-effects-v1/);
    assert.match(foundation, /subject-aware-reframing-v1/);
    const envDocs = readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md");
    assert.match(envDocs, /staging-keyframed-motion-overlays/);
    assert.match(
      envDocs,
      /12A,12B,12C,12D,12E/,
    );
  });

  console.log(`\nvisual-motion-capabilities: ${passed} PASS\n`);
}

main();
