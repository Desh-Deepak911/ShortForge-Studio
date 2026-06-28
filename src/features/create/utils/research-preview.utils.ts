import type {
  ResearchPreviewConfidence,
  ResearchPreviewDisplayStatus,
  ResearchPreviewEntity,
  ResearchPreviewState,
} from "@/features/create/types/research-preview.types";
import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { hasAssembledUsefulContent } from "@/features/create/utils/research-preview-assembled.utils";
import type { GenerateScriptResearchPreview, ScriptMode } from "@/types/footiebitz";

export function buildGenerateScriptResearchPreview(
  preview: ResearchPreviewState,
): GenerateScriptResearchPreview | undefined {
  if (
    (preview.status !== "success" && preview.status !== "fallback") ||
    !preview.topic ||
    !preview.mode ||
    !preview.assembledContext ||
    !preview.intelligenceQuery
  ) {
    return undefined;
  }

  if (!hasAssembledUsefulContent(preview.assembledContext)) {
    return undefined;
  }

  return {
    queryId: preview.intelligenceQuery.id,
    topic: preview.topic,
    mode: preview.mode,
  };
}

export function isResearchPreviewReusableForGenerate(input: {
  preview: ResearchPreviewState;
  topic: string;
  scriptMode: ScriptMode;
  enableResearch: boolean;
}): boolean {
  if (!input.enableResearch) {
    return false;
  }

  const payload = buildGenerateScriptResearchPreview(input.preview);
  if (!payload) {
    return false;
  }

  return (
    payload.topic.trim() === input.topic.trim() && payload.mode === input.scriptMode
  );
}

const ENTITY_LABELS: Record<ResearchPreviewEntity, string> = {
  player: "Player",
  team: "Team",
  match: "Match",
  competition: "Competition",
  ranking: "Ranking",
  year_season: "Year/season",
  unknown: "General topic",
};

const DISPLAY_STATUS_TONE: Record<ResearchPreviewDisplayStatus, string> = {
  Idle: "bg-surface-elevated/50 text-muted ring-border/25",
  Searching: "bg-accent/10 text-accent ring-accent/20",
  Ready: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  Limited: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  Unavailable: "bg-red-500/10 text-red-300 ring-red-500/20",
};

const CONFIDENCE_TONE: Record<ResearchPreviewConfidence, string> = {
  High: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  Medium: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  Low: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
};

const FRIENDLY_WARNING_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /no matching teams/i,
    message: "We couldn't match those teams to live data.",
  },
  {
    pattern: /no recent fixture/i,
    message: "No recent match was found for this topic.",
  },
  {
    pattern: /standings unavailable/i,
    message: "League standings aren't available right now.",
  },
  {
    pattern: /no ranking data/i,
    message: "Ranked lists aren't available — the story will stay qualitative.",
  },
  {
    pattern: /topscorers|top scorers|ranked.*unavailable/i,
    message: "Verified ranking data isn't available for this request.",
  },
  {
    pattern: /unreadable profile/i,
    message: "Player details couldn't be read clearly from the provider.",
  },
  {
    pattern: /curated all-time|static fallback|fallback/i,
    message: "Using curated reference notes instead of live stats.",
  },
  {
    pattern: /no verified player/i,
    message: "Player stats aren't verified — use cautious wording.",
  },
  {
    pattern: /squad selection|participation|if selected/i,
    message: "Squad or participation details may be unconfirmed.",
  },
  {
    pattern: /exact xg unavailable/i,
    message: "Expected goals (xG) aren't available for this match.",
  },
  {
    pattern: /provider|api-football|configured/i,
    message: "Live football data is limited for this topic.",
  },
];

export function researchPreviewDisplayStatusTone(status: ResearchPreviewDisplayStatus): string {
  return DISPLAY_STATUS_TONE[status];
}

export function researchPreviewConfidenceTone(confidence: ResearchPreviewConfidence): string {
  return CONFIDENCE_TONE[confidence];
}

export function resolveResearchPreviewDisplayStatus(
  preview: ResearchPreviewState,
  assembled?: AssembledContext,
): ResearchPreviewDisplayStatus {
  switch (preview.status) {
    case "idle":
      return "Idle";
    case "loading":
      return "Searching";
    case "error":
      return "Unavailable";
    case "fallback":
      return "Limited";
    case "success":
      return assembled && hasAssembledUsefulContent(assembled) ? "Ready" : "Limited";
  }
}

export function formatResearchDetectedLabel(entity: ResearchPreviewEntity): string {
  return ENTITY_LABELS[entity];
}

export function formatResearchPreviewWarning(warning: string): string {
  const trimmed = warning.trim();
  if (!trimmed) {
    return trimmed;
  }

  for (const { pattern, message } of FRIENDLY_WARNING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return message;
    }
  }

  if (trimmed.length > 160) {
    return `${trimmed.slice(0, 157).trimEnd()}…`;
  }

  return trimmed;
}

export function dedupeFriendlyWarnings(warnings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const warning of warnings) {
    const friendly = formatResearchPreviewWarning(warning);
    if (!friendly || seen.has(friendly)) {
      continue;
    }
    seen.add(friendly);
    result.push(friendly);
  }

  return result;
}
