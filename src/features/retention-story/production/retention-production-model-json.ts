/**
 * Shared JSON request helper for Retention production model adapters — Sprint 10F.3 / 10F.3A / 10H.2.
 * Uses existing OpenAI script infrastructure. No new env vars or providers.
 * max_output_tokens is call-kind-aware (not shared narration-only policy).
 * Prefer schema-constrained Structured Outputs when a schema is supplied.
 */

import { getOpenAIClient } from "@/lib/ai";
import { cleanJsonText } from "@/features/story/services/story-parse.service";
import { assertRetentionOpenAiStrictJsonSchema } from "./assert-retention-openai-strict-json-schema";
import { noteRetentionCertificationProviderInvoke } from "./create-retention-certification-call-budget";
import {
  classifyRetentionProviderFailure,
  RetentionProviderRequestError,
} from "./classify-retention-provider-failure";
import {
  resolveRetentionProductionMaxOutputTokens,
  type RetentionProductionModelCallKind,
} from "./resolve-retention-production-max-output-tokens";

export async function requestRetentionStructuredJson(input: {
  readonly model: string;
  readonly prompt: string;
  readonly durationSec: number;
  readonly kind: RetentionProductionModelCallKind;
  readonly beatCount: number;
  readonly targetWordBudget?: number;
  /** Optional sampling temperature (planner prefers lower; default 0.5). */
  readonly temperature?: number;
  /** When set, request OpenAI Structured Outputs (json_schema). Still fail-closed on semantic normalize. */
  readonly jsonSchema?: {
    readonly name: string;
    readonly schema: Record<string, unknown>;
    readonly description?: string;
  };
}): Promise<unknown> {
  const classifyExtras = {
    configuredModel: input.model,
    endpointFamily: "responses" as const,
    retryCount: 0,
  };

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (error) {
    throw new RetentionProviderRequestError(
      classifyRetentionProviderFailure(error, {
        ...classifyExtras,
        failurePhase: "client_init",
      }),
    );
  }

  if (input.jsonSchema) {
    try {
      assertRetentionOpenAiStrictJsonSchema(input.jsonSchema.schema);
    } catch (error) {
      throw new RetentionProviderRequestError(
        classifyRetentionProviderFailure(error, {
          ...classifyExtras,
          failurePhase: "schema_construction",
        }),
      );
    }
  }

  const maxOutputTokens = resolveRetentionProductionMaxOutputTokens({
    kind: input.kind,
    durationSec: input.durationSec,
    beatCount: input.beatCount,
    ...(input.targetWordBudget != null
      ? { targetWordBudget: input.targetWordBudget }
      : {}),
  });
  const temperature =
    typeof input.temperature === "number" &&
    Number.isFinite(input.temperature) &&
    input.temperature >= 0 &&
    input.temperature <= 1
      ? input.temperature
      : 0.5;

  noteRetentionCertificationProviderInvoke(input.kind);

  let response: { output_text?: string | null };
  try {
    response = await openai.responses.create({
      model: input.model,
      input: input.prompt,
      temperature,
      max_output_tokens: maxOutputTokens,
      ...(input.jsonSchema
        ? {
            text: {
              format: {
                type: "json_schema" as const,
                name: input.jsonSchema.name,
                schema: input.jsonSchema.schema,
                strict: true,
                ...(input.jsonSchema.description
                  ? { description: input.jsonSchema.description }
                  : {}),
              },
            },
          }
        : {
            text: {
              format: { type: "json_object" as const },
            },
          }),
    });
  } catch (error) {
    throw new RetentionProviderRequestError(
      classifyRetentionProviderFailure(error, {
        ...classifyExtras,
        failurePhase: "provider_request",
      }),
    );
  }

  let rawText = "";
  try {
    rawText = response.output_text?.trim() ?? "";
  } catch (error) {
    throw new RetentionProviderRequestError(
      classifyRetentionProviderFailure(error, {
        ...classifyExtras,
        failurePhase: "response_extraction",
      }),
    );
  }
  if (!rawText) {
    throw new RetentionProviderRequestError(
      classifyRetentionProviderFailure(new Error("empty_provider_response"), {
        ...classifyExtras,
        failurePhase: "response_extraction",
      }),
    );
  }

  try {
    const cleaned = cleanJsonText(rawText);
    return JSON.parse(cleaned) as unknown;
  } catch (error) {
    throw new RetentionProviderRequestError(
      classifyRetentionProviderFailure(
        error instanceof SyntaxError ? error : new Error("response_json_parse_failure"),
        {
          ...classifyExtras,
          failurePhase: "response_parse",
        },
      ),
    );
  }
}

/** Bound claim summaries for prompts — IDs + short text only. */
export function formatBoundedClaimsForPrompt(
  claims: readonly {
    readonly claimId: string;
    readonly text: string;
    readonly eligibleForFactualSupport?: boolean;
  }[],
  max = 12,
): string {
  return claims
    .slice(0, max)
    .map((c) => {
      const flag =
        c.eligibleForFactualSupport === false ? "avoidance" : "eligible";
      return `- [${flag}] ${c.claimId}: ${c.text}`;
    })
    .join("\n");
}
