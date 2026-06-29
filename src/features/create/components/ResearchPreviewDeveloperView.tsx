"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import {
  isResearchPreviewDevEnabled,
  type EntityResolverDevDebug,
} from "@/features/create/types/research-preview-dev.types";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import { formatPromptIntelligenceDevSummaryForDev } from "@/features/intelligence/prompts/prompt-intelligence-dev.utils";
import {
  buildResearchPreviewDevSnapshot,
  collectResolvedIds,
  formatAssembledContextForDev,
  formatCanonicalBundleConfidenceForDev,
  formatCanonicalProvenanceForDev,
  formatCanonicalResearchBundleForDev,
  formatDevJson,
  formatEntityDiagnosticsForDev,
  formatGraphContextDeveloperViewForDev,
  formatGraphContextRankingsForDev,
  formatGraphContextSummaryForDev,
  formatIntelligenceQueryForDev,
  formatKnowledgeGraphProvenanceForDev,
  formatKnowledgeGraphSummaryForDev,
  formatKnowledgeGraphTopFactsForDev,
  formatProviderResultsForDev,
  formatProviderResultsListForDev,
  summarizeIntent,
} from "@/features/create/utils/research-preview-dev.utils";
import {
  enrichProviderDiagnosticsWithEntityCache,
  formatProviderDiagnosticsForDevView,
  formatProviderExecutionSummaryForDevView,
} from "@/features/create/utils/provider-diagnostics-display.utils";
import { studioGhostButton, studioPanel, studioSubtleText } from "@/lib/utils/studioUi";
import type { ScriptMode } from "@/types/footiebitz";

interface ResearchPreviewDeveloperViewProps {
  topic: string;
  context?: string;
  scriptMode: ScriptMode;
  preview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  entityDebug?: EntityResolverDevDebug;
}

function DevSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-violet-300/80">{title}</p>
      <div className="rounded-lg bg-black/25 px-2.5 py-2 ring-1 ring-violet-500/15">{children}</div>
    </div>
  );
}

function DevPre({ value }: { value: string }) {
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-violet-100/90">
      {value}
    </pre>
  );
}

export default function ResearchPreviewDeveloperView({
  topic,
  context,
  scriptMode,
  preview,
  entityPreview,
  entityDebug,
}: ResearchPreviewDeveloperViewProps) {
  const snapshot = useMemo(
    () =>
      buildResearchPreviewDevSnapshot({
        topic,
        context,
        preview,
        entityPreview,
        entityDebug,
      }),
    [context, entityDebug, entityPreview, preview, topic],
  );

  if (!isResearchPreviewDevEnabled || !topic.trim()) {
    return null;
  }

  const resolvedIds = snapshot.entityDebug ? collectResolvedIds(snapshot.entityDebug) : [];
  const providerDiagnostics = enrichProviderDiagnosticsWithEntityCache(
    snapshot.providerDiagnostics,
    snapshot.entityDebug,
  );
  const entityDiagnosticsText = formatEntityDiagnosticsForDev(snapshot.entityDebug);
  const entityConfidence = entityPreview
    ? `${entityPreview.overallConfidence.tier} (${entityPreview.overallConfidence.percent}%)`
    : "—";

  return (
    <details className={`${studioPanel} mt-3 border border-violet-500/20 bg-violet-950/15`}>
      <summary
        className={`${studioGhostButton} cursor-pointer list-none px-3.5 py-3 text-sm font-medium text-violet-200 [&::-webkit-details-marker]:hidden sm:px-4`}
      >
        Developer View
        <span className={`${studioSubtleText} ml-2 text-xs font-normal text-violet-300/70`}>
          dev only
        </span>
      </summary>

      <div className="space-y-3 border-t border-violet-500/15 px-3.5 py-3 sm:px-4 sm:py-4">
        <DevSection title="Pipeline">
          <DevPre
            value={formatDevJson({
              path: "executeIntelligenceQuery → merge → assembleContextFromBundle → buildKnowledgeGraph → buildGraphContext",
              executionStatus: snapshot.executionStatus ?? "unknown",
              endpoints: snapshot.researchCalls.map((call) => call.endpoint),
            })}
          />
        </DevSection>

        <DevSection title="Prompt Intelligence">
          <DevPre
            value={formatPromptIntelligenceDevSummaryForDev(snapshot.promptIntelligenceSummary)}
          />
        </DevSection>

        <DevSection title="Graph context">
          <DevPre value={formatGraphContextDeveloperViewForDev(snapshot.graphContext)} />
        </DevSection>

        <DevSection title="Graph context — detail">
          <DevPre value={formatGraphContextSummaryForDev(snapshot.graphContext)} />
        </DevSection>

        <DevSection title="Graph context — ranked facts">
          <DevPre value={formatGraphContextRankingsForDev(snapshot.graphContext)} />
        </DevSection>

        <DevSection title="Knowledge graph">
          <DevPre value={formatKnowledgeGraphSummaryForDev(snapshot.knowledgeGraph)} />
        </DevSection>

        <DevSection title="Knowledge graph — top facts">
          <DevPre value={formatKnowledgeGraphTopFactsForDev(snapshot.knowledgeGraph)} />
        </DevSection>

        <DevSection title="Knowledge graph — provenance">
          <DevPre value={formatKnowledgeGraphProvenanceForDev(snapshot.knowledgeGraph)} />
        </DevSection>

        <DevSection title="Intelligence query">
          <DevPre value={formatIntelligenceQueryForDev(snapshot.intelligenceQuery)} />
        </DevSection>

        <DevSection title="Assembled context">
          <DevPre value={formatAssembledContextForDev(snapshot.assembledContext)} />
        </DevSection>

        <DevSection title="Intent">
          <DevPre value={summarizeIntent(snapshot.intent)} />
          {snapshot.intent.reasoning ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-violet-200/75">
              {snapshot.intent.reasoning}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-violet-300/60">scriptMode: {scriptMode}</p>
        </DevSection>

        <DevSection title="Entities">
          <DevPre
            value={formatDevJson({
              assembled: snapshot.assembledContext?.entities.map((entity) => ({
                kind: entity.kind,
                label: entity.label,
              })) ?? [],
              entityPreview: {
                player: entityPreview?.player?.value ?? null,
                competition: entityPreview?.competition?.value ?? null,
                teams: entityPreview?.teams.map((team) => team.value) ?? [],
                season: entityPreview?.season?.value ?? null,
                ambiguities: entityPreview?.ambiguities ?? [],
              },
            })}
          />
        </DevSection>

        <DevSection title="Entity diagnostics">
          <DevPre value={entityDiagnosticsText} />
        </DevSection>

        <DevSection title="Confidence">
          <DevPre
            value={formatDevJson({
              orchestrator: snapshot.orchestratorConfidence ?? "—",
              entity: entityConfidence,
              intent: `${snapshot.intent.confidence} (${snapshot.intent.confidencePercent}%)`,
              research: snapshot.researchConfidence ?? "—",
              canonicalBundle: formatCanonicalBundleConfidenceForDev(
                snapshot.canonicalResearchBundle,
              ),
            })}
          />
        </DevSection>

        <DevSection title="Provider results">
          <DevPre
            value={formatProviderResultsListForDev(snapshot.providerResults)}
          />
        </DevSection>

        <DevSection title="Canonical provider results">
          <DevPre
            value={formatProviderResultsForDev(snapshot.canonicalResearchBundle)}
          />
        </DevSection>

        <DevSection title="Merged research bundle">
          <DevPre
            value={formatCanonicalResearchBundleForDev(snapshot.canonicalResearchBundle)}
          />
        </DevSection>

        <DevSection title="Provenance">
          <DevPre
            value={formatCanonicalProvenanceForDev(snapshot.canonicalResearchBundle)}
          />
        </DevSection>

        <DevSection title="Provider Diagnostics">
          <DevPre value={formatProviderDiagnosticsForDevView(providerDiagnostics)} />
        </DevSection>

        <DevSection title="Provider result status">
          <DevPre value={formatProviderExecutionSummaryForDevView(snapshot.providerExecutionSummary)} />
        </DevSection>

        <DevSection title="Provider">
          <DevPre
            value={
              snapshot.entityDebug
                ? formatDevJson({
                    entityLookups: snapshot.entityDebug.lookups.map((lookup) => ({
                      kind: lookup.kind,
                      provider: lookup.provider,
                      query: lookup.query,
                      confidence: lookup.confidencePercent,
                    })),
                    researchSource: snapshot.researchSource ?? "—",
                  })
                : "Entity diagnostics unavailable."
            }
          />
        </DevSection>

        <DevSection title="Cache">
          <DevPre
            value={
              snapshot.entityDebug
                ? formatDevJson({
                    cacheEntryCount: snapshot.entityDebug.cacheEntryCount,
                    lookups: snapshot.entityDebug.lookups.map((lookup) => ({
                      kind: lookup.kind,
                      query: lookup.query,
                      cache: lookup.cache,
                    })),
                  })
                : "Entity diagnostics unavailable."
            }
          />
        </DevSection>

        <DevSection title="Resolved IDs">
          <DevPre
            value={
              snapshot.entityDebug
                ? resolvedIds.length
                  ? resolvedIds.join("\n")
                  : "—"
                : "Entity diagnostics unavailable."
            }
          />
        </DevSection>

        <DevSection title="Research plan">
          <DevPre
            value={
              snapshot.researchPlan
                ? formatDevJson({
                    canProceed: snapshot.researchPlan.canProceed,
                    missingInputs: snapshot.researchPlan.missingInputs,
                    fallbackStrategy: snapshot.researchPlan.fallbackStrategy,
                    reason: snapshot.researchPlan.reason,
                    requiredProviders: snapshot.researchPlan.requiredProviders,
                    requiredCalls: snapshot.researchPlan.requiredCalls,
                    providerRouting: snapshot.researchPlan.providerRouting,
                  })
                : "No orchestrator plan yet."
            }
          />
        </DevSection>

        <DevSection title="Orchestrator diagnostics">
          <DevPre
            value={
              snapshot.orchestratorDiagnostics
                ? formatDevJson({
                    orchestratedAt: snapshot.orchestratorDiagnostics.orchestratedAt,
                    events: snapshot.orchestratorDiagnostics.events,
                    confidenceReport: snapshot.orchestratorDiagnostics.confidenceReport,
                  })
                : "No orchestrator diagnostics yet."
            }
          />
        </DevSection>

        <DevSection title="Research calls">
          <DevPre
            value={
              snapshot.researchCalls.length
                ? formatDevJson(snapshot.researchCalls)
                : "No research preview calls yet."
            }
          />
        </DevSection>
      </div>
    </details>
  );
}
