import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { IntelligenceExecutionStatus } from "@/features/intelligence/planner/execute-intelligence-query";
import type { ConfidenceScore } from "@/features/intelligence/shared/confidence.types";
import type { IntelligenceEntity } from "@/features/intelligence/shared/entity.types";

import type {
  ResearchPreviewConfidence,
  ResearchPreviewEntity,
  ResearchPreviewSourceDisplay,
  ResearchPreviewStatus,
} from "@/features/create/types/research-preview.types";

import {
  formatOrchestratorConfidence,
  formatOrchestratorEntities,
  formatOrchestratorIntent,
  orchestratorConfidenceLabel,
} from "./research-orchestrator-display.utils";

export function hasAssembledUsefulContent(assembled: AssembledContext): boolean {
  if (assembled.verifiedFacts.some((fact) => fact.text.trim().length > 0)) {
    return true;
  }

  if (assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
    return true;
  }

  if (
    assembled.fixtures.length > 0 ||
    assembled.statistics.length > 0 ||
    assembled.events.length > 0 ||
    assembled.lineups.length > 0
  ) {
    return true;
  }

  return false;
}

export function resolveResearchPreviewStatusFromPreview(input: {
  assembledContext?: AssembledContext;
  executionStatus?: IntelligenceExecutionStatus;
  httpOk: boolean;
}): ResearchPreviewStatus {
  if (!input.httpOk) {
    return "error";
  }

  if (input.executionStatus === "success") {
    return "success";
  }

  if (input.executionStatus === "partial" || input.executionStatus === "failed") {
    return "fallback";
  }

  if (input.assembledContext) {
    const source = input.assembledContext.provenance.source;
    if (
      hasAssembledUsefulContent(input.assembledContext) &&
      (source === "api-football" ||
        source === "static-fallback" ||
        source === "manual" ||
        source === "user")
    ) {
      return "success";
    }

    if (!hasAssembledUsefulContent(input.assembledContext)) {
      return "fallback";
    }

    return "success";
  }

  return "error";
}

export function resolveAssembledPreviewConfidence(
  confidence: ConfidenceScore,
): ResearchPreviewConfidence {
  return orchestratorConfidenceLabel(confidence);
}

export function formatAssembledIntent(assembled: AssembledContext): string {
  return formatOrchestratorIntent(assembled.intent);
}

export function formatAssembledEntities(entities: IntelligenceEntity[]): string {
  return formatOrchestratorEntities(entities);
}

export function formatAssembledConfidence(confidence: ConfidenceScore): string {
  return formatOrchestratorConfidence(confidence);
}

export function selectAssembledVerifiedFacts(assembled: AssembledContext): string[] {
  const facts = assembled.verifiedFacts
    .map((fact) => fact.text.trim())
    .filter(Boolean);

  if (facts.length <= 6) {
    return facts;
  }

  return facts.slice(0, 6);
}

export function formatAssembledRankingLabel(
  metric: AssembledContext["rankings"][number]["metric"],
): string {
  switch (metric) {
    case "goals":
      return "G";
    case "assists":
      return "A";
    default:
      return "";
  }
}

export function formatAssembledProvenanceSource(
  source: AssembledContext["provenance"]["source"],
): string {
  return source.replace(/-/g, " ");
}

export function resolveAssembledPreviewSourceLabel(
  source: AssembledContext["provenance"]["source"],
): ResearchPreviewSourceDisplay {
  if (source === "manual" || source === "user") {
    return "Manual notes";
  }

  if (source === "static-fallback") {
    return "Static fallback";
  }

  if (source === "api-football") {
    return "Smart Research";
  }

  return "Prompt only";
}

export function resolveAssembledPreviewSourceDetail(
  source: AssembledContext["provenance"]["source"],
): string | undefined {
  if (source === "api-football") {
    return "Live data via API-Football";
  }

  if (source === "static-fallback") {
    return "Curated reference notes";
  }

  if (source === "manual" || source === "user") {
    return "From your additional notes";
  }

  return undefined;
}

export function detectAssembledPreviewTags(assembled: AssembledContext): ResearchPreviewEntity[] {
  const tags = new Set<ResearchPreviewEntity>();

  if (assembled.rankings.some((ranking) => ranking.entries.length > 0) || assembled.selectedMode === "top_5") {
    tags.add("ranking");
  }

  if (assembled.fixtures.length > 0) {
    tags.add("match");
  }

  if (assembled.entities.some((entity) => entity.kind === "player")) {
    tags.add("player");
  }

  if (
    assembled.entities.some(
      (entity) => entity.kind === "club" || entity.kind === "national_team",
    )
  ) {
    tags.add("team");
  }

  if (assembled.competition) {
    tags.add("competition");
  }

  if (assembled.season != null) {
    tags.add("year_season");
  }

  if (tags.size === 0) {
    tags.add("unknown");
  }

  return [...tags];
}

export function resolveAssembledPreviewSummary(assembled: AssembledContext): string | undefined {
  const fact = assembled.verifiedFacts.find((entry) => entry.text.trim().length > 0);
  return fact?.text.trim();
}

export function shouldShowAssembledNoReliableDataWarning(assembled: AssembledContext): boolean {
  return !hasAssembledUsefulContent(assembled);
}
