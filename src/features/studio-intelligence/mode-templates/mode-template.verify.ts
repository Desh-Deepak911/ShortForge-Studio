/**
 * Mode template registry verification (run via npm run test:studio-intelligence-mode-templates).
 */
import assert from "node:assert/strict";

import { listModeTemplateIds, MODE_TEMPLATE_REGISTRY, resolveModeTemplate } from "./index";
import { getDefaultStoryStrategy, getStoryStrategyById } from "../story-strategy";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("mode-template");

test("registry includes all nine mode templates", () => {
  const ids = listModeTemplateIds();
  assert.equal(ids.length, 9);
  assert.ok(ids.includes("default"));
  assert.ok(ids.includes("debate"));
  assert.ok(ids.includes("countdown"));
  assert.ok(ids.includes("tactical_analysis"));
});

test("resolveModeTemplate maps strategy to template", () => {
  const debate = resolveModeTemplate(getStoryStrategyById("debate"));
  assert.equal(debate.templateId, "debate");
  assert.ok(debate.targetSceneSlots.some((slot) => slot.label === "Verdict"));

  const countdown = resolveModeTemplate(getStoryStrategyById("countdown"));
  assert.ok(countdown.targetSceneSlots.some((slot) => slot.label === "#5"));
  assert.ok(countdown.targetSceneSlots.some((slot) => slot.label === "#1"));
});

test("each template defines slots, arcs, and profiles", () => {
  for (const template of Object.values(MODE_TEMPLATE_REGISTRY)) {
    assert.ok(template.targetSceneSlots.length >= 3);
    assert.ok(template.targetArcSequence.length >= 2);
    assert.ok(template.targetBeatSequence.length >= 3);
    assert.ok(template.preferredSceneRoles.length >= 3);
    assert.ok(template.preferredVisualIntents.length >= 2);
    assert.ok(template.timingProfile.hookPacing);
    assert.ok(template.captionProfile.hookStyle);
  }
});

test("default template resolves from default strategy", () => {
  assert.equal(resolveModeTemplate(getDefaultStoryStrategy()).templateId, "default");
});

console.log("\nAll mode template registry checks passed.");
