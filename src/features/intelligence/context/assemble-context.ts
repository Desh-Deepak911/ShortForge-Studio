import type { IntelligenceResearchResult } from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";

import type { AssembledContext } from "./assembled-context.types";
import type { CanonicalResearchBundle } from "./canonical-research.types";

/** Whether a bundle contains structured provider payload beyond warnings. */
export function hasUsableStructuredPayload(bundle: CanonicalResearchBundle): boolean {
  return (
    bundle.mergedFacts.some((fact) => fact.text.trim().length > 0) ||
    bundle.rankings.some((ranking) => ranking.entries.length > 0) ||
    bundle.fixtures.length > 0 ||
    bundle.statistics.length > 0 ||
    bundle.events.length > 0 ||
    bundle.lineups.length > 0
  );
}

function isProviderResultEmpty(result: IntelligenceResearchResult): boolean {
  return (
    result.facts.length === 0 &&
    result.rankings.length === 0 &&
    result.fixtures.length === 0 &&
    result.statistics.length === 0 &&
    result.events.length === 0 &&
    result.lineups.length === 0
  );
}

function allProviderResultsEmpty(bundle: CanonicalResearchBundle): boolean {
  if (bundle.providerResults.length === 0) {
    return true;
  }

  return bundle.providerResults.every(isProviderResultEmpty);
}

function dedupeWarnings(values: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    merged.push(trimmed);
  }

  return merged;
}

/**
 * Collects query, provider, and plan-gap warnings.
 * When provider results are empty, missing plan inputs are preserved explicitly.
 */
export function collectAssemblyWarnings(bundle: CanonicalResearchBundle): string[] {
  const warnings: string[] = [
    ...bundle.query.warnings,
    ...bundle.warnings,
    ...bundle.providerResults.flatMap((result) => result.warnings),
  ];

  const providersEmpty = allProviderResultsEmpty(bundle);

  if (providersEmpty) {
    if (bundle.providerResults.length === 0) {
      warnings.push("No provider research results were returned for this query.");
    } else {
      warnings.push("Provider research returned no structured payload for this query.");
    }

    for (const missingInput of bundle.query.researchPlan.missingInputs) {
      warnings.push(`Missing input: ${missingInput}`);
    }

    if (!bundle.query.researchPlan.canProceed) {
      warnings.push(bundle.query.researchPlan.reason);
    }
  }

  return dedupeWarnings(warnings);
}

/** Confidence for assembled context — never inflates empty provider payloads. */
export function computeAssemblyConfidence(bundle: CanonicalResearchBundle): ConfidenceScore {
  if (hasUsableStructuredPayload(bundle)) {
    return bundle.confidence;
  }

  const percent = Math.min(bundle.confidence.percent, 35);

  return {
    tier: percent >= 68 ? "medium" : "low",
    percent,
    reasoning: [
      bundle.confidence.reasoning,
      "Structured provider payload is empty — assembly retained warnings and plan gaps only.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Assembles structured prompt input from a canonical research bundle.
 *
 * Rankings, verified facts, and provenance stay typed for `assembledContextToPrompt()`.
 * Empty provider results keep warnings and missingInputs instead of substituting legacy context.
 */
export function assembleContextFromBundle(
  bundle: CanonicalResearchBundle,
): AssembledContext {
  const warnings = collectAssemblyWarnings(bundle);
  const manualNotes = bundle.query.input.manualNotes?.trim() || undefined;
  const confidence = computeAssemblyConfidence(bundle);

  return {
    queryId: bundle.query.id,
    topic: bundle.query.input.topic.trim(),
    selectedMode: bundle.query.input.selectedMode,
    intent: bundle.query.intent,
    entities: [...bundle.mergedEntities],
    ...(bundle.query.competition ? { competition: bundle.query.competition } : {}),
    ...(bundle.query.season != null ? { season: bundle.query.season } : {}),
    verifiedFacts: [...bundle.mergedFacts],
    rankings: [...bundle.rankings],
    fixtures: [...bundle.fixtures],
    statistics: [...bundle.statistics],
    events: [...bundle.events],
    lineups: [...bundle.lineups],
    ...(manualNotes ? { manualNotes } : {}),
    warnings,
    confidence,
    provenance: {
      ...bundle.provenance,
      operations: [...(bundle.provenance.operations ?? [])],
      ...(bundle.provenance.facts
        ? { facts: [...bundle.provenance.facts] }
        : {}),
    },
    promptSections: [],
    diagnostics: [...bundle.diagnostics],
  };
}

/** @deprecated Use `hasUsableStructuredPayload`. */
export const hasUsableBundlePayload = hasUsableStructuredPayload;
