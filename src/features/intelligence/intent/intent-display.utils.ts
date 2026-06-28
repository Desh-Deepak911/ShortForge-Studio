import type { Intent } from "./intent-types";
import type { ScriptMode } from "@/types/footiebitz";

/** Creator-facing content type labels shown on /create. */
export const SUGGESTED_CONTENT_TYPE_LABELS: Record<Intent, string> = {
  story: "Story",
  player_profile: "Player Profile",
  ranked_list: "Ranked List",
  match_preview: "Match Preview",
  match_recap: "Match Recap",
  tactical_breakdown: "Tactical Breakdown",
  historical_explainer: "Historical Explainer",
  opinion: "Opinion",
  news: "News",
};

/** Maps inferred intent to the closest ScriptMode for comparison with the user selection. */
export const INTENT_TO_SCRIPT_MODE: Record<Intent, ScriptMode> = {
  story: "story",
  player_profile: "player_analysis",
  ranked_list: "top_5",
  match_preview: "match_preview",
  match_recap: "match_recap",
  tactical_breakdown: "tactical_review",
  historical_explainer: "historical_explainer",
  opinion: "opinion_debate",
  news: "story",
};

export function resolveSuggestedContentTypeLabel(intent: Intent): string {
  return SUGGESTED_CONTENT_TYPE_LABELS[intent];
}

export function resolveIntentScriptMode(intent: Intent): ScriptMode {
  return INTENT_TO_SCRIPT_MODE[intent];
}

export function intentMatchesScriptMode(intent: Intent, scriptMode: ScriptMode): boolean {
  return resolveIntentScriptMode(intent) === scriptMode;
}
