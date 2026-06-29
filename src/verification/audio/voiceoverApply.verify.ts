/**
 * Apply Changes flow verification (run: npm run test:voiceover-apply).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FootieScript } from "@/features/story/types";
import { ensureTimelineItems, resolveStoryDurationSec } from "@/features/story/utils";
import { applyVoiceoverChanges, syncFootieScript } from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("voiceover apply");

test("Apply Changes hook uses applyVoiceoverRegeneration", () => {
  const hook = readFileSync(join(process.cwd(), "src/hooks/useStoryVoiceoverApply.ts"), "utf8");
  assert.match(hook, /applyVoiceoverRegeneration/);
  assert.match(hook, /narration: narrationText/);
  assert.match(hook, /restoreVoiceoverBaseline/);
  assert.match(hook, /getCanonicalVoiceover/);
  assert.match(hook, /handleVoiceoverReplacement/);
});

test("Apply Changes UI shows loading and error states", () => {
  const card = readFileSync(join(process.cwd(), "src/components/VoiceSettingsCard.tsx"), "utf8");
  assert.match(card, /Updating narration/);
  assert.match(card, /Couldn&apos;t update narration/);
  assert.match(card, /disabled=\{loading \|\| controlsDisabled/);
});

test("applyVoiceoverChanges preserves transitions and scene order", () => {
  const scenes = [
    {
      id: "a",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "First",
    },
    {
      id: "b",
      start: 3,
      end: 6,
      duration: 3,
      subtitle: "Second",
    },
  ] as FootieScript["scenes"];

  const timelineItems = ensureTimelineItems(scenes);
  const transition = timelineItems.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");

  const script = syncFootieScript({
    title: "Test",
    narration: "Story narration text.",
    totalDuration: 6,
    scenes,
    timelineItems: timelineItems.map((item) =>
      item.type === "transition"
        ? { ...item, effect: "fade" as const, durationMs: 500, label: "Fade" }
        : item,
    ),
  });

  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new-audio",
    voiceoverDurationMs: 4200,
    voiceSettings: { voice: "fable", speed: 1.1 },
  });

  assert.equal(next.scenes[0]?.id, "a");
  assert.equal(next.scenes[1]?.id, "b");
  assert.equal(next.voiceoverDurationMs, 4200);
  assert.equal(next.scenes[0]?.durationMs, 2100);
  assert.equal(next.scenes[1]?.durationMs, 2100);
  assert.equal(next.scenes[0]?.subtitle, "First");
  assert.equal(next.scenes[1]?.subtitle, "Second");

  const nextTransition = next.timelineItems?.find((item) => item.type === "transition");
  assert.ok(nextTransition && nextTransition.type === "transition");
  assert.equal(nextTransition.effect, "fade");
  assert.equal(nextTransition.durationMs, 500);
  assert.equal(nextTransition.label, "Fade");
  assert.equal(resolveStoryDurationSec(next), 4.2);
});

console.log("\nAll voiceover apply checks passed.");
