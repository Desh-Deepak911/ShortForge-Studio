/**
 * Transport serialization of one frozen generation result — Prompt 8.
 * JSON and NDJSON must share the same internal authority. They are not
 * two independent model generations.
 */

export interface RetentionCanonicalPublicGenerationResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly generationContext?: string;
  readonly researchApplied?: boolean;
  readonly hookPlan?: unknown;
  readonly hookDiagnostics?: unknown;
  readonly retentionPlan?: unknown;
  readonly retentionValidation?: unknown;
  readonly retentionDiagnostics?: unknown;
  readonly generationDisposition?: unknown;
}

export function serializeRetentionCanonicalGenerationResult(
  result: RetentionCanonicalPublicGenerationResult,
): {
  readonly json: RetentionCanonicalPublicGenerationResult;
  readonly ndjson: string;
} {
  const json = Object.freeze({ ...result });
  return Object.freeze({
    json,
    ndjson: `${JSON.stringify({ type: "complete", ...json })}\n`,
  });
}

export function parseRetentionNdjsonComplete(
  ndjson: string,
): RetentionCanonicalPublicGenerationResult {
  const lines = ndjson.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]!) as {
        type?: string;
      } & RetentionCanonicalPublicGenerationResult;
      if (parsed.type === "complete" || parsed.success === true) {
        const { type: _type, ...rest } = parsed as {
          type?: string;
        } & RetentionCanonicalPublicGenerationResult;
        void _type;
        return rest;
      }
    } catch {
      // skip non-JSON progress lines
    }
  }
  throw new Error("ndjson_complete_missing");
}
