import type { CreatorTemplate, CreatorTemplateId } from "./creator-template.types";

export const CREATOR_TEMPLATE_IDS: readonly CreatorTemplateId[] = [
  "educational_bullet_points",
  "football_match_preview",
  "player_analysis",
  "top_10_countdown",
  "history_explained",
  "transfer_news",
  "tactical_breakdown",
  "documentary",
  "myth_vs_reality",
] as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

const BUILT_IN_CREATOR_TEMPLATES: readonly CreatorTemplate[] = deepFreeze([
  {
    id: "educational_bullet_points",
    title: "Educational Bullet Points",
    description:
      "Clear, scannable facts and takeaways — ideal for teaching one idea per beat.",
    category: "educational",
    recommendedFor: ["rules explainers", "quick lessons", "fan education", "how-it-works clips"],
    defaults: {
      scriptMode: "story",
      sceneCount: 5,
      targetDurationSec: 45,
      speechStylePreset: "documentary",
      captionPreset: "documentary",
    },
    promptHints: {
      tone: "Clear, approachable, and authoritative without jargon overload.",
      structure: "Hook, numbered or labeled bullet beats, quick recap, soft CTA.",
      openingStyle: "State the question or misconception the viewer came for.",
      pacing: "One idea per scene; short clauses; pause between major points.",
      ctaStyle: "Invite a follow, save, or deeper dive on the next topic.",
      avoid: "Long monologues, nested tangents, and unlabeled stat dumps.",
    },
    styleProfile: {
      visualStyle: "Clean lower-thirds, simple diagrams, and readable on-screen labels.",
      assetStyle: "Infographic stills, rulebook clips, and training-ground b-roll.",
      captionStyle: "Documentary weight with fade-safe readability.",
      musicMood: {
        mood: "Focused and neutral",
        energy: "low",
        tempo: "moderate",
        recommendedUse: ["explainers", "education", "on-screen text support"],
      },
    },
  },
  {
    id: "football_match_preview",
    title: "Football Match Preview",
    description: "Build stakes, form, and key matchups before kick-off.",
    category: "match_day",
    recommendedFor: ["pre-match shorts", "derby build-up", "fixture previews"],
    defaults: {
      scriptMode: "match_preview",
      sceneCount: 6,
      targetDurationSec: 45,
      speechStylePreset: "countdown",
      captionPreset: "sports",
      audioMixer: {
        music: { duckingEnabled: true, duckingStrength: 0.4 },
      },
    },
    promptHints: {
      tone: "Anticipatory, energetic, and confident about what matters.",
      structure: "Stakes hook, form snapshot, key battles, prediction or question.",
      openingStyle: "Lead with why this fixture matters tonight.",
      pacing: "Rising tension toward kick-off; clip phrases on big names.",
      ctaStyle: "Ask for score predictions or who wins the key duel.",
      avoid: "Post-match spoilers, full line-up speculation as fact, and filler history.",
    },
    styleProfile: {
      visualStyle: "Bold team colors, fixture graphics, and countdown energy.",
      assetStyle: "Recent match highlights, tunnel shots, and team crest overlays.",
      captionStyle: "Sports bounce with high-contrast emphasis on names and scores.",
      musicMood: {
        mood: "Anticipation and hype",
        energy: "high",
        tempo: "fast",
        recommendedUse: ["pre-match", "countdowns", "fixture promos"],
      },
    },
  },
  {
    id: "player_analysis",
    title: "Player Analysis",
    description: "Zoom in on one player’s role, form, and impact on the game.",
    category: "analysis",
    recommendedFor: ["spotlight reels", "form checks", "tactical player lenses"],
    defaults: {
      scriptMode: "player_analysis",
      sceneCount: 6,
      targetDurationSec: 60,
      speechStylePreset: "documentary",
      captionPreset: "documentary",
    },
    promptHints: {
      tone: "Insightful, measured, and evidence-led.",
      structure: "Player intro, role, recent evidence, verdict on impact.",
      openingStyle: "Name the player and the single question this video answers.",
      pacing: "Steady build with one proof point per scene.",
      ctaStyle: "Ask whether they are underrated or overdue for a call-up.",
      avoid: "Generic praise, unrelated club drama, and unsupported hot takes.",
    },
    styleProfile: {
      visualStyle: "Spotlight framing, heat-map style overlays, and stat callouts.",
      assetStyle: "Isolated player clips, touch maps, and close-up reactions.",
      captionStyle: "Documentary semibold with subtle shadow for longer reads.",
      musicMood: {
        mood: "Analytical and cool",
        energy: "medium",
        tempo: "moderate",
        recommendedUse: ["analysis", "player focus", "studio breakdowns"],
      },
    },
  },
  {
    id: "top_10_countdown",
    title: "Top 10 Countdown",
    description: "Ranked list with escalating stakes from #10 to #1.",
    category: "list",
    recommendedFor: ["ranked lists", "season awards", "viral countdowns"],
    defaults: {
      scriptMode: "top_5",
      sceneCount: 10,
      targetDurationSec: 60,
      speechStylePreset: "countdown",
      captionPreset: "tiktok",
      audioMixer: {
        voice: { volume: 1.1 },
        music: { volume: 0.22, duckingEnabled: true },
      },
    },
    promptHints: {
      tone: "Punchy, competitive, and building toward the #1 reveal.",
      structure: "List promise, descending ranks with one hook each, #1 payoff.",
      openingStyle: "Tease the #1 pick without revealing it immediately.",
      pacing: "Accelerate energy as ranks climb; shorter lines near the top.",
      ctaStyle: "Challenge viewers to disagree with the order in comments.",
      avoid: "Equal-length entries, burying the #1, and unclear ranking criteria.",
    },
    styleProfile: {
      visualStyle: "Rank numbers, bold transitions, and progressive reveal graphics.",
      assetStyle: "Quick-cut highlights with numbered overlays.",
      captionStyle: "TikTok pop motion for short, punchy rank labels.",
      musicMood: {
        mood: "Competitive escalation",
        energy: "high",
        tempo: "fast",
        recommendedUse: ["lists", "rankings", "short-form hooks"],
      },
    },
  },
  {
    id: "history_explained",
    title: "History Explained",
    description: "Context, legacy, and backstory for moments fans half-remember.",
    category: "history",
    recommendedFor: ["club history", "era explainers", "legacy deep dives"],
    defaults: {
      scriptMode: "historical_explainer",
      sceneCount: 7,
      targetDurationSec: 60,
      speechStylePreset: "calm_storytelling",
      captionPreset: "documentary",
    },
    promptHints: {
      tone: "Reflective, authoritative, and narrative-driven.",
      structure: "Present-day hook, origin, turning points, legacy today.",
      openingStyle: "Anchor on a familiar moment then rewind to the root cause.",
      pacing: "Unhurried scenes with deliberate pauses on pivotal dates.",
      ctaStyle: "Invite viewers to share their memory of the era.",
      avoid: "Present-tense spoilers, chronology jumps without signposts, and trivia lists.",
    },
    styleProfile: {
      visualStyle: "Archive grain, era labels, and timeline markers.",
      assetStyle: "Historical footage, newspaper headlines, and legacy photo stills.",
      captionStyle: "Documentary fade-safe captions for longer narration.",
      musicMood: {
        mood: "Nostalgic and reflective",
        energy: "low",
        tempo: "slow",
        recommendedUse: ["history", "legacy", "long-form storytelling"],
      },
    },
  },
  {
    id: "transfer_news",
    title: "Transfer News",
    description: "Fast, headline-style updates on deals, rumors, and confirmed moves.",
    category: "news",
    recommendedFor: ["transfer windows", "breaking updates", "rumor roundups"],
    defaults: {
      scriptMode: "match_recap",
      sceneCount: 5,
      targetDurationSec: 30,
      speechStylePreset: "news",
      captionPreset: "news",
      audioMixer: {
        music: { volume: 0.15, duckingEnabled: true, duckingStrength: 0.45 },
      },
    },
    promptHints: {
      tone: "Crisp, neutral, and headline-first — rumor vs confirmed clearly labeled.",
      structure: "Lead headline, supporting details, fee or source context, what's next.",
      openingStyle: "Open with the biggest name or fee in the first line.",
      pacing: "Tight broadcast rhythm; no scene without a new fact.",
      ctaStyle: "Ask who the club should sign next or rate the deal.",
      avoid: "Presenting rumors as done deals, agent quotes without context, and filler adjectives.",
    },
    styleProfile: {
      visualStyle: "Broadcast lower-thirds, ticker energy, and club badge stacks.",
      assetStyle: "Press conference clips, training arrivals, and social rumor graphics.",
      captionStyle: "News slide-in with pill highlights for names and fees.",
      musicMood: {
        mood: "Urgent and informational",
        energy: "medium",
        tempo: "moderate",
        recommendedUse: ["headlines", "transfers", "deadline day"],
      },
    },
  },
  {
    id: "tactical_breakdown",
    title: "Tactical Breakdown",
    description: "Formations, patterns, and decisions that decided the match.",
    category: "tactical",
    recommendedFor: ["post-match analysis", "shape explainers", "coaching lenses"],
    defaults: {
      scriptMode: "tactical_review",
      sceneCount: 7,
      targetDurationSec: 60,
      speechStylePreset: "documentary",
      captionPreset: "documentary",
    },
    promptHints: {
      tone: "Analytical, precise, and coach-like without over-coaching jargon.",
      structure: "Match frame, shape setup, trigger moment, adjustment, outcome.",
      openingStyle: "State the tactical question the match answered.",
      pacing: "One pattern per scene; use clear before/after beats.",
      ctaStyle: "Ask what adjustment the manager should have made.",
      avoid: "Vague buzzwords, unrelated player gossip, and unsupported xG monologues.",
    },
    styleProfile: {
      visualStyle: "Pitch diagrams, pressing arrows, and phase labels.",
      assetStyle: "Wide tactical angles, freeze frames, and training shape clips.",
      captionStyle: "Documentary captions with room for on-screen diagram labels.",
      musicMood: {
        mood: "Focused analysis",
        energy: "low",
        tempo: "slow",
        recommendedUse: ["tactics", "coaching content", "breakdowns"],
      },
    },
  },
  {
    id: "documentary",
    title: "Documentary",
    description: "Long-form human story with cinematic pacing and emotional arc.",
    category: "documentary",
    recommendedFor: ["player journeys", "club culture", "emotional features"],
    defaults: {
      scriptMode: "story",
      sceneCount: 8,
      targetDurationSec: 60,
      speechStylePreset: "documentary",
      captionPreset: "cinematic",
      audioMixer: {
        voice: { volume: 1 },
        music: { volume: 0.2, duckingEnabled: true, duckingStrength: 0.3 },
        master: { peakProtection: true },
      },
    },
    promptHints: {
      tone: "Cinematic, empathetic, and emotionally grounded.",
      structure: "Human hook, context, conflict, resolution, lingering image.",
      openingStyle: "Start on a sensory or emotional detail before naming the subject.",
      pacing: "Deliberate pauses; let moments breathe between revelations.",
      ctaStyle: "Invite viewers to share what the story meant to them.",
      avoid: "Tabloid framing, rushed conclusions, and stat-first cold opens.",
    },
    styleProfile: {
      visualStyle: "Filmic grade, slow pushes, and chapter-style scene breaks.",
      assetStyle: "B-roll atmosphere, interview framing, and archival inserts.",
      captionStyle: "Cinematic shadow with gravitas on key lines.",
      musicMood: {
        mood: "Emotional and cinematic",
        energy: "medium",
        tempo: "slow",
        recommendedUse: ["features", "tributes", "long-form shorts"],
      },
    },
  },
  {
    id: "myth_vs_reality",
    title: "Myth vs Reality",
    description: "Challenge a popular take with evidence, tension, and a clear verdict.",
    category: "debate",
    recommendedFor: ["hot takes", "fan myths", "contrarian explainers"],
    defaults: {
      scriptMode: "opinion_debate",
      sceneCount: 6,
      targetDurationSec: 45,
      speechStylePreset: "debate",
      captionPreset: "cinematic",
    },
    promptHints: {
      tone: "Assertive, fair, and rhetorically sharp — both sides get airtime.",
      structure: "State the myth, steelman it, counter with evidence, verdict.",
      openingStyle: "Quote the popular myth verbatim before challenging it.",
      pacing: "Contrast beats between claim and rebuttal; stress pivot words.",
      ctaStyle: "Ask viewers which side they were on before watching.",
      avoid: "Strawman arguments, personal attacks, and inconclusive wishy-washy endings.",
    },
    styleProfile: {
      visualStyle: "Split contrast, myth/reality labels, and debate-style typography.",
      assetStyle: "Evidence clips, stat overlays, and reaction cutaways.",
      captionStyle: "Cinematic emphasis on pivot phrases and verdict lines.",
      musicMood: {
        mood: "Tension and contrast",
        energy: "medium",
        tempo: "moderate",
        recommendedUse: ["debate", "myth-busting", "opinion content"],
      },
    },
  },
]);

const TEMPLATE_BY_ID = new Map<string, CreatorTemplate>(
  BUILT_IN_CREATOR_TEMPLATES.map((template) => [template.id, template]),
);

/** Returns all built-in creator templates in stable registry order. */
export function getCreatorTemplateRegistry(): readonly CreatorTemplate[] {
  return BUILT_IN_CREATOR_TEMPLATES;
}

/** Returns a built-in template when the id is known. */
export function getCreatorTemplateFromRegistry(id: string): CreatorTemplate | undefined {
  return TEMPLATE_BY_ID.get(id.trim().toLowerCase());
}
