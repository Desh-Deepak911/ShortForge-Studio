import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";
import type { AssetRequirementType } from "@/features/studio-intelligence/studio-intelligence.types";
import { normalizeNarrationText } from "@/features/studio-intelligence/studio-intelligence.utils";

import type {
  AssetEntity,
  AssetEntityType,
  AssetIntelligenceInput,
  AssetQueryCandidate,
  AssetQueryPriority,
  SceneAssetPlan,
} from "./asset-intelligence.types";
import { resolveSceneEntities } from "./asset-entity-merge.utils";
import {
  buildEntityFocusedQuery,
  polishAssetQuery,
  refineQueryCandidates,
} from "./asset-query-quality.utils";

interface QueryBiasTerm {
  term: string;
  tags: string[];
}

export const ENTITY_QUERY_BIAS: Record<AssetEntityType, QueryBiasTerm[]> = {
  player: [
    { term: "portrait", tags: ["portrait"] },
    { term: "action", tags: ["action"] },
    { term: "celebration", tags: ["celebration"] },
  ],
  club: [
    { term: "badge", tags: ["logo"] },
    { term: "kit", tags: ["kit"] },
    { term: "stadium", tags: ["stadium"] },
  ],
  manager: [
    { term: "touchline", tags: ["manager"] },
    { term: "press conference", tags: ["manager"] },
  ],
  tournament: [
    { term: "trophy", tags: ["tournament"] },
    { term: "logo", tags: ["branding"] },
    { term: "branding", tags: ["branding"] },
  ],
  country: [
    { term: "flag", tags: ["country"] },
    { term: "kit", tags: ["kit"] },
    { term: "anthem moment", tags: ["country"] },
  ],
  national_team: [
    { term: "flag", tags: ["national_team"] },
    { term: "kit", tags: ["kit"] },
    { term: "anthem moment", tags: ["national_team"] },
  ],
  tactic: [
    { term: "tactical board", tags: ["tactic"] },
    { term: "formation graphic", tags: ["tactic"] },
  ],
  season: [
    { term: "archive", tags: ["archive"] },
    { term: "season highlights", tags: ["archive"] },
  ],
  award: [
    { term: "trophy ceremony", tags: ["award"] },
    { term: "podium", tags: ["award"] },
  ],
  match: [
    { term: "highlight", tags: ["match"] },
    { term: "scoreboard", tags: ["match"] },
  ],
  generic_topic: [{ term: "football highlights", tags: ["broll"] }],
};

const ROLE_VISUAL_TERMS: Record<string, string[]> = {
  intro: ["hook opener", "close up"],
  evidence: ["stats overlay", "performance data"],
  conflict: ["debate split screen", "comparison"],
  payoff: ["legacy moment", "emotional celebration"],
  ending: ["legacy moment", "emotional celebration"],
  climax: ["decisive moment", "match highlight"],
  cta: ["subscribe call to action"],
  context: ["football b-roll", "context"],
  transition: ["football b-roll"],
};

function resolveLegacySearchQuery(scene: BlueprintMappedScene): string | undefined {
  const query = scene.assetSearchQuery?.trim() || scene.mediaHints.searchQuery?.trim();
  return query || undefined;
}

function createCandidate(input: {
  query: string;
  priority: AssetQueryPriority;
  rationale: string;
  confidence: AssetQueryCandidate["confidence"];
  entityIds: string[];
  scene: BlueprintMappedScene;
  tags: string[];
}): AssetQueryCandidate | null {
  const query = polishAssetQuery(input.query);
  if (!query) {
    return null;
  }

  return {
    query,
    priority: input.priority,
    rationale: input.rationale,
    confidence: input.confidence,
    entityIds: input.entityIds,
    visualIntent: input.scene.visualIntentType,
    semanticRole: input.scene.semanticRole,
    orientation: input.scene.mediaHints.preferredOrientation,
    expectedAssetTypes: [input.scene.mediaHints.assetRequirementType],
    tags: input.tags,
  };
}

function resolveCandidateConfidence(
  entity: AssetEntity,
  priority: AssetQueryPriority,
): AssetQueryCandidate["confidence"] {
  if (entity.confidence === "high" && priority === "primary") {
    return "high";
  }

  if (entity.confidence === "low" || priority === "exploratory") {
    return "low";
  }

  return "medium";
}

function buildEntityCandidates(
  scene: BlueprintMappedScene,
  sceneEntities: AssetEntity[],
  topic: string,
): AssetQueryCandidate[] {
  const candidates: AssetQueryCandidate[] = [];
  const seenQueries = new Set<string>();

  const pushCandidate = (candidate: AssetQueryCandidate | null) => {
    if (!candidate || seenQueries.has(candidate.query)) {
      return;
    }
    seenQueries.add(candidate.query);
    candidates.push(candidate);
  };

  for (const entity of sceneEntities) {
    const biasTerms = ENTITY_QUERY_BIAS[entity.type] ?? ENTITY_QUERY_BIAS.generic_topic;

    for (const [index, bias] of biasTerms.entries()) {
      if (candidates.length >= 4) {
        break;
      }

      const priority: AssetQueryPriority =
        index === 0 ? "primary" : index === 1 ? "fallback" : "exploratory";

      const contextTerms = [
        scene.visualHints.subject,
        index === 0 ? topic.split(/\s+/).slice(0, 3).join(" ") : undefined,
      ].filter((term): term is string => Boolean(term));

      pushCandidate(
        createCandidate({
          query: buildEntityFocusedQuery(entity, bias.term, contextTerms),
          priority,
          rationale: `${entity.type} bias: ${bias.term}`,
          confidence: resolveCandidateConfidence(entity, priority),
          entityIds: [entity.id],
          scene,
          tags: [...bias.tags, entity.type],
        }),
      );
    }
  }

  const roleTerms = ROLE_VISUAL_TERMS[scene.blueprintRole] ?? ROLE_VISUAL_TERMS.context;
  for (const roleTerm of roleTerms) {
    if (candidates.length >= 4) {
      break;
    }

    const anchorEntity = sceneEntities[0];
    if (!anchorEntity) {
      continue;
    }

    pushCandidate(
      createCandidate({
        query: buildEntityFocusedQuery(anchorEntity, roleTerm, [
          scene.visualIntentType.replace(/_/g, " "),
        ]),
        priority: "exploratory",
        rationale: `role visual bias: ${roleTerm}`,
        confidence: "medium",
        entityIds: sceneEntities.map((entity) => entity.id),
        scene,
        tags: ["role", scene.blueprintRole],
      }),
    );
  }

  if (candidates.length < 2 && sceneEntities[0]) {
    pushCandidate(
      createCandidate({
        query: buildEntityFocusedQuery(sceneEntities[0], "football highlights", [
          scene.title,
          topic.split(/\s+/).slice(0, 2).join(" "),
        ]),
        priority: "fallback",
        rationale: "entity-anchored scene fallback",
        confidence: "medium",
        entityIds: sceneEntities.map((entity) => entity.id),
        scene,
        tags: ["fallback"],
      }),
    );
  }

  return refineQueryCandidates(candidates.slice(0, 4), sceneEntities);
}

function buildSceneText(scene: BlueprintMappedScene): string {
  return [
    scene.title,
    scene.narrationExcerpt,
    scene.visualHints.subject,
    scene.captionText,
    scene.semanticSlotLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

function resolveGlobalPrimaryEntityIds(entities: AssetEntity[]): string[] {
  const priorityTypes: AssetEntityType[] = [
    "player",
    "award",
    "tournament",
    "club",
    "manager",
    "match",
    "national_team",
    "country",
  ];

  const selected: string[] = [];

  for (const type of priorityTypes) {
    const match = entities.find((entity) => entity.type === type);
    if (match) {
      selected.push(match.id);
    }
  }

  if (selected.length === 0 && entities.length > 0) {
    selected.push(entities[0].id);
  }

  return selected.slice(0, 3);
}

function buildDiversityKey(sceneEntities: AssetEntity[], scene: BlueprintMappedScene): string {
  const primary = sceneEntities[0];
  if (!primary) {
    return `${scene.visualIntentType}:${scene.blueprintRole}`;
  }

  return `${primary.type}:${normalizeAssetSearchQuery(primary.name)}:${scene.visualIntentType}`;
}

/** Builds per-scene asset query plans from mapped scenes and merged entities. */
export function buildSceneAssetPlans(
  input: AssetIntelligenceInput,
  entities: AssetEntity[],
  mappedScenes: BlueprintMappedScene[],
): SceneAssetPlan[] {
  const topic = normalizeNarrationText(input.topic);
  const globalPrimaryEntityIds = resolveGlobalPrimaryEntityIds(entities);

  return mappedScenes.map((scene, sceneIndex) => {
    const sceneText = buildSceneText(scene);
    const sceneEntities = resolveSceneEntities(entities, sceneText, globalPrimaryEntityIds);
    const legacySearchQuery = resolveLegacySearchQuery(scene);
    const isPlaceholder = scene.mediaHints.assetRequirementType === "placeholder";

    const candidates = isPlaceholder
      ? []
      : buildEntityCandidates(scene, sceneEntities, topic);

    const planningNotes: string[] = [];
    if (legacySearchQuery) {
      planningNotes.push(`legacy SI query preserved: "${legacySearchQuery}"`);
    }
    if (sceneEntities.length === 0) {
      planningNotes.push("no scene-specific entities matched; used global fallbacks");
    }

    return {
      sceneId: scene.id,
      sceneIndex,
      blueprintId: scene.sourceBlueprintId,
      semanticRole: scene.semanticRole,
      semanticSlotLabel: scene.semanticSlotLabel,
      assetRequirementType: scene.mediaHints.assetRequirementType,
      legacySearchQuery,
      candidates,
      primaryEntityIds: sceneEntities.map((entity) => entity.id),
      diversityKey: buildDiversityKey(sceneEntities, scene),
      planningNotes: planningNotes.length > 0 ? planningNotes : undefined,
    };
  });
}

/** Returns whether a scene requires asset query candidates. */
export function sceneRequiresAssetCandidates(
  assetRequirementType: AssetRequirementType,
): boolean {
  return assetRequirementType !== "placeholder";
}
