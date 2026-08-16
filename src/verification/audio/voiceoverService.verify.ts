/**
 * Voiceover service verification (run: npm run test:voiceover-service).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adjustVoiceoverDurationForSpeed } from "@/features/story/utils/voiceover-duration.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("voiceover service");

test("adjustVoiceoverDurationForSpeed keeps provider-encoded duration unchanged", () => {
  assert.equal(adjustVoiceoverDurationForSpeed(12_000, 1.25, true), 12_000);
  assert.equal(adjustVoiceoverDurationForSpeed(12_000, 1, false), 12_000);
});

test("adjustVoiceoverDurationForSpeed estimates duration when provider lacks speed", () => {
  assert.equal(adjustVoiceoverDurationForSpeed(12_000, 1.25, false), 9600);
  assert.equal(adjustVoiceoverDurationForSpeed(9000, 0.9, false), 10_000);
});

test("generateVoiceover accepts narration, voice, and speed", () => {
  const servicePath = join(
    process.cwd(),
    "src/features/story/services/voiceover.service.ts",
  );
  const routePath = join(process.cwd(), "src/app/api/generate-voiceover/route.ts");
  const service = readFileSync(servicePath, "utf8");
  const route = readFileSync(routePath, "utf8");

  assert.match(service, /interface GenerateVoiceoverInput/);
  assert.match(service, /narration: string/);
  assert.match(route, /generateVoiceover\(\{/);
  assert.match(route, /narration,/);
});

test("non-1 speeds use lossless normal-speed speech plus pitch-preserved tempo", () => {
  const servicePath = join(
    process.cwd(),
    "src/features/story/services/voiceover.service.ts",
  );
  const service = readFileSync(servicePath, "utf8");

  assert.match(service, /responseFormat: "wav"/);
  assert.match(service, /speed: 1/);
  assert.match(service, /renderPitchPreservedVoiceSpeed/);
  assert.match(service, /speedRendering: "pitch_preserved"/);
});

test("voice generation keeps a provider-speed fallback", () => {
  const service = readFileSync(
    join(process.cwd(), "src/features/story/services/voiceover.service.ts"),
    "utf8",
  );
  assert.match(service, /speedRendering: "provider_fallback"/);
  assert.match(service, /responseFormat: "mp3"/);
});

console.log("\nAll voiceover service checks passed.");
