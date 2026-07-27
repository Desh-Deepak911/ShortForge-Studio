import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const stepper = read("src/components/ui/StudioNumberStepper.tsx");
const studioSwitch = read("src/components/ui/StudioSwitch.tsx");
const createBrief = read(
  "src/features/create/components/CreateBriefInspector.tsx",
);
const review = read("src/features/create/components/ReviewInspector.tsx");
const sceneInspector = read(
  "src/features/editor/components/StudioSceneInspector.tsx",
);
const videoInspector = read(
  "src/features/editor/components/media/SceneVideoInspector.tsx",
);
const motionInspector = read(
  "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
);
const adjustments = read(
  "src/features/editor/components/media/MediaVisualAdjustmentsPanel.tsx",
);

const tests: Array<[string, () => void]> = [
  [
    "number stepper exposes accessible decrement and increment actions",
    () => {
      assert.match(stepper, /aria-label=\{`Decrease/);
      assert.match(stepper, /aria-label=\{`Increase/);
      assert.match(stepper, /data-studio-number-stepper="true"/);
    },
  ],
  [
    "number stepper preserves native numeric semantics without browser spinners",
    () => {
      assert.match(stepper, /type="number"/);
      assert.match(stepper, /\[appearance:textfield\]/);
      assert.match(stepper, /webkit-inner-spin-button/);
      assert.match(stepper, /Math\.min\(maximum/);
      assert.match(stepper, /Math\.max\(minimum/);
    },
  ],
  [
    "switch keeps an accessible checkbox while replacing the visible checkmark",
    () => {
      assert.match(studioSwitch, /type="checkbox"/);
      assert.match(studioSwitch, /className="peer sr-only"/);
      assert.match(studioSwitch, /peer-checked:bg-accent/);
      assert.match(studioSwitch, /peer-focus-visible:ring-2/);
    },
  ],
  [
    "Create and Review scene counts use the shared bounded stepper",
    () => {
      assert.match(createBrief, /<StudioNumberStepper[\s\S]*id="sceneCount"/);
      assert.match(review, /<StudioNumberStepper[\s\S]*id="review-scene-count"/);
      assert.doesNotMatch(createBrief, /id="sceneCount"\s+type="number"/);
      assert.doesNotMatch(review, /id="review-scene-count"\s+type="number"/);
    },
  ],
  [
    "scene duration and trim controls use steppers with their existing bounds",
    () => {
      assert.match(
        sceneInspector,
        /<StudioNumberStepper[\s\S]*min=\{1\}[\s\S]*max=\{20\}/,
      );
      assert.match(videoInspector, /data-trim-field="start"/);
      assert.match(videoInspector, /data-trim-field="end"/);
      assert.match(videoInspector, /onStepValue=\{\(seconds\) =>/);
      assert.match(videoInspector, /commitTrimValues/);
    },
  ],
  [
    "motion and shadow controls use the shared switch",
    () => {
      assert.match(motionInspector, /<StudioSwitch/);
      assert.match(motionInspector, /data-media-motion-enable="true"/);
      assert.match(adjustments, /<StudioSwitch/);
      assert.match(adjustments, /label="Shadow"/);
    },
  ],
  [
    "Create toggles use the same switch language",
    () => {
      assert.match(createBrief, /label="Smart Research"/);
      assert.match(review, /label="Studio Intelligence scene planning"/);
    },
  ],
];

let passed = 0;
console.log("studioControlPolish");
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
console.log(`${passed} passed`);
