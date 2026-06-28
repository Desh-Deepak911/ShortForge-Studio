import "server-only";

import { buildIntelligenceAnalysis } from "../../analysis/build-intelligence-analysis.utils";
import { resolveCompetitionFromTopic } from "../../competitions";
import { resolveEntities } from "../../entities/entity-resolver";
import { analyzeIntent } from "../../intent/intent-engine";
import { buildResearchPlan } from "../../planner/query-orchestrator-research-plan.utils";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";

import { providerRegistry } from "../provider-registry";
import {
  clearProviderExecutionContext,
  registerProviderExecutionContext,
} from "../provider-execution-context.server";
import { executionResultToFootballContext } from "./football-research-to-result.legacy.utils";
import {
  executeProviderFallbackChain,
  resolveProviderFallbackChain,
} from "../provider-fallback-chain.server";
import type { ProviderQuery } from "../provider.types";
import type { ProviderDiagnosticEntry } from "../provider-diagnostics.types";
import type { ProviderResearchInput } from "../provider-research.types";
import type { ResearchProviderId } from "../provider.types";

function createQueryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `prq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** @deprecated Legacy registry adapter — rebuilds query from topic when analysis is absent. */
export function buildProviderQueryFromResearchInput(
  input: ProviderResearchInput,
): ProviderQuery {
  const queryInput = {
    topic: input.topic,
    selectedMode: input.mode,
    manualNotes: input.manualContext,
    enableResearch: true,
  };

  if (input.intelligenceAnalysis) {
    const analysis = input.intelligenceAnalysis;

    return {
      id: createQueryId(),
      input: queryInput,
      intent: analysis.intent,
      entities: analysis.entities,
      ...(analysis.competition ? { competition: analysis.competition } : {}),
      ...(analysis.season != null ? { season: analysis.season } : {}),
      warnings: analysis.warnings,
      confidence: analysis.confidence,
      researchPlan: analysis.researchPlan,
      diagnostics: analysis.diagnostics,
    };
  }

  const intent = analyzeIntent({
    topic: input.topic,
    context: input.manualContext,
  });
  const extraction = resolveEntities({
    topic: input.topic,
    manualContext: input.manualContext,
    mode: input.mode,
  });
  const competitionResolution = resolveCompetitionFromTopic({ topic: input.topic });
  const analysis = buildIntelligenceAnalysis({
    topic: input.topic,
    manualContext: input.manualContext,
    mode: input.mode,
    extraction,
    competitionResolution,
  });

  const researchPlan = buildResearchPlan({
    queryInput,
    intent,
    extraction,
    competitionResolution,
    entities: analysis.entities,
    competition: analysis.competition,
    season: analysis.season,
  });

  return {
    id: createQueryId(),
    input: queryInput,
    intent,
    entities: analysis.entities,
    ...(analysis.competition ? { competition: analysis.competition } : {}),
    ...(analysis.season != null ? { season: analysis.season } : {}),
    warnings: analysis.warnings,
    confidence: {
      tier: "low",
      percent: 0,
      reasoning: "Heuristic analysis — orchestrator confidence unavailable.",
    },
    researchPlan,
    diagnostics: {
      orchestratedAt: new Date().toISOString(),
      events: [],
    },
  };
}

async function resolveNoProviderWarnings(manualContext?: string): Promise<string[]> {
  if (manualContext?.trim()) {
    return ["API_FOOTBALL_KEY is not configured — using manual context only."];
  }

  const providers = providerRegistry.getProviders();
  const unavailableMessages = await Promise.all(
    providers.map(async (provider) => {
      const health = await provider.health();
      return health.status === "unavailable" ? health.message : null;
    }),
  );

  const configuredWarning = unavailableMessages.find(
    (message) => message?.includes("API_FOOTBALL_KEY"),
  );

  if (configuredWarning) {
    return ["API_FOOTBALL_KEY is not configured."];
  }

  return ["No research providers available for this brief."];
}

function findDiagnosticEntry(
  diagnostics: ProviderDiagnosticEntry[],
  providerId: ResearchProviderId,
): ProviderDiagnosticEntry | undefined {
  return diagnostics.find((entry) => entry.provider === providerId);
}

export interface RegistryResearchOutcome {
  context: FootballResearchContext | null;
  providerDiagnostics?: ProviderDiagnosticEntry[];
}

/**
 * @deprecated Legacy registry chain — bypasses `executeIntelligenceQuery`.
 * @deprecated test/legacy only — do not use in production path.
 */
export async function runRegistryResearch(
  input: ProviderResearchInput,
  options?: { collectDiagnostics?: boolean },
): Promise<FootballResearchContext | null> {
  const outcome = await runRegistryResearchDetailed(input, options);
  return outcome.context;
}

/** @deprecated test/legacy only — do not use in production path. */
export async function runRegistryResearchDetailed(
  input: ProviderResearchInput,
  options?: { collectDiagnostics?: boolean },
): Promise<RegistryResearchOutcome> {
  const query = buildProviderQueryFromResearchInput(input);
  const providerDiagnostics: ProviderDiagnosticEntry[] = [];
  const selectedProviders = await providerRegistry.selectProviders(
    query,
    options?.collectDiagnostics ? providerDiagnostics : undefined,
  );
  const providerChain = resolveProviderFallbackChain(
    providerRegistry,
    query,
    selectedProviders,
  );

  registerProviderExecutionContext(query.id, input);

  try {
    const chainResult = await executeProviderFallbackChain(query, providerChain, {
      collectDiagnostics: options?.collectDiagnostics,
      diagnostics: providerDiagnostics,
      findExistingDiagnostic: (providerId) =>
        findDiagnosticEntry(providerDiagnostics, providerId),
    });

    if (chainResult) {
      return {
        context: executionResultToFootballContext(chainResult.execution, input),
        ...(options?.collectDiagnostics ? { providerDiagnostics } : {}),
      };
    }

    return {
      context: null,
      ...(options?.collectDiagnostics ? { providerDiagnostics } : {}),
    };
  } finally {
    clearProviderExecutionContext(query.id);
  }
}

export { resolveNoProviderWarnings };
