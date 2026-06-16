import type { Tone } from "@/types/footiebitz";

const TONE_GUIDANCE: Record<Tone, string> = {
  dramatic: "Cinematic, high-stakes, tension-building. Emphasise turning points and climactic moments.",
  funny: "Witty, playful, banter-friendly. Keep it sharp but still about the football.",
  tactical: "Analytical and insight-led. Highlight decisions, patterns, and why moments mattered.",
  news: "Concise, headline-driven, factual. Report the story clearly without hype for hype's sake.",
  emotional: "Passionate and human. Lean into pride, heartbreak, redemption, and fan feeling.",
};

export function buildFootieScriptPrompt(
  topic: string,
  tone: Tone,
  duration: number,
): string {
  const toneGuide = TONE_GUIDANCE[tone];

  return `You are a YouTube Shorts scriptwriter for football content.

Write a vertical short-form script about this match or topic:
"${topic}"

Tone: ${tone}
${toneGuide}

Target total duration: ~${duration} seconds (acceptable range: ${duration - 2} to ${duration + 2} seconds).

Content focus:
- Key moments, drama, tactics, comebacks, goals, controversy, or emotional angles
- Build narrative momentum across the short
- Do NOT invent exact stats, scores, minute marks, or player records unless they are widely known and clearly tied to this topic
- If unsure of a specific fact, keep language general rather than fabricating numbers

Scene rules:
- Create exactly 5 or 6 scenes
- Each scene must include: duration (seconds), subtitle, imagePrompt
- Subtitles must be punchy and short (max 10 words)
- Scene durations should sum to roughly ${duration} seconds
- imagePrompt describes a cinematic football-related visual with NO text, logos, or watermarks in the image

Output rules:
- Return valid JSON only
- No markdown
- No code fences
- No commentary before or after the JSON

Return JSON matching this shape:
{
  "title": "Short catchy title",
  "hook": "Opening hook that grabs attention in one line",
  "caption": "YouTube Shorts caption for the post",
  "hashtags": ["#Football", "#Shorts"],
  "scenes": [
    {
      "duration": 5,
      "subtitle": "Punchy on-screen text",
      "imagePrompt": "Cinematic visual description for background image generation"
    }
  ]
}`;
}
