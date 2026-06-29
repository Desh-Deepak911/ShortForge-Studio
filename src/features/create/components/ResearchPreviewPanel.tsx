"use client";

import { AlertTriangle, Loader2, Search } from "lucide-react";

import {
  dedupeFriendlyWarnings,
  formatResearchDetectedLabel,
  researchPreviewConfidenceTone,
  researchPreviewDisplayStatusTone,
} from "@/features/create/utils/research-preview-display.utils";
import {
  detectAssembledPreviewTags,
  formatAssembledConfidence,
  formatAssembledEntities,
  formatAssembledIntent,
  formatAssembledRankingLabel,
  resolveAssembledPreviewConfidence,
  resolveAssembledPreviewSourceDetail,
  resolveAssembledPreviewSourceLabel,
  resolveAssembledPreviewSummary,
  selectAssembledVerifiedFacts,
  shouldShowAssembledNoReliableDataWarning,
} from "@/features/create/utils/research-preview-assembled.utils";
import { resolveResearchPreviewDisplayStatus } from "@/features/create/utils/research-preview-display.utils";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import {
  entityPreviewConfidenceLabel,
  formatEntityPreviewConfidence,
  formatEntityPreviewId,
  formatEntityPreviewValue,
} from "@/features/create/utils/entity-preview.utils";
import {
  formatOrchestratorConfidence,
  formatOrchestratorEntities,
  formatOrchestratorIntent,
  formatOrchestratorResearchCalls,
  formatProviderDisplayName,
  formatProviderFallbackDisplay,
  orchestratorConfidenceLabel,
  resolveResearchPreviewProviderRouting,
} from "@/features/create/utils/research-orchestrator-display.utils";
import type { EntityPreviewDisplay, EntityPreviewField } from "@/features/create/types/entity-preview.types";
import ResearchPreviewDeveloperView from "@/features/create/components/ResearchPreviewDeveloperView";
import {
  NO_RELIABLE_FOOTBALL_DATA_WARNING,
} from "@/features/research/utils/research-grounding.utils";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import {
  studioComposerHelper,
  studioFieldLabel,
  studioGhostButton,
  studioPanel,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { ScriptMode } from "@/types/footiebitz";

interface ResearchPreviewPanelProps {
  enableResearch: boolean;
  topic: string;
  manualContext?: string;
  scriptMode: ScriptMode;
  preview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  disabled: boolean;
  onPreviewResearch: () => void;
  /** Re-runs preview through `/api/research-football` → `executeIntelligenceQuery`. */
  onRefreshResearchPreview?: () => void;
  /** Nested inside Smart Research step — lighter chrome, no section divider. */
  embedded?: boolean;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-foreground/90 sm:text-right">{value}</dd>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tone}`}
    >
      {label}
    </span>
  );
}

function EntityFieldRow({ label, field }: { label: string; field?: EntityPreviewField }) {
  const researchLabel =
    field?.usedForResearch === true
      ? "Yes — ID used for research"
      : field?.usedForResearch === false && field.confidence.percent > 0
        ? "No — search fallback"
        : "—";

  return (
    <>
      <MetaRow label={label} value={formatEntityPreviewValue(field)} />
      {field ? (
        <>
          <MetaRow label={`${label} ID`} value={formatEntityPreviewId(field)} />
          <MetaRow
            label={`${label} confidence`}
            value={`${entityPreviewConfidenceLabel(field.confidence)} (${formatEntityPreviewConfidence(field)})`}
          />
          {field.ambiguous ? (
            <MetaRow label={`${label} status`} value="Ambiguous match" />
          ) : null}
          <MetaRow label={`${label} in research`} value={researchLabel} />
        </>
      ) : null}
    </>
  );
}

export default function ResearchPreviewPanel({
  enableResearch,
  topic,
  manualContext,
  scriptMode,
  preview,
  entityPreview,
  disabled,
  onPreviewResearch,
  onRefreshResearchPreview,
  embedded = false,
}: ResearchPreviewPanelProps) {
  const assembled = preview.assembledContext;
  const displayStatus = resolveResearchPreviewDisplayStatus(preview, assembled);
  const confidence = assembled
    ? resolveAssembledPreviewConfidence(assembled.confidence)
    : null;
  const entityConfidence = entityPreview
    ? entityPreviewConfidenceLabel(entityPreview.overallConfidence)
    : null;
  const entityConfidencePercent = entityPreview?.overallConfidence.percent ?? 0;
  const sourceLabel = assembled
    ? resolveAssembledPreviewSourceLabel(assembled.provenance.source)
    : null;
  const sourceDetail = assembled
    ? resolveAssembledPreviewSourceDetail(assembled.provenance.source)
    : null;
  const detectedTags = assembled ? detectAssembledPreviewTags(assembled) : [];
  const seasonLabel = assembled?.season != null ? String(assembled.season) : undefined;
  const keyFacts = assembled ? selectAssembledVerifiedFacts(assembled) : [];
  const assembledRankings = assembled?.rankings.flatMap((ranking) =>
    ranking.entries.map((entry) => ({
      key: `${ranking.metric}-${entry.rank}-${entry.label}`,
      rank: entry.rank,
      label: entry.label,
      value: entry.value,
      metricLabel: formatAssembledRankingLabel(ranking.metric),
    })),
  ) ?? [];
  const hasRankings = assembledRankings.length > 0;
  const entityWarnings = [
    ...(entityPreview?.warnings ?? []),
    ...(entityPreview?.ambiguities ?? []),
    ...(preview.resolvedEntities?.warnings ?? []),
    ...(preview.resolvedEntities?.ambiguities ?? []),
  ].filter((entry, index, list) => list.indexOf(entry) === index);
  const friendlyWarnings = assembled ? dedupeFriendlyWarnings(assembled.warnings) : [];
  const showNoReliableDataWarning = assembled
    ? shouldShowAssembledNoReliableDataWarning(assembled)
    : false;
  const previewDisabled = disabled || !enableResearch || !topic.trim() || preview.status === "loading";
  const showEntityPreview = Boolean(topic.trim() && entityPreview && !assembled);
  const intelligenceAnalysis = preview.intelligenceAnalysis;
  const providerRouting = resolveResearchPreviewProviderRouting(intelligenceAnalysis);
  const orchestratorConfidence = assembled
    ? resolveAssembledPreviewConfidence(assembled.confidence)
    : intelligenceAnalysis
      ? orchestratorConfidenceLabel(intelligenceAnalysis.confidence)
      : null;
  const showOrchestratorPanel = Boolean(topic.trim() && (assembled || intelligenceAnalysis));
  const showResultPanel =
    assembled && preview.status !== "idle" && preview.status !== "loading";
  const assembledSummary = assembled ? resolveAssembledPreviewSummary(assembled) : undefined;
  const assembledPromptText = assembled ? assembledContextToPrompt(assembled) : undefined;

  return (
    <div className={embedded ? "mt-3" : "mt-4 border-t border-border/50 pt-4"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={embedded ? studioSubtleText : studioFieldLabel}>
            {embedded ? "Preview research" : "Research Preview"}
          </p>
          {!embedded ? (
            <p className={`${studioComposerHelper} mt-1`}>
              See whether your story will be grounded before you write.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPreviewResearch}
            disabled={previewDisabled}
            className={`${studioSecondaryButton} w-full shrink-0 sm:w-auto`}
          >
            {preview.status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up...
              </>
            ) : (
              <Search className="h-4 w-4" strokeWidth={1.75} />
            )}
            Research Preview
          </button>
          {showResultPanel && onRefreshResearchPreview ? (
            <button
              type="button"
              onClick={onRefreshResearchPreview}
              disabled={previewDisabled}
              className={`${studioGhostButton} w-full shrink-0 sm:w-auto`}
            >
              Refresh preview
            </button>
          ) : null}
        </div>
      </div>

      {!enableResearch ? (
        <p className={`${studioComposerHelper} mt-3 rounded-xl bg-surface-elevated/30 px-3 py-2.5 ring-1 ring-border/20`}>
          Enable Smart Research to look up supporting details for your topic.
        </p>
      ) : null}

      {enableResearch && !topic.trim() ? (
        <p className={`${studioComposerHelper} mt-3 rounded-xl bg-surface-elevated/30 px-3 py-2.5 ring-1 ring-border/20`}>
          Add a topic above to preview research for your story.
        </p>
      ) : null}

      {enableResearch && topic.trim() && preview.status === "idle" ? (
        <div className={`${studioPanel} mt-3 flex flex-wrap items-center gap-2 px-3.5 py-3 sm:px-4`}>
          <StatusBadge label="Idle" tone={researchPreviewDisplayStatusTone("Idle")} />
          <p className={`${studioSubtleText} min-w-0 flex-1 basis-full sm:basis-auto`}>
            Run a research preview to see what details are available for this topic.
          </p>
        </div>
      ) : null}

      {showOrchestratorPanel && (assembled || intelligenceAnalysis) ? (
        <div className={`${studioPanel} mt-3 space-y-3 px-3.5 py-3 sm:px-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground/90">Intelligence query</p>
            {preview.status === "loading" && !assembled ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
            ) : null}
            {orchestratorConfidence ? (
              <StatusBadge
                label={`Confidence: ${orchestratorConfidence}`}
                tone={researchPreviewConfidenceTone(orchestratorConfidence)}
              />
            ) : null}
          </div>

          <dl className="space-y-2.5 rounded-xl bg-surface-elevated/20 px-3 py-3 ring-1 ring-border/15">
            <MetaRow
              label="Intent"
              value={
                assembled
                  ? formatAssembledIntent(assembled)
                  : formatOrchestratorIntent(intelligenceAnalysis!.intent)
              }
            />
            <MetaRow
              label="Entities"
              value={
                assembled
                  ? formatAssembledEntities(assembled.entities)
                  : formatOrchestratorEntities(intelligenceAnalysis!.entities)
              }
            />
            <MetaRow
              label="Competition"
              value={
                assembled?.competition?.label ??
                intelligenceAnalysis?.competition?.label ??
                "Not detected"
              }
            />
            <MetaRow
              label="Season"
              value={
                assembled?.season != null
                  ? String(assembled.season)
                  : intelligenceAnalysis?.season != null
                    ? String(intelligenceAnalysis.season)
                    : "Not detected"
              }
            />
            <MetaRow
              label="Research confidence"
              value={
                assembled
                  ? formatAssembledConfidence(assembled.confidence)
                  : formatOrchestratorConfidence(intelligenceAnalysis!.confidence)
              }
            />
            {intelligenceAnalysis ? (
              <>
                <MetaRow
                  label="Can proceed"
                  value={intelligenceAnalysis.researchPlan.canProceed ? "Yes" : "No"}
                />
                <MetaRow
                  label="Missing inputs"
                  value={
                    intelligenceAnalysis.researchPlan.missingInputs.length
                      ? intelligenceAnalysis.researchPlan.missingInputs.join(", ")
                      : "None"
                  }
                />
                <MetaRow
                  label="Fallback strategy"
                  value={intelligenceAnalysis.researchPlan.fallbackStrategy}
                />
                <MetaRow label="Research plan" value={intelligenceAnalysis.researchPlan.reason} />
                {providerRouting ? (
                  <>
                    <MetaRow
                      label="Selected Provider"
                      value={formatProviderDisplayName(providerRouting.selectedProvider)}
                    />
                    <MetaRow
                      label="Fallback Provider"
                      value={formatProviderFallbackDisplay(providerRouting.fallbackProviders)}
                    />
                    <MetaRow label="Reason" value={providerRouting.reasoning} />
                  </>
                ) : null}
                <MetaRow
                  label="Planned calls"
                  value={formatOrchestratorResearchCalls(intelligenceAnalysis)}
                />
              </>
            ) : null}
          </dl>

          {(assembled?.warnings.length ?? intelligenceAnalysis?.warnings.length ?? 0) > 0 ? (
            <div className="rounded-xl bg-amber-950/20 px-3 py-2.5 ring-1 ring-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-200">Orchestrator warnings</p>
                  <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-amber-100/90">
                    {(assembled?.warnings ?? intelligenceAnalysis?.warnings ?? []).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showEntityPreview && entityPreview ? (
        <div className={`${studioPanel} mt-3 space-y-3 px-3.5 py-3 sm:px-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground/90">Resolved entities</p>
            {entityPreview.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
            ) : null}
            {entityConfidence && entityConfidencePercent > 0 ? (
              <StatusBadge
                label={`Confidence: ${entityConfidence}`}
                tone={researchPreviewConfidenceTone(entityConfidence)}
              />
            ) : null}
          </div>

          <dl className="space-y-2.5 rounded-xl bg-surface-elevated/20 px-3 py-3 ring-1 ring-border/15">
            <EntityFieldRow label="Player" field={entityPreview.player} />
            <EntityFieldRow label="Competition" field={entityPreview.competition} />
            {entityPreview.teams.length > 0 ? (
              entityPreview.teams.map((team, index) => (
                <EntityFieldRow key={`${team.value}-${index}`} label={`Team ${index + 1}`} field={team} />
              ))
            ) : (
              <MetaRow label="Teams" value="Not detected" />
            )}
            <EntityFieldRow label="Season" field={entityPreview.season} />
            {entityConfidence && entityConfidencePercent > 0 ? (
              <MetaRow
                label="Overall confidence"
                value={`${entityConfidence} (${entityConfidencePercent}%)`}
              />
            ) : null}
          </dl>

          {entityWarnings.length > 0 ? (
            <div className="rounded-xl bg-amber-950/20 px-3 py-2.5 ring-1 ring-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-200">Entity warnings</p>
                  <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-amber-100/90">
                    {entityWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <ResearchPreviewDeveloperView
        topic={topic}
        context={manualContext}
        scriptMode={scriptMode}
        preview={preview}
        entityPreview={entityPreview}
        entityDebug={preview.entityDevDebug}
      />

      {preview.status === "error" && preview.errorMessage ? (
        <div className={`${studioPanel} mt-3 space-y-2 px-3.5 py-3 sm:px-4`}>
          <StatusBadge label="Unavailable" tone={researchPreviewDisplayStatusTone("Unavailable")} />
          <p className="text-sm leading-relaxed text-red-300/90">{preview.errorMessage}</p>
        </div>
      ) : null}

      {preview.status === "loading" ? (
        <div className={`${studioPanel} mt-3 space-y-2 px-3.5 py-3 sm:px-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="Searching" tone={researchPreviewDisplayStatusTone("Searching")} />
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
          </div>
          <p className={`${studioSubtleText} text-sm`}>Looking up supporting details...</p>
        </div>
      ) : null}

      {showResultPanel ? (
        <div className={`${studioPanel} mt-3 space-y-4 p-3.5 sm:p-4`}>
          <div>
            <p className="text-sm font-medium text-foreground/90">Research Summary</p>
            <p className={`${studioSubtleText} mt-1`}>
              {displayStatus === "Ready"
                ? "Good news — verified details are available for your story."
                : displayStatus === "Limited"
                  ? "Some details are limited — your story will stay cautious."
                  : "Research isn't available for this topic right now."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={displayStatus}
              tone={researchPreviewDisplayStatusTone(displayStatus)}
            />
            {confidence ? (
              <StatusBadge
                label={`Confidence: ${confidence}`}
                tone={researchPreviewConfidenceTone(confidence)}
              />
            ) : null}
            {sourceLabel ? (
              <StatusBadge
                label={`Source: ${sourceLabel}`}
                tone="bg-surface-elevated/50 text-muted ring-border/25"
              />
            ) : null}
          </div>

          {sourceDetail ? (
            <p className={`${studioSubtleText} text-xs`}>{sourceDetail}</p>
          ) : null}

          {showNoReliableDataWarning ? (
            <div className="rounded-xl bg-amber-950/25 px-3 py-2.5 ring-1 ring-amber-500/25">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-sm font-medium leading-relaxed text-amber-100">
                  {NO_RELIABLE_FOOTBALL_DATA_WARNING}
                </p>
              </div>
            </div>
          ) : null}

          <dl className="space-y-2.5 rounded-xl bg-surface-elevated/20 px-3 py-3 ring-1 ring-border/15">
            <MetaRow label="Research status" value={displayStatus} />
            {confidence ? <MetaRow label="Confidence" value={confidence} /> : null}
            {sourceLabel ? <MetaRow label="Source" value={sourceLabel} /> : null}
            {providerRouting ? (
              <>
                <MetaRow
                  label="Selected Provider"
                  value={formatProviderDisplayName(providerRouting.selectedProvider)}
                />
                <MetaRow
                  label="Fallback Provider"
                  value={formatProviderFallbackDisplay(providerRouting.fallbackProviders)}
                />
                <MetaRow label="Reason" value={providerRouting.reasoning} />
              </>
            ) : null}
            <MetaRow
              label="Detected"
              value={detectedTags.map((tag) => formatResearchDetectedLabel(tag)).join(" · ")}
            />
            {seasonLabel ? <MetaRow label="Year/season" value={seasonLabel} /> : null}
          </dl>

          {assembledSummary && !showNoReliableDataWarning ? (
            <p className="text-sm leading-relaxed text-foreground/85">{assembledSummary}</p>
          ) : null}

          {keyFacts.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Key facts</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground/90">
                {keyFacts.map((fact) => (
                  <li key={fact} className="flex gap-2">
                    <span className="text-muted">·</span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasRankings ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Rankings</p>
              <ol className="mt-2 divide-y divide-border/15 rounded-xl bg-surface-elevated/20 ring-1 ring-border/15">
                {assembledRankings.slice(0, 6).map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/90"
                  >
                    <span className="w-5 shrink-0 font-medium tabular-nums text-muted">
                      {entry.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.value != null && entry.metricLabel ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {entry.value}
                        {entry.metricLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {friendlyWarnings.length > 0 ? (
            <div className="rounded-xl bg-amber-950/20 px-3 py-2.5 ring-1 ring-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-200">Heads up</p>
                  <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-amber-100/90">
                    {friendlyWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {assembledPromptText ? (
            <details className="group">
              <summary className={`${studioGhostButton} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                View details
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-elevated/35 px-3 py-2.5 text-xs leading-relaxed text-foreground/85 ring-1 ring-border/20">
                {assembledPromptText}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
