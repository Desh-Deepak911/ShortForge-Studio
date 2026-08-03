/**
 * Visual-beat-density capability plumbing verification.
 * Run: npm run test:visual-beat-density
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isMixedMediaScenesCapabilityEnabled,
} from "@/features/mixed-media-scenes/domain/mixed-media-scenes-capability";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";
import {
  evaluateVisualRetentionUiCoverage,
  isAllowedVisualRetentionStagingDevelopmentBranch,
  isVisualBeatDensityCapabilityEnabled,
  resolveVisualRetentionGatesFromEnvironment,
  resolveVisualRetentionPhaseGates,
  VISUAL_BEAT_DENSITY_CAPABILITY_ID,
  VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES,
} from "@/features/visual-retention";
import { parseVisualRetentionCapabilitiesResponse } from "@/features/visual-retention/client/parse-visual-retention-capabilities";
import { resolveVisualBeatDensityEnabledFromEnvironment } from "@/features/visual-retention/server/resolve-visual-beat-density-enabled";
import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function stagingEnv(input: {
  readonly phases?: string;
  readonly branch?: string;
  readonly vercelEnv?: string;
  readonly headlessEnv?: string;
}): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: input.headlessEnv ?? "staging",
    VERCEL_ENV: input.vercelEnv ?? "preview",
    VERCEL_GIT_COMMIT_REF: input.branch ?? "staging",
    ...(input.phases
      ? { SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: input.phases }
      : {}),
  };
}

function testPhaseAndBranchGates(): void {
  assert.equal(VISUAL_BEAT_DENSITY_CAPABILITY_ID, "visual-beat-density-v1");
  assert.ok(
    VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES.includes(
      "sprint12c-staging-visual-beat-density",
    ),
  );
  assert.equal(
    isAllowedVisualRetentionStagingDevelopmentBranch(
      "sprint12c-staging-visual-beat-density",
    ),
    true,
  );
  assert.equal(
    isAllowedVisualRetentionStagingDevelopmentBranch(
      "sprint12-staging-compat-safety-foundation",
    ),
    true,
  );
  assert.equal(
    isAllowedVisualRetentionStagingDevelopmentBranch("feature/random"),
    false,
  );
  assert.equal(isAllowedVisualRetentionStagingDevelopmentBranch(null), false);

  const both = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C",
      branch: "sprint12c-staging-visual-beat-density",
    }),
  );
  assert.equal(both.valid, true);
  assert.equal(isMixedMediaScenesCapabilityEnabled(both), true);
  assert.equal(isVisualBeatDensityCapabilityEnabled(both), true);

  const twelveBOnly = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({ phases: "12A,12B", branch: "staging" }),
  );
  assert.equal(twelveBOnly.valid, true);
  assert.equal(isMixedMediaScenesCapabilityEnabled(twelveBOnly), true);
  assert.equal(isVisualBeatDensityCapabilityEnabled(twelveBOnly), false);

  const gap = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({ phases: "12A,12C", branch: "staging" }),
  );
  assert.equal(gap.valid, false);
  assert.equal(isMixedMediaScenesCapabilityEnabled(gap), false);
  assert.equal(isVisualBeatDensityCapabilityEnabled(gap), false);

  const production = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C",
      branch: "staging",
      vercelEnv: "production",
    }),
  );
  assert.equal(isMixedMediaScenesCapabilityEnabled(production), false);
  assert.equal(isVisualBeatDensityCapabilityEnabled(production), false);

  const main = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "main",
    requestedPhases: "12A,12B,12C",
  });
  assert.equal(isMixedMediaScenesCapabilityEnabled(main), false);
  assert.equal(isVisualBeatDensityCapabilityEnabled(main), false);

  const arbitrary = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C",
      branch: "feature/unrelated-experiment",
    }),
  );
  assert.equal(arbitrary.valid, false);
  assert.equal(
    arbitrary.phases["12A"].reason,
    "staging_development_branch_rejected",
  );
  assert.equal(isVisualBeatDensityCapabilityEnabled(arbitrary), false);

  const missing = resolveVisualRetentionGatesFromEnvironment({});
  assert.equal(isMixedMediaScenesCapabilityEnabled(missing), false);
  assert.equal(isVisualBeatDensityCapabilityEnabled(missing), false);

  const malformed = resolveVisualRetentionGatesFromEnvironment(
    stagingEnv({ phases: "12A,12Z", branch: "staging" }),
  );
  assert.equal(malformed.valid, false);
  assert.equal(isVisualBeatDensityCapabilityEnabled(malformed), false);
}

function testServerResolversAndApiShape(): void {
  const enabled = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({
      phases: "12A,12B,12C",
      branch: "sprint12c-staging-visual-beat-density",
    }),
  );
  assert.deepEqual(enabled, {
    version: 1,
    mixedMediaScenesEnabled: true,
    visualBeatDensityEnabled: true,
    sourceQualityIntelligenceEnabled: false,
    phasesValid: true,
  });

  const twelveB = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    stagingEnv({ phases: "12A,12B" }),
  );
  assert.equal(twelveB.mixedMediaScenesEnabled, true);
  assert.equal(twelveB.visualBeatDensityEnabled, false);
  assert.equal(twelveB.sourceQualityIntelligenceEnabled, false);

  assert.equal(
    resolveVisualBeatDensityEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    ),
    true,
  );
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment(
      stagingEnv({ phases: "12A,12B,12C" }),
    ),
    true,
  );

  const route = readSrc("src/app/api/visual-retention/capabilities/route.ts");
  assert.match(route, /visualBeatDensityEnabled/);
  assert.match(route, /mixedMediaScenesEnabled/);
  assert.match(
    route,
    /resolveVisualRetentionCreatorCapabilitiesFromEnvironment/,
  );
  assert.doesNotMatch(route, /SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES/);
  assert.doesNotMatch(route, /VERCEL_GIT_COMMIT_REF/);
  assert.doesNotMatch(route, /process\.env\.[A-Z0-9_]+/);
}

function testClientFailClosedAndSingleFetch(): void {
  assert.deepEqual(parseVisualRetentionCapabilitiesResponse(null), {
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    sourceQualityIntelligenceEnabled: false,
  });
  assert.deepEqual(parseVisualRetentionCapabilitiesResponse(undefined), {
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    sourceQualityIntelligenceEnabled: false,
  });
  assert.deepEqual(parseVisualRetentionCapabilitiesResponse("nope"), {
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    sourceQualityIntelligenceEnabled: false,
  });
  assert.deepEqual(
    parseVisualRetentionCapabilitiesResponse({
      mixedMediaScenesEnabled: "true",
      visualBeatDensityEnabled: 1,
      sourceQualityIntelligenceEnabled: "yes",
    }),
    {
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
      sourceQualityIntelligenceEnabled: false,
    },
  );
  assert.deepEqual(
    parseVisualRetentionCapabilitiesResponse({
      mixedMediaScenesEnabled: true,
      visualBeatDensityEnabled: true,
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
  assert.match(provider, /VISUAL_RETENTION_CAPABILITIES_DISABLED/);
  assert.match(provider, /parseVisualRetentionCapabilitiesResponse/);
  assert.match(provider, /fetch\("\/api\/visual-retention\/capabilities"/);
  // One fetch site in the shared provider — not per-capability fetches.
  assert.equal(
    (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ?? [])
      .length,
    1,
  );

  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /VisualRetentionCapabilitiesProvider/);
  assert.equal(
    (workspace.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ?? [])
      .length,
    0,
  );

  const compat = readSrc(
    "src/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext.tsx",
  );
  assert.match(compat, /useMixedMediaScenesEnabled/);
  assert.match(compat, /MixedMediaScenesCapabilityProvider/);
  assert.doesNotMatch(compat, /fetch\(/);

  // Mixed-media consumers still import the compatibility hook path.
  // ExportPanel also reads Visual pacing authoring capability for guidance only.
  assert.match(
    readSrc("src/components/ExportPanel.tsx"),
    /useMixedMediaScenesEnabled/,
  );
  assert.match(
    readSrc("src/components/ExportPanel.tsx"),
    /useVisualBeatDensityEnabled/,
  );
  assert.match(
    readSrc("src/features/preview/components/VideoPreview.tsx"),
    /useMixedMediaScenesEnabled/,
  );
}

function testUiContractAndNoRenderScopeLeak(): void {
  const coverage = evaluateVisualRetentionUiCoverage({
    capability: "visual-beat-density-v1",
    implementedSurfaces: [
      "editor",
      "scene-inspector",
      "preview",
      "browser-export",
      "headless-export",
      "warnings-and-errors",
    ],
  });
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.missingSurfaces, []);

  const incomplete = evaluateVisualRetentionUiCoverage({
    capability: "visual-beat-density-v1",
    implementedSurfaces: ["editor", "preview"],
  });
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.missingSurfaces.includes("scene-inspector"));

  // Optional scene plan metadata is allowed via leaf type import only.
  // Scene-inspector pacing UI lives in VisualPacingPanel; ExportManifest must not consume plans.
  const storyTypes = readSrc("src/features/story/types/story.types.ts");
  assert.match(storyTypes, /visualBeatPlan\?: VisualBeatPlanV1/);
  assert.match(
    storyTypes,
    /from\s+["']@\/features\/visual-beat-density\/domain\/visual-beat-plan["']/,
  );
  assert.doesNotMatch(
    storyTypes,
    /from\s+["']@\/features\/visual-beat-density["']/,
  );
  assert.doesNotMatch(
    readSrc("src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx"),
    /visualBeatDensity|Suggest pacing|Visual pacing/,
  );
  assert.match(
    readSrc("src/features/editor/components/StudioSceneInspector.tsx"),
    /VisualPacingPanel/,
  );
  assert.doesNotMatch(
    readSrc("src/features/export/domain/export-manifest.types.ts"),
    /visualBeatPlan|visualBeatDensity|visual-beat-density/,
  );
  assert.doesNotMatch(
    readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md"),
    /narration-visual-beats-v1/,
  );
  assert.match(
    readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md"),
    /visual-beat-density-v1/,
  );
  assert.match(
    readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md"),
    /music never/i,
  );
  assert.match(
    readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md"),
    /Browser export remains available/,
  );

  // Dev QA route guard remains development-only.
  assert.match(
    readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx"),
    /assertLocalDevQaHarnessAllowed/,
  );
}

const tests: Array<[string, () => void]> = [
  ["phase/branch gates + capability resolution", testPhaseAndBranchGates],
  ["server resolvers + API response shape", testServerResolversAndApiShape],
  ["client fail-closed + single capability fetch", testClientFailClosedAndSingleFetch],
  ["UI contract + no beat/render scope leak", testUiContractAndNoRenderScopeLeak],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
console.log(
  `\nVisual-beat-density capability: ${passed}/${tests.length} PASS`,
);
