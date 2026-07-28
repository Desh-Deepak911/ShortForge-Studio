/**
 * Story strategy verification
 * (run: npm run test:studio-intelligence-story-strategy).
 */
import assert from "node:assert/strict";

import {
  DEFAULT_STORY_STRATEGY_ID,
  STORY_STRATEGY_IDS,
} from "@/features/studio-intelligence/story-strategy/story-strategy.constants";
import { listStoryStrategies } from "@/features/studio-intelligence/story-strategy/story-strategy.registry";
import {
  getDefaultStoryStrategy,
  getStoryStrategyRegistry,
  listStoryStrategyIds,
  mapModeToStoryStrategyId,
  resolveStoryStrategy,
} from "@/features/studio-intelligence/story-strategy/story-strategy.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("studio-intelligence-story-strategy");

test("all strategies resolve correctly", () => {
  for (const id of STORY_STRATEGY_IDS) {
    const strategy = resolveStoryStrategy(id);

    assert.equal(strategy.id, id);
    assert.ok(strategy.displayName.length > 0);
    assert.ok(strategy.preferredStructure.length > 0);
    assert.ok(strategy.plannerHints.length > 0);
    assert.ok(Object.isFrozen(strategy));
  }

  assert.equal(listStoryStrategies().length, STORY_STRATEGY_IDS.length);
  assert.equal(listStoryStrategyIds().length, STORY_STRATEGY_IDS.length);
  assert.equal(Object.keys(getStoryStrategyRegistry()).length, STORY_STRATEGY_IDS.length);
});

test("script modes map to expected strategies", () => {
  assert.equal(resolveStoryStrategy("story").id, "default");
  assert.equal(resolveStoryStrategy("historical_explainer").id, "history");
  assert.equal(resolveStoryStrategy("opinion_debate").id, "debate");
  assert.equal(resolveStoryStrategy("comparison").id, "comparison");
  assert.equal(resolveStoryStrategy("top_5").id, "countdown");
  assert.equal(resolveStoryStrategy("player_analysis").id, "biography");
  assert.equal(resolveStoryStrategy("match_preview").id, "match_preview");
  assert.equal(resolveStoryStrategy("tactical_review").id, "tactical_analysis");
  assert.equal(resolveStoryStrategy("match_recap").id, "news");
});

test("unknown mode falls back to default", () => {
  const strategy = resolveStoryStrategy("totally_unknown_mode");
  const defaultStrategy = getDefaultStoryStrategy();

  assert.equal(strategy.id, DEFAULT_STORY_STRATEGY_ID);
  assert.equal(strategy.id, defaultStrategy.id);
  assert.equal(mapModeToStoryStrategyId("totally_unknown_mode"), undefined);
  assert.equal(resolveStoryStrategy(undefined).id, "default");
  assert.equal(resolveStoryStrategy(null).id, "default");
});

test("strategies remain immutable", () => {
  const strategy = resolveStoryStrategy("debate");

  assert.ok(Object.isFrozen(strategy));
  assert.ok(Object.isFrozen(strategy.hookStrategy));
  assert.ok(Object.isFrozen(strategy.arcStrategy.preferredArcSequence));
  assert.ok(Object.isFrozen(strategy.plannerHints));
});

console.log("All story strategy checks passed.");
