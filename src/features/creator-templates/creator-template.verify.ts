/**
 * Creator template registry verification
 * (run: npm run test:creator-templates).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./creator-template.ui.verify";
import "./creator-template-prompt.verify";

import {
  applyCreatorTemplateToBrief,
  buildTemplatePromptHints,
  CREATOR_TEMPLATE_IDS,
  formatTemplatePromptHints,
  getCreatorTemplate,
  getCreatorTemplateRegistry,
  getCreatorTemplates,
  getCreatorTemplatesByCategory,
  mergeCreationBriefWithTemplateSelection,
  resolveCreatorTemplateDefaults,
  type CreatorTemplate,
} from "@/features/creator-templates";
import type { StoryCreationBrief } from "@/features/drafts/types";
import { SCRIPT_MODES } from "@/types/footiebitz";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATOR_TEMPLATES_ROOT = __dirname;
const REPO_ROOT = process.cwd();
const GENERATE_SCRIPT_ROUTE_PATH = join(REPO_ROOT, "src/app/api/generate-script/route.ts");

function buildBaseBrief(overrides: Partial<StoryCreationBrief> = {}): StoryCreationBrief {
  return {
    topic: "Arsenal title race",
    tone: "dramatic",
    duration: 30,
    qualityMode: "cheap",
    sceneCount: 6,
    scriptMode: "story",
    enableResearch: false,
    ...overrides,
  };
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectCreatorTemplateSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectCreatorTemplateSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("creator-templates");

test("all built-in templates registered", () => {
  assert.equal(CREATOR_TEMPLATE_IDS.length, 9);
  assert.equal(getCreatorTemplates().length, 9);
  assert.equal(getCreatorTemplateRegistry().length, 9);

  for (const templateId of CREATOR_TEMPLATE_IDS) {
    const template = getCreatorTemplate(templateId);
    assert.ok(template, `${templateId} must exist`);
    assert.equal(template.id, templateId);
    assert.ok(template.title.trim());
    assert.ok(template.description.trim());
    assert.ok(template.recommendedFor.length > 0);
  }
});

test("template ids are unique", () => {
  const ids = getCreatorTemplates().map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("scriptMode values are valid", () => {
  for (const template of getCreatorTemplates()) {
    assert.ok(
      SCRIPT_MODES.includes(template.defaults.scriptMode),
      `${template.id} must use a valid ScriptMode`,
    );
  }
});

test("defaults resolve safely for all templates and unknown input", () => {
  for (const template of getCreatorTemplates()) {
    const resolved = resolveCreatorTemplateDefaults(template);
    assert.ok(SCRIPT_MODES.includes(resolved.scriptMode));
    assert.ok(resolved.sceneCount >= 3 && resolved.sceneCount <= 12);
    assert.ok(resolved.targetDurationSec >= 15 && resolved.targetDurationSec <= 120);
  }

  const unknownDefaults = resolveCreatorTemplateDefaults(null);
  assert.equal(unknownDefaults.scriptMode, "story");
  assert.equal(unknownDefaults.sceneCount, 6);
  assert.equal(unknownDefaults.targetDurationSec, 30);
});

test("prompt hints exist and serialize", () => {
  for (const template of getCreatorTemplates()) {
    const hints = buildTemplatePromptHints(template);
    assert.ok(hints);
    assert.ok(hints.tone);
    assert.ok(hints.structure);
    assert.ok(hints.openingStyle);
    assert.ok(hints.pacing);
    assert.ok(hints.ctaStyle);

    const formatted = formatTemplatePromptHints(template);
    assert.match(formatted, /Tone:/);
    assert.match(formatted, /Structure:/);
  }
});

test("unknown template resolves to null", () => {
  assert.equal(getCreatorTemplate("not_a_template"), null);
  assert.equal(getCreatorTemplate(""), null);
  assert.equal(getCreatorTemplate(undefined), null);
});

test("category filter returns matching templates only", () => {
  const newsTemplates = getCreatorTemplatesByCategory("news");
  assert.equal(newsTemplates.length, 1);
  assert.equal(newsTemplates[0]?.id, "transfer_news");
});

test("registry is immutable", () => {
  const registry = getCreatorTemplateRegistry();
  assert.ok(Object.isFrozen(registry));

  for (const template of registry) {
    assert.ok(Object.isFrozen(template));
    assert.ok(Object.isFrozen(template.defaults));
    assert.ok(Object.isFrozen(template.promptHints));
    assert.ok(Object.isFrozen(template.styleProfile));
    assert.ok(Object.isFrozen(template.recommendedFor));
  }

  assert.throws(() => {
    (registry as CreatorTemplate[]).push({} as CreatorTemplate);
  });
});

test("getCreatorTemplates returns copies that do not mutate registry", () => {
  const templates = getCreatorTemplates();
  const first = templates[0];
  assert.ok(first);
  first.title = "Mutated title";

  const fresh = getCreatorTemplate(first.id);
  assert.notEqual(fresh?.title, "Mutated title");
});

test("educational and transfer news map to existing ScriptModes with hints", () => {
  const educational = getCreatorTemplate("educational_bullet_points");
  assert.ok(educational);
  assert.equal(educational.defaults.scriptMode, "story");
  assert.ok(buildTemplatePromptHints(educational)?.structure.includes("bullet"));

  const transferNews = getCreatorTemplate("transfer_news");
  assert.ok(transferNews);
  assert.equal(transferNews.defaults.scriptMode, "match_recap");
  assert.ok(buildTemplatePromptHints(transferNews)?.tone.toLowerCase().includes("headline"));
});

test("applyCreatorTemplateToBrief sets educational bullet defaults", () => {
  const template = getCreatorTemplate("educational_bullet_points");
  assert.ok(template);

  const applied = applyCreatorTemplateToBrief(buildBaseBrief(), template);
  assert.equal(applied.templateId, "educational_bullet_points");
  assert.equal(applied.scriptMode, "story");
  assert.equal(applied.sceneCount, 5);
  assert.equal(applied.duration, 45);
  assert.ok(applied.templatePromptHints?.structure);
  assert.equal(applied.speechStylePreset, "documentary");
  assert.equal(applied.captionPreset, "documentary");
});

test("applyCreatorTemplateToBrief sets top 10 countdown defaults", () => {
  const template = getCreatorTemplate("top_10_countdown");
  assert.ok(template);

  const applied = applyCreatorTemplateToBrief(buildBaseBrief(), template);
  assert.equal(applied.scriptMode, "top_5");
  assert.equal(applied.sceneCount, 10);
  assert.equal(applied.speechStylePreset, "countdown");
});

test("applyCreatorTemplateToBrief sets match preview defaults", () => {
  const template = getCreatorTemplate("football_match_preview");
  assert.ok(template);

  const applied = applyCreatorTemplateToBrief(buildBaseBrief(), template);
  assert.equal(applied.scriptMode, "match_preview");
  assert.equal(applied.duration, 45);
});

test("user override is preserved until template is selected again", () => {
  const template = getCreatorTemplate("top_10_countdown");
  assert.ok(template);

  const applied = applyCreatorTemplateToBrief(buildBaseBrief(), template);
  const userOverride: StoryCreationBrief = {
    ...applied,
    sceneCount: 8,
    duration: 30,
  };

  assert.equal(userOverride.sceneCount, 8);
  assert.equal(userOverride.duration, 30);

  const reapplied = applyCreatorTemplateToBrief(userOverride, template);
  assert.equal(reapplied.sceneCount, 10);
  assert.equal(reapplied.duration, 60);
});

test("legacy brief without template remains unchanged", () => {
  const legacy = buildBaseBrief();
  const unchanged = applyCreatorTemplateToBrief(legacy, null);
  assert.deepEqual(unchanged, legacy);
  assert.equal(unchanged.templateId, undefined);
});

test("mergeCreationBriefWithTemplateSelection keeps user-edited form values", () => {
  const template = getCreatorTemplate("football_match_preview");
  assert.ok(template);

  const brief = buildBaseBrief({
    sceneCount: 9,
    duration: 60,
    scriptMode: "story",
  });

  const merged = mergeCreationBriefWithTemplateSelection(brief, template);
  assert.equal(merged.templateId, "football_match_preview");
  assert.equal(merged.sceneCount, 9);
  assert.equal(merged.duration, 60);
  assert.equal(merged.scriptMode, "story");
  assert.ok(merged.templatePromptHints);
});

test("request payload can include template metadata without template selection", () => {
  const brief = buildBaseBrief();
  const payload = {
    topic: brief.topic,
    tone: brief.tone,
    duration: brief.duration,
    qualityMode: brief.qualityMode,
    sceneCount: brief.sceneCount,
    scriptMode: brief.scriptMode,
    mode: "script-only" as const,
    stream: true,
    ...(brief.templateId ? { templateId: brief.templateId } : {}),
    ...(brief.templatePromptHints ? { templatePromptHints: brief.templatePromptHints } : {}),
  };

  assert.equal("templateId" in payload, false);
  assert.equal("templatePromptHints" in payload, false);
});

test("generate-script route forwards template metadata without Studio Intelligence wiring", () => {
  const routeSource = readFileSync(GENERATE_SCRIPT_ROUTE_PATH, "utf8");
  assert.match(routeSource, /resolveCreatorTemplatePromptBlock/);
  assert.match(routeSource, /templatePromptBlock/);
  assert.doesNotMatch(routeSource, /buildPromptIntelligence/);
  assert.doesNotMatch(routeSource, /studio-intelligence/);
});

test("no runtime or generation imports in creator-templates module", () => {
  const forbidden = [
    /features\/export/,
    /features\/preview/,
    /features\/create/,
    /generate-script/,
    /prompt-intelligence/,
    /studio-intelligence/,
    /asset-intelligence/,
    /creator-asset-planning/,
    /draft-session-store/,
    /draft-model\.utils/,
  ];

  const sources = collectCreatorTemplateSources(CREATOR_TEMPLATES_ROOT);
  assert.ok(sources.length >= 4);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay foundation-only`);
    }
  }
});

console.log("creator-templates passed");
