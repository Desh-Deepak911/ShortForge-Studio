/**
 * Public generation-context presence — story-quality Prompt 8.
 * Never echo creator notes, premises, briefs, facts, or prompts.
 */

export const RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED = "supplied" as const;

export function buildRetentionPublicGenerationContextPresence(
  context: string | null | undefined,
): typeof RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED | undefined {
  return context != null && context.trim().length > 0
    ? RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED
    : undefined;
}

const LEAK_KEYS = [
  "promptBlock",
  "hookDirectiveBlock",
  "eligibleClaims",
  "contentAuthority",
  "orderedEssentialUnits",
  "compositionBrief",
  "premiseDetails",
  "manualContext",
  "OPENAI_API_KEY",
];

export function assertRetentionPublicPayloadPrivacy(
  payload: unknown,
  sentinels: readonly string[] = [],
): void {
  const json = JSON.stringify(payload);
  for (const key of LEAK_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`public_privacy_leak:${key}`);
    }
  }
  for (const sentinel of sentinels) {
    if (sentinel && json.includes(sentinel)) {
      throw new Error("public_privacy_leak:sentinel");
    }
  }
}
