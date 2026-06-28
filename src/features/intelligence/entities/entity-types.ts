import type { IntelligenceProviderId } from "../shared/provider.types";

/** Supported football entity types for resolution. */
export type EntityType =
  | "player"
  | "club"
  | "national_team"
  | "competition"
  | "league"
  | "fixture"
  | "manager"
  | "stadium"
  | "country"
  | "season";

export const ENTITY_TYPES: EntityType[] = [
  "player",
  "club",
  "national_team",
  "competition",
  "league",
  "fixture",
  "manager",
  "stadium",
  "country",
  "season",
];

/** Confidence attached to an entity candidate or resolution. */
export interface EntityConfidence {
  tier: "high" | "medium" | "low";
  /** Display-friendly score (0–100). */
  percent: number;
  reasoning?: string;
}

/** Provider that supplied or confirmed an entity match. */
export type EntityProvider = IntelligenceProviderId | "inferred" | "manual";

export type EntityMetadata = Record<string, string | number | boolean | null>;

/**
 * Base fields shared by resolved entities and resolution candidates.
 * Canonical entity shape for Phase 2+ pipelines.
 */
export interface EntityRecord {
  /** Stable intelligence-layer ID (may differ from provider external ID). */
  id: string;
  /** Normalized canonical name. */
  name: string;
  /** Creator-facing display label. */
  displayName: string;
  type: EntityType;
  /** Alternate spellings, nicknames, or provider labels. */
  aliases: string[];
  confidence: EntityConfidence;
  provider: EntityProvider;
  metadata?: EntityMetadata;
}

/** A candidate match before disambiguation or provider lookup. */
export interface EntityCandidate extends EntityRecord {
  /** Provider external ID when known pre-resolution. */
  externalId?: string | number;
  /** Raw phrase from the brief that produced this candidate. */
  matchedPhrase?: string;
}

/** A fully resolved entity ready for research and context assembly. */
export interface ResolvedEntity extends EntityRecord {
  externalId?: string | number;
  /** Parent entity ID (e.g. player → club). */
  parentId?: string;
}

/** Full output of the entity resolver for a brief. */
export interface EntityResolution {
  topic: string;
  resolved: ResolvedEntity[];
  candidates: EntityCandidate[];
  ambiguities: string[];
  /** Normalized text used for extraction. */
  normalizedText: string;
}

export interface EntityResolverInput {
  topic: string;
  manualContext?: string;
  /** Optional script mode — steers club vs player extraction heuristics. */
  mode?: import("@/types/footiebitz").ScriptMode;
}
