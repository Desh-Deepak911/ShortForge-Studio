/**
 * Smart Edit image action QA (run: npm run test:smart-edit-image-action-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSmartEditImageToolUrl,
  resolveSafeStudioReturnPath,
} from "@/lib/utils/smart-image-tool.utils";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("smartEditImageActionQa");

test("buildSmartEditImageToolUrl includes source, returnTo, draftId, sceneId", () => {
  const url = new URL(
    buildSmartEditImageToolUrl({
      returnTo: "http://localhost:3000/editor/abc-123",
      draftId: "abc-123",
      sceneId: "scene-2",
    }),
  );

  assert.equal(url.origin, "https://image-optimizer-six.vercel.app");
  assert.equal(url.searchParams.get("source"), "shortforge");
  assert.equal(url.searchParams.get("returnTo"), "http://localhost:3000/editor/abc-123");
  assert.equal(url.searchParams.get("draftId"), "abc-123");
  assert.equal(url.searchParams.get("sceneId"), "scene-2");
});

test("resolveSafeStudioReturnPath prefers exact editor URL", () => {
  assert.equal(
    resolveSafeStudioReturnPath("http://localhost:3000/editor/draft-1?scene=2", "http://localhost:3000"),
    "/editor/draft-1?scene=2",
  );
  assert.equal(
    resolveSafeStudioReturnPath("https://evil.example/phish", "http://localhost:3000"),
    "/drafts",
  );
});

test("SmartEditImageAction opens external tool directly", () => {
  const action = readSrc("src/features/tool/components/SmartEditImageAction.tsx");
  assert.match(action, /buildSmartEditImageToolUrl/);
  assert.doesNotMatch(action, /SMART_IMAGE_TOOL_ROUTE/);
  assert.match(action, /target="_blank"/);
  assert.match(action, /Smart Edit/);
  assert.match(action, /Edit image first/);
  assert.match(action, /Edit the image in the tool, download it, then replace the image in this scene/);
});

test("image inspector shows Smart Edit when scene has an image", () => {
  const inspector = readSrc("src/features/editor/components/SceneImageInspector.tsx");
  assert.match(inspector, /SmartEditImageAction/);
  assert.match(inspector, /sceneId=\{sceneId\}/);
});

test("scene inspector adds Smart Edit next to Replace and Remove", () => {
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(sceneInspector, /SmartEditImageAction hasImage buttonOnly sceneId=\{scene\.id\}/);
  assert.match(sceneInspector, /Replace/);
  assert.match(sceneInspector, /Remove/);
  assert.match(sceneInspector, /SMART_EDIT_HAS_IMAGE_COPY/);
});

test("context ribbon opens external tool directly", () => {
  const ribbon = readSrc("src/features/editor/components/ImageRibbonContext.tsx");
  assert.match(ribbon, /label="Smart Edit"/);
  assert.match(ribbon, /openSmartEditImageToolFromContext/);
  assert.match(ribbon, /useSmartEditImageContext/);
});

test("/tool bridge uses returnTo for Back to Studio", () => {
  const bridge = readSrc("src/features/tool/components/SmartImageToolBridge.tsx");
  assert.match(bridge, /resolveSafeStudioReturnPath/);
  assert.match(bridge, /href=\{backHref\}/);
  assert.doesNotMatch(bridge, /href="\/drafts"/);
});

console.log("\nAll smart edit image action checks passed.");
