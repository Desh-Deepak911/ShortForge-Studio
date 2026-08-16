/**
 * Story-quality Prompt 6 — provider-path classification, schema, and
 * model-narration survival. Provider-free. No topic special cases.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
  assertRetentionOpenAiStrictJsonSchema,
  buildRetentionComposerJsonSchema,
  buildRetentionSafeResponseEnvelope,
  classifyRetentionProviderFailure,
  inspectRetentionOpenAiStrictJsonSchema,
  mapRetentionNarrationToBeats,
  RetentionProviderRequestError,
  retentionStoryErrorFromProviderFailure,
  runRetentionProductionNarration,
} from "@/features/retention-story";
import { buildRetentionPlannerJsonSchema } from "@/features/retention-story/production/create-retention-production-planner";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { RetentionComposerCallback } from "@/features/retention-story";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

import {
  makeRetentionComposer,
  passRetentionHookRunner,
} from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus/iu;

const COMEBACK = [
  "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
  "Harbor United finished tenth in Voss's first stretch back.",
  "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
  "Do not claim Voss failed a new test.",
].join("\n");

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function makeHookAwareComposer(): RetentionComposerCallback {
  const base = makeRetentionComposer();
  return async (request) => {
    const proposal = await base(request);
    const wantsQuestion =
      /\bquestion\b/i.test(request.hookDirectiveBlock ?? "") ||
      /\bquestion\b/i.test(request.hookHandoff.openingPsychologicalFunction);
    if (!wantsQuestion || !("segments" in proposal) || !proposal.segments?.[0]) {
      return proposal;
    }
    const first = proposal.segments[0];
    const rewritten = first.text.replace(
      /^Why does Spain pressure matter\?/u,
      "Can Spain hold France?",
    );
    return {
      ...proposal,
      segments: [{ ...first, text: rewritten }, ...proposal.segments.slice(1)],
    };
  };
}

async function main(): Promise<void> {
  console.log("retention-provider-path");

  await check("[P6-1] Prompt 5 composer schema fails OpenAI strict required-property rule", () => {
    const issues = inspectRetentionOpenAiStrictJsonSchema(
      RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
    );
    const missing = issues.filter((issue) => issue.code === "required_missing_property");
    assert.ok(missing.length >= 4, JSON.stringify(issues));
    const names = new Set(missing.map((issue) => issue.propertyName));
    assert.ok(names.has("hookOpening"));
    assert.ok(names.has("payoffClosing"));
    assert.ok(names.has("requiredUncertaintyMarkersUsed"));
    assert.ok(names.has("factualSupport"));
    assert.throws(() =>
      assertRetentionOpenAiStrictJsonSchema(
        RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
      ),
    );
  });

  await check("[P6-2] repaired production composer schema is strict-compliant", () => {
    const schema = buildRetentionComposerJsonSchema({ eligibleClaims: [] });
    assert.doesNotThrow(() => assertRetentionOpenAiStrictJsonSchema(schema));
    const required = new Set(schema.required as string[]);
    const properties = Object.keys(schema.properties as object);
    for (const name of properties) {
      assert.ok(required.has(name), `missing required ${name}`);
    }
    assert.equal(schema.additionalProperties, false);
  });

  await check("[P6-3] planner schema remains strict-compliant", () => {
    const schema = buildRetentionPlannerJsonSchema({
      topic: "Harbor return",
      durationSec: 30,
      qualityMode: "balanced",
      scriptMode: "story",
      targetBeatCountRange: { min: 4, max: 6 },
      suggestedBeatPurposes: ["hook_handoff", "proof", "escalation", "payoff"],
      controllingIdeaStatement: "Harbor must decide whether to stand with Voss.",
      pacingProfile: "steady",
      informationDensity: "balanced",
      visualDensity: "moderate",
      endingStrategy: "open_question",
      requirePayoff: true,
      forbidGenericIntro: true,
      eligibleClaims: [],
      avoidanceClaims: [],
    } as Parameters<typeof buildRetentionPlannerJsonSchema>[0]);
    assert.doesNotThrow(() => assertRetentionOpenAiStrictJsonSchema(schema));
  });

  await check("[P6-4] classifier distinguishes schema, auth, timeout, and parse failures", () => {
    const schema = classifyRetentionProviderFailure({
      name: "BadRequestError",
      status: 400,
      type: "invalid_request_error",
      code: "invalid_json_schema",
      param: "text.format.schema",
      requestID: "req_schema_1",
      message: "Invalid schema for response_format: missing required properties.",
    });
    assert.equal(schema.class, "structured_output_schema_rejected");
    assert.equal(schema.httpStatus, 400);
    assert.equal(schema.rejectedParameterName, "text.format.schema");
    assert.equal(schema.endpointFamily, "responses");
    assert.doesNotMatch(JSON.stringify(schema), /Invalid schema/u);

    const auth = classifyRetentionProviderFailure({
      name: "AuthenticationError",
      status: 401,
      type: "invalid_request_error",
      code: "invalid_api_key",
    });
    assert.equal(auth.class, "authentication_rejected");

    const timeout = classifyRetentionProviderFailure({
      name: "APIConnectionTimeoutError",
      message: "Request timed out.",
    });
    assert.equal(timeout.class, "provider_timeout");
    assert.equal(timeout.timeoutClassification, "connection_timeout");

    const parse = classifyRetentionProviderFailure(new SyntaxError("Unexpected token"));
    assert.equal(parse.class, "response_json_parse_failure");
    assert.equal(
      retentionStoryErrorFromProviderFailure(parse).reason,
      "composer_proposal_invalid",
    );

    const config = classifyRetentionProviderFailure(
      new Error("OPENAI_API_KEY is not configured"),
    );
    assert.equal(config.class, "provider_config_unavailable");
    assert.equal(
      retentionStoryErrorFromProviderFailure(config).reason,
      "composer_call_failed",
    );
  });

  await check("[P6-5] parse/schema-mismatch is not model_call_failed; API failure is", async () => {
    const parseResult = await runRetentionProductionNarration({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => {
        throw new RetentionProviderRequestError({
          class: "response_json_parse_failure",
          endpointFamily: "responses",
          configuredModel: "gpt-4.1-mini",
          failurePhase: "response_parse",
          retryCount: 0,
        });
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(parseResult.ok, true);
    if (!parseResult.ok) throw new Error("expected rescue");
    const parseTrace = parseResult.approved.generationDisposition?.acceptanceTrace;
    assert.equal(parseTrace?.earliestDecisiveRejection, "malformed_composer_proposal");
    assert.equal(parseTrace?.providerFailure?.class, "response_json_parse_failure");
    assert.equal(parseTrace?.finalNarrationAuthority, "deterministic_rescue");

    const apiResult = await runRetentionProductionNarration({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => {
        throw new RetentionProviderRequestError({
          class: "structured_output_schema_rejected",
          endpointFamily: "responses",
          configuredModel: "gpt-4.1-mini",
          httpStatus: 400,
          providerErrorType: "invalid_request_error",
          rejectedParameterName: "text.format.schema",
          failurePhase: "provider_request",
          retryCount: 0,
        });
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(apiResult.ok, true);
    if (!apiResult.ok) throw new Error("expected rescue");
    const apiTrace = apiResult.approved.generationDisposition?.acceptanceTrace;
    assert.equal(apiTrace?.earliestDecisiveRejection, "model_call_failed");
    assert.equal(apiTrace?.providerFailure?.class, "structured_output_schema_rejected");
    assert.equal(apiTrace?.finalNarrationAuthority, "deterministic_rescue");
    assert.doesNotMatch(
      JSON.stringify(apiResult.approved.safeDiagnostics),
      /sk-|Bearer |prompt|Calen Voss returned/u,
    );
  });

  await check("[P6-6] accepted model narration survives mapping and JSON/NDJSON", async () => {
    const composer = makeRetentionComposer();
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : `${result.failureCategory}:${result.retentionDiagnostics.safeReasonIds.join(",")}`,
    );
    if (!result.ok) throw new Error("expected model accept");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.notEqual(result.approved.generationDisposition?.disposition, "fallback");
    assert.match(result.approved.narration, /Spain/u);
    assert.match(result.approved.narration, /France|pressure/u);
    assert.doesNotMatch(result.approved.narration, SCAFFOLD);
    const acceptedNarration = result.approved.narration
      .normalize("NFC")
      .replace(/\s+/gu, " ")
      .trim();

    const contractInput = buildProductionStoryContractInput({
      topic: "Spain versus France tactical preview",
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      factHandlingMode: "verified_facts_only",
      tone: "dramatic",
    });
    const contract = normalizeStoryContract(contractInput);
    const grounding = contractInput.grounding!;
    const ledger = createRetentionModelCallLedger(contract.qualityMode);
    const planResult = buildReliabilityDeterministicRetentionPlan({
      contract,
      grounding,
      planner: null,
      ledger,
    });
    assert.equal(planResult.status, "ready");
    if (planResult.status !== "ready") throw new Error("plan");
    const mapped = mapRetentionNarrationToBeats({
      narration: acceptedNarration,
      plan: planResult.plan,
      grounding,
      strategySeed: planResult.strategySeed,
      allowEmptyInternalBeats: true,
    });
    assert.equal(mapped.narration, acceptedNarration);
    const rematerialized = mapped.segments
      .map((segment) => segment.text)
      .filter(Boolean)
      .join(" ");
    assert.equal(rematerialized.replace(/\s+/g, " ").trim(), acceptedNarration);
    const jsonEnvelope = buildRetentionSafeResponseEnvelope(result);
    const ndjsonEnvelope = buildRetentionSafeResponseEnvelope(result);
    assert.equal(JSON.stringify(jsonEnvelope), JSON.stringify(ndjsonEnvelope));
    assert.equal(
      jsonEnvelope.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
  });

  await check("[P6-7] explicit Hook changes presentation without replacing facts", async () => {
    const composer = makeHookAwareComposer();
    const run = (hookStyle: HookStyleSelection) =>
      runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 40,
        generationPath: "script_only",
        qualityMode: "cheap",
        factHandlingMode: "verified_facts_only",
        hookStyle,
        planner: null,
        composer,
        hookRunner: passRetentionHookRunner,
      });
    const auto = await run("auto");
    const question = await run("provocative_question");
    assert.equal(auto.ok, true);
    assert.equal(question.ok, true);
    if (!auto.ok || !question.ok) throw new Error("expected both");
    assert.equal(
      auto.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.equal(
      question.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.match(auto.approved.narration, /Why does Spain pressure matter/u);
    assert.match(question.approved.narration, /Can Spain hold France/u);
    assert.notEqual(auto.approved.narration, question.approved.narration);
    for (const narration of [auto.approved.narration, question.approved.narration]) {
      assert.match(narration, /Spain/u);
      assert.match(narration, /France|pressure/u);
      assert.doesNotMatch(narration, SCAFFOLD);
    }
  });

  await check("[P6-8] no topic-specific production logic in the provider repair", () => {
    const files = [
      "features/retention-story/production/retention-composer-json-schema.ts",
      "features/retention-story/production/classify-retention-provider-failure.ts",
      "features/retention-story/production/assert-retention-openai-strict-json-schema.ts",
      "features/retention-story/production/retention-production-model-json.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(
        source,
        /\b(?:Arsenal|Chelsea|Liverpool|Barcelona|Real Madrid|Premier League|La Liga|Haaland|Mbappe)\b/u,
      );
    }
  });

  console.log("retention-provider-path: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
