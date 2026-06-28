/**
 * Research Preview display mapping (run: npm run test:research-preview-display).
 */
import assert from "node:assert/strict";

import {
  dedupeFriendlyWarnings,
  resolveResearchPreviewDisplayStatus,
} from "@/features/create/utils/research-preview-display.utils";
import {
  resolveResearchPreviewConfidence,
  resolveResearchPreviewSourceLabel,
  selectResearchPreviewFacts,
} from "@/features/create/utils/research-preview-display.legacy.utils";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import { NO_RELIABLE_FOOTBALL_DATA_WARNING } from "@/features/research/utils/research-grounding.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("researchPreviewDisplay");

test("display status maps preview lifecycle to creator labels", () => {
  assert.equal(resolveResearchPreviewDisplayStatus({ status: "idle" }), "Idle");
  assert.equal(resolveResearchPreviewDisplayStatus({ status: "loading" }), "Searching");
  assert.equal(resolveResearchPreviewDisplayStatus({ status: "error" }), "Unavailable");
  assert.equal(
    resolveResearchPreviewDisplayStatus({
      status: "success",
      researchContext: {
        mode: "story",
        topic: "Test",
        summary: "",
        facts: ["One fact"],
        warnings: [],
        source: "api-football",
      },
    }),
    "Ready",
  );
});

test("source label maps api-football to Smart Research for creators", () => {
  const context: FootballResearchContext = {
    mode: "story",
    topic: "Arsenal",
    summary: "Summary",
    facts: ["Fact"],
    warnings: [],
    source: "api-football",
  };

  assert.equal(resolveResearchPreviewSourceLabel(context), "Smart Research");
});

test("no useful data uses prompt-only source and grounding copy", () => {
  const context: FootballResearchContext = {
    mode: "story",
    topic: "Unknown topic",
    summary: "",
    facts: [],
    warnings: ["No matching teams found in API-Football."],
    source: "fallback",
  };

  assert.equal(resolveResearchPreviewSourceLabel(context), "Prompt only");
  assert.equal(
    NO_RELIABLE_FOOTBALL_DATA_WARNING,
    "Research is limited for this topic, so the story will avoid exact claims.",
  );
});

test("friendly warnings simplify provider messages", () => {
  const friendly = dedupeFriendlyWarnings([
    "No matching teams found in API-Football.",
    "Standings unavailable from provider.",
  ]);

  assert.equal(friendly.length, 2);
  assert.match(friendly[0]!, /couldn't match those teams/i);
});

test("key facts are capped at six items", () => {
  const context: FootballResearchContext = {
    mode: "story",
    topic: "Facts",
    summary: "",
    facts: ["1", "2", "3", "4", "5", "6", "7"],
    warnings: [],
    source: "manual",
  };

  assert.equal(selectResearchPreviewFacts(context).length, 6);
  assert.equal(resolveResearchPreviewConfidence(context), "Medium");
});

console.log("\nAll research preview display checks passed.");
