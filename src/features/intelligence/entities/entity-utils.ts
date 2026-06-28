import type { IntelligenceProviderId } from "../shared/provider.types";

import type {
  EntityCandidate,
  EntityConfidence,
  EntityMetadata,
  EntityProvider,
  EntityResolution,
  EntityType,
  ResolvedEntity,
} from "./entity-types";
import { ENTITY_TYPES } from "./entity-types";

const DEFAULT_CONFIDENCE: EntityConfidence = {
  tier: "low",
  percent: 0,
};

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && ENTITY_TYPES.includes(value as EntityType);
}

export function normalizeEntityText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEntityName(value: string): string {
  return normalizeEntityText(value).toLowerCase();
}

export function buildEntityCacheKey(type: EntityType, name: string): string {
  return `${type}:${normalizeEntityName(name)}`;
}

export function createEntityConfidence(
  partial: Partial<EntityConfidence> & Pick<EntityConfidence, "tier" | "percent">,
): EntityConfidence {
  return {
    tier: partial.tier,
    percent: partial.percent,
    ...(partial.reasoning ? { reasoning: partial.reasoning } : {}),
  };
}

export function createEntityCandidate(input: {
  id: string;
  name: string;
  displayName: string;
  type: EntityType;
  provider?: EntityProvider;
  aliases?: string[];
  confidence?: EntityConfidence;
  metadata?: EntityMetadata;
  externalId?: string | number;
  matchedPhrase?: string;
}): EntityCandidate {
  return {
    id: input.id,
    name: input.name,
    displayName: input.displayName,
    type: input.type,
    aliases: input.aliases ?? [],
    confidence: input.confidence ?? DEFAULT_CONFIDENCE,
    provider: input.provider ?? "inferred",
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.externalId != null ? { externalId: input.externalId } : {}),
    ...(input.matchedPhrase ? { matchedPhrase: input.matchedPhrase } : {}),
  };
}

export function createResolvedEntity(input: {
  id: string;
  name: string;
  displayName: string;
  type: EntityType;
  provider: EntityProvider | IntelligenceProviderId;
  aliases?: string[];
  confidence: EntityConfidence;
  metadata?: EntityMetadata;
  externalId?: string | number;
  parentId?: string;
}): ResolvedEntity {
  return {
    id: input.id,
    name: input.name,
    displayName: input.displayName,
    type: input.type,
    aliases: input.aliases ?? [],
    confidence: input.confidence,
    provider: input.provider,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.externalId != null ? { externalId: input.externalId } : {}),
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
}

export function createEmptyEntityResolution(topic: string): EntityResolution {
  return {
    topic,
    normalizedText: normalizeEntityText(topic),
    resolved: [],
    candidates: [],
    ambiguities: [],
  };
}

export function mergeEntityResolutionText(topic: string, manualContext?: string): string {
  const normalizedTopic = normalizeEntityText(topic);
  const normalizedContext = manualContext ? normalizeEntityText(manualContext) : "";

  if (!normalizedContext) {
    return normalizedTopic;
  }

  if (!normalizedTopic) {
    return normalizedContext;
  }

  return `${normalizedTopic} ${normalizedContext}`;
}

export function formatEntityTypeLabel(type: EntityType): string {
  switch (type) {
    case "national_team":
      return "National Team";
    case "player":
      return "Player";
    case "club":
      return "Club";
    case "competition":
      return "Competition";
    case "league":
      return "League";
    case "fixture":
      return "Fixture";
    case "manager":
      return "Manager";
    case "stadium":
      return "Stadium";
    case "country":
      return "Country";
    case "season":
      return "Season";
    default:
      return type;
  }
}
