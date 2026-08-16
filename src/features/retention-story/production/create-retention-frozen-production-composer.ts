/**
 * Inject a frozen production-shaped composer response at the provider boundary.
 * Used for exact production replay. Does not bypass schema or acceptance.
 */

import type { RetentionComposerCallback } from "../composition/retention-narration-candidate.types";
import { assertRetentionOpenAiStrictJsonSchema } from "./assert-retention-openai-strict-json-schema";
import { buildRetentionComposerJsonSchema } from "./retention-composer-json-schema";

export function createRetentionFrozenProductionComposer(
  raw: unknown,
): RetentionComposerCallback {
  const schema = buildRetentionComposerJsonSchema({ eligibleClaims: [] });
  assertRetentionOpenAiStrictJsonSchema(schema);
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("frozen_composer_proposal_invalid");
  }
  const proposal = Object.freeze({ ...(raw as Record<string, unknown>) });
  return () => proposal as never;
}
