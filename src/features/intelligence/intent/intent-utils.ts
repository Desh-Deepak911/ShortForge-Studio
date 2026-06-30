export {
  combineIntentText,
  emptyTopicAnalysis,
  emptyTopicParseResult,
  formatIntentLabel,
  formatSubIntentLabel,
  isMatchTopic,
  normalizeIntentTopic,
  splitMatchTopic,
} from "@/features/intent-engine";

/** @deprecated Use intent-engine weighted scoring — kept for backward compatibility. */
export function hasPastMatchSignals(text: string): boolean {
  return (
    /\brecap\b/i.test(text) ||
    /\bhighlights\b/i.test(text) ||
    /\bfull[- ]time\b/i.test(text) ||
    /\bft\b/i.test(text) ||
    /\blast night\b/i.test(text) ||
    /\byesterday\b/i.test(text) ||
    /\bresult\b/i.test(text) ||
    /\bbeat\b/i.test(text) ||
    /\bdefeated\b/i.test(text) ||
    /\bwon \d/i.test(text) ||
    /\bdrew \d/i.test(text) ||
    /\blost \d/i.test(text) ||
    /\b\d-\d\b/.test(text)
  );
}

/** @deprecated Use intent-engine weighted scoring — kept for backward compatibility. */
export function hasFutureMatchSignals(text: string): boolean {
  return (
    /\bpreview\b/i.test(text) ||
    /\bbuild[- ]up\b/i.test(text) ||
    /\bbefore kick[- ]?off\b/i.test(text) ||
    /\bahead of\b/i.test(text) ||
    /\bupcoming\b/i.test(text) ||
    /\bthis weekend\b/i.test(text) ||
    /\btonight\b/i.test(text) ||
    /\btomorrow\b/i.test(text) ||
    /\bwho will win\b/i.test(text)
  );
}

/** @deprecated Use intent-engine weighted scoring — kept for backward compatibility. */
export function scorePatternRules(
  text: string,
  rules: { id: string; weight: number; pattern: RegExp; label: string }[],
) {
  const scores = new Map<string, { intent: string; score: number; signals: string[] }>();

  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const existing = scores.get(rule.id) ?? { intent: rule.id, score: 0, signals: [] };
    existing.score += rule.weight;
    existing.signals.push(rule.label);
    scores.set(rule.id, existing);
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/** @deprecated Use intent-engine weighted scoring — kept for backward compatibility. */
export function scoreSubIntentRules(
  text: string,
  rules: { subIntent: string; weight: number; pattern: RegExp; label: string }[],
) {
  const scores = new Map<string, { subIntent: string; score: number; signals: string[] }>();

  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const existing = scores.get(rule.subIntent) ?? {
      subIntent: rule.subIntent,
      score: 0,
      signals: [],
    };
    existing.score += rule.weight;
    existing.signals.push(rule.label);
    scores.set(rule.subIntent, existing);
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/** @deprecated Use intent-engine confidence scoring — kept for backward compatibility. */
export function resolveIntentConfidence(
  top: { score: number } | undefined,
  runnerUp: { score: number } | undefined,
) {
  if (!top || top.score <= 0) {
    return "low" as const;
  }

  const gap = runnerUp ? top.score - runnerUp.score : top.score;

  if (top.score >= 4 && gap >= 2) {
    return "high" as const;
  }

  if (top.score >= 2 && gap >= 1) {
    return "medium" as const;
  }

  return "low" as const;
}

/** @deprecated Use intent-engine confidence scoring — kept for backward compatibility. */
export function resolveConfidencePercent(
  primary: { score: number },
  runnerUp: { score: number } | undefined,
  confidence: "high" | "medium" | "low",
): number {
  if (primary.score <= 0) {
    return 0;
  }

  const gap = runnerUp ? Math.max(0, primary.score - runnerUp.score) : primary.score;
  const raw = 58 + primary.score * 6 + gap * 4;
  const capped = Math.round(Math.min(97, Math.max(38, raw)));

  if (confidence === "high") {
    return Math.min(97, Math.max(88, capped));
  }

  if (confidence === "medium") {
    return Math.min(87, Math.max(68, capped));
  }

  return Math.min(67, Math.max(38, capped));
}

/** @deprecated Use intent-engine reasoning builder — kept for backward compatibility. */
export function buildReasoning(
  intentScore: { intent: string; score: number; signals: string[] },
  subIntentScore: { subIntent: string; signals: string[] } | undefined,
  confidence: "high" | "medium" | "low",
): string {
  const intentPart = `Primary intent "${intentScore.intent}" from: ${intentScore.signals.join(", ")}.`;
  const subPart = subIntentScore
    ? ` Sub-intent "${subIntentScore.subIntent}" from: ${subIntentScore.signals.join(", ")}.`
    : "";
  const confidencePart = ` Confidence is ${confidence} (score ${intentScore.score}).`;

  return `${intentPart}${subPart}${confidencePart}`.trim();
}
