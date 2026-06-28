import "server-only";

import type { AssembledContext } from "../context/assembled-context.types";
import type { IntelligenceResearchRanking } from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";
import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";

import type { KnowledgeEdge } from "./knowledge-edge.types";
import type { KnowledgeFact } from "./knowledge-fact.types";
import type { KnowledgeGraph } from "./knowledge-graph.types";
import type { KnowledgeNode, KnowledgeNodeType } from "./knowledge-node.types";
import type { KnowledgeProvenance } from "./knowledge-provenance.types";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function mapGraphProvenance(assembled: AssembledContext): KnowledgeProvenance {
  return {
    source: assembled.provenance.source,
    fetchedAt: assembled.provenance.fetchedAt,
    operations: assembled.provenance.operations ? [...assembled.provenance.operations] : undefined,
  };
}

function mapFactProvenance(fact: IntelligenceFact): KnowledgeProvenance {
  return {
    source: fact.provenance.source,
    fetchedAt: fact.provenance.fetchedAt,
    metadata:
      fact.provenance.entityLabels && fact.provenance.entityLabels.length > 0
        ? { entityLabels: fact.provenance.entityLabels.join(", ") }
        : undefined,
  };
}

function resolveFactSourceProviderId(
  fact: IntelligenceFact,
): KnowledgeFact["sourceProviderId"] {
  const source = fact.provenance.source;
  if (source === "inferred" || source === "user") {
    return source;
  }
  return source;
}

function confidenceFromPercent(
  percent: number | undefined,
  fallback: ConfidenceScore,
  reasoning?: string,
): ConfidenceScore {
  if (percent == null) {
    return fallback;
  }

  return {
    tier: percent >= fallback.percent ? fallback.tier : percent >= 68 ? "medium" : "low",
    percent,
    reasoning,
  };
}

function entityConfidence(
  entity: IntelligenceEntity,
  fallback: ConfidenceScore,
): ConfidenceScore {
  return confidenceFromPercent(entity.confidencePercent, fallback, "Entity resolution confidence.");
}

function factConfidence(fact: IntelligenceFact, fallback: ConfidenceScore): ConfidenceScore {
  return confidenceFromPercent(
    fact.confidencePercent,
    fallback,
    "Verified fact confidence.",
  );
}

function resolveEntityNodeType(kind: IntelligenceEntity["kind"]): KnowledgeNodeType {
  if (
    kind === "player" ||
    kind === "club" ||
    kind === "national_team" ||
    kind === "competition" ||
    kind === "season" ||
    kind === "match" ||
    kind === "venue" ||
    kind === "manager" ||
    kind === "formation"
  ) {
    return kind;
  }

  return "entity";
}

interface GraphBuilder {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  facts: KnowledgeFact[];
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  factIds: Set<string>;
  assemblyProvenance: KnowledgeProvenance;
  graphConfidence: ConfidenceScore;
}

function createBuilder(assembled: AssembledContext): GraphBuilder {
  return {
    nodes: [],
    edges: [],
    facts: [],
    nodeIds: new Set<string>(),
    edgeIds: new Set<string>(),
    factIds: new Set<string>(),
    assemblyProvenance: mapGraphProvenance(assembled),
    graphConfidence: assembled.confidence,
  };
}

function addNode(builder: GraphBuilder, node: KnowledgeNode): void {
  if (builder.nodeIds.has(node.id)) {
    return;
  }

  builder.nodeIds.add(node.id);
  builder.nodes.push(node);
}

function addEdge(
  builder: GraphBuilder,
  input: Omit<KnowledgeEdge, "id" | "confidence" | "provenance"> & {
    id?: string;
    confidence?: ConfidenceScore;
    provenance?: KnowledgeProvenance;
  },
): void {
  const id =
    input.id ??
    `edge:${input.sourceNodeId}:${input.type}:${input.targetNodeId}`;
  if (builder.edgeIds.has(id)) {
    return;
  }

  builder.edgeIds.add(id);
  builder.edges.push({
    id,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    type: input.type,
    label: input.label,
    confidence: input.confidence ?? builder.graphConfidence,
    provenance: input.provenance ?? builder.assemblyProvenance,
  });
}

function addFact(builder: GraphBuilder, fact: KnowledgeFact): void {
  if (builder.factIds.has(fact.id)) {
    return;
  }

  builder.factIds.add(fact.id);
  builder.facts.push(fact);
}

function resolveEntityNodeId(
  entities: IntelligenceEntity[],
  label: string,
  entityId?: string | number,
): string | undefined {
  if (typeof entityId === "string") {
    const byId = entities.find((entity) => entity.id === entityId);
    if (byId) {
      return byId.id;
    }
  }

  const byLabel = entities.find(
    (entity) => entity.label.toLowerCase() === label.toLowerCase(),
  );
  return byLabel?.id;
}

function ensureTeamNode(builder: GraphBuilder, teamName: string): string {
  const matchedEntity = builder.nodes.find(
    (node) => node.label.toLowerCase() === teamName.toLowerCase(),
  );
  if (matchedEntity) {
    return matchedEntity.id;
  }

  const nodeId = `team:${slug(teamName)}`;
  addNode(builder, {
    id: nodeId,
    type: "club",
    label: teamName,
    aliases: [],
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
  });

  return nodeId;
}

function convertVerifiedFact(
  builder: GraphBuilder,
  fact: IntelligenceFact,
  subjectNodeId?: string,
): void {
  addFact(builder, {
    id: fact.id,
    text: fact.text,
    type: "reference",
    subjectNodeId,
    confidence: factConfidence(fact, builder.graphConfidence),
    provenance: mapFactProvenance(fact),
    sourceProviderId: resolveFactSourceProviderId(fact),
  });
}

function addRankingFacts(
  builder: GraphBuilder,
  queryNodeId: string,
  ranking: IntelligenceResearchRanking,
  rankingIndex: number,
  entities: IntelligenceEntity[],
): void {
  const rankingNodeId = `ranking:${rankingIndex}:${ranking.metric}`;
  addNode(builder, {
    id: rankingNodeId,
    type: "ranking",
    label: `${ranking.metric} (top ${ranking.limit})`,
    aliases: [],
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
  });
  addEdge(builder, {
    sourceNodeId: queryNodeId,
    targetNodeId: rankingNodeId,
    type: "includes_ranking",
    label: "includes ranking",
  });

  for (const entry of ranking.entries) {
    const entryNodeId = `ranking-entry:${rankingNodeId}:${entry.rank}`;
    addNode(builder, {
      id: entryNodeId,
      type: "ranking_entry",
      label: entry.label,
      aliases: [],
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
      entityRef:
        entry.entityId != null
          ? {
              externalId: entry.entityId,
              label: entry.label,
            }
          : undefined,
    });
    addEdge(builder, {
      sourceNodeId: rankingNodeId,
      targetNodeId: entryNodeId,
      type: "ranked_at",
      label: `rank ${entry.rank}`,
    });

    const entityNodeId = resolveEntityNodeId(entities, entry.label, entry.entityId);
    if (entityNodeId) {
      addEdge(builder, {
        sourceNodeId: entryNodeId,
        targetNodeId: entityNodeId,
        type: "identifies_entity",
        label: "identifies entity",
      });
    }

    const metricUnit = ranking.metric === "goals" ? "goals" : ranking.metric;
    addFact(builder, {
      id: `ranking-fact:${rankingNodeId}:${entry.rank}`,
      text: `#${entry.rank} ${entry.label}${entry.value != null ? `: ${entry.value} ${metricUnit}` : ""}`,
      type: "ranking_value",
      subjectNodeId: entryNodeId,
      objectNodeId: entityNodeId,
      value: entry.value ?? null,
      unit: metricUnit,
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
      sourceProviderId: builder.assemblyProvenance.source,
    });
  }
}

function addFixtureGraph(
  builder: GraphBuilder,
  queryNodeId: string,
  fixture: FootballResearchFixture,
): string {
  const fixtureNodeId = `fixture:${fixture.id}`;
  addNode(builder, {
    id: fixtureNodeId,
    type: "fixture",
    label: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    aliases: [fixture.league, fixture.round].filter(Boolean) as string[],
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
  });
  addEdge(builder, {
    sourceNodeId: queryNodeId,
    targetNodeId: fixtureNodeId,
    type: "references_fixture",
    label: "references fixture",
  });

  const homeNodeId = ensureTeamNode(builder, fixture.homeTeam);
  const awayNodeId = ensureTeamNode(builder, fixture.awayTeam);
  addEdge(builder, {
    sourceNodeId: fixtureNodeId,
    targetNodeId: homeNodeId,
    type: "related_to",
    label: "home team",
  });
  addEdge(builder, {
    sourceNodeId: fixtureNodeId,
    targetNodeId: awayNodeId,
    type: "related_to",
    label: "away team",
  });

  addFact(builder, {
    id: `fixture-fact:${fixture.id}:meta`,
    text: `${fixture.homeTeam} vs ${fixture.awayTeam} — ${fixture.league}${fixture.season ? ` (${fixture.season})` : ""}`,
    type: "reference",
    subjectNodeId: fixtureNodeId,
    value: fixture.date,
    unit: "date",
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
    sourceProviderId: builder.assemblyProvenance.source,
  });

  if (fixture.homeGoals != null && fixture.awayGoals != null) {
    addFact(builder, {
      id: `fixture-fact:${fixture.id}:score`,
      text: `Final score: ${fixture.homeTeam} ${fixture.homeGoals}-${fixture.awayGoals} ${fixture.awayTeam}`,
      type: "statistic",
      subjectNodeId: fixtureNodeId,
      value: `${fixture.homeGoals}-${fixture.awayGoals}`,
      unit: "score",
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
      sourceProviderId: builder.assemblyProvenance.source,
    });
  }

  if (fixture.status) {
    addFact(builder, {
      id: `fixture-fact:${fixture.id}:status`,
      text: `Match status: ${fixture.status}`,
      type: "reference",
      subjectNodeId: fixtureNodeId,
      value: fixture.status,
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
      sourceProviderId: builder.assemblyProvenance.source,
    });
  }

  return fixtureNodeId;
}

function addStatisticFact(
  builder: GraphBuilder,
  statistic: FootballResearchStatistic,
  index: number,
  fixtureNodeIds: string[],
): void {
  const teamNodeId = ensureTeamNode(builder, statistic.team);
  const linkedFixtureNodeId = fixtureNodeIds[0];

  addFact(builder, {
    id: `statistic-fact:${index}:${slug(statistic.team)}:${slug(statistic.type)}`,
    text: `${statistic.team} ${statistic.type}: ${statistic.value ?? "n/a"}`,
    type: "statistic",
    subjectNodeId: teamNodeId,
    objectNodeId: linkedFixtureNodeId,
    value: statistic.value,
    unit: statistic.type,
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
    sourceProviderId: builder.assemblyProvenance.source,
  });

  if (linkedFixtureNodeId) {
    addEdge(builder, {
      sourceNodeId: linkedFixtureNodeId,
      targetNodeId: teamNodeId,
      type: "related_to",
      label: "team statistic",
    });
  }
}

function addEventFact(
  builder: GraphBuilder,
  event: FootballResearchEvent,
  index: number,
  fixtureNodeIds: string[],
): void {
  const teamNodeId = ensureTeamNode(builder, event.team);
  const minuteLabel =
    event.minute != null
      ? `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ""}'`
      : "unknown minute";
  const playerLabel = event.player
    ? event.assist
      ? `${event.player} (assist: ${event.assist})`
      : event.player
    : "";
  const detail = event.detail ? ` — ${event.detail}` : "";

  addFact(builder, {
    id: `event-fact:${index}:${slug(event.team)}:${event.minute ?? "na"}`,
    text: `${minuteLabel} ${event.team}${playerLabel ? `: ${playerLabel}` : ""} (${event.type ?? "event"})${detail}`,
    type: "event",
    subjectNodeId: teamNodeId,
    objectNodeId: fixtureNodeIds[0],
    value: event.minute ?? null,
    unit: "minute",
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
    sourceProviderId: builder.assemblyProvenance.source,
  });
}

/**
 * Builds the canonical knowledge graph from assembled research context.
 *
 * Structured facts preserve typed values and provenance — not plain-string flattening.
 * Prompt generation does not consume this yet.
 */
export function buildKnowledgeGraphFromAssembledContext(
  assembled: AssembledContext,
): KnowledgeGraph {
  const builder = createBuilder(assembled);
  const queryNodeId = `query:${assembled.queryId}`;

  addNode(builder, {
    id: queryNodeId,
    type: "query",
    label: assembled.topic,
    aliases: [],
    confidence: builder.graphConfidence,
    provenance: builder.assemblyProvenance,
  });

  const intentNodeId = `intent:${assembled.intent.intent}`;
  addNode(builder, {
    id: intentNodeId,
    type: "intent",
    label: assembled.intent.intent,
    aliases: assembled.intent.subIntent ? [assembled.intent.subIntent] : [],
    confidence: confidenceFromPercent(
      assembled.intent.confidencePercent,
      builder.graphConfidence,
      assembled.intent.reasoning,
    ),
    provenance: builder.assemblyProvenance,
  });
  addEdge(builder, {
    sourceNodeId: queryNodeId,
    targetNodeId: intentNodeId,
    type: "classified_as",
    label: "classified intent",
  });

  for (const entity of assembled.entities) {
    addNode(builder, {
      id: entity.id,
      type: resolveEntityNodeType(entity.kind),
      label: entity.label,
      aliases: entity.parentLabel ? [entity.parentLabel] : [],
      entityRef: {
        entityId: entity.id,
        kind: entity.kind,
        externalId: entity.externalId,
        label: entity.label,
      },
      confidence: entityConfidence(entity, builder.graphConfidence),
      provenance: builder.assemblyProvenance,
    });
    addEdge(builder, {
      sourceNodeId: queryNodeId,
      targetNodeId: entity.id,
      type: "mentions_entity",
      label: "mentions entity",
    });

    if (entity.parentLabel) {
      const parentId = `entity-parent:${slug(entity.parentLabel)}`;
      addNode(builder, {
        id: parentId,
        type: entity.kind === "player" ? "club" : "competition",
        label: entity.parentLabel,
        aliases: [],
        confidence: builder.graphConfidence,
        provenance: builder.assemblyProvenance,
      });
      addEdge(builder, {
        sourceNodeId: entity.id,
        targetNodeId: parentId,
        type: "associated_with",
        label: "associated with",
      });
    }
  }

  if (assembled.competition) {
    const competitionId = `competition:${assembled.competition.scope}`;
    addNode(builder, {
      id: competitionId,
      type: "competition",
      label: assembled.competition.label,
      aliases: [],
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
    });
    addEdge(builder, {
      sourceNodeId: queryNodeId,
      targetNodeId: competitionId,
      type: "scoped_to_competition",
      label: "scoped to competition",
    });
  }

  if (assembled.season != null) {
    const seasonId = `season:${assembled.season}`;
    addNode(builder, {
      id: seasonId,
      type: "season",
      label: String(assembled.season),
      aliases: [],
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
    });
    addEdge(builder, {
      sourceNodeId: queryNodeId,
      targetNodeId: seasonId,
      type: "scoped_to_season",
      label: "scoped to season",
    });
  }

  const fixtureNodeIds = assembled.fixtures.map((fixture) =>
    addFixtureGraph(builder, queryNodeId, fixture),
  );

  for (const [rankingIndex, ranking] of assembled.rankings.entries()) {
    addRankingFacts(builder, queryNodeId, ranking, rankingIndex, assembled.entities);
  }

  for (const [index, statistic] of assembled.statistics.entries()) {
    addStatisticFact(builder, statistic, index, fixtureNodeIds);
  }

  for (const [index, event] of assembled.events.entries()) {
    addEventFact(builder, event, index, fixtureNodeIds);
  }

  for (const fact of assembled.verifiedFacts) {
    const subjectNodeId =
      fact.provenance.entityLabels
        ?.map((label) => resolveEntityNodeId(assembled.entities, label))
        .find(Boolean) ?? queryNodeId;

    convertVerifiedFact(builder, fact, subjectNodeId);
  }

  if (assembled.manualNotes?.trim()) {
    addFact(builder, {
      id: `manual-note:${assembled.queryId}`,
      text: assembled.manualNotes.trim(),
      type: "manual_note",
      subjectNodeId: queryNodeId,
      confidence: builder.graphConfidence,
      provenance: {
        source: "user",
        fetchedAt: builder.assemblyProvenance.fetchedAt,
      },
      sourceProviderId: "user",
    });
  }

  for (const [index, warning] of assembled.warnings.entries()) {
    const warningNodeId = `warning:${index}:${slug(warning).slice(0, 48) || "unknown"}`;
    addNode(builder, {
      id: warningNodeId,
      type: "warning",
      label: warning,
      aliases: [],
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
    });
    addEdge(builder, {
      sourceNodeId: queryNodeId,
      targetNodeId: warningNodeId,
      type: "has_warning",
      label: "has warning",
    });
    addFact(builder, {
      id: `warning-fact:${index}`,
      text: warning,
      type: "warning",
      subjectNodeId: warningNodeId,
      confidence: builder.graphConfidence,
      provenance: builder.assemblyProvenance,
      sourceProviderId: builder.assemblyProvenance.source,
    });
  }

  return {
    queryId: assembled.queryId,
    nodes: builder.nodes,
    edges: builder.edges,
    facts: builder.facts,
    warnings: [...assembled.warnings],
    confidence: assembled.confidence,
    provenance: builder.assemblyProvenance,
    diagnostics: [...assembled.diagnostics],
  };
}
