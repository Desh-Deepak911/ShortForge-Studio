import type {
  PromptIntelligence,
  PromptIntelligenceSection,
} from "./prompt-intelligence.types";

function renderSection(section: PromptIntelligenceSection): string[] {
  return [section.title, ...section.lines];
}

/**
 * Renders Prompt Intelligence into final research prompt text for LLM injection.
 *
 * Not wired into production — `graphContextToPromptText()` remains the live path.
 */
export function promptIntelligenceToPromptText(
  promptIntelligence: PromptIntelligence,
): string {
  const ordered = [...promptIntelligence.sections].sort(
    (left, right) => left.priority - right.priority,
  );

  const lines: string[] = [];

  for (const [index, section] of ordered.entries()) {
    if (index > 0) {
      lines.push("");
    }
    lines.push(...renderSection(section));
  }

  return lines.join("\n").trim();
}
