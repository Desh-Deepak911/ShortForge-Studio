import type { IntentAnalysis } from "@/features/intelligence/intent/intent-types";
import { resolveSuggestedContentTypeLabel } from "@/features/intelligence/intent/intent-display.utils";
import type { IntelligenceAnalysis } from "@/features/intelligence/shared/intelligence-analysis.types";
import type { ConfidenceScore } from "@/features/intelligence/shared/confidence.types";
import type { IntelligenceEntity } from "@/features/intelligence/shared/entity.types";
import type { IntelligenceProviderId } from "@/features/intelligence/shared/provider.types";
import type { ResearchPlanProviderRouting } from "@/features/intelligence/planner/query-orchestrator.types";
import type { ResearchPreviewConfidence } from "@/features/create/types/research-preview.types";

const PROVIDER_DISPLAY_NAMES: Record<IntelligenceProviderId, string> = {
  "api-football": "API-Football",
  "static-fallback": "Static fallback",
  statsbomb: "StatsBomb",
  manual: "Manual notes",
  fallback: "Fallback",
};

export function formatProviderDisplayName(
  providerId: IntelligenceProviderId | null | undefined,
): string {
  if (!providerId) {
    return "None";
  }

  return PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
}

export function formatProviderFallbackDisplay(
  fallbackProviders: IntelligenceProviderId[] | undefined,
): string {
  if (!fallbackProviders?.length) {
    return "None";
  }

  return fallbackProviders.map((providerId) => formatProviderDisplayName(providerId)).join(", ");
}

export function resolveResearchPreviewProviderRouting(
  analysis: IntelligenceAnalysis | undefined,
): ResearchPlanProviderRouting | undefined {
  return analysis?.researchPlan.providerRouting;
}

export function formatOrchestratorIntent(intent: IntentAnalysis): string {
  const label = resolveSuggestedContentTypeLabel(intent.intent);
  const sub = intent.subIntent ? ` · ${intent.subIntent}` : "";
  return `${label}${sub}`;
}

export function formatOrchestratorConfidence(confidence: ConfidenceScore): string {
  const tier = confidence.tier.charAt(0).toUpperCase() + confidence.tier.slice(1);
  return `${tier} (${confidence.percent}%)`;
}

export function orchestratorConfidenceLabel(
  confidence: ConfidenceScore,
): ResearchPreviewConfidence {
  if (confidence.percent >= 85 || confidence.tier === "high") {
    return "High";
  }

  if (confidence.percent >= 65 || confidence.tier === "medium") {
    return "Medium";
  }

  return "Low";
}

export function formatOrchestratorEntities(entities: IntelligenceEntity[]): string {
  if (entities.length === 0) {
    return "Not detected";
  }

  return entities
    .map((entity) => {
      const id =
        entity.externalId != null ? ` #${entity.externalId}` : "";
      return `${entity.kind}: ${entity.label}${id} (${entity.status})`;
    })
    .join(" · ");
}

export function formatOrchestratorResearchCalls(analysis: IntelligenceAnalysis): string {
  const { requiredCalls } = analysis.researchPlan;
  if (requiredCalls.length === 0) {
    return "None planned";
  }

  return requiredCalls
    .map((call) => `${call.operation} (${call.provider}, p${call.priority})`)
    .join(" · ");
}
