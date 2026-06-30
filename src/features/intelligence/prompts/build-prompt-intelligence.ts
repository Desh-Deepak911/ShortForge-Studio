import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

import { buildNarrativePlan } from "./build-narrative-plan";
import { isSparseGraphContext } from "./graph-context-sparse.utils";
import { resolvePromptStudioAlignment } from "@/features/studio-intelligence/prompt-studio-alignment";
import {
  buildStoryStructureStyleRules,
  STORY_STRUCTURE_NARRATION_RULES,
} from "./story-structure-intelligence.utils";
import type { NarrativePlan } from "./narrative-plan.types";
import type {
  FactUsagePlan,
  PromptGroundingRule,
  PromptLengthRule,
  PromptStyleRule,
} from "./prompt-plan.types";
import type { PromptIntelligenceResult } from "./prompt-intelligence.types";
import type { PromptSection, PromptSectionKind } from "./prompt-section.types";

const DEFAULT_TARGET_DURATION_SECONDS = 30;

export interface BuildPromptIntelligenceInput {
  graphContext: GraphContext;
  /** When set, length rules and beat budgets use this narration target. */
  targetDurationSeconds?: number;
}

const MODE_TONE: Record<ScriptMode, Tone> = {
  top_5: "dramatic",
  player_analysis: "dramatic",
  tactical_review: "tactical",
  match_preview: "news",
  match_recap: "dramatic",
  story: "emotional",
  historical_explainer: "dramatic",
  opinion_debate: "dramatic",
};

function formatModeLabel(mode: ScriptMode): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(source: GraphContext["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function indexGraphFacts(context: GraphContext): Map<string, GraphContextFact> {
  const index = new Map<string, GraphContextFact>();

  for (const collection of [
    context.rankedFacts,
    context.verifiedFacts,
    context.statisticFacts,
    context.timelineFacts,
    context.fixtureFacts,
  ]) {
    for (const fact of collection) {
      index.set(fact.id, fact);
    }
  }

  return index;
}

function allInputFactIds(context: GraphContext): string[] {
  return [
    ...context.rankedFacts,
    ...context.verifiedFacts,
    ...context.statisticFacts,
    ...context.timelineFacts,
    ...context.fixtureFacts,
  ]
    .filter((fact) => fact.type !== "manual_note")
    .map((fact) => fact.id);
}

function selectRelevantFactIds(narrativePlan: NarrativePlan, context: GraphContext): {
  selectedFactIds: Set<string>;
  suppressedFactIds: string[];
} {
  const allIds = allInputFactIds(context);
  const selectedFactIds = new Set([
    ...narrativePlan.requiredFacts,
    ...narrativePlan.optionalFacts,
  ]);
  const suppressedFactIds = allIds.filter((factId) => !selectedFactIds.has(factId));

  return { selectedFactIds, suppressedFactIds };
}

function filterFactsBySelection(
  facts: GraphContextFact[],
  selectedFactIds: Set<string>,
): GraphContextFact[] {
  return facts.filter((fact) => selectedFactIds.has(fact.id));
}

function buildFactUsagePlan(
  narrativePlan: NarrativePlan,
  promptSections: PromptSection[],
  suppressedFactIds: string[],
): FactUsagePlan {
  return {
    requiredFactIds: [...narrativePlan.requiredFacts],
    optionalFactIds: [...narrativePlan.optionalFacts],
    suppressedFactIds,
    beatAssignments: narrativePlan.beats.map((beat) => ({
      beatId: beat.id,
      factIds: [...beat.requiredFactIds],
    })),
    sectionAssignments: promptSections
      .filter((section) => section.sourceFactIds?.length)
      .map((section) => ({
        sectionId: section.id,
        factIds: [...section.sourceFactIds!],
      })),
  };
}

function buildGroundingRules(
  context: GraphContext,
  narrativePlan: NarrativePlan,
): PromptGroundingRule[] {
  const rules: PromptGroundingRule[] = [];
  let index = 0;

  for (const text of context.groundingRules) {
    const trimmed = text.trim();
    if (!trimmed) {
      continue;
    }

    rules.push({ id: `grounding-${index += 1}`, text: trimmed });
  }

  for (const text of narrativePlan.modeSpecificRules) {
    rules.push({ id: `mode-rule-${index += 1}`, text });
  }

  for (const claim of narrativePlan.forbiddenClaims) {
    rules.push({ id: `forbidden-${index += 1}`, text: `Do not claim: ${claim}` });
  }

  return rules;
}

function buildStyleRules(context: GraphContext, narrativePlan: NarrativePlan): PromptStyleRule[] {
  const tone = MODE_TONE[context.selectedMode];
  const rules: PromptStyleRule[] = [
    {
      id: "tone",
      text: `Use a ${tone} tone throughout the script.`,
    },
    {
      id: "structure",
      text: `Follow the ${narrativePlan.structureLabel} arc in spoken order.`,
    },
    {
      id: "fact-discipline",
      text: "Use only facts listed in the research context — do not invent scores, stats, dates, or records.",
    },
    ...buildStoryStructureStyleRules(context.selectedMode).map((text, index) => ({
      id: `story-structure-${index + 1}`,
      text,
    })),
    ...STORY_STRUCTURE_NARRATION_RULES.map((text, index) => ({
      id: `narration-discipline-${index + 1}`,
      text,
    })),
  ];

  if (context.selectedMode === "top_5") {
    rules.push({
      id: "ranking-order",
      text: "Present ranked entries in the exact order provided, building toward rank 1.",
    });
  }

  if (context.selectedMode === "opinion_debate") {
    rules.push({
      id: "debate-balance",
      text: "Present contrasting angles fairly without inventing unsupported positions.",
    });
  }

  return rules;
}

function buildLengthRules(
  narrativePlan: NarrativePlan,
  targetDurationSeconds?: number,
): PromptLengthRule[] {
  const budget = getNarrationWordBudget(targetDurationSeconds ?? DEFAULT_TARGET_DURATION_SECONDS);

  const rules: PromptLengthRule[] = [
    {
      id: "total-budget",
      label: "Total narration budget",
      guidance: `Target ${budget.targetSeconds}s spoken narration using verified facts only.`,
      targetWordCount: budget.idealMaxWords,
      minWordCount: budget.idealMinWords,
      maxWordCount: budget.hardCapWords,
    },
  ];

  for (const beat of narrativePlan.beats) {
    rules.push({
      id: `beat-${beat.id}`,
      label: beat.label,
      guidance: beat.purpose,
      targetWordCount: beat.targetWordCount,
    });
  }

  return rules;
}

function formatFactLine(fact: GraphContextFact): string {
  return `- ${fact.text.trim()}`;
}

function buildPromptSection(
  kind: PromptSectionKind,
  title: string,
  lines: string[],
  emphasis: PromptSection["emphasis"],
  sourceFactIds?: string[],
  priority = 0,
): PromptSection | null {
  const filtered = lines.map((line) => line.trim()).filter(Boolean);
  if (filtered.length === 0) {
    return null;
  }

  return {
    id: `${kind}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    title,
    priority,
    lines: filtered,
    emphasis,
    ...(sourceFactIds?.length ? { sourceFactIds } : {}),
  };
}

function buildNarrativeDirectiveSection(
  narrativePlan: NarrativePlan,
  factIndex: Map<string, GraphContextFact>,
): PromptSection | null {
  const lines: string[] = [
    `Structure: ${narrativePlan.structureLabel}`,
    "",
    "Beats (planning labels — do not speak these words in narration):",
  ];

  for (const beat of narrativePlan.beats) {
    const factTexts = beat.requiredFactIds
      .map((factId) => factIndex.get(factId)?.text.trim())
      .filter(Boolean);

    const timingNote = beat.openingHook ? " ~1–2 spoken seconds" : "";
    lines.push(
      `- ${beat.label} (~${beat.targetWordCount} words${timingNote}, ${beat.tone}): ${beat.purpose}`,
    );

    if (factTexts.length > 0) {
      lines.push(`  Facts: ${factTexts.join(" | ")}`);
    }
  }

  if (narrativePlan.forbiddenClaims.length > 0) {
    lines.push("", "Forbidden claims:");
    for (const claim of narrativePlan.forbiddenClaims) {
      lines.push(`- ${claim}`);
    }
  }

  return buildPromptSection("narrative_directive", "NARRATIVE PLAN:", lines, "required", undefined, 2);
}

function buildFactSection(
  kind: PromptSectionKind,
  title: string,
  facts: GraphContextFact[],
  emphasis: PromptSection["emphasis"],
  priority: number,
  leadLine?: string,
): PromptSection | null {
  if (facts.length === 0) {
    return null;
  }

  const lines = [
    ...(leadLine ? [leadLine] : []),
    ...facts.map(formatFactLine),
  ];

  return buildPromptSection(
    kind,
    title,
    lines,
    emphasis,
    facts.map((fact) => fact.id),
    priority,
  );
}

function buildPromptSections(
  context: GraphContext,
  narrativePlan: NarrativePlan,
  selectedFactIds: Set<string>,
  groundingRules: PromptGroundingRule[],
): PromptSection[] {
  const factIndex = indexGraphFacts(context);
  const manualNotes = context.verifiedFacts.filter((fact) => fact.type === "manual_note");

  const ranked = filterFactsBySelection(context.rankedFacts, selectedFactIds);
  const verified = filterFactsBySelection(
    context.verifiedFacts.filter((fact) => fact.type !== "manual_note"),
    selectedFactIds,
  );
  const statistics = filterFactsBySelection(context.statisticFacts, selectedFactIds);
  const timeline = filterFactsBySelection(context.timelineFacts, selectedFactIds);
  const fixtures = filterFactsBySelection(context.fixtureFacts, selectedFactIds);

  const sections: PromptSection[] = [];

  const metadata = buildPromptSection(
    "metadata",
    "RESEARCHED FOOTBALL CONTEXT",
    [
      `Mode: ${formatModeLabel(context.selectedMode)}`,
      `Topic: ${context.topic}`,
      `Research source: ${formatProvenanceLabel(context.provenance.source)}`,
      `Research confidence: ${context.confidence.tier} (${context.confidence.percent}%)`,
    ],
    "required",
    undefined,
    1,
  );
  if (metadata) {
    sections.push(metadata);
  }

  const narrativeDirective = buildNarrativeDirectiveSection(narrativePlan, factIndex);
  if (narrativeDirective) {
    sections.push(narrativeDirective);
  }

  const rankedSection = buildFactSection(
    "ranked_facts",
    "RANKED FACTS:",
    ranked,
    "required",
    3,
    ranked.length > 0 ? "Exact order and values below must be preserved in the script." : undefined,
  );
  if (rankedSection) {
    sections.push(rankedSection);
  }

  const primaryEntityLines: string[] = [];
  for (const summary of context.entitySummaries) {
    const kind = summary.kind ? ` (${summary.kind})` : "";
    primaryEntityLines.push(`- ${summary.label}${kind}`);
    for (const line of summary.lines) {
      primaryEntityLines.push(`  - ${line.trim()}`);
    }
  }
  for (const entity of context.primaryEntities) {
    const kind = entity.kind ? ` (${entity.kind})` : "";
    primaryEntityLines.push(`- ${entity.label}${kind}`);
  }

  const primarySection = buildPromptSection(
    "primary_entity",
    "PRIMARY ENTITY:",
    primaryEntityLines,
    "recommended",
    undefined,
    4,
  );
  if (primarySection) {
    sections.push(primarySection);
  }

  for (const [kind, title, facts, priority] of [
    ["fixture", "FIXTURE:", fixtures, 5],
    ["statistics", "STATISTICS:", statistics, 6],
    ["timeline", "EVENTS:", timeline, 7],
    ["verified_facts", "VERIFIED FACTS:", verified, 8],
  ] as const) {
    const section = buildFactSection(kind, title, facts, "recommended", priority);
    if (section) {
      sections.push(section);
    }
  }

  const groundingSection = buildPromptSection(
    "grounding",
    "Grounding rules:",
    groundingRules.map((rule) =>
      rule.text.startsWith("- ") ? rule.text : `- ${rule.text}`,
    ),
    "required",
    undefined,
    9,
  );
  if (groundingSection) {
    sections.push(groundingSection);
  }

  const manualSection = buildFactSection(
    "manual_notes",
    "CREATOR NOTES (manual — not provider-verified):",
    manualNotes,
    "optional",
    10,
  );
  if (manualSection) {
    sections.push(manualSection);
  }

  const warnings = [...new Set(context.warnings.map((warning) => warning.trim()))].filter(Boolean);
  const warningsSection = buildPromptSection(
    "warnings",
    "Warnings (grounding constraints):",
    warnings.map((warning) => `- ${warning}`),
    "required",
    undefined,
    11,
  );
  if (warningsSection) {
    sections.push(warningsSection);
  }

  return sections;
}

function isSparseContext(context: GraphContext): boolean {
  return isSparseGraphContext(context);
}

/**
 * Builds Prompt Intelligence from GraphContext.
 *
 * Orchestrates narrative planning, fact selection, beat mapping, and rule assembly.
 * Does not call OpenAI — not wired into production script generation yet.
 */
export function buildPromptIntelligence(
  input: BuildPromptIntelligenceInput,
): PromptIntelligenceResult {
  const { graphContext, targetDurationSeconds } = input;

  const narrativePlan = buildNarrativePlan({
    graphContext,
    targetDurationSeconds,
  });

  const { selectedFactIds, suppressedFactIds } = selectRelevantFactIds(narrativePlan, graphContext);
  const groundingRules = buildGroundingRules(graphContext, narrativePlan);
  const styleRules = buildStyleRules(graphContext, narrativePlan);
  const lengthRules = buildLengthRules(narrativePlan, targetDurationSeconds);
  const promptSections = buildPromptSections(
    graphContext,
    narrativePlan,
    selectedFactIds,
    groundingRules,
  );
  const factUsagePlan = buildFactUsagePlan(narrativePlan, promptSections, suppressedFactIds);

  const selectedLineCount = promptSections.reduce(
    (total, section) => total + section.lines.length,
    0,
  );

  const alignment = resolvePromptStudioAlignment({
    mode: graphContext.selectedMode,
    topic: graphContext.topic,
  });

  return {
    queryId: graphContext.queryId,
    selectedMode: graphContext.selectedMode,
    narrativePlan,
    promptSections,
    groundingRules,
    styleRules,
    lengthRules,
    factUsagePlan,
    warnings: [...graphContext.warnings],
    confidence: graphContext.confidence,
    diagnostics: {
      graphQueryId: graphContext.queryId,
      inputFactCount: allInputFactIds(graphContext).length,
      selectedSectionCount: promptSections.length,
      selectedLineCount,
      narrativeBeatCount: narrativePlan.beats.length,
      strategyId: narrativePlan.structure,
      sparseContext: isSparseContext(graphContext),
      warnings: [...graphContext.warnings],
      promptStructureId: alignment.promptStructureId,
      studioStrategyId: alignment.studioStrategyId,
      modeTemplateId: alignment.modeTemplateId,
      alignmentStatus: alignment.alignmentStatus,
      mismatchWarnings: alignment.mismatchWarnings,
    },
  };
}
