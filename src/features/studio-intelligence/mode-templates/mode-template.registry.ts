import type { ModeTemplate, ModeTemplateSlot } from "./mode-template.types";

function slot(
  slotId: string,
  label: string,
  preferredRole: ModeTemplateSlot["preferredRole"],
  overrides: Partial<Omit<ModeTemplateSlot, "slotId" | "label" | "preferredRole">> = {},
): ModeTemplateSlot {
  return {
    slotId,
    label,
    preferredRole,
    ...overrides,
  };
}

const DEFAULT_TEMPLATE: ModeTemplate = {
  templateId: "default",
  displayName: "Default Story",
  targetBeatSequence: ["hook", "setup", "context", "payoff"],
  targetArcSequence: ["opening", "development", "ending"],
  targetSceneSlots: [
    slot("hook", "Hook", "intro", {
      preferredKind: "hook_opener",
      preferredVisualIntent: "player_portrait",
      timingPacing: "punchy",
      captionStyleHint: "bold_hook",
    }),
    slot("story", "Story", "context", {
      preferredVisualIntent: "neutral_broll",
      timingPacing: "normal",
    }),
    slot("payoff", "Payoff", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "archive_footage",
      timingPacing: "normal",
      captionStyleHint: "default",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "payoff"],
  preferredVisualIntents: ["player_portrait", "neutral_broll", "archive_footage"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "normal",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "default",
    closeStyle: "default",
  },
};

const DEBATE_TEMPLATE: ModeTemplate = {
  templateId: "debate",
  displayName: "Debate",
  targetBeatSequence: ["question", "argument_a", "argument_b", "evidence", "counterpoint", "verdict"],
  targetArcSequence: ["opening", "conflict", "ending"],
  targetSceneSlots: [
    slot("question_hook", "Question Hook", "intro", {
      preferredKind: "text_card",
      preferredVisualIntent: "comparison_split",
      timingPacing: "punchy",
      captionStyleHint: "debate",
    }),
    slot("argument_a", "Argument A", "context", {
      preferredKind: "player_spotlight",
      preferredVisualIntent: "player_portrait",
      captionStyleHint: "debate",
    }),
    slot("argument_b", "Argument B", "conflict", {
      preferredKind: "debate_split",
      preferredVisualIntent: "comparison_split",
      captionStyleHint: "debate",
    }),
    slot("evidence", "Evidence", "evidence", {
      preferredKind: "stat_moment",
      preferredVisualIntent: "stat_overlay",
      captionEmphasis: "stat",
      captionStyleHint: "stat_highlight",
    }),
    slot("counterpoint", "Counterpoint", "conflict", {
      preferredKind: "debate_split",
      preferredVisualIntent: "comparison_split",
      captionStyleHint: "debate",
    }),
    slot("verdict", "Verdict", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "text_card",
      timingPacing: "normal",
      captionStyleHint: "debate",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "conflict", "evidence", "payoff"],
  preferredVisualIntents: ["comparison_split", "stat_overlay", "text_card"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "fast",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "debate",
    bodyStyle: "debate",
    evidenceStyle: "stat_highlight",
    closeStyle: "debate",
  },
};

const COMPARISON_TEMPLATE: ModeTemplate = {
  templateId: "comparison",
  displayName: "Comparison",
  targetBeatSequence: ["claim", "side_a", "side_b", "evidence", "verdict"],
  targetArcSequence: ["opening", "development", "conflict", "ending"],
  targetSceneSlots: [
    slot("claim", "Bold Claim", "intro", {
      preferredKind: "text_card",
      preferredVisualIntent: "comparison_split",
      timingPacing: "punchy",
    }),
    slot("side_a", "Side A", "context", {
      preferredVisualIntent: "player_portrait",
    }),
    slot("side_b", "Side B", "conflict", {
      preferredKind: "comparison",
      preferredVisualIntent: "comparison_split",
    }),
    slot("evidence", "Evidence", "evidence", {
      preferredKind: "stat_moment",
      preferredVisualIntent: "stat_overlay",
      captionEmphasis: "stat",
    }),
    slot("verdict", "Verdict", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "text_card",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "conflict", "evidence", "payoff"],
  preferredVisualIntents: ["comparison_split", "stat_overlay", "player_portrait"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "fast",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "stat_highlight",
    closeStyle: "default",
  },
};

const COUNTDOWN_TEMPLATE: ModeTemplate = {
  templateId: "countdown",
  displayName: "Countdown",
  targetBeatSequence: ["hook", "rank_5", "rank_4", "rank_3", "rank_2", "rank_1", "final_reveal"],
  targetArcSequence: ["opening", "development", "ending"],
  targetSceneSlots: [
    slot("hook", "Hook", "intro", {
      preferredKind: "hook_opener",
      preferredVisualIntent: "text_card",
      timingPacing: "punchy",
    }),
    slot("rank_5", "#5", "evidence", {
      preferredKind: "ranked_reveal",
      preferredVisualIntent: "text_card",
      timingPacing: "fast",
      captionEmphasis: "stat",
      captionStyleHint: "stat_highlight",
    }),
    slot("rank_4", "#4", "evidence", {
      preferredKind: "ranked_reveal",
      preferredVisualIntent: "text_card",
      timingPacing: "fast",
      captionEmphasis: "stat",
    }),
    slot("rank_3", "#3", "evidence", {
      preferredKind: "ranked_reveal",
      preferredVisualIntent: "text_card",
      timingPacing: "fast",
    }),
    slot("rank_2", "#2", "evidence", {
      preferredKind: "ranked_reveal",
      preferredVisualIntent: "text_card",
      timingPacing: "fast",
    }),
    slot("rank_1", "#1", "climax", {
      preferredKind: "ranked_reveal",
      preferredVisualIntent: "text_card",
      timingPacing: "normal",
      captionEmphasis: "stat",
    }),
    slot("final_reveal", "Final Reveal", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "text_card",
      timingPacing: "normal",
    }),
  ],
  preferredSceneRoles: ["intro", "evidence", "climax", "payoff", "cta"],
  preferredVisualIntents: ["text_card", "stat_overlay"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "fast",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "stat_highlight",
    evidenceStyle: "stat_highlight",
    closeStyle: "stat_highlight",
  },
};

const BIOGRAPHY_TEMPLATE: ModeTemplate = {
  templateId: "biography",
  displayName: "Biography",
  targetBeatSequence: ["hook", "origin", "rise", "peak", "legacy"],
  targetArcSequence: ["opening", "development", "climax", "ending"],
  targetSceneSlots: [
    slot("hook", "Hook", "intro", {
      preferredKind: "player_spotlight",
      preferredVisualIntent: "player_portrait",
      timingPacing: "punchy",
    }),
    slot("origin", "Origin", "context", {
      preferredVisualIntent: "archive_footage",
      timingPacing: "normal",
    }),
    slot("rise", "Rise", "evidence", {
      preferredKind: "stat_moment",
      preferredVisualIntent: "match_action",
      timingPacing: "normal",
    }),
    slot("peak", "Peak", "climax", {
      preferredKind: "match_highlight",
      preferredVisualIntent: "match_action",
      timingPacing: "normal",
    }),
    slot("legacy", "Legacy", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "archive_footage",
      timingPacing: "normal",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "evidence", "climax", "payoff"],
  preferredVisualIntents: ["player_portrait", "match_action", "archive_footage"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "normal",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "stat_highlight",
    closeStyle: "default",
  },
};

const HISTORY_TEMPLATE: ModeTemplate = {
  templateId: "history",
  displayName: "History",
  targetBeatSequence: ["hook", "context", "turning_point", "impact", "legacy"],
  targetArcSequence: ["opening", "development", "resolution", "ending"],
  targetSceneSlots: [
    slot("hook", "Hook", "intro", {
      preferredKind: "hook_opener",
      preferredVisualIntent: "archive_footage",
      timingPacing: "punchy",
    }),
    slot("context", "Context", "context", {
      preferredVisualIntent: "archive_footage",
      timingPacing: "slow",
    }),
    slot("turning_point", "Turning Point", "climax", {
      preferredKind: "match_highlight",
      preferredVisualIntent: "archive_footage",
      timingPacing: "slow",
    }),
    slot("impact", "Impact", "evidence", {
      preferredVisualIntent: "timeline_graphic",
      timingPacing: "normal",
    }),
    slot("legacy", "Legacy", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "archive_footage",
      timingPacing: "normal",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "climax", "evidence", "payoff"],
  preferredVisualIntents: ["archive_footage", "timeline_graphic"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "slow",
    climaxPacing: "slow",
    ctaPacing: "normal",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "default",
    closeStyle: "default",
  },
};

const TACTICAL_TEMPLATE: ModeTemplate = {
  templateId: "tactical_analysis",
  displayName: "Tactical Analysis",
  targetBeatSequence: ["hook", "formation", "pattern", "key_play", "outcome"],
  targetArcSequence: ["opening", "development", "conflict", "ending"],
  targetSceneSlots: [
    slot("hook", "Hook", "intro", {
      preferredKind: "text_card",
      preferredVisualIntent: "stat_overlay",
      timingPacing: "punchy",
    }),
    slot("formation", "Formation / Setup", "context", {
      preferredVisualIntent: "timeline_graphic",
      timingPacing: "normal",
    }),
    slot("pattern", "Pattern", "evidence", {
      preferredKind: "stat_moment",
      preferredVisualIntent: "stat_overlay",
      captionEmphasis: "stat",
      captionStyleHint: "stat_highlight",
    }),
    slot("key_play", "Key Play", "climax", {
      preferredKind: "match_highlight",
      preferredVisualIntent: "match_action",
      timingPacing: "normal",
    }),
    slot("outcome", "Outcome", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "stat_overlay",
      timingPacing: "normal",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "evidence", "climax", "payoff"],
  preferredVisualIntents: ["stat_overlay", "timeline_graphic", "match_action"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "normal",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "stat_highlight",
    closeStyle: "default",
  },
};

const MATCH_PREVIEW_TEMPLATE: ModeTemplate = {
  templateId: "match_preview",
  displayName: "Match Preview",
  targetBeatSequence: ["stakes_hook", "team_a", "team_b", "key_battle", "prediction"],
  targetArcSequence: ["opening", "development", "conflict", "ending"],
  targetSceneSlots: [
    slot("stakes_hook", "Stakes Hook", "intro", {
      preferredKind: "hook_opener",
      preferredVisualIntent: "match_action",
      timingPacing: "punchy",
    }),
    slot("team_a", "Team A", "context", {
      preferredVisualIntent: "team_crest",
    }),
    slot("team_b", "Team B", "context", {
      preferredVisualIntent: "team_crest",
    }),
    slot("key_battle", "Key Battle", "conflict", {
      preferredKind: "debate_split",
      preferredVisualIntent: "comparison_split",
      timingPacing: "fast",
    }),
    slot("prediction", "Prediction", "payoff", {
      preferredKind: "text_card",
      preferredVisualIntent: "text_card",
      timingPacing: "normal",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "conflict", "payoff"],
  preferredVisualIntents: ["match_action", "team_crest", "comparison_split"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "fast",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "default",
    closeStyle: "default",
  },
};

const NEWS_TEMPLATE: ModeTemplate = {
  templateId: "news",
  displayName: "News",
  targetBeatSequence: ["breaking_hook", "context", "what_changed", "impact", "what_next"],
  targetArcSequence: ["opening", "development", "climax", "ending"],
  targetSceneSlots: [
    slot("breaking_hook", "Breaking Hook", "intro", {
      preferredKind: "hook_opener",
      preferredVisualIntent: "match_action",
      timingPacing: "punchy",
    }),
    slot("context", "Context", "context", {
      preferredVisualIntent: "archive_footage",
      timingPacing: "fast",
    }),
    slot("what_changed", "What Changed", "evidence", {
      preferredKind: "stat_moment",
      preferredVisualIntent: "text_card",
      timingPacing: "fast",
    }),
    slot("impact", "Impact", "climax", {
      preferredKind: "match_highlight",
      preferredVisualIntent: "crowd_atmosphere",
      timingPacing: "normal",
    }),
    slot("what_next", "What Next", "payoff", {
      preferredKind: "closing_moment",
      preferredVisualIntent: "text_card",
      timingPacing: "normal",
      captionStyleHint: "cta",
    }),
  ],
  preferredSceneRoles: ["intro", "context", "evidence", "climax", "payoff"],
  preferredVisualIntents: ["match_action", "text_card", "crowd_atmosphere"],
  timingProfile: {
    hookPacing: "punchy",
    bodyPacing: "fast",
    climaxPacing: "normal",
    ctaPacing: "punchy",
  },
  captionProfile: {
    hookStyle: "bold_hook",
    bodyStyle: "default",
    evidenceStyle: "stat_highlight",
    closeStyle: "cta",
  },
};

export const MODE_TEMPLATE_REGISTRY: Readonly<Record<ModeTemplate["templateId"], ModeTemplate>> =
  Object.freeze({
    default: DEFAULT_TEMPLATE,
    debate: DEBATE_TEMPLATE,
    comparison: COMPARISON_TEMPLATE,
    countdown: COUNTDOWN_TEMPLATE,
    biography: BIOGRAPHY_TEMPLATE,
    history: HISTORY_TEMPLATE,
    tactical_analysis: TACTICAL_TEMPLATE,
    match_preview: MATCH_PREVIEW_TEMPLATE,
    news: NEWS_TEMPLATE,
  });

export function getModeTemplateById(templateId: ModeTemplate["templateId"]): ModeTemplate {
  return MODE_TEMPLATE_REGISTRY[templateId];
}

export function listModeTemplates(): readonly ModeTemplate[] {
  return Object.freeze(Object.values(MODE_TEMPLATE_REGISTRY));
}
