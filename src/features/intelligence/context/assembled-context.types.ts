import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";
import type { ScriptMode } from "@/types/footiebitz";

import type { IntentAnalysis } from "../intent/intent-types";
import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";
import type {
  IntelligenceResearchRanking,
  ResearchResultProvenance,
} from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";
import type { IntelligenceCompetition } from "../shared/competition.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

/** Named prompt block derived from verified research and creator notes. */
export type AssembledPromptSectionKind =
  | "metadata"
  | "grounding_rules"
  | "ranked_player_data"
  | "ranking_script_rules"
  | "ranking_notes"
  | "fixture"
  | "statistics"
  | "events"
  | "lineups"
  | "verified_facts"
  | "manual_notes"
  | "warnings"
  | "custom";

export interface AssembledPromptSection {
  kind: AssembledPromptSectionKind;
  title: string;
  lines: string[];
  /** Provider-verified content suitable for grounding rules. */
  verified: boolean;
}

/**
 * Structured research context for prompt generation.
 *
 * Direct input to Prompt Intelligence — holds typed facts, rankings, and
 * mode-filtered prompt sections without requiring a Knowledge Graph.
 */
export interface AssembledContext {
  queryId: string;
  topic: string;
  selectedMode: ScriptMode;
  intent: IntentAnalysis;
  entities: IntelligenceEntity[];
  competition?: IntelligenceCompetition;
  season?: number;
  verifiedFacts: IntelligenceFact[];
  rankings: IntelligenceResearchRanking[];
  fixtures: FootballResearchFixture[];
  statistics: FootballResearchStatistic[];
  events: FootballResearchEvent[];
  lineups: FootballResearchLineup[];
  manualNotes?: string;
  warnings: string[];
  confidence: ConfidenceScore;
  provenance: ResearchResultProvenance;
  /** @deprecated Legacy section model — production prompt text uses `assembledContextToPrompt()`. */
  promptSections: AssembledPromptSection[];
  diagnostics: ProviderDiagnosticEntry[];
}
