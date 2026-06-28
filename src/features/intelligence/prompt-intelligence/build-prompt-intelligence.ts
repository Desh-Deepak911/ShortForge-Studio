import type { GraphContext, GraphContextFact } from "../context/graph-context.types";

import { isSparseOpinionDebateGraphContext, resolvePromptIntelligenceStrategy } from "./prompt-intelligence-strategy.utils";
import type {
  BuildPromptIntelligenceInput,
  BuildPromptIntelligenceResult,
  PromptIntelligence,
  PromptIntelligenceGrounding,
  PromptIntelligenceSection,
  PromptIntelligenceSectionEmphasis,
  PromptIntelligenceSectionKind,
  PromptIntelligenceStatus,
} from "./prompt-intelligence.types";

function formatModeLabel(mode: GraphContext["selectedMode"]): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(source: GraphContext["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function resolveGraphSummary(context: GraphContext): string {
  const firstVerified = context.verifiedFacts.find(
    (fact) => fact.type !== "manual_note" && fact.text.trim().length > 0,
  );
  if (firstVerified) {
    return firstVerified.text.trim();
  }

  const fixture = context.fixtureFacts[0];
  if (fixture) {
    return fixture.text.trim();
  }

  return `Research brief: ${context.topic}`;
}

function splitManualNotes(facts: GraphContextFact[]): {
  manualNotes: GraphContextFact[];
  otherFacts: GraphContextFact[];
} {
  const manualNotes = facts.filter((fact) => fact.type === "manual_note");
  const otherFacts = facts.filter((fact) => fact.type !== "manual_note");
  return { manualNotes, otherFacts };
}

function section(
  kind: PromptIntelligenceSectionKind,
  title: string,
  lines: string[],
  emphasis: PromptIntelligenceSectionEmphasis,
  sourceFactIds?: string[],
): PromptIntelligenceSection | null {
  const filtered = lines.map((line) => line.trim()).filter(Boolean);
  if (filtered.length === 0) {
    return null;
  }

  return {
    id: `${kind}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    title,
    priority: 0,
    lines: filtered,
    emphasis,
    ...(sourceFactIds?.length ? { sourceFactIds } : {}),
  };
}

function buildMetadataSection(context: GraphContext): PromptIntelligenceSection {
  const lines = [
    `Mode: ${formatModeLabel(context.selectedMode)}`,
    `Topic: ${context.topic}`,
  ];

  if (isSparseOpinionDebateGraphContext(context)) {
    lines.push(`Summary: ${resolveGraphSummary(context)}`);
  }

  lines.push(
    `Research source: ${formatProvenanceLabel(context.provenance.source)}`,
    `Research confidence: ${context.confidence.tier} (${context.confidence.percent}%)`,
  );

  return section("metadata", "RESEARCHED FOOTBALL CONTEXT", lines, "required")!;
}

function buildGroundingSection(context: GraphContext): PromptIntelligenceSection | null {
  const rules = context.groundingRules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => !rule.startsWith("Grounding constraint:"));

  if (rules.length === 0) {
    return section(
      "grounding",
      "Grounding rules:",
      [
        context.selectedMode === "top_5"
          ? "Use only the ranked entries and values in RANKED FACTS. Do not invent players, scores, or stats beyond this context."
          : "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.",
      ],
      "required",
    );
  }

  return section(
    "grounding",
    "Grounding rules:",
    rules.map((rule) => (rule.startsWith("- ") ? rule : `- ${rule}`)),
    "required",
  );
}

function buildRankedFactsSection(context: GraphContext): PromptIntelligenceSection | null {
  if (context.rankedFacts.length === 0) {
    return null;
  }

  return section(
    "ranked_facts",
    "RANKED FACTS:",
    [
      "Exact order and values below must be preserved in the script.",
      ...context.rankedFacts.map((fact) => `- ${fact.text.trim()}`),
    ],
    "required",
    context.rankedFacts.map((fact) => fact.id),
  );
}

function buildPrimaryEntitySection(context: GraphContext): PromptIntelligenceSection | null {
  const lines: string[] = [];

  for (const summary of context.entitySummaries) {
    const kind = summary.kind ? ` (${summary.kind})` : "";
    lines.push(`- ${summary.label}${kind}`);
    for (const line of summary.lines) {
      lines.push(`  - ${line.trim()}`);
    }
  }

  for (const entity of context.primaryEntities) {
    const kind = entity.kind ? ` (${entity.kind})` : "";
    lines.push(`- ${entity.label}${kind}`);
  }

  return section("primary_entity", "PRIMARY ENTITY:", lines, "recommended");
}

function buildVerifiedFactsSection(facts: GraphContextFact[]): PromptIntelligenceSection | null {
  if (facts.length === 0) {
    return null;
  }

  return section(
    "verified_facts",
    "VERIFIED FACTS:",
    facts.map((fact) => `- ${fact.text.trim()}`),
    "recommended",
    facts.map((fact) => fact.id),
  );
}

function buildFixtureSection(context: GraphContext): PromptIntelligenceSection | null {
  if (context.fixtureFacts.length === 0) {
    return null;
  }

  return section(
    "fixture",
    "FIXTURE:",
    context.fixtureFacts.map((fact) => `- ${fact.text.trim()}`),
    "recommended",
    context.fixtureFacts.map((fact) => fact.id),
  );
}

function buildStatisticsSection(context: GraphContext): PromptIntelligenceSection | null {
  if (context.statisticFacts.length === 0) {
    return null;
  }

  return section(
    "statistics",
    "STATISTICS:",
    context.statisticFacts.map((fact) => `- ${fact.text.trim()}`),
    "recommended",
    context.statisticFacts.map((fact) => fact.id),
  );
}

function buildTimelineSection(context: GraphContext): PromptIntelligenceSection | null {
  if (context.timelineFacts.length === 0) {
    return null;
  }

  return section(
    "timeline",
    "EVENTS:",
    context.timelineFacts.map((fact) => `- ${fact.text.trim()}`),
    "recommended",
    context.timelineFacts.map((fact) => fact.id),
  );
}

function buildManualNotesSection(notes: GraphContextFact[]): PromptIntelligenceSection | null {
  if (notes.length === 0) {
    return null;
  }

  return section(
    "manual_notes",
    "CREATOR NOTES (manual — not provider-verified):",
    notes.map((note) => `- ${note.text.trim()}`),
    "optional",
    notes.map((note) => note.id),
  );
}

function buildWarningsSection(context: GraphContext): PromptIntelligenceSection | null {
  const uniqueWarnings = [...new Set(context.warnings.map((warning) => warning.trim()))].filter(
    Boolean,
  );

  if (uniqueWarnings.length === 0) {
    return null;
  }

  return section(
    "warnings",
    "Warnings (grounding constraints):",
    uniqueWarnings.map((warning) => `- ${warning}`),
    "required",
  );
}

function buildGroundingPolicy(context: GraphContext): PromptIntelligenceGrounding {
  const constraints = context.warnings.filter(Boolean);
  const strictness =
    context.selectedMode === "top_5" || constraints.length > 0 ? "strict" : "standard";

  return {
    rules: context.groundingRules.filter(Boolean),
    constraints,
    strictness,
  };
}

function resolveStatus(context: GraphContext, sections: PromptIntelligenceSection[]): PromptIntelligenceStatus {
  if (sections.length <= 2 && context.warnings.length > 0) {
    return "sparse";
  }

  const hasResearchSections = sections.some((entry) =>
    ["ranked_facts", "verified_facts", "fixture", "statistics", "timeline"].includes(entry.kind),
  );

  return hasResearchSections ? "ready" : "sparse";
}

function collectSections(context: GraphContext): PromptIntelligenceSection[] {
  const { manualNotes, otherFacts } = splitManualNotes(context.verifiedFacts);
  const candidates = new Map<PromptIntelligenceSectionKind, PromptIntelligenceSection>();

  const metadata = buildMetadataSection(context);
  candidates.set(metadata.kind, metadata);

  const ranked = buildRankedFactsSection(context);
  if (ranked) candidates.set(ranked.kind, ranked);

  const primary = buildPrimaryEntitySection(context);
  if (primary) candidates.set(primary.kind, primary);

  const verified = buildVerifiedFactsSection(otherFacts);
  if (verified) candidates.set(verified.kind, verified);

  const fixture = buildFixtureSection(context);
  if (fixture) candidates.set(fixture.kind, fixture);

  const statistics = buildStatisticsSection(context);
  if (statistics) candidates.set(statistics.kind, statistics);

  const timeline = buildTimelineSection(context);
  if (timeline) candidates.set(timeline.kind, timeline);

  const grounding = buildGroundingSection(context);
  if (grounding) candidates.set(grounding.kind, grounding);

  const manual = buildManualNotesSection(manualNotes);
  if (manual) candidates.set(manual.kind, manual);

  const warnings = buildWarningsSection(context);
  if (warnings) candidates.set(warnings.kind, warnings);

  const strategy = resolvePromptIntelligenceStrategy(context);

  return strategy.sectionOrder
    .map((kind, index) => {
      const entry = candidates.get(kind);
      if (!entry) {
        return null;
      }

      return { ...entry, priority: index + 1 };
    })
    .filter((entry): entry is PromptIntelligenceSection => entry != null);
}

/**
 * Builds Prompt Intelligence from GraphContext.
 *
 * Not wired into production — `graphContextToPromptText()` remains the live path.
 */
export function buildPromptIntelligence(
  input: BuildPromptIntelligenceInput,
): BuildPromptIntelligenceResult {
  const context = input.graphContext;
  const strategy = resolvePromptIntelligenceStrategy(context);
  const sections = collectSections(context);
  const inputFactCount =
    context.rankedFacts.length +
    context.verifiedFacts.length +
    context.fixtureFacts.length +
    context.statisticFacts.length +
    context.timelineFacts.length;

  const promptIntelligence: PromptIntelligence = {
    queryId: context.queryId,
    topic: context.topic,
    selectedMode: context.selectedMode,
    status: resolveStatus(context, sections),
    strategy,
    grounding: buildGroundingPolicy(context),
    sections,
    confidence: context.confidence,
    provenance: context.provenance,
    diagnostics: {
      graphQueryId: context.queryId,
      inputFactCount,
      selectedSectionCount: sections.length,
      selectedLineCount: sections.reduce((total, entry) => total + entry.lines.length, 0),
      strategyId: strategy.id,
      sparseContext: strategy.compressSparseContext,
      warnings: context.warnings,
    },
  };

  return { promptIntelligence };
}
