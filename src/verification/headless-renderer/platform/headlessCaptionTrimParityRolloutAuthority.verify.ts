/**
 * Caption/trim parity rollout authority — provider-free.
 * Run: npm run test:headless-caption-trim-parity-rollout-authority
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyHeadlessHostedWorkerEnvironment } from "@/features/headless-renderer/worker/hosted/hosted-environment";
import {
  HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
  HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
  HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
  isAcceptedHeadlessWorkerRendererBuildId,
  isAcceptedHostedRendererBuildId,
} from "@/features/headless-renderer/worker/runtime/renderer-build-id";
import { STAGING_HEADLESS_RENDERER_BUILD_ID } from "@/features/headless-renderer/control-plane/runtime/staging-renderer-build-authority";
import {
  HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_PHASES,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID,
  classifyHeadlessFlyStagingCaptionTrimAttemptBudget,
  classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition,
  classifyHeadlessFlyStagingCaptionTrimForwardDigest,
  classifyHeadlessFlyStagingCaptionTrimPageBundle,
  classifyHeadlessFlyStagingCaptionTrimRollbackDigest,
  classifyHeadlessFlyStagingCaptionTrimRolloutGate,
  classifyHeadlessFlyStagingCaptionTrimTopology,
  isHeadlessFlyStagingCaptionTrimCandidateSealed,
  isHeadlessFlyStagingCaptionTrimPlaceholderDigest,
  materializeHeadlessFlyStagingCaptionTrimToml,
  redactHeadlessFlyStagingCaptionTrimSecrets,
  validateHeadlessFlyStagingCaptionTrimParityPairs,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-caption-trim-parity-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function hostedEnv(buildId: string): Record<string, string> {
  return {
    HEADLESS_WORKER_MODE: "render",
    HEADLESS_ENV_NAME: "staging",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIABBBBBBBBBBBBBBBB",
    R2_SECRET_ACCESS_KEY: "secretvaluecccccccccccccccccccc",
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: buildId,
    HEADLESS_WORKER_CONCURRENCY: "1",
  };
}

function main() {
  console.log("\nCaption/trim parity rollout authority\n");

  test("web default identity remains 24e", () => {
    assert.equal(STAGING_HEADLESS_RENDERER_BUILD_ID, HEADLESS_PHASE3_RENDERER_BUILD_ID);
    assert.notEqual(
      STAGING_HEADLESS_RENDERER_BUILD_ID,
      HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
    );
  });

  test("historical hosted IDs remain accepted", () => {
    for (const id of [
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
      HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    ]) {
      const classified = classifyHeadlessHostedWorkerEnvironment(hostedEnv(id));
      assert.equal(classified.status, "configured", id);
    }
    const bridge = classifyHeadlessHostedWorkerEnvironment({
      ...hostedEnv(HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID),
      HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE: "rollback_bridge_007_008",
    });
    assert.equal(bridge.status, "configured");
  });

  test("new caption/trim ID is accepted", () => {
    const classified = classifyHeadlessHostedWorkerEnvironment(
      hostedEnv(HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID),
    );
    assert.equal(classified.status, "configured");
    assert.equal(
      classified.config?.rendererBuildId,
      HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
    );
  });

  test("artifact/diagnostic identity accepts 24e and 26, rejects unknown", () => {
    assert.equal(
      isAcceptedHeadlessWorkerRendererBuildId(HEADLESS_PHASE3_RENDERER_BUILD_ID),
      true,
    );
    assert.equal(
      isAcceptedHeadlessWorkerRendererBuildId(
        HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
      ),
      true,
    );
    assert.equal(
      isAcceptedHeadlessWorkerRendererBuildId(
        HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
      ),
      false,
    );
    assert.equal(
      isAcceptedHeadlessWorkerRendererBuildId("unknown-build"),
      false,
    );
    assert.equal(
      isAcceptedHostedRendererBuildId(HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID),
      true,
    );
    assert.equal(isAcceptedHostedRendererBuildId("unknown-build"), false);
  });

  test("unknown ID still rejects", () => {
    const classified = classifyHeadlessHostedWorkerEnvironment(
      hostedEnv("headless-local-chromium-ffmpeg-unknown"),
    );
    assert.equal(classified.status, "invalid");
    assert.equal(classified.reasonId, "invalid_renderer_build_id");
  });

  test("pairs share topology and Neon/maintenance contract", () => {
    const validated = validateHeadlessFlyStagingCaptionTrimParityPairs();
    assert.equal(validated.ok, true);
    assert.equal(
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR.verifyMachineId,
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR.verifyMachineId,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR.renderMachineId,
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR.renderMachineId,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR.rendererBuildId,
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR.imageDigestSha256,
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
    );
  });

  test("placeholder is not a deployable forward digest", () => {
    assert.equal(
      isHeadlessFlyStagingCaptionTrimPlaceholderDigest(
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST,
      ),
      true,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimForwardDigest(
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST,
      ).ok,
      false,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimForwardDigest(
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
      ).reasonId,
      "deployed_digest_forbidden",
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimForwardDigest(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ).reasonId,
      "not_sealed",
    );
    if (isHeadlessFlyStagingCaptionTrimCandidateSealed()) {
      assert.equal(
        classifyHeadlessFlyStagingCaptionTrimForwardDigest(
          HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
        ).ok,
        true,
      );
    } else {
      assert.equal(
        classifyHeadlessFlyStagingCaptionTrimForwardDigest(
          HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
        ).reasonId,
        "placeholder_digest",
      );
    }
  });

  test("rollback accepts only the live phase2g.25 digest", () => {
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimRollbackDigest(
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
      ).ok,
      true,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimRollbackDigest(
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST,
      ).ok,
      false,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimRollbackDigest(
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ).ok,
      false,
    );
  });

  test("attempt budget is one each for build/forward/rollback", () => {
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimAttemptBudget({
        kind: "build_only",
        attemptedCount: 0,
      }).ok,
      true,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimAttemptBudget({
        kind: "forward",
        attemptedCount: 1,
      }).reasonId,
      "attempt_budget_exhausted",
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimAttemptBudget({
        kind: "rollback",
        attemptedCount: 1,
      }).reasonId,
      "attempt_budget_exhausted",
    );
  });

  test("topology requires the two known Machines", () => {
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimTopology({
        appName: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
        region: "iad",
        verifyMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID,
        renderMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
        verifyCount: 1,
        renderCount: 1,
        otherCount: 0,
      }).ok,
      true,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimTopology({
        appName: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
        region: "iad",
        verifyMachineId: "other",
        renderMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
        verifyCount: 1,
        renderCount: 1,
        otherCount: 0,
      }).ok,
      false,
    );
  });

  test("build-only state machine walks every phase and fails closed", () => {
    let phase: (typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_PHASES)[number] =
      "authorize";
    for (let i = 0; i < HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_PHASES.length; i += 1) {
      const next = classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition({
        phase,
        event: "ok",
      });
      assert.equal(next.ok, true);
      if (next.ok && next.nextPhase === "done") break;
      if (next.ok) phase = next.nextPhase;
    }
    const failed = classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition({
      phase: "push_build_only",
      event: "second_push",
    });
    assert.equal(failed.ok, false);
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition({
        phase: "push_build_only",
        event: "machine_update_attempted",
      }).ok,
      false,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition({
        phase: "record_digest",
        event: "zero_digest",
      }).reasonId,
      "placeholder_digest",
    );
  });

  test("rollout gate refuses placeholder and unsealed forward", () => {
    const unsealed = classifyHeadlessFlyStagingCaptionTrimRolloutGate({
      sealed: false,
      digest: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
      kind: "forward",
    });
    assert.equal(unsealed.ok, false);
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimRolloutGate({
        sealed: true,
        digest: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
        kind: "rollback",
      }).ok,
      true,
    );
    if (isHeadlessFlyStagingCaptionTrimCandidateSealed()) {
      assert.equal(
        classifyHeadlessFlyStagingCaptionTrimRolloutGate({
          sealed: true,
          digest: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
          kind: "forward",
        }).ok,
        true,
      );
    }
  });

  test("materialized config uses the new ID and has no public service", () => {
    const template = readFileSync(
      join(process.cwd(), HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
      "utf8",
    );
    const materialized = materializeHeadlessFlyStagingCaptionTrimToml({
      templateToml: template,
      appName: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
    });
    assert.equal(materialized.status, "ok");
    assert.match(
      materialized.toml ?? "",
      /headless-local-chromium-ffmpeg-11e-phase2g\.26-caption-trim-parity/,
    );
    assert.match(materialized.toml ?? "", /HEADLESS_QUEUE_PROVIDER = "neon"/);
    assert.doesNotMatch(materialized.toml ?? "", /\[\[services\]\]|\[http_service\]/);
    assert.match(template, /phase2g\.24e/);
  });

  test("secret redaction never echoes credentials", () => {
    const redacted = redactHeadlessFlyStagingCaptionTrimSecrets(
      "DATABASE_URL=postgres://user:pass@host/db FLY_API_TOKEN=fly_abc UPSTASH_REDIS_TCP_URL=rediss://x",
    );
    assert.doesNotMatch(redacted, /postgres:\/\/user/);
    assert.doesNotMatch(redacted, /fly_abc/);
    assert.match(redacted, /REDACTED/);
  });

  test("page-bundle classifier requires CTA/sting/trim/caption markers", () => {
    assert.equal(classifyHeadlessFlyStagingCaptionTrimPageBundle("").ok, false);
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimPageBundle(
        [
          "resolveDisplayableVideoSourceTimeMs",
          "resolveCaptionBackgroundAuthority",
          "resolveEngagementOverlayFrame",
          "drawEngagementOverlay",
          "resolveEngagementOverlayCaptionSafePlacement",
          "Subscribe",
          "resolveBrandStingFrame",
          "drawBrandSting",
          "engagement-overlays-v1",
          "shortforge-brand-sting-v1",
          "continuous-intra-scene-transitions-v1",
        ].join("\n"),
      ).ok,
      true,
    );
    assert.equal(
      classifyHeadlessFlyStagingCaptionTrimPageBundle(
        "resolveDisplayableVideoSourceTimeMs\nSpeechStylePanel",
      ).ok,
      false,
    );
  });

  test("historical cleanup rollout still hard-stops new releases", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/fly-staging/fly-staging-cleanup-runtime-rollout.sh"),
      "utf8",
    );
    assert.match(script, /no_authorized_cleanup_forward_digest/);
  });

  console.log(`\n${passed} passed`);
}

main();
