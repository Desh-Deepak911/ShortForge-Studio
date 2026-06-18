import type { Tone } from "@/types/footiebitz";

const TONE_GUIDANCE: Record<Tone, string> = {
  dramatic: "High-stakes, cinematic tension.",
  funny: "Witty, playful banter.",
  tactical: "Analytical, decision-focused.",
  news: "Concise, factual headlines.",
  emotional: "Passionate, human, fan feeling.",
};

export function buildFootieScriptPrompt(
  topic: string,
  tone: Tone,
  duration: number,
): string {
  const toneGuide = TONE_GUIDANCE[tone];

  return `Topic: "${topic}"
Tone: ${tone} — ${toneGuide}
Target duration: ~${duration}s (scene durations sum ${duration - 2}-${duration + 2}s).

Output rules:
- JSON only. No markdown, explanation, or research notes.
- Do not invent exact scores, stats, minute marks, or records.
- Keep title, hook, caption, and hashtags short.
- Exactly 5 scenes.
- subtitle: max 12 words.
- imagePrompt: max 8 words, cinematic football visual, no text/logos/watermarks.
- imageSearchQuery: max 6 words, stock-photo search phrase for the scene.

{
  "title": "Short title",
  "hook": "One-line hook",
  "caption": "Short YouTube caption",
  "hashtags": ["#Football", "#Shorts"],
  "scenes": [
    {
      "id": "1",
      "duration": 6,
      "subtitle": "Spain started with total control.",
      "imagePrompt": "Spain football team attack",
      "imageSearchQuery": "Spain football team match"
    }
  ]
}`;
}
