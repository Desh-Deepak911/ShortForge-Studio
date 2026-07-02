import type { ScriptMode, Tone } from "@/types/footiebitz";
import { buildResearchUnavailablePromptRules } from "@/features/research/utils/research-grounding.utils";
import {
  buildStoryStructurePromptLines,
  STORY_STRUCTURE_NARRATION_RULES,
} from "@/features/intelligence/prompts/story-structure-intelligence.utils";
import {
  buildTop5ModeFocus,
  buildTop5StructureRule,
  hasRankedPlayerDataInContextText,
  TOP_5_MISSING_RANKINGS_RULES,
  TOP_5_RANKED_DATA_RULES,
} from "@/lib/ai/top5-script-prompt.utils";

/** Word limits passed into script-only narration prompts. */
export interface StoryScriptWordBudget {
  idealMinWords: number;
  idealMaxWords: number;
  hardCapWords: number;
  maxDurationSeconds: number;
}

const RESEARCHED_FOOTBALL_CONTEXT_HEADER = "RESEARCHED FOOTBALL CONTEXT";

const SCRIPT_MODE_VOICE: Partial<Record<ScriptMode, string>> = {
  tactical_review:
    "Analytical and pattern-led — formations, pressing triggers, structural control, transitions, recurring patterns, and the turning point that changed the game.",
  match_preview:
    "Forward-looking build-up — stakes, recent form, key battles to watch, and what could decide the match. Tease kick-off without inventing a result.",
  match_recap:
    "Tell the story of the game — key moments in order, momentum shifts, and why it changed. Land the result only if provided in context.",
  player_analysis:
    "Player-led — role in the system, strengths, weaknesses, and concrete impact. Keep the lens on the player, not a full team recap.",
  top_5:
    "Ranked and punchy — countdown energy from #5 to #1, each entry evidence-backed, sharp transitions, and a top pick that feels earned.",
};

const SCRIPT_MODE_GUIDANCE: Record<ScriptMode, string> = {
  story:
    "Cinematic football storytelling — hook, context, stakes, emotional arc, and a satisfying close. One continuous narrated short, not a list.",
  tactical_review:
    "Tactical breakdown for smart fans — formations, pressing triggers, midfield control, transitions, key patterns, and turning points. Explain what happened on the pitch structurally.",
  match_preview:
    "Pre-match build-up — stakes, recent form, head-to-head tension, key battles to watch, and a prediction-style ending that tees up kick-off without claiming a result.",
  match_recap:
    "Post-match review — turning points, momentum shifts, what decided the game, and a clear conclusion. Reference stats only when provided.",
  player_analysis:
    "Player-focused lens — role in the system, strengths, weaknesses, match impact, and a brief future angle. The player is the story, not a full team recap.",
  top_5:
    "Ranked countdown — five clear beats from #5 to #1 (or #1 reveal), each with a hook, punchy transition, and reason it earned its place.",
  historical_explainer:
    "Historical documentary — context, timeline of key moments, and legacy. Explain why this moment, rivalry, or record still matters.",
  opinion_debate:
    "Balanced debate — present the strongest case on each side, then land a clear, confident final take. Acknowledge counter-arguments without sounding neutral.",
};

const STATS_AND_CONTEXT_RULES = `Stats and context rules (strict):
- If the user provides stats, formations, events, or extra context, use them accurately in the narration.
- If stats are NOT provided, do NOT invent exact numbers — no fake xG, possession percentages, shot counts, pass completion rates, or precise scorelines.
- Do not invent exact dates, minute marks, records, or player stat lines unless clearly stated in the brief or additional context.
- When data is missing, write clear analysis without fake stats — use safe qualitative phrasing: "controlled the midfield", "created the better chances", "looked sharper in transition", "edge in the final third", "momentum swung", "pressure told in the closing stages".
- Mention uncertainty naturally and only when needed — never guess specifics to sound authoritative.`;

const RESEARCHED_CONTEXT_RULES = `Researched football context rules (strict):
- The RESEARCHED FOOTBALL CONTEXT block is your primary factual grounding — treat every listed fact, stat, event, lineup, and standing as verified.
- Use scores, percentages, player stat lines, minute marks, and standings from that block accurately when present.
- Do NOT invent exact numbers, xG, possession, shot counts, records, or results that are not in the brief or researched context.
- If a stat is missing or a warning says it is unavailable, write sharp mode-fit analysis without fake precision — patterns, roles, momentum, and impact in qualitative terms.
- Mention uncertainty naturally and sparingly only when the researched context itself is incomplete — do not fill gaps with fabricated stats.
- Heed warnings in the researched context (for example unavailable xG).`;

const TONE_GUIDANCE: Record<Tone, string> = {
  dramatic:
    "Build tension like a prestige sports documentary — weight, silence, and consequence in every line.",
  funny:
    "Sharp and observational, like a witty football storyteller — never slapstick, always grounded in the game.",
  tactical:
    "Thoughtful and analytical — explain decisions, patterns, and turning points with clarity, not jargon.",
  news:
    "Direct and authoritative — headline energy with documentary depth, not bullet-point recaps.",
  emotional:
    "Human and reflective — fans, identity, memory, and what the moment meant beyond the scoreline.",
};

const EXAMPLE_JSON = `{
  "title": "When Madrid and Barça Stopped Pretending",
  "totalDuration": 45,
  "narration": "For decades, this rivalry was more than football — it was politics, pride, and proof. Every meeting carried the weight of cities that never needed an excuse to disagree. When form dipped and doubt crept in, neither side could afford to look weak. The stakes were never just three points; they were identity on a knife edge. And in moments like these, history does not stay in the past — it walks onto the pitch with them.",
  "scenes": [
    {
      "id": "1",
      "start": 0,
      "end": 9,
      "duration": 9,
      "subtitle": "More than a derby"
    },
    {
      "id": "2",
      "start": 9,
      "end": 18,
      "duration": 9,
      "subtitle": "Pride on the line"
    },
    {
      "id": "3",
      "start": 18,
      "end": 27,
      "duration": 9,
      "subtitle": "Form fades, pressure rises"
    },
    {
      "id": "4",
      "start": 27,
      "end": 36,
      "duration": 9,
      "subtitle": "Identity at stake"
    },
    {
      "id": "5",
      "start": 36,
      "end": 45,
      "duration": 9,
      "subtitle": "History walks out with them"
    }
  ]
}`;

export function buildFootieScriptPrompt(
  topic: string,
  tone: Tone,
  duration: number,
): string {
  const toneGuide = TONE_GUIDANCE[tone];
  const durationMin = Math.max(30, duration - 5);
  const durationMax = Math.min(60, duration + 5);

  return `You are a football documentary writer for FootieBitz.

Your job: turn the user's topic into one continuous narrated short — cinematic, informative, and emotionally grounded — lasting roughly ${duration} seconds (${durationMin}–${durationMax}s).

Content brief:
"${topic}"

Tone: ${tone} — ${toneGuide}

Story goals:
- Write one cohesive narrated short, not a list of facts.
- Open narration with a strong hook that pulls the viewer in immediately.
- Explain history, context, rivalry, stakes, or development tied to the brief.
- If the brief mentions multiple matches, weave them into one unified story arc — do not treat them as separate segments.
- Make narration rich and descriptive. Use full sentences and vivid language. Never reduce the story to one-liners or slogan-style lines.
- Subtitles are on-screen text only: short, punchy phrases (max 12 words). They must not repeat or paraphrase the full narration.

Hard rules:
- Return JSON only. No markdown. No code fences. No commentary before or after the JSON.
- Do not include extra metadata or image fields beyond the schema.
- Do not invent exact scores, dates, minute marks, records, or statistics unless the brief states them clearly.
- If a fact is uncertain, speak in general terms — tension, reputation, momentum, rivalry, consequence — rather than fabricating specifics.
- Split the narration into exactly 5 timed scenes.
- Scene durations must sum to totalDuration (within ±2 seconds of ${duration}s).
- Each scene needs id, start, end, duration, and subtitle. Times must be contiguous: scene 1 starts at 0, each scene's start equals the previous scene's end, and the final scene's end equals totalDuration.
- duration must equal end minus start for every scene.

Output shape:
${EXAMPLE_JSON}`;
}

const STORY_SCRIPT_EXAMPLE_JSON = `{
  "title": "When Madrid and Barça Stopped Pretending",
  "narration": "For decades, this rivalry was more than football — it was politics, pride, and proof. Every meeting carried the weight of cities that never needed an excuse to disagree. When form dipped and doubt crept in, neither side could afford to look weak. The stakes were never just three points; they were identity on a knife edge. And in moments like these, history does not stay in the past — it walks onto the pitch with them."
}`;

function hasResearchedFootballContext(context?: string): boolean {
  return Boolean(context?.includes(RESEARCHED_FOOTBALL_CONTEXT_HEADER));
}

export interface BuildStoryScriptPromptOptions {
  researchAttemptedWithoutData?: boolean;
  /** When true/false, overrides RANKED PLAYER DATA detection for top_5 mode. */
  top5RankedDataAvailable?: boolean;
  /** Advisory creator template block — omitted when unset. */
  templatePromptBlock?: string;
}

function resolveBuildStoryScriptPromptOptions(
  researchAttemptedWithoutDataOrOptions: boolean | BuildStoryScriptPromptOptions = false,
): BuildStoryScriptPromptOptions {
  if (typeof researchAttemptedWithoutDataOrOptions === "boolean") {
    return { researchAttemptedWithoutData: researchAttemptedWithoutDataOrOptions };
  }

  return researchAttemptedWithoutDataOrOptions;
}

function formatIdealWordCount(wordBudget: StoryScriptWordBudget): string {
  if (wordBudget.idealMinWords === wordBudget.idealMaxWords) {
    return String(wordBudget.idealMinWords);
  }

  return `${wordBudget.idealMinWords}–${wordBudget.idealMaxWords}`;
}

function formatStoryScriptWordBudgetSection(
  duration: number,
  wordBudget: StoryScriptWordBudget,
  options: { hasResearchedContext: boolean; hasRankedPlayerData: boolean; tone: Tone },
): string {
  const idealWords = formatIdealWordCount(wordBudget);
  const lines = [
    "Script length budget (hard rules — non-negotiable):",
    `- Target duration: ${duration}s`,
    `- Ideal word count: ${idealWords}`,
    `- Hard maximum word count: ${wordBudget.hardCapWords}`,
    "- Do not exceed the hard maximum.",
    "- Shorter is better than complete.",
  ];

  if (options.hasRankedPlayerData) {
    lines.push(
      "- Top 5 ranked countdown: include every researched player name and goal total — coverage beats brevity.",
    );
  } else if (options.hasResearchedContext) {
    lines.push(
      "- Use research context selectively.",
      "- Do not include every stat.",
      "- Prioritize the strongest 3–5 facts only.",
    );
  }

  if (options.tone === "dramatic") {
    lines.push(
      "- Dramatic tone must not increase length — intensity comes from word choice and pacing, not extra sentences.",
    );
  }

  lines.push(
    `- The \`narration\` field MUST stay within ${wordBudget.hardCapWords} words. Shorter is fine; longer is invalid.`,
  );

  if (duration === 30) {
    lines.push(
      "",
      "30-second structure (compress for length — keep the selected mode's voice and intent):",
      "- Short, punchy opening — ~1–2 spoken seconds, no long setup.",
      "- 2–3 compact beats in the middle.",
      "- Payoff ending tied to the brief — not a generic sign-off.",
    );
  }

  return lines.join("\n");
}

export function buildStoryScriptPrompt(
  topic: string,
  tone: Tone,
  duration: number,
  scriptMode: ScriptMode = "story",
  context?: string,
  wordBudget?: StoryScriptWordBudget,
  researchAttemptedWithoutDataOrOptions: boolean | BuildStoryScriptPromptOptions = false,
): string {
  const promptOptions = resolveBuildStoryScriptPromptOptions(researchAttemptedWithoutDataOrOptions);
  const researchAttemptedWithoutData = promptOptions.researchAttemptedWithoutData === true;
  const toneGuide = TONE_GUIDANCE[tone];
  const modeGuide = SCRIPT_MODE_GUIDANCE[scriptMode];
  const modeVoice = SCRIPT_MODE_VOICE[scriptMode];
  const isTop5Mode = scriptMode === "top_5";
  const trimmedContext = context?.trim();
  const hasContext = Boolean(trimmedContext);
  const hasResearchedContext = hasResearchedFootballContext(trimmedContext);
  const rankedDataInContext = hasRankedPlayerDataInContextText(trimmedContext);
  const hasRankedPlayerData =
    isTop5Mode &&
    (promptOptions.top5RankedDataAvailable === true ||
      (promptOptions.top5RankedDataAvailable !== false && rankedDataInContext));
  const top5MissingRankings = isTop5Mode && !hasRankedPlayerData;
  const modeFocus = isTop5Mode && !hasRankedPlayerData
    ? buildTop5ModeFocus(false).map((line) => `- ${line}`).join("\n")
    : buildStoryStructurePromptLines(scriptMode).join("\n");
  const storyStructureRules = STORY_STRUCTURE_NARRATION_RULES.map((rule) => `- ${rule}`).join("\n");
  const lengthSection = wordBudget
    ? formatStoryScriptWordBudgetSection(duration, wordBudget, {
        hasResearchedContext,
        hasRankedPlayerData,
        tone,
      })
    : `Target length when spoken: roughly ${duration} seconds (${Math.max(15, duration - 5)}–${Math.min(60, duration + 5)}s).`;

  const contextBlock = hasResearchedContext
    ? `\n\nResearched football context (API-backed factual grounding — use accurately; do not invent beyond this):\n${trimmedContext}`
    : hasContext
      ? `\n\nAdditional context (provided by the user — use accurately; do not invent beyond this):\n${trimmedContext}`
      : "\n\nAdditional context: none provided.";

  const contextRules = hasRankedPlayerData
    ? `${RESEARCHED_CONTEXT_RULES}\n\n${TOP_5_RANKED_DATA_RULES}`
    : top5MissingRankings
      ? `${STATS_AND_CONTEXT_RULES}\n\n${TOP_5_MISSING_RANKINGS_RULES}${
          researchAttemptedWithoutData
            ? `\n\n${buildResearchUnavailablePromptRules(topic)}`
            : ""
        }`
      : hasResearchedContext
        ? RESEARCHED_CONTEXT_RULES
        : researchAttemptedWithoutData
          ? `${STATS_AND_CONTEXT_RULES}\n\n${buildResearchUnavailablePromptRules(topic)}`
          : STATS_AND_CONTEXT_RULES;

  const structureRule = isTop5Mode
    ? buildTop5StructureRule(hasRankedPlayerData)
    : scriptMode === "story"
      ? "- Write one cohesive cinematic narration — not a list of facts or bullet points."
      : "- Write one continuous spoken narration — structured strongly for the selected mode but flowing as natural speech, not bullet points.";

  const researchedSelectivityRule =
    hasResearchedContext && wordBudget && !hasRankedPlayerData
      ? "- When researched context is provided, cite only the strongest 3–5 facts that fit the budget — accuracy over coverage."
      : null;

  const rankedPlayerGroundingRule = hasRankedPlayerData
    ? "- Ground the countdown in RANKED PLAYER DATA — mention every ranked item in order with exact names and goal totals."
    : null;

  const top5MissingRankingsRule = top5MissingRankings
    ? "- Top 5 ranked data is missing — do not deliver a fake countdown; use a cautious data-unavailable script or ask for a narrower scope."
    : null;

  const factualGroundingRule = hasRankedPlayerData
    ? rankedPlayerGroundingRule
    : top5MissingRankings
      ? top5MissingRankingsRule
      : hasResearchedContext
        ? "- Ground every factual claim in the brief and researched context above. Prefer verified stats and events from research when available."
        : researchAttemptedWithoutData
          ? "- Football research returned no verified data — stay qualitative and do not backfill facts from general knowledge."
          : hasContext
            ? "- Ground factual claims in the brief and additional context above."
            : "- When specific facts are not in the brief, stay qualitative — do not guess numbers or results.";

  const modeVoiceBlock = modeVoice
    ? `\nMode voice (strongly shape the narration):\n- ${modeVoice}\n`
    : "";

  const templateSection = promptOptions.templatePromptBlock?.trim()
    ? `\n${promptOptions.templatePromptBlock.trim()}\n`
    : "";

  return `Generate a voiceover-ready narration script for a YouTube Short.

You are a football storyteller for FootieBitz. Write one continuous spoken script meant to be read aloud as the full voiceover.

Script mode: ${scriptMode.replace(/_/g, " ")} — ${modeGuide}
${modeVoiceBlock}
${lengthSection}

Content brief:
"${topic}"${contextBlock}

Tone: ${tone} — ${toneGuide}

Mode structure — cover these beats in order:
${modeFocus}

Story structure narration rules:
${storyStructureRules}

${contextRules}
${templateSection}
Writing rules:
- Return JSON only. No markdown. No code fences. No commentary before or after the JSON.
- Output exactly two fields: \`title\` and \`narration\`. Nothing else.
- Do not output scenes, captions, subtitles, timestamps, image prompts, hashtags, or extra metadata.
${structureRule}
- Open with a short, punchy first line (~1–2 spoken seconds when possible). Use full sentences and vivid language suitable for TTS.
- Do not say planning labels aloud (hook, story, conclusion, payoff, or beat titles).
- End with a factual or emotional payoff — not generic like/subscribe CTAs.
- Make the narration unmistakably fit the selected script mode — structure, emphasis, and vocabulary should match the mode voice above.
${factualGroundingRule ? `\n${factualGroundingRule}` : ""}
${researchedSelectivityRule ? `\n${researchedSelectivityRule}` : ""}

Output shape:
${STORY_SCRIPT_EXAMPLE_JSON}`;
}

function buildScenePlanExampleJson(sceneCount: number): string {
  const subtitles = [
    "More than a derby",
    "Pride on the line",
    "Form fades, pressure rises",
    "Identity at stake",
    "History walks out with them",
    "The crowd holds its breath",
    "Legacy written tonight",
  ];

  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    id: String(index + 1),
    subtitle: subtitles[index % subtitles.length],
    sceneType:
      index === 0
        ? "intro"
        : index === sceneCount - 1
          ? "ending"
          : index === Math.floor(sceneCount / 2)
            ? "match"
            : "context",
  }));

  return JSON.stringify({ scenes }, null, 2);
}

export function buildScenePlanPrompt(
  prompt: string,
  script: { title: string; narration: string },
  sceneCount: number,
  voiceoverDurationMs: number,
): string {
  const voiceoverDurationSec = Math.round(voiceoverDurationMs / 1000);
  const sceneDurationSec = Math.max(1, Math.round(voiceoverDurationSec / sceneCount));

  return `Plan visual scenes for a YouTube Short that already has a finished voiceover script.

The narration is locked — do not rewrite, extend, shorten, or replace it. Your job is to design ${sceneCount} visual scene beats that support what the narrator says.

Content brief:
"${prompt}"

Story title:
"${script.title}"

Full narration (read-only — do not output this again):
"""${script.narration}"""

Timing (already decided — do not output timestamps):
- Total voiceover: ~${voiceoverDurationSec}s (${voiceoverDurationMs}ms)
- Scenes: ${sceneCount}
- ~${sceneDurationSec}s per scene (even split)

Scene planning rules:
- Return JSON only. No markdown. No code fences. No commentary.
- Output exactly ${sceneCount} scenes in playback order.
- Each scene needs \`id\` and \`subtitle\` (short on-screen caption, max 12 words).
- Optional \`sceneType\`: intro | context | match | transition | ending.
- Subtitles are visual captions only — punchy phrases, not the full narration text.
- Do not output narration, voiceover copy, image prompts, durations, or timestamps.
- Do not invent new story facts beyond what the narration supports.
- Map scenes sequentially across the narration from opening hook to closing beat.

Output shape:
${buildScenePlanExampleJson(sceneCount)}`;
}
