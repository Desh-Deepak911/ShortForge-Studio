import type { EntityCandidate, EntityType, ResolvedEntity } from "@/features/intelligence/entities/entity-types";
import { extractEntityCandidates } from "@/features/intelligence/entities/entity-extractor";
import { normalizeEntityName } from "@/features/intelligence/entities/entity-utils";
import { normalizeNarrationText } from "@/features/studio-intelligence/studio-intelligence.utils";

import type {
  AssetEntity,
  AssetEntityConfidence,
  AssetEntitySource,
  AssetEntitySummaryInput,
  AssetEntityType,
  AssetIntelligenceInput,
  AssetSceneTextInput,
} from "./asset-intelligence.types";

const AWARD_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bgolden boot\b/i, label: "Golden Boot" },
  { pattern: /\bballon d['']?or\b/i, label: "Ballon d'Or" },
  { pattern: /\buefa player of the year\b/i, label: "UEFA Player of the Year" },
  { pattern: /\bfifa best\b/i, label: "FIFA Best" },
  { pattern: /\bgolden ball\b/i, label: "Golden Ball" },
];

const TACTIC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b4-3-3\b/i, label: "4-3-3 formation" },
  { pattern: /\b4-2-3-1\b/i, label: "4-2-3-1 formation" },
  { pattern: /\b3-5-2\b/i, label: "3-5-2 formation" },
  { pattern: /\blow block\b/i, label: "low block" },
  { pattern: /\bhigh press\b/i, label: "high press" },
  { pattern: /\bgegenpress\b/i, label: "gegenpress" },
  { pattern: /\btactical\b/i, label: "tactical" },
  { pattern: /\bformation\b/i, label: "formation" },
];

const TOURNAMENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bchampions league\b/i, label: "UEFA Champions League" },
  { pattern: /\bpremier league\b/i, label: "Premier League" },
  { pattern: /\bworld cup\b/i, label: "FIFA World Cup" },
  { pattern: /\beuro\b/i, label: "UEFA Euro" },
  { pattern: /\bla liga\b/i, label: "La Liga" },
  { pattern: /\bbundesliga\b/i, label: "Bundesliga" },
];

const NATIONAL_TEAM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bindia\b/i, label: "India" },
  { pattern: /\bpakistan\b/i, label: "Pakistan" },
  { pattern: /\bbrazil\b/i, label: "Brazil" },
  { pattern: /\bargentina\b/i, label: "Argentina" },
  { pattern: /\bengland\b/i, label: "England" },
  { pattern: /\bfrance\b/i, label: "France" },
  { pattern: /\bgermany\b/i, label: "Germany" },
  { pattern: /\bspain\b/i, label: "Spain" },
];

const MANAGER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpep guardiola\b/i, label: "Pep Guardiola" },
  { pattern: /\bjurgen klopp\b/i, label: "Jurgen Klopp" },
  { pattern: /\bcarlo ancelotti\b/i, label: "Carlo Ancelotti" },
];

const FORMATION_PATTERN = /\b\d-\d-\d(?:-\d)?\b/i;

const SCENE_ROLE_NOISE =
  /\b(intro|context|climax|evidence|payoff|ending|transition|this|the|then|numbers|dominated|unreal|while|may|define|every|knockout|stood|podium|lifted|won|carried|scored)\b/i;

interface MergeRecord {
  entity: AssetEntity;
}

function slugify(value: string): string {
  return normalizeEntityName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildEntityId(type: AssetEntityType, name: string): string {
  return `asset-entity:${type}:${slugify(name)}`;
}

function mergeKey(type: AssetEntityType, name: string): string {
  return `${type}:${normalizeEntityName(name)}`;
}

function confidenceFromPercent(percent: number): AssetEntityConfidence {
  if (percent >= 85) {
    return "high";
  }
  if (percent >= 65) {
    return "medium";
  }
  return "low";
}

function mapEntityType(type: EntityType): AssetEntityType {
  switch (type) {
    case "player":
      return "player";
    case "club":
      return "club";
    case "manager":
      return "manager";
    case "competition":
    case "league":
      return "tournament";
    case "country":
      return "country";
    case "national_team":
      return "national_team";
    case "season":
      return "season";
    case "fixture":
      return "match";
    default:
      return "generic_topic";
  }
}

function mapSummaryKind(kind: string): AssetEntityType {
  const normalized = kind.toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "player":
      return "player";
    case "club":
    case "team":
      return "club";
    case "manager":
    case "coach":
      return "manager";
    case "competition":
    case "league":
    case "tournament":
      return "tournament";
    case "country":
      return "country";
    case "national_team":
      return "national_team";
    case "season":
      return "season";
    case "match":
    case "fixture":
      return "match";
    case "award":
      return "award";
    case "tactic":
    case "formation":
      return "tactic";
    default:
      return "generic_topic";
  }
}

function mergeConfidence(
  current: AssetEntityConfidence,
  incoming: AssetEntityConfidence,
): AssetEntityConfidence {
  const rank = { high: 3, medium: 2, low: 1 };
  return rank[incoming] > rank[current] ? incoming : current;
}

function isNoisePlayerEntity(name: string): boolean {
  const normalized = normalizeEntityName(name);
  if (!normalized) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).length;
  if (wordCount === 1 && normalized.length < 4) {
    return true;
  }

  if (SCENE_ROLE_NOISE.test(name)) {
    return true;
  }

  if (/^(ballon|champions|league|trophy|legacy|erling)$/i.test(normalized)) {
    return true;
  }

  return false;
}

function shouldKeepEntity(entity: AssetEntity): boolean {
  if (entity.type !== "player") {
    return true;
  }

  if (entity.source === "input" || entity.source === "research") {
    return !isNoisePlayerEntity(entity.name);
  }

  if (entity.confidence === "high") {
    return !isNoisePlayerEntity(entity.name);
  }

  return !isNoisePlayerEntity(entity.name) && entity.confidence !== "low";
}

function upsertEntity(
  bucket: Map<string, MergeRecord>,
  input: {
    type: AssetEntityType;
    name: string;
    confidence: AssetEntityConfidence;
    source: AssetEntitySource;
    sceneId?: string;
    evidence: string;
    aliases?: string[];
  },
): void {
  const trimmedName = normalizeNarrationText(input.name);
  if (!trimmedName) {
    return;
  }

  if (input.type === "player" && isNoisePlayerEntity(trimmedName)) {
    return;
  }

  const key = mergeKey(input.type, trimmedName);
  const existing = bucket.get(key);
  const aliases = [...new Set([...(input.aliases ?? []), trimmedName].filter(Boolean))];

  if (!existing) {
    bucket.set(key, {
      entity: {
        id: buildEntityId(input.type, trimmedName),
        type: input.type,
        name: trimmedName,
        confidence: input.confidence,
        aliases,
        source: input.source,
        sceneIds: input.sceneId ? [input.sceneId] : [],
        evidence: [input.evidence],
      },
    });
    return;
  }

  existing.entity.confidence = mergeConfidence(existing.entity.confidence, input.confidence);
  existing.entity.aliases = [...new Set([...existing.entity.aliases, ...aliases])];
  existing.entity.evidence = [...new Set([...existing.entity.evidence, input.evidence])];

  if (input.sceneId && !existing.entity.sceneIds.includes(input.sceneId)) {
    existing.entity.sceneIds.push(input.sceneId);
  }
}

function ingestEntityCandidate(
  bucket: Map<string, MergeRecord>,
  candidate: EntityCandidate | ResolvedEntity,
  source: AssetEntitySource,
  sceneId?: string,
): void {
  const matchedPhrase =
    "matchedPhrase" in candidate ? candidate.matchedPhrase : undefined;

  upsertEntity(bucket, {
    type: mapEntityType(candidate.type),
    name: candidate.displayName || candidate.name,
    confidence: confidenceFromPercent(candidate.confidence.percent),
    source,
    sceneId,
    evidence: matchedPhrase
      ? `matched "${matchedPhrase}"`
      : `extracted ${candidate.type}`,
    aliases: candidate.aliases,
  });
}

function ingestHeuristicPatterns(
  bucket: Map<string, MergeRecord>,
  text: string,
  source: AssetEntitySource,
  sceneId?: string,
): void {
  const normalized = normalizeNarrationText(text);
  if (!normalized) {
    return;
  }

  for (const award of AWARD_PATTERNS) {
    if (award.pattern.test(normalized)) {
      upsertEntity(bucket, {
        type: "award",
        name: award.label,
        confidence: "high",
        source,
        sceneId,
        evidence: `award pattern ${award.pattern.source}`,
      });
    }
  }

  for (const tournament of TOURNAMENT_PATTERNS) {
    if (tournament.pattern.test(normalized)) {
      upsertEntity(bucket, {
        type: "tournament",
        name: tournament.label,
        confidence: "high",
        source,
        sceneId,
        evidence: `tournament pattern ${tournament.pattern.source}`,
      });
    }
  }

  for (const nationalTeam of NATIONAL_TEAM_PATTERNS) {
    if (nationalTeam.pattern.test(normalized)) {
      upsertEntity(bucket, {
        type: "national_team",
        name: nationalTeam.label,
        confidence: "high",
        source,
        sceneId,
        evidence: `national team pattern ${nationalTeam.pattern.source}`,
      });
    }
  }

  for (const manager of MANAGER_PATTERNS) {
    if (manager.pattern.test(normalized)) {
      upsertEntity(bucket, {
        type: "manager",
        name: manager.label,
        confidence: "high",
        source,
        sceneId,
        evidence: `manager pattern ${manager.pattern.source}`,
      });
    }
  }

  for (const tactic of TACTIC_PATTERNS) {
    if (tactic.pattern.test(normalized)) {
      upsertEntity(bucket, {
        type: "tactic",
        name: tactic.label,
        confidence: "medium",
        source,
        sceneId,
        evidence: `tactic pattern ${tactic.pattern.source}`,
      });
    }
  }

  const formationMatch = normalized.match(FORMATION_PATTERN);
  if (formationMatch) {
    upsertEntity(bucket, {
      type: "tactic",
      name: `${formationMatch[0]} formation`,
      confidence: "high",
      source,
      sceneId,
      evidence: `formation ${formationMatch[0]}`,
    });
  }
}

function ingestGlobalTextScan(
  bucket: Map<string, MergeRecord>,
  text: string,
  source: AssetEntitySource,
): void {
  const normalized = normalizeNarrationText(text);
  if (!normalized) {
    return;
  }

  for (const candidate of extractEntityCandidates(normalized)) {
    ingestEntityCandidate(bucket, candidate, source);
  }

  ingestHeuristicPatterns(bucket, normalized, source);
}

function tagExistingEntitiesInSceneText(
  bucket: Map<string, MergeRecord>,
  text: string,
  sceneId: string,
): void {
  const normalizedScene = normalizeEntityName(text);
  if (!normalizedScene) {
    return;
  }

  for (const record of bucket.values()) {
    const names = [record.entity.name, ...record.entity.aliases].map((name) =>
      normalizeEntityName(name),
    );

    const matched = names.some((name) => name.length >= 4 && normalizedScene.includes(name));
    if (matched && !record.entity.sceneIds.includes(sceneId)) {
      record.entity.sceneIds.push(sceneId);
      record.entity.evidence.push(`scene text match in ${sceneId}`);
    }
  }
}

function ingestSceneScopedText(
  bucket: Map<string, MergeRecord>,
  text: string,
  source: AssetEntitySource,
  sceneId: string,
): void {
  ingestHeuristicPatterns(bucket, text, source, sceneId);
  tagExistingEntitiesInSceneText(bucket, text, sceneId);
}

function inferInputEntityType(name: string): AssetEntityType | undefined {
  if (AWARD_PATTERNS.some((pattern) => pattern.pattern.test(name))) {
    return "award";
  }

  if (TOURNAMENT_PATTERNS.some((pattern) => pattern.pattern.test(name))) {
    return "tournament";
  }

  if (NATIONAL_TEAM_PATTERNS.some((pattern) => pattern.pattern.test(name))) {
    return "national_team";
  }

  if (MANAGER_PATTERNS.some((pattern) => pattern.pattern.test(name))) {
    return "manager";
  }

  return undefined;
}

function ingestSummaries(
  bucket: Map<string, MergeRecord>,
  summaries: AssetEntitySummaryInput[],
): void {
  for (const summary of summaries) {
    upsertEntity(bucket, {
      type: mapSummaryKind(summary.kind),
      name: summary.name,
      confidence: "high",
      source: "research",
      evidence: `entity summary kind=${summary.kind}`,
    });
  }
}

function ingestInputEntities(
  bucket: Map<string, MergeRecord>,
  entities: string[],
): void {
  for (const entity of entities) {
    const normalized = normalizeNarrationText(entity);
    if (!normalized) {
      continue;
    }

    const inferredType = inferInputEntityType(normalized);
    if (inferredType) {
      upsertEntity(bucket, {
        type: inferredType,
        name: normalized,
        confidence: "high",
        source: "input",
        evidence: "creator-provided typed entity string",
      });
      continue;
    }

    const candidates = extractEntityCandidates(normalized);
    if (candidates.length > 0) {
      for (const candidate of candidates) {
        ingestEntityCandidate(bucket, candidate, "input");
      }
      continue;
    }

    upsertEntity(bucket, {
      type: "player",
      name: normalized,
      confidence: "high",
      source: "input",
      evidence: "creator-provided entity string",
    });
  }
}

function ingestSceneTexts(
  bucket: Map<string, MergeRecord>,
  sceneTexts: AssetSceneTextInput[],
): void {
  for (const scene of sceneTexts) {
    const combined = [scene.title, scene.summary, scene.narration, scene.caption]
      .filter(Boolean)
      .join(" ");

    ingestSceneScopedText(bucket, combined, "narration", scene.sceneId);
  }
}

function ingestBlueprintSummaries(
  bucket: Map<string, MergeRecord>,
  input: AssetIntelligenceInput,
): void {
  const blueprints = input.studioIntelligence?.sceneBlueprintCollection.blueprints ?? [];

  for (const blueprint of blueprints) {
    const combined = [blueprint.summary, blueprint.visual.subject].filter(Boolean).join(" ");
    ingestSceneScopedText(bucket, combined, "blueprint", blueprint.id);
  }
}

function ingestMappedScenes(
  bucket: Map<string, MergeRecord>,
  input: AssetIntelligenceInput,
): void {
  for (const scene of input.mappedScenes ?? []) {
    const combined = [
      scene.title,
      scene.narrationExcerpt,
      scene.visualHints.subject,
      scene.captionText,
    ]
      .filter(Boolean)
      .join(" ");

    ingestSceneScopedText(bucket, combined, "mapped_scene", scene.id);
  }
}

/** Merges entity sources into deduplicated asset entities. */
export function mergeAssetEntities(input: AssetIntelligenceInput): AssetEntity[] {
  const bucket = new Map<string, MergeRecord>();

  ingestGlobalTextScan(bucket, input.topic, "extractor");

  if (input.studioIntelligence?.normalizedNarration) {
    ingestGlobalTextScan(bucket, input.studioIntelligence.normalizedNarration, "narration");
  }

  if (input.entitySummaries?.length) {
    ingestSummaries(bucket, input.entitySummaries);
  }

  if (input.inputEntities?.length) {
    ingestInputEntities(bucket, input.inputEntities);
  }

  for (const candidate of input.entityResolution?.candidates ?? []) {
    ingestEntityCandidate(bucket, candidate, "extractor");
  }

  for (const resolved of input.entityResolution?.resolved ?? []) {
    ingestEntityCandidate(bucket, resolved, "research");
  }

  ingestBlueprintSummaries(bucket, input);

  if (input.sceneTexts?.length) {
    ingestSceneTexts(bucket, input.sceneTexts);
  }

  ingestMappedScenes(bucket, input);

  return [...bucket.values()]
    .map((record) => record.entity)
    .filter(shouldKeepEntity)
    .sort((a, b) => {
      const confidenceRank = { high: 3, medium: 2, low: 1 };
      const confidenceDiff = confidenceRank[b.confidence] - confidenceRank[a.confidence];
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }
      return a.name.localeCompare(b.name);
    });
}

/** Returns entities most relevant to a scene based on text overlap. */
export function resolveSceneEntities(
  entities: AssetEntity[],
  sceneText: string,
  globalEntityIds: string[],
): AssetEntity[] {
  const normalizedScene = normalizeEntityName(sceneText);
  const globalEntities = globalEntityIds
    .map((entityId) => entities.find((entity) => entity.id === entityId))
    .filter((entity): entity is AssetEntity => Boolean(entity));

  if (!normalizedScene) {
    return globalEntities.slice(0, 3);
  }

  const scored = entities
    .map((entity) => {
      const names = [entity.name, ...entity.aliases].map((name) => normalizeEntityName(name));
      const matched = names.some(
        (name) => name.length >= 4 && normalizedScene.includes(name),
      );
      const confidenceRank = { high: 3, medium: 2, low: 1 };
      const globalBoost = globalEntityIds.indexOf(entity.id) >= 0 ? 5 - globalEntityIds.indexOf(entity.id) : 0;
      const score = (matched ? 10 : 0) + confidenceRank[entity.confidence] + globalBoost;
      return { entity, score, matched };
    })
    .filter((entry) => entry.matched || globalEntityIds.includes(entry.entity.id))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return globalEntities.slice(0, 3);
  }

  const primaryPlayer = globalEntities.find((entity) => entity.type === "player");
  const selected = scored.slice(0, 4).map((entry) => entry.entity);

  if (primaryPlayer && !selected.some((entity) => entity.id === primaryPlayer.id)) {
    return [primaryPlayer, ...selected].slice(0, 4);
  }

  return selected;
}
