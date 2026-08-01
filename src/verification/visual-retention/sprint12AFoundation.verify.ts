import assert from "node:assert/strict";

import {
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  EXPORT_RENDERER_CONTRACT_V3,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "@/features/export/domain/export-manifest.types";
import {
  VISUAL_RETENTION_UI_SURFACES,
  addedBrandStingDurationMs,
  buildEnabledVisualRetentionCapabilities,
  createVisualRetentionCapabilityEnvelope,
  evaluateVisualRetentionUiCoverage,
  negotiateVisualRetentionCapabilities,
  resolveVisualRetentionGatesFromEnvironment,
  resolveVisualRetentionPhaseGates,
  resolveVisualRetentionRendererChoice,
  validateVisualRetentionProjectExtensions,
} from "@/features/visual-retention";

function testStagingOnlyPhaseGates(): void {
  const off = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
  });
  assert.equal(off.valid, true);
  assert.equal(off.phases["12A"].enabled, false);

  const active = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
    requestedPhases: "12A,12B,12C",
  });
  assert.equal(active.valid, true);
  assert.equal(active.phases["12A"].enabled, true);
  assert.equal(active.phases["12B"].enabled, true);
  assert.equal(active.phases["12C"].enabled, true);
  assert.equal(active.phases["12D"].enabled, false);

  const main = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "refs/heads/main",
    requestedPhases: "12A,12B,12C,12D,12E,12F,12G",
  });
  assert.equal(main.valid, false);
  assert.ok(Object.values(main.phases).every((phase) => !phase.enabled));
  assert.equal(main.phases["12A"].reason, "main_branch_rejected");

  const production = resolveVisualRetentionPhaseGates({
    deploymentTarget: "production",
    sourceBranch: "staging",
    requestedPhases: "12A",
  });
  assert.equal(production.valid, false);
  assert.equal(
    production.phases["12A"].reason,
    "production_deployment_rejected",
  );

  const dependencyGap = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
    requestedPhases: "12A,12C",
  });
  assert.equal(dependencyGap.valid, false);
  assert.equal(dependencyGap.phases["12A"].enabled, true);
  assert.equal(dependencyGap.phases["12C"].enabled, false);
  assert.equal(dependencyGap.phases["12C"].reason, "dependency_not_enabled");

  const invalid = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    requestedPhases: "12A,12Z",
  });
  assert.equal(invalid.valid, false);
  assert.ok(Object.values(invalid.phases).every((phase) => !phase.enabled));
}

function testEnvironmentClassification(): void {
  const staging = resolveVisualRetentionGatesFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A",
  });
  assert.equal(staging.deploymentTarget, "staging");
  assert.equal(staging.phases["12A"].enabled, true);

  const copiedToProduction = resolveVisualRetentionGatesFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
  });
  assert.equal(copiedToProduction.deploymentTarget, "production");
  assert.ok(
    Object.values(copiedToProduction.phases).every((phase) => !phase.enabled),
  );
}

function testCapabilityNegotiation(): void {
  const gates = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
    requestedPhases: "12A,12B,12C,12D,12E",
  });
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  assert.ok(enabled.includes("narration-timing-v1"));
  assert.ok(enabled.includes("mixed-media-scenes-v1"));
  assert.ok(enabled.includes("engagement-overlays-v1"));
  assert.ok(enabled.includes("shortforge-brand-sting-v1"));
  assert.ok(!enabled.includes("visual-retention-presets-v1"));

  const browserEnvelope = createVisualRetentionCapabilityEnvelope({
    renderer: "browser",
    capabilities: enabled,
  });
  const headlessEnvelope = createVisualRetentionCapabilityEnvelope({
    renderer: "headless",
    capabilities: ["narration-timing-v1"],
  });
  assert.deepEqual(browserEnvelope.resolutions, ["720p", "1080p"]);
  assert.deepEqual(headlessEnvelope.resolutions, ["720p", "1080p", "4k"]);

  const browser = negotiateVisualRetentionCapabilities({
    renderer: browserEnvelope,
    requestedResolution: "1080p",
    requirements: [
      { capability: "narration-timing-v1", level: "required" },
      { capability: "engagement-overlays-v1", level: "required" },
      { capability: "visual-retention-presets-v1", level: "optional" },
    ],
  });
  assert.equal(browser.supported, true);
  assert.equal(browser.warnings.length, 1);
  assert.equal(browser.terminalFailure, null);

  const headless = negotiateVisualRetentionCapabilities({
    renderer: headlessEnvelope,
    requestedResolution: "1080p",
    requirements: [
      { capability: "narration-timing-v1", level: "required" },
      { capability: "engagement-overlays-v1", level: "required" },
    ],
  });
  assert.equal(headless.supported, false);
  assert.equal(headless.terminalFailure?.reasonId, "UNSUPPORTED_CAPABILITY");
  assert.equal(headless.terminalFailure?.stage, "pre_dispatch");
  assert.equal(headless.terminalFailure?.retryable, false);

  const browser4k = negotiateVisualRetentionCapabilities({
    renderer: browserEnvelope,
    requestedResolution: "4k",
    requirements: [{ capability: "narration-timing-v1", level: "required" }],
  });
  assert.equal(browser4k.supported, false);
  assert.equal(browser4k.terminalFailure?.unsupportedResolution, "4k");

  const choice = resolveVisualRetentionRendererChoice({
    browser,
    headless,
    headlessPreferred: true,
  });
  assert.equal(choice.browserSelectable, true);
  assert.equal(choice.headlessSelectable, false);
  assert.equal(choice.recommended, "browser");
}

function testUiCompletenessGate(): void {
  const incomplete = evaluateVisualRetentionUiCoverage({
    capability: "engagement-overlays-v1",
    implementedSurfaces: VISUAL_RETENTION_UI_SURFACES.filter(
      (surface) => surface !== "scene-inspector",
    ),
  });
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missingSurfaces, ["scene-inspector"]);

  const brandSting = evaluateVisualRetentionUiCoverage({
    capability: "shortforge-brand-sting-v1",
    implementedSurfaces: VISUAL_RETENTION_UI_SURFACES.filter(
      (surface) => surface !== "scene-inspector",
    ),
  });
  assert.equal(brandSting.complete, true);
}

function testOptionalExtensionContracts(): void {
  assert.equal(validateVisualRetentionProjectExtensions(undefined).ok, true);
  assert.equal(addedBrandStingDurationMs(undefined), 0);

  const extensions = {
    version: 1 as const,
    engagementOverlaysBySceneId: {
      scene_1: [
        {
          version: 1 as const,
          id: "cta_1",
          kind: "combined" as const,
          startOffsetMs: 1250,
          durationMs: 1800,
          position: "bottom-center" as const,
          presetId: "retention-pop-v1",
        },
      ],
    },
    shortForgeBrandSting: {
      version: 1 as const,
      enabled: true,
      title: "ShortForge Studio" as const,
      durationMs: 2500 as const,
      presetId: "forge-reveal-v1",
      narrationPolicy: "none" as const,
      captionPolicy: "none" as const,
      playbackSpeedPolicy: "fixed" as const,
    },
  };
  assert.equal(validateVisualRetentionProjectExtensions(extensions).ok, true);
  assert.equal(addedBrandStingDurationMs(extensions), 2500);

  const invalidSting = {
    ...extensions,
    shortForgeBrandSting: {
      ...extensions.shortForgeBrandSting,
      title: "Another Product",
      narrationPolicy: "voice",
    },
  };
  assert.equal(validateVisualRetentionProjectExtensions(invalidSting).ok, false);
}

function testFrozenManifestContractsRemainUnchanged(): void {
  assert.equal(EXPORT_MANIFEST_V2_VERSION, 2);
  assert.equal(EXPORT_RENDERER_CONTRACT_V2, "8D");
  assert.equal(EXPORT_MANIFEST_V3_VERSION, 3);
  assert.equal(EXPORT_RENDERER_CONTRACT_V3, "9C");
  assert.equal(EXPORT_MANIFEST_VERSION, 4);
  assert.equal(EXPORT_RENDERER_CONTRACT_VERSION, "9D");
}

testStagingOnlyPhaseGates();
testEnvironmentClassification();
testCapabilityNegotiation();
testUiCompletenessGate();
testOptionalExtensionContracts();
testFrozenManifestContractsRemainUnchanged();

console.log("Sprint 12A visual-retention foundation verification passed.");
