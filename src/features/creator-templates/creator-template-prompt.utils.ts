import { getCreatorTemplate, isCreatorTemplateId } from "./creator-template.utils";
import type {
  CreatorTemplateId,
  CreatorTemplatePromptHints,
} from "./creator-template.types";

export interface CreatorTemplatePromptContextInput {
  templateId?: CreatorTemplateId | string | null;
  templatePromptHints?: CreatorTemplatePromptHints | null;
}

export interface CreatorTemplatePromptContext {
  templateId?: CreatorTemplateId;
  templateTitle?: string;
  hints: CreatorTemplatePromptHints;
}

const TEMPLATE_STRUCTURE_REINFORCEMENTS: Partial<Record<CreatorTemplateId, string>> = {
  educational_bullet_points:
    "Favor a clear hook, 3–5 bullet-like spoken beats with concise explanations, a quick recap, and a soft CTA.",
  top_10_countdown:
    "Favor countdown/ranked structure with numbered progression, escalating energy, and a strong final reveal.",
  transfer_news:
    "Favor a headline hook, current situation, key parties, why it matters, and what happens next.",
};

const MAX_HINT_LINE_LENGTH = 320;

function sanitizeHintLine(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HINT_LINE_LENGTH);
}

function normalizeTemplatePromptHints(
  hints: CreatorTemplatePromptHints | null | undefined,
): CreatorTemplatePromptHints | null {
  if (!hints) {
    return null;
  }

  const normalized: CreatorTemplatePromptHints = {
    tone: sanitizeHintLine(hints.tone),
    structure: sanitizeHintLine(hints.structure),
    openingStyle: sanitizeHintLine(hints.openingStyle),
    pacing: sanitizeHintLine(hints.pacing),
    ctaStyle: sanitizeHintLine(hints.ctaStyle),
  };

  const avoid = sanitizeHintLine(hints.avoid);
  if (avoid) {
    normalized.avoid = avoid;
  }

  if (
    !normalized.tone ||
    !normalized.structure ||
    !normalized.openingStyle ||
    !normalized.pacing ||
    !normalized.ctaStyle
  ) {
    return null;
  }

  return normalized;
}

/** Builds advisory template prompt context from request/brief metadata. Unknown templates safely no-op. */
export function buildCreatorTemplatePromptContext(
  input: CreatorTemplatePromptContextInput,
): CreatorTemplatePromptContext | null {
  const template = input.templateId ? getCreatorTemplate(input.templateId) : null;
  const hints =
    normalizeTemplatePromptHints(input.templatePromptHints) ??
    (template ? normalizeTemplatePromptHints(template.promptHints) : null);

  if (!hints) {
    return null;
  }

  const templateId =
    template?.id ??
    (typeof input.templateId === "string" && isCreatorTemplateId(input.templateId)
      ? input.templateId
      : undefined);

  return {
    ...(templateId ? { templateId } : {}),
    ...(template?.title ? { templateTitle: template.title } : {}),
    hints,
  };
}

/** Formats template context into a compact advisory block for script prompt assembly. */
export function formatCreatorTemplatePromptBlock(
  context: CreatorTemplatePromptContext | null | undefined,
): string {
  if (!context?.hints) {
    return "";
  }

  const lines = [
    "Creator template guidance (advisory only — the user's content brief above is primary and must not be replaced):",
  ];

  if (context.templateTitle) {
    lines.push(`Template: ${context.templateTitle}`);
  }

  lines.push(
    `- Structure: ${context.hints.structure}`,
    `- Tone: ${context.hints.tone}`,
    `- Opening style: ${context.hints.openingStyle}`,
    `- Pacing: ${context.hints.pacing}`,
    `- CTA style: ${context.hints.ctaStyle}`,
  );

  if (context.hints.avoid) {
    lines.push(`- Avoid: ${context.hints.avoid}`);
  }

  const reinforcement = context.templateId
    ? TEMPLATE_STRUCTURE_REINFORCEMENTS[context.templateId]
    : undefined;
  if (reinforcement) {
    lines.push(`- Reinforcement: ${reinforcement}`);
  }

  lines.push(
    "- Treat template guidance as delivery and structure hints only — never override the user's topic, facts, or provided context.",
  );

  return lines.join("\n");
}

/** Resolves a safe prompt block from template metadata, or an empty string when absent. */
export function resolveCreatorTemplatePromptBlock(
  input: CreatorTemplatePromptContextInput,
): string {
  return formatCreatorTemplatePromptBlock(buildCreatorTemplatePromptContext(input));
}
