/**
 * Prompt 6 progressive production-client canary.
 * Same client, credentials, SDK, models, and Responses endpoint as production.
 * Maximum 12 live model calls across Prompt 6. Stops at the first unexpected failure.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { getOpenAIClient } from "@/lib/ai";
import { QUALITY_MODELS, resolveScriptModel } from "@/lib/ai/script-models";
import {
  RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
  buildRetentionComposerJsonSchema,
  classifyRetentionProviderFailure,
  inspectRetentionOpenAiStrictJsonSchema,
} from "@/features/retention-story";
import { requestRetentionStructuredJson } from "@/features/retention-story/production/retention-production-model-json";

const ROOT = process.cwd();
loadEnvConfig(ROOT);

const OUT = path.resolve(".tmp/story-quality-real-cert/prompt6");
const MAX_LIVE_CALLS = 12;
const TINY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
} as const;

mkdirSync(OUT, { recursive: true });

let liveCalls = 0;
const steps: Array<Record<string, unknown>> = [];

function writeArtifacts(): void {
  writeFileSync(
    path.join(OUT, "canary-summary.json"),
    `${JSON.stringify({ liveCalls, maxLiveCalls: MAX_LIVE_CALLS, steps }, null, 2)}\n`,
  );
}

function record(step: Record<string, unknown>): void {
  steps.push(step);
  writeArtifacts();
}

function consumeCall(): void {
  if (liveCalls >= MAX_LIVE_CALLS) {
    throw new Error("prompt6_live_call_budget_exhausted");
  }
  liveCalls += 1;
}

async function main(): Promise<void> {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  const scriptModelOverrideSet = Boolean(process.env.OPENAI_SCRIPT_MODEL);
  const fastModel = resolveScriptModel("cheap");
  const balancedModel = resolveScriptModel("balanced");
  record({
    id: "1-config",
    outcome: hasApiKey ? "ok" : "provider_config_unavailable",
    hasApiKey,
    scriptModelOverrideSet,
    fastModel,
    balancedModel,
    defaultFast: QUALITY_MODELS.cheap,
    defaultBalanced: QUALITY_MODELS.balanced,
    endpointFamily: "responses",
    liveCalls,
  });
  if (!hasApiKey) {
    console.log("canary_stop: provider_config_unavailable");
    return;
  }
  if (QUALITY_MODELS.cheap !== "gpt-4.1-mini" || QUALITY_MODELS.balanced !== "gpt-4.1") {
    record({
      id: "1-config-model-drift",
      outcome: "fail",
      reason: "configured_models_changed",
    });
    console.log("canary_stop: configured_models_changed");
    return;
  }

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      failurePhase: "client_init",
      endpointFamily: "responses",
    });
    record({ id: "1-client", outcome: "fail", providerFailure: failure, liveCalls });
    console.log(`canary_stop: ${failure.class}`);
    return;
  }

  consumeCall();
  try {
    const unstructured = await openai.responses.create({
      model: fastModel,
      input: "Reply with the single word ok.",
      max_output_tokens: 16,
    });
    const text = unstructured.output_text?.trim() ?? "";
    record({
      id: "2-unstructured-mini",
      outcome: text ? "ok" : "empty_provider_response",
      model: fastModel,
      endpointFamily: "responses",
      liveCalls,
      hasOutputText: Boolean(text),
    });
    if (!text) return;
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      configuredModel: fastModel,
      endpointFamily: "responses",
      failurePhase: "provider_request",
    });
    record({
      id: "2-unstructured-mini",
      outcome: "fail",
      providerFailure: failure,
      liveCalls,
    });
    console.log(`canary_stop: ${failure.class}`);
    return;
  }

  consumeCall();
  try {
    const tiny = await openai.responses.create({
      model: fastModel,
      input: 'Return {"ok": true}.',
      max_output_tokens: 32,
      text: {
        format: {
          type: "json_schema",
          name: "tiny_ok",
          strict: true,
          schema: TINY_SCHEMA,
        },
      },
    });
    const parsed = JSON.parse(tiny.output_text ?? "");
    record({
      id: "3-tiny-schema-mini",
      outcome: parsed?.ok === true ? "ok" : "response_schema_mismatch",
      model: fastModel,
      endpointFamily: "responses",
      liveCalls,
    });
    if (parsed?.ok !== true) return;
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      configuredModel: fastModel,
      endpointFamily: "responses",
      failurePhase: "provider_request",
    });
    record({
      id: "3-tiny-schema-mini",
      outcome: "fail",
      providerFailure: failure,
      liveCalls,
    });
    console.log(`canary_stop: ${failure.class}`);
    return;
  }

  const defectIssues = inspectRetentionOpenAiStrictJsonSchema(
    RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
  );
  record({
    id: "4a-prompt5-schema-local",
    outcome: defectIssues.length > 0 ? "classified_defect" : "unexpected_pass",
    failingLayer: "structured_output_schema",
    issueCodes: defectIssues.map((issue) => issue.code),
    missingProperties: defectIssues
      .filter((issue) => issue.code === "required_missing_property")
      .map((issue) => issue.propertyName),
    liveCalls,
  });

  consumeCall();
  try {
    await openai.responses.create({
      model: fastModel,
      input:
        'Return a tiny fictional JSON object with title, narration, empty arrays, and empty strings. Topic: "Calen Voss Harbor return".',
      max_output_tokens: 200,
      text: {
        format: {
          type: "json_schema",
          name: "retention_composer_proposal",
          strict: true,
          schema: RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
        },
      },
    });
    record({
      id: "4b-prompt5-schema-live",
      outcome: "unexpected_pass",
      model: fastModel,
      endpointFamily: "responses",
      liveCalls,
    });
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      configuredModel: fastModel,
      endpointFamily: "responses",
      failurePhase: "provider_request",
    });
    record({
      id: "4b-prompt5-schema-live",
      outcome: "expected_fail",
      failingLayer: "structured_output_schema",
      providerFailure: failure,
      liveCalls,
    });
    if (failure.class !== "structured_output_schema_rejected") {
      console.log(`canary_stop: unexpected_class:${failure.class}`);
      return;
    }
  }

  consumeCall();
  try {
    const repaired = await requestRetentionStructuredJson({
      model: fastModel,
      prompt:
        'Return valid JSON for a tiny fictional Harbor return. title="Harbor return". narration="Voss is back. Harbor finished tenth and Mira Solan asked for patience.". usedContentIds=[], omittedContentIds=[], hookClaimRefs=[], hookOpening="Voss is back.", payoffClosing="", requiredUncertaintyMarkersUsed=[], factualSupport=[].',
      durationSec: 15,
      kind: "initial_composer",
      beatCount: 4,
      jsonSchema: {
        name: "retention_composer_proposal",
        schema: buildRetentionComposerJsonSchema({ eligibleClaims: [] }),
      },
    });
    const ok =
      repaired != null &&
      typeof repaired === "object" &&
      !Array.isArray(repaired) &&
      typeof (repaired as { narration?: unknown }).narration === "string";
    record({
      id: "4c-repaired-composer-schema-mini",
      outcome: ok ? "ok" : "response_schema_mismatch",
      model: fastModel,
      endpointFamily: "responses",
      liveCalls,
    });
    if (!ok) return;
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      configuredModel: fastModel,
      endpointFamily: "responses",
    });
    record({
      id: "4c-repaired-composer-schema-mini",
      outcome: "fail",
      providerFailure: failure,
      liveCalls,
    });
    console.log(`canary_stop: ${failure.class}`);
    return;
  }

  consumeCall();
  try {
    const balancedTiny = await openai.responses.create({
      model: balancedModel,
      input: 'Return {"ok": true}.',
      max_output_tokens: 32,
      text: {
        format: {
          type: "json_schema",
          name: "tiny_ok",
          strict: true,
          schema: TINY_SCHEMA,
        },
      },
    });
    const parsed = JSON.parse(balancedTiny.output_text ?? "");
    record({
      id: "4d-tiny-schema-gpt-4.1",
      outcome: parsed?.ok === true ? "ok" : "response_schema_mismatch",
      model: balancedModel,
      endpointFamily: "responses",
      liveCalls,
    });
  } catch (error) {
    const failure = classifyRetentionProviderFailure(error, {
      configuredModel: balancedModel,
      endpointFamily: "responses",
      failurePhase: "provider_request",
    });
    record({
      id: "4d-tiny-schema-gpt-4.1",
      outcome: "fail",
      providerFailure: failure,
      liveCalls,
    });
    console.log(`canary_stop: ${failure.class}`);
    return;
  }

  console.log(`canary_ok liveCalls=${liveCalls}`);
}

main().catch((error) => {
  record({
    id: "canary-crash",
    outcome: "fail",
    class: "unknown_provider_failure",
    liveCalls,
  });
  console.error(error instanceof Error ? error.name : "canary_failed");
  process.exitCode = 1;
});
