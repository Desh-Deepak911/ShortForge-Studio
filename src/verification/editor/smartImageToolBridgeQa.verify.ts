/**
 * Smart Image Tool bridge QA (run: npm run test:smart-image-tool-bridge-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("smartImageToolBridgeQa");

test("/tool route page exists", () => {
  const page = readSrc("src/app/tool/page.tsx");
  assert.match(page, /SmartImageToolBridge/);
  assert.match(page, /SiteNav/);
});

test("bridge page explains workflow and external tool", () => {
  const bridge = readSrc("src/features/tool/components/SmartImageToolBridge.tsx");
  assert.match(bridge, /Open \{SMART_IMAGE_TOOL_NAME\}/);
  assert.match(bridge, /Back to Studio/);
  assert.match(bridge, /target="_blank"/);
  assert.match(bridge, /buildSmartEditImageToolUrl/);
  assert.match(bridge, /resolveSafeStudioReturnPath/);
  assert.match(bridge, /Automatic image handoff is not available yet/);
  assert.match(bridge, /optional overview/i);
});

test("config centralizes external URL and route", () => {
  const config = readSrc("src/lib/constants/smart-image-tool.config.ts");
  assert.match(config, /SMART_IMAGE_TOOL_URL/);
  assert.match(config, /image-optimizer-six\.vercel\.app/);
  assert.match(config, /SMART_IMAGE_TOOL_ROUTE = "\/tool"/);
});

test("image inspector opens external tool via SmartEditImageAction", () => {
  const inspector = readSrc("src/features/editor/components/SceneImageInspector.tsx");
  assert.match(inspector, /SmartEditImageAction/);
});

test("scene inspector upload and empty states open external tool context", () => {
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(sceneInspector, /SmartEditImageAction/);
  assert.doesNotMatch(sceneInspector, /SMART_IMAGE_TOOL_ROUTE/);
});

test("primary nav does not expose /tool globally", () => {
  const navigation = readSrc("src/lib/constants/product-navigation.ts");
  assert.doesNotMatch(navigation, /\/tool/);
});

console.log("\nAll smart image tool bridge checks passed.");
