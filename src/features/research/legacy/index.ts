/** @deprecated Legacy FootballResearchContext adapters — test/legacy only. Do not use in production path. */
export type {
  FootballResearchContext,
  FootballResearchMode,
  FootballResearchSource,
} from "../types/football-research.types";

export { buildFootballResearchContextText } from "../utils/football-context-builder";
export { researchFootballContext } from "./football-research.legacy.server";
export {
  applyFifaWorldCup2026Grounding,
  hasNoUsefulResearchForGrounding,
  shouldShowNoReliableDataWarning,
} from "./research-grounding.legacy.utils";
export { applyResolvedResearchContext } from "./script-research-context.legacy.utils";
