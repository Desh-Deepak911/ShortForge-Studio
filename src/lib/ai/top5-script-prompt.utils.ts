import type { ScriptMode } from "@/types/footiebitz";

export const TOP_5_RANKED_DATA_RULES = `Top 5 ranked data rules (mandatory — verified rankings present):
- RANKED PLAYER DATA is the sole source for this countdown — every listed entry must appear in the narration.
- Mention EVERY ranked item — do not skip, merge, or omit any entry from the list.
- Keep the EXACT order shown in RANKED PLAYER DATA (list order is the countdown order).
- Use EXACT player names, team/nation labels, and goal numbers — no paraphrasing, rounding, or substitutions.
- Do NOT write a generic football story, hype reel, or qualitative roundup without naming the full ranked list.`;

export const TOP_5_MISSING_RANKINGS_RULES = `Top 5 mode without ranked data (mandatory — no verified list available):
- Verified ranked player data is NOT available for this brief.
- Do NOT pretend to deliver a ranked top-5 countdown with specific players, goal totals, or positions.
- Do NOT invent names, rankings, or statistics from general knowledge.
- Choose ONE approach:
  (A) Write a short, cautious script explaining that ranked data is unavailable and invite the listener to narrow scope (competition, season, or metric), OR
  (B) Write qualitative football analysis WITHOUT numbered rankings, fake countdown beats, or placeholder list entries.
- If you reference a countdown at all, explicitly state that verified ranking data was not found — never fill the list from memory.`;

export function hasRankedPlayerDataInContextText(context?: string): boolean {
  return Boolean(
    context?.includes("RANKED PLAYER DATA:") || context?.includes("RANKINGS:"),
  );
}

export function resolveTop5RankedDataAvailable(input: {
  scriptMode: ScriptMode;
  contextText?: string;
  researchApplied?: boolean;
}): boolean {
  if (input.scriptMode !== "top_5" || !input.researchApplied) {
    return false;
  }

  return hasRankedPlayerDataInContextText(input.contextText);
}

export function buildTop5StructureRule(hasRankedData: boolean): string {
  if (hasRankedData) {
    return "- Use a ranked countdown structure — one spoken narration flowing from the first listed entry through the last, with punchy transitions. Every ranked name and goal total must appear.";
  }

  return "- Do NOT use a ranked countdown with invented players — ranked data is unavailable for this brief.";
}

export function buildTop5ModeFocus(hasRankedData: boolean): string[] {
  if (hasRankedData) {
    return [
      "Open with a hook that tees up the ranked countdown.",
      "Walk through every researched entry in list order with evidence-backed lines.",
      "Land a strong #1 or closing line that fits the researched order — do not reorder entries.",
    ];
  }

  return [
    "Open with a brief hook tied to the topic.",
    "State clearly that verified ranking data is unavailable (or ask for a narrower competition/season scope).",
    "Offer cautious qualitative context only — no fake numbered list or invented scorers.",
  ];
}
