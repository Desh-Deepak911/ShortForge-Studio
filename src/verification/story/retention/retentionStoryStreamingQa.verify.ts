/**
 * Sprint 10H — Retention Story JSON/NDJSON + concurrency QA.
 * Run: npm run test:retention-story-streaming-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

import { consumeGenerateScriptStream } from "@/lib/utils/generateScriptStream";
import type {
  GenerateScriptResponse,
  GenerateScriptStreamEvent,
} from "@/types/footiebitz";
import type { HookDiagnostics, HookPlanSnapshot } from "@/features/hook-engine";
import {
  assertNoPrivateRetentionFieldsSerialized,
  buildRetentionSafeResponseEnvelope,
  runRetentionProductionNarration,
  type RetentionStoryPlanSnapshot,
  type RetentionValidationSummary,
} from "@/features/retention-story";

import { retentionProductionDoubles } from "./retentionStoryQaDoubles";

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const SAMPLE_HOOK_PLAN: HookPlanSnapshot = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  requestFingerprint: "hr:rs-stream1",
  planFingerprint: "hp:rs-stream1",
  resolvedConstraints: {
    maxOpeningWords: 5,
    maxOpeningSpokenSecondsHint: 3,
    mustPreserveSubject: true,
    allowQuestionForm: true,
    allowStatisticClaim: false,
    forbidUnverifiedSuperlatives: true,
    minProvocativeness: 0.5,
    minClarity: 0.5,
  },
};

const SAMPLE_HOOK_DIAG: HookDiagnostics = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  generationPath: "script_only",
  requestFingerprint: "hr:rs-stream1",
  planFingerprint: "hp:rs-stream1",
  groundingStatus: "user_context_only",
  validationOutcome: "pass",
  repairAttempts: 0,
  lengthEnforcement: "none",
  templateInfluenced: false,
  promptIntelligenceInfluenced: false,
  adapterRan: true,
};

const SAMPLE_RETENTION_PLAN: RetentionStoryPlanSnapshot = {
  version: 1,
  formatStrategyId: "short_retention",
  controllingIdea: "Pressure decides the preview",
  primaryEmotion: "tension",
  secondaryEmotion: "hope",
  beatCount: 5,
  pacingProfile: "front_loaded",
  endingStrategy: "payoff_reveal",
  informationDensity: "dense",
  visualDensity: "high",
  claimIdCount: 0,
  contractFingerprint: "rsc:stream1",
  planFingerprint: "rsp:stream1",
  strategyRegistryVersion: "retention-format-strategy/1",
};

const SAMPLE_RETENTION_VALIDATION: RetentionValidationSummary = {
  version: 1,
  ok: true,
  retentionReadiness: 0.9,
  storyQualityConfidence: 0.85,
  frameworkCompliance: 0.95,
  failedHardGateIds: [],
  warningNotes: [],
  validationFingerprint: "rv:stream1",
  candidateFingerprint: "rnc:stream1",
  contractFingerprint: "rsc:stream1",
  planFingerprint: "rsp:stream1",
  terminalState: "pass_without_rewrite",
  rewriteUsed: false,
};

function eventsToNdjson(events: GenerateScriptStreamEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function responseFromBytes(chunks: Uint8Array[]): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i]!);
      i += 1;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function splitUtf8(text: string, sizes: number[]): Uint8Array[] {
  const encoded = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= encoded.length) break;
    chunks.push(encoded.slice(offset, offset + size));
    offset += size;
  }
  if (offset < encoded.length) chunks.push(encoded.slice(offset));
  return chunks;
}

function jsonSuccessEnvelope(): GenerateScriptResponse {
  return {
    success: true,
    data: {
      title: "Stream Title",
      narration: "Why does Spain pressure matter? Body continues.",
      totalDuration: 30,
      scenes: [],
    },
    hookPlan: SAMPLE_HOOK_PLAN,
    hookDiagnostics: SAMPLE_HOOK_DIAG,
    retentionPlan: SAMPLE_RETENTION_PLAN,
    retentionValidation: SAMPLE_RETENTION_VALIDATION,
  };
}

async function main(): Promise<void> {
  console.log("\nretention-story-streaming-qa (Sprint 10H)\n");

  await check("JSON and NDJSON terminal-envelope parity (Retention fields)", async () => {
    const json = jsonSuccessEnvelope();
    const events: GenerateScriptStreamEvent[] = [
      { type: "progress", step: 1, label: "Writing your story..." },
      {
        type: "complete",
        success: true,
        data: json.data,
        hookPlan: json.hookPlan,
        hookDiagnostics: json.hookDiagnostics,
        retentionPlan: json.retentionPlan,
        retentionValidation: json.retentionValidation,
      },
    ];
    const streamed = await consumeGenerateScriptStream(
      responseFromBytes(splitUtf8(eventsToNdjson(events), [40, 80, 200, 500])),
      () => {},
    );
    assert.equal(streamed.success, true);
    assert.deepEqual(streamed.retentionPlan, json.retentionPlan);
    assert.deepEqual(streamed.retentionValidation, json.retentionValidation);
    assert.deepEqual(streamed.hookPlan, json.hookPlan);
  });

  await check("exactly one terminal stream result", async () => {
    const events: GenerateScriptStreamEvent[] = [
      { type: "progress", step: 1, label: "Writing your story..." },
      {
        type: "complete",
        success: true,
        data: jsonSuccessEnvelope().data,
        retentionPlan: SAMPLE_RETENTION_PLAN,
        retentionValidation: SAMPLE_RETENTION_VALIDATION,
        hookPlan: SAMPLE_HOOK_PLAN,
        hookDiagnostics: SAMPLE_HOOK_DIAG,
      },
    ];
    const streamed = await consumeGenerateScriptStream(
      responseFromBytes([new TextEncoder().encode(eventsToNdjson(events))]),
      () => {},
    );
    assert.equal(streamed.success, true);
    assert.ok(streamed.data?.narration);
  });

  await check("success and failure field parity", async () => {
    const failEvents: GenerateScriptStreamEvent[] = [
      {
        type: "error",
        error: "Retention Story could not approve narration.",
        retentionDiagnostics: {
          version: 1,
          terminalState: "hard_gate_failed",
          qualityMode: "cheap",
          contractFingerprint: "rsc:fail",
          planFingerprint: null,
          candidateFingerprint: null,
          validationFingerprint: null,
          rewriteUsed: false,
          failureCategory: "retention_hard_gate_failure",
          safeReasonIds: ["hard_gate"],
        },
      },
    ];
    const streamed = await consumeGenerateScriptStream(
      responseFromBytes([
        new TextEncoder().encode(eventsToNdjson(failEvents)),
      ]),
      () => {},
    );
    assert.equal(streamed.success, false);
    assert.ok(streamed.error);
    assert.equal(streamed.retentionPlan, undefined);
    assert.equal(streamed.retentionValidation, undefined);
    assert.ok(streamed.retentionDiagnostics);
  });

  await check("split UTF-8 / token handling preserves Retention envelopes", async () => {
    const narration = "Café derby night erupts. Body — 日本語.";
    const events: GenerateScriptStreamEvent[] = [
      {
        type: "complete",
        success: true,
        data: {
          title: "UTF",
          narration,
          totalDuration: 30,
          scenes: [],
        },
        hookPlan: SAMPLE_HOOK_PLAN,
        hookDiagnostics: SAMPLE_HOOK_DIAG,
        retentionPlan: SAMPLE_RETENTION_PLAN,
        retentionValidation: SAMPLE_RETENTION_VALIDATION,
      },
    ];
    const streamed = await consumeGenerateScriptStream(
      responseFromBytes(splitUtf8(eventsToNdjson(events), [3, 5, 7, 11, 17])),
      () => {},
    );
    assert.equal(streamed.data?.narration, narration);
    assert.equal(streamed.retentionPlan?.planFingerprint, "rsp:stream1");
  });

  await check("private fields never cross the response boundary", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const envelope = buildRetentionSafeResponseEnvelope(result);
    const payload = {
      type: "complete" as const,
      success: true as const,
      ...envelope,
      hookPlan: result.approved.hookPlan,
      hookDiagnostics: result.approved.hookDiagnostics,
    };
    assertNoPrivateRetentionFieldsSerialized(payload);
    const blob = JSON.stringify(payload);
    assert.equal(blob.includes("terminalHookAuthority"), false);
    assert.equal(blob.includes("promptBlock"), false);
  });

  await check(
    "concurrent Fast/Balanced/Studio cannot share ledgers/fingerprints",
    async () => {
      const [fast, balanced, studio] = await Promise.all([
        runRetentionProductionNarration({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "cheap",
          ...retentionProductionDoubles("cheap"),
        }),
        runRetentionProductionNarration({
          topic: "Germany versus Italy tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "balanced",
          ...retentionProductionDoubles("balanced"),
        }),
        runRetentionProductionNarration({
          topic: "Brazil versus Argentina tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "best",
          ...retentionProductionDoubles("best"),
        }),
      ]);
      assert.equal(fast.ok, true);
      assert.equal(balanced.ok, true);
      assert.equal(studio.ok, true);
      if (!fast.ok || !balanced.ok || !studio.ok) return;
      const fps = [
        fast.approved.contractFingerprint,
        balanced.approved.contractFingerprint,
        studio.approved.contractFingerprint,
      ];
      assert.equal(new Set(fps).size, 3);
      const plans = [
        fast.approved.planFingerprint,
        balanced.approved.planFingerprint,
        studio.approved.planFingerprint,
      ];
      assert.equal(new Set(plans).size, 3);
      const cands = [
        fast.approved.candidateFingerprint,
        balanced.approved.candidateFingerprint,
        studio.approved.candidateFingerprint,
      ];
      assert.equal(new Set(cands).size, 3);
    },
  );

  console.log(`\nretention-story-streaming-qa — ${passed} checks passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
