/**
 * Narrative beat detector verification
 * (run: npm run test:studio-intelligence-beats).
 */
import assert from "node:assert/strict";

import {
  classifySentenceBeat,
  detectNarrativeBeats,
  inferBeatEmotion,
  scoreBeatImportance,
} from "@/features/studio-intelligence/narrative-beat-detector";
import type { NarrativeBeat, StudioIntelligenceInput } from "@/features/studio-intelligence";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeInput(narration: string, mode?: StudioIntelligenceInput["mode"]): StudioIntelligenceInput {
  return {
    topic: "Test topic",
    narration,
    targetDurationSec: 45,
    mode,
  };
}

console.log("studio-intelligence-beats");

test("hook-first narration detects hook", () => {
  const beats = detectNarrativeBeats(
    makeInput("This is insane. Haaland just broke another record in the league."),
  );

  assert.ok(beats.length >= 2);
  assert.equal(beats[0]?.type, "hook");
  assert.equal(classifySentenceBeat("This is insane.", 0, 2), "hook");
});

test("top 5 narration identifies ranking and evidence beats", () => {
  const narration =
    "Here are the top 5 scorers this season. Number 5 is Salah with 20 goals. Number 1 is Haaland with 30 goals. That's the ranking that matters.";
  const beats = detectNarrativeBeats(makeInput(narration, "top_5"));

  assert.ok(beats.some((beat) => beat.type === "evidence"));
  assert.ok(/\btop 5\b/i.test(beats[0]?.text ?? ""));
  assert.ok(beats.some((beat) => /number 5|number 1/i.test(beat.text)));
});

test("debate narration identifies conflict and turning point", () => {
  const narration =
    "Some say he is overrated. However, the stats tell a different story. Then everything changed after that match.";
  const beats = detectNarrativeBeats(makeInput(narration, "opinion_debate"));

  assert.ok(beats.some((beat) => beat.type === "conflict"));
  assert.ok(beats.some((beat) => beat.type === "turning_point"));
  assert.equal(inferBeatEmotion("However, critics argue the opposite."), "tension");
});

test("ending sentence becomes payoff or conclusion", () => {
  const beats = detectNarrativeBeats(
    makeInput(
      "He dominated every duel. The stats prove why he changed the title race. Ultimately, that's why he remains the best.",
    ),
  );

  const last = beats[beats.length - 1];
  assert.ok(last?.type === "conclusion" || last?.type === "payoff");
  assert.ok(["conclusion", "payoff"].includes(last?.type ?? ""));
});

test("importance scores are clamped and tiered", () => {
  const beat: NarrativeBeat = {
    id: "beat-1",
    type: "hook",
    label: "Hook",
    text: "This is insane.",
    order: 0,
    timing: { durationMs: 1200, weight: 0.9 },
    importance: { value: 0.5, tier: "medium" },
  };

  const scored = scoreBeatImportance(beat);
  assert.ok(scored.value >= 0 && scored.value <= 1);
  assert.ok(["low", "medium", "high", "critical"].includes(scored.tier));
  assert.ok((scored.value >= 0.85 && scored.tier === "critical") || scored.tier === "high");
});

test("empty narration returns empty beat list", () => {
  assert.deepEqual(detectNarrativeBeats(makeInput("   ")), []);
  assert.deepEqual(detectNarrativeBeats(makeInput("")), []);
});

console.log("All narrative beat detector checks passed.");
