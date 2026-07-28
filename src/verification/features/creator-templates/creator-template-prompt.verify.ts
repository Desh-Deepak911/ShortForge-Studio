/**
 * Creator template prompt integration verification
 * (imported from creator-template.verify.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCreatorTemplatePromptContext,
  formatCreatorTemplatePromptBlock,
  resolveCreatorTemplatePromptBlock,
} from "@/features/creator-templates/creator-template-prompt.utils";
import { buildStoryScriptPrompt } from "@/lib/ai/prompts";

const REPO_ROOT = process.cwd();
const GENERATE_SCRIPT_ROUTE_PATH = join(REPO_ROOT, "src/app/api/generate-script/route.ts");
const SCRIPT_GENERATION_PATH = join(
  REPO_ROOT,
  "src/features/story/services/script-generation.service.ts",
);

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("creator-template-prompt");

test("no template metadata produces no prompt block", () => {
  assert.equal(resolveCreatorTemplatePromptBlock({}), "");
  assert.equal(buildCreatorTemplatePromptContext({}), null);
});

test("template prompt block is generated from hints", () => {
  const context = buildCreatorTemplatePromptContext({
    templateId: "educational_bullet_points",
  });
  assert.ok(context);
  const block = formatCreatorTemplatePromptBlock(context);
  assert.match(block, /Creator template guidance \(advisory only/);
  assert.match(block, /Structure:/);
  assert.match(block, /Tone:/);
  assert.match(block, /Opening style:/);
  assert.match(block, /Pacing:/);
  assert.match(block, /CTA style:/);
  assert.match(block, /Avoid:/);
});

test("user topic remains primary in prompt block", () => {
  const block = resolveCreatorTemplatePromptBlock({
    templateId: "transfer_news",
  });
  assert.match(block, /user's content brief above is primary/);
  assert.match(block, /never override the user's topic/);
});

test("educational bullet template includes bullet structure reinforcement", () => {
  const block = resolveCreatorTemplatePromptBlock({
    templateId: "educational_bullet_points",
  });
  assert.match(block, /bullet-like spoken beats/i);
  assert.match(block, /quick recap/i);
  assert.match(block, /soft CTA/i);
});

test("top 10 template includes countdown structure reinforcement", () => {
  const block = resolveCreatorTemplatePromptBlock({
    templateId: "top_10_countdown",
  });
  assert.match(block, /countdown\/ranked structure/i);
  assert.match(block, /numbered progression/i);
  assert.match(block, /final reveal/i);
});

test("transfer news template includes news structure reinforcement", () => {
  const block = resolveCreatorTemplatePromptBlock({
    templateId: "transfer_news",
  });
  assert.match(block, /headline hook/i);
  assert.match(block, /key parties/i);
  assert.match(block, /what happens next/i);
});

test("unknown templateId safely no-ops without hints", () => {
  assert.equal(
    resolveCreatorTemplatePromptBlock({
      templateId: "unknown_template",
    }),
    "",
  );
});

test("buildStoryScriptPrompt unchanged without template block", () => {
  const baseline = buildStoryScriptPrompt("Arsenal title race", "dramatic", 30, "story");
  const withoutTemplate = buildStoryScriptPrompt("Arsenal title race", "dramatic", 30, "story", undefined, undefined, {
    researchAttemptedWithoutData: false,
  });
  assert.equal(baseline, withoutTemplate);
});

test("buildStoryScriptPrompt includes template block when provided", () => {
  const templateBlock = resolveCreatorTemplatePromptBlock({
    templateId: "football_match_preview",
  });
  assert.ok(templateBlock);

  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea preview",
    "dramatic",
    45,
    "match_preview",
    undefined,
    undefined,
    { templatePromptBlock: templateBlock },
  );

  assert.match(prompt, /Content brief:\n"Arsenal vs Chelsea preview"/);
  assert.ok(prompt.includes(templateBlock));
  assert.match(prompt, /Creator template guidance/);
});

test("generate-script route accepts template fields and forwards prompt block", () => {
  const routeSource = readFileSync(GENERATE_SCRIPT_ROUTE_PATH, "utf8");
  const scriptGenSource = readFileSync(SCRIPT_GENERATION_PATH, "utf8");

  assert.match(routeSource, /body\.templateId/);
  assert.match(routeSource, /body\.templatePromptHints/);
  assert.match(routeSource, /resolveCreatorTemplatePromptBlock/);
  assert.match(routeSource, /templatePromptBlock/);
  assert.match(scriptGenSource, /templatePromptBlock/);
  assert.doesNotMatch(routeSource, /studio-intelligence/);
  assert.doesNotMatch(routeSource, /asset-intelligence/);
});

test("prompt utils avoid Studio, Asset, and Editor imports", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src/features/creator-templates/creator-template-prompt.utils.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /studio-intelligence/);
  assert.doesNotMatch(source, /asset-intelligence/);
  assert.doesNotMatch(source, /features\/editor/);
  assert.doesNotMatch(source, /features\/export/);
});

console.log("creator-template-prompt passed");
