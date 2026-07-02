/**
 * Creator template picker UI verification
 * (imported from creator-template.verify.ts).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CREATOR_TEMPLATE_CATEGORY_TABS,
  filterCreatorTemplates,
  findCreatorTemplateById,
} from "@/features/creator-templates/creator-template-picker.utils";
import { getCreatorTemplates } from "@/features/creator-templates";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = join(__dirname, "components");
const REPO_ROOT = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function collectComponentSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectComponentSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && entry !== "index.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

const ALL_TEMPLATES = getCreatorTemplates();

console.log("creator-template-ui");

test("picker source renders all built-in templates", () => {
  const picker = readRepo("src/features/creator-templates/components/CreatorTemplatePicker.tsx");
  assert.match(picker, /getCreatorTemplates\(\)/);
  assert.match(picker, /filteredTemplates\.map/);
  assert.match(picker, /No template/);
  assert.equal(ALL_TEMPLATES.length, 9);
});

test("category filter utility works", () => {
  assert.equal(filterCreatorTemplates(ALL_TEMPLATES, { category: "all" }).length, 9);
  assert.equal(filterCreatorTemplates(ALL_TEMPLATES, { category: "news" }).length, 1);
  assert.equal(
    filterCreatorTemplates(ALL_TEMPLATES, { category: "news" })[0]?.id,
    "transfer_news",
  );
  assert.equal(
    filterCreatorTemplates(ALL_TEMPLATES, { query: "countdown" }).some(
      (template) => template.id === "top_10_countdown",
    ),
    true,
  );
});

test("category tabs cover every template category", () => {
  const tabIds = new Set(CREATOR_TEMPLATE_CATEGORY_TABS.map((tab) => tab.id));
  for (const template of ALL_TEMPLATES) {
    assert.ok(tabIds.has(template.category), `${template.category} must have a tab`);
  }
  assert.ok(tabIds.has("all"));
});

test("selected template card uses studioCardActive", () => {
  const card = readRepo("src/features/creator-templates/components/CreatorTemplateCard.tsx");
  const picker = readRepo("src/features/creator-templates/components/CreatorTemplatePicker.tsx");

  assert.match(card, /studioCardActive/);
  assert.match(card, /aria-selected=\{selected\}/);
  assert.match(picker, /selectedTemplateId === template\.id/);
  assert.match(picker, /selectedTemplateId === ""/);
});

test("no template clears selection via handler", () => {
  const picker = readRepo("src/features/creator-templates/components/CreatorTemplatePicker.tsx");
  assert.match(picker, /onTemplateChange\(""\)/);
});

test("CreateBriefInspector wires picker to existing template handler", () => {
  const inspector = readRepo("src/features/create/components/CreateBriefInspector.tsx");
  assert.match(inspector, /CreatorTemplatePicker/);
  assert.match(inspector, /onTemplateChange=\{onTemplateChange\}/);
  assert.doesNotMatch(inspector, /<select[\s\S]*creatorTemplate/);
});

test("scriptMode override remains available in create canvas", () => {
  const canvas = readRepo("src/features/create/components/BriefCanvas.tsx");
  const flow = readRepo("src/features/create/components/CreateStoryFlow.tsx");

  assert.match(canvas, /onScriptModeChange/);
  assert.match(canvas, /scriptMode/);
  assert.match(flow, /onScriptModeChange=\{handleScriptModeChange\}/);
});

test("summary shows structure, tone, and override note", () => {
  const summary = readRepo("src/features/creator-templates/components/CreatorTemplateSummary.tsx");
  assert.match(summary, /promptHints\.structure/);
  assert.match(summary, /promptHints\.tone/);
  assert.match(summary, /You can still override these settings\./);
});

test("selected template resolves for summary display", () => {
  const template = findCreatorTemplateById(ALL_TEMPLATES, "educational_bullet_points");
  assert.ok(template);
  assert.equal(template.id, "educational_bullet_points");
});

test("picker components avoid backend and generation imports", () => {
  const forbidden = [
    /generate-script/,
    /prompt-intelligence/,
    /studio-intelligence/,
    /asset-intelligence/,
    /features\/export/,
    /features\/editor/,
    /generate-voiceover/,
  ];

  const sources = collectComponentSources(COMPONENTS_ROOT);
  assert.ok(sources.length >= 4);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay create UI only`);
    }
  }
});

console.log("creator-template-ui passed");
