export const NO_RELIABLE_FOOTBALL_DATA_WARNING =
  "Research is limited for this topic, so the story will avoid exact claims.";

const FIFA_WORLD_CUP_2026_PATTERN =
  /\bfifa world cup 2026\b|\bworld cup 2026\b|\bwc 2026\b/i;

export function mentionsFifaWorldCup2026(topic: string): boolean {
  return FIFA_WORLD_CUP_2026_PATTERN.test(topic.trim());
}

export const FIFA_WORLD_CUP_2026_HOST_FACT =
  "FIFA World Cup 2026 host nations: USA, Canada, and Mexico.";

export const FIFA_WORLD_CUP_2026_NOT_QATAR_FACT =
  "The 2026 tournament is not the Qatar World Cup — do not refer to Qatar as host.";

export const FIFA_WORLD_CUP_2026_PARTICIPATION_FACT =
  "Player squad selection for FIFA World Cup 2026 is unconfirmed — use conditional phrasing such as \"if selected\" or \"if he appears\", not \"he will play\".";

export function buildResearchUnavailablePromptRules(topic: string): string {
  const lines = [
    "Football research unavailable (strict — research was attempted but returned no verified data):",
    "- Do NOT invent host nations, scores, teams, rankings, stats, or player availability.",
    "- Do NOT mention past tournaments unless the user brief explicitly asks for historical context.",
    "- For future or upcoming tournaments, do not claim participation, squad selection, or availability unless confirmed in the brief, manual context, or researched context.",
    "- Write sharp qualitative analysis — roles, reputation, momentum, stakes — without inventing precise numbers or historical events.",
    "- Keep the script useful and engaging, but cautious on every exact claim.",
  ];

  if (mentionsFifaWorldCup2026(topic)) {
    lines.push(
      "",
      "FIFA World Cup 2026 (referenced in the brief):",
      "- Known host nations: USA, Canada, and Mexico — never describe this as the Qatar World Cup or cite Qatar as host.",
      "- If player participation is unknown, use conditional phrasing such as \"if selected\" or \"if he appears\" — never \"he will play\" or \"he is going to\".",
    );
  }

  return lines.join("\n");
}

export function buildFifaWorldCup2026ContextRules(hasVerifiedPlayerProfile: boolean): string[] {
  const rules = [
    "- FIFA World Cup 2026 host nations: USA, Canada, and Mexico.",
    "- Never call this tournament the Qatar World Cup or reference Qatar as host.",
  ];

  if (!hasVerifiedPlayerProfile) {
    rules.push(
      "- Player participation/squad status for 2026 is not confirmed — say \"if selected\" or \"if he appears\", not \"he will play\".",
    );
  } else {
    rules.push(
      "- Prefer conditional phrasing for 2026 participation unless squad status is explicitly confirmed in this context.",
    );
  }

  return rules;
}