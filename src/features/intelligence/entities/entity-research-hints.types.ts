import type { EntityConfidence } from "./entity-types";

/** Slim provider IDs passed into research when confidence thresholds pass. */
export interface EntityResearchHints {
  player?: {
    id: number;
    name: string;
  };
  teams?: Array<{
    id: number;
    name: string;
    type: "club" | "national_team";
  }>;
  competition?: {
    leagueId: number;
    label: string;
    competitionKey?: string;
  };
  season?: number;
  fixture?: {
    label: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamId?: number;
    awayTeamId?: number;
  };
}

/** Resolved entity field for Research Preview display and research routing. */
export interface ResolvedEntityPreviewField {
  value: string;
  externalId?: number;
  confidence: EntityConfidence;
  source: "api-football" | "inferred";
  ambiguous?: boolean;
  /** True when this ID is passed into research (high-confidence provider match). */
  usedForResearch: boolean;
  reasoning?: string;
}

/** Full resolved-entity payload from `/api/resolve-entities` for research preview. */
export interface ResolvedEntitiesPayload {
  topic: string;
  warnings: string[];
  ambiguities: string[];
  player?: ResolvedEntityPreviewField;
  competition?: ResolvedEntityPreviewField & { leagueId?: number };
  season?: ResolvedEntityPreviewField & { year?: number };
  teams: Array<ResolvedEntityPreviewField & { type?: "club" | "national_team" }>;
  fixture?: {
    label: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamId?: number;
    awayTeamId?: number;
  };
  /** High-confidence subset used by research when available. */
  researchHints?: EntityResearchHints;
}
