/** Canonical entity kinds for the intelligence layer. */
export type EntityKind =
  | "player"
  | "club"
  | "national_team"
  | "competition"
  | "season"
  | "match"
  | "venue"
  | "manager"
  | "formation";

/** Resolution status for an entity candidate. */
export type EntityResolutionStatus = "resolved" | "ambiguous" | "unresolved";

/**
 * A football entity inferred or resolved from a creator brief.
 * Canonical model — migrate from research heuristics in later phases.
 */
export interface IntelligenceEntity {
  /** Immutable resolver-owned identity. */
  id: string;
  kind: EntityKind;
  /** Display label as written or normalized from the brief. */
  label: string;
  status: EntityResolutionStatus;
  /** Provider-specific identifier when resolved. */
  externalId?: string | number;
  /** Optional parent entity (e.g. player → club). */
  parentLabel?: string;
  /** Resolver/provider confidence — may increase via enrichment, never identity. */
  confidencePercent?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Matchup sides extracted from topic text before full fixture resolution. */
export interface MatchupEntities {
  homeOrFirst?: IntelligenceEntity;
  awayOrSecond?: IntelligenceEntity;
  rawSides?: string[];
}

/** Output of the entity resolution pipeline. */
export interface EntityResolutionResult {
  entities: IntelligenceEntity[];
  matchup?: MatchupEntities;
  ambiguities?: string[];
}
