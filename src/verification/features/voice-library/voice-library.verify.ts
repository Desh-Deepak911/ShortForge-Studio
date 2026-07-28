/**
 * Voice library verification
 * (run: npm run test:voice-library).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyStoryVoiceSettings } from "@/lib/utils/voiceover";
import { resolveVoiceoverVoice, VOICEOVER_VOICE_OPTIONS } from "@/lib/utils/voiceoverOptions";
import {
  filterVoiceLibraryEntries,
  getVoiceLibraryEntries,
  groupVoiceLibraryByCategory,
  OPENAI_VOICE_LIBRARY_IDS,
  resolveVoiceLibrarySelection,
  voiceLibraryCoversResolverVoices,
  voiceLibraryEntriesAreResolverSafe,
} from "@/features/voice-library";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOICE_LIBRARY_ROOT = join(process.cwd(), "src/features/voice-library");
const VOICE_CARD_PATH = join(process.cwd(), "src/features/voice-library/VoiceCard.tsx");
const VOICE_SETTINGS_CARD_PATH = join(process.cwd(), "src/components/VoiceSettingsCard.tsx");
const PROJECT_AUDIO_PATH = join(
  process.cwd(),
  "src/features/editor/components/ProjectAudioVoiceoverSection.tsx",
);

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectVoiceLibrarySources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectVoiceLibrarySources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("voice-library");

test("all 13 backend-valid voices exist in catalog", () => {
  assert.equal(OPENAI_VOICE_LIBRARY_IDS.length, 13);
  assert.equal(getVoiceLibraryEntries().length, 13);
  assert.equal(voiceLibraryCoversResolverVoices(), true);
});

test("no catalog voice is unsupported by resolver", () => {
  assert.equal(voiceLibraryEntriesAreResolverSafe(), true);
});

test("category grouping works", () => {
  const groups = groupVoiceLibraryByCategory();
  assert.ok(groups.length >= 5);
  assert.equal(
    groups.reduce((count, group) => count + group.voices.length, 0),
    13,
  );
  assert.equal(filterVoiceLibraryEntries("sports").length >= 2, true);
});

test("selecting voice uses settings update path only", () => {
  const script = {
    title: "Voice Library QA",
    narration: "Test narration.",
    totalDuration: 4,
    scenes: [{ id: "1", start: 0, end: 4, duration: 4, subtitle: "Scene" }],
  };

  const next = applyStoryVoiceSettings(script, { voice: "cedar" });
  assert.equal(next.voiceSettings?.voice, "cedar");
  assert.equal(next.voiceoverUrl, undefined);
});

test("existing legacy voice ids remain valid", () => {
  for (const voice of VOICEOVER_VOICE_OPTIONS) {
    assert.equal(resolveVoiceoverVoice(voice), voice);
  }
});

test("unknown voice fallback remains safe", () => {
  assert.equal(resolveVoiceLibrarySelection("not-a-voice"), "alloy");
  assert.equal(resolveVoiceoverVoice("legacy-unknown"), "alloy");
});

function extractVoiceSelectHandler(source: string): string {
  const match = source.match(/onVoiceSelect=\{\(voice\)\s*=>\s*([\s\S]*?)\s*\}\s*\/>/);
  assert.ok(match?.[1], "VoiceLibraryPanel onVoiceSelect handler must exist");
  return match[1];
}

test("voice library UI integration does not trigger generation on select", () => {
  const cardSource = readFileSync(VOICE_SETTINGS_CARD_PATH, "utf8");
  const projectAudioSource = readFileSync(PROJECT_AUDIO_PATH, "utf8");

  assert.match(cardSource, /VoiceLibraryPanel/);
  assert.doesNotMatch(cardSource, /<select[\s\S]*story-voice/);

  const cardHandler = extractVoiceSelectHandler(cardSource);
  assert.match(cardHandler, /applyStoryVoiceSettings/);
  assert.doesNotMatch(cardHandler, /applyVoiceoverChanges/);

  assert.match(projectAudioSource, /VoiceLibraryPanel/);
  assert.doesNotMatch(projectAudioSource, /<select/);

  const projectHandler = extractVoiceSelectHandler(projectAudioSource);
  assert.match(projectHandler, /applyStoryVoiceSettings/);
  assert.doesNotMatch(projectHandler, /applyVoiceoverChanges/);
});

test("no API route, TTS service, preview, or export imports in voice library", () => {
  const forbidden = [
    /voiceover\.service/,
    /generate-voiceover/,
    /useStoryVoiceoverApply/,
    /features\/export/,
    /features\/preview/,
    /audio\.speech\.create/,
  ];
  const sources = collectVoiceLibrarySources(VOICE_LIBRARY_ROOT);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay UI/catalog only`);
    }
  }
});

test("voice cards use rectangular studioCard surfaces", () => {
  const cardSource = readFileSync(VOICE_CARD_PATH, "utf8");
  assert.match(cardSource, /studioCard/);
  assert.match(cardSource, /studioCardActive/);
  assert.doesNotMatch(cardSource, /studioChipActive.*flex/);
  assert.doesNotMatch(cardSource, /min-h-\[6/);
  assert.doesNotMatch(cardSource, /min-h-\[7/);
});

test("voice settings card uses compact voice library layout", () => {
  const cardSource = readFileSync(VOICE_SETTINGS_CARD_PATH, "utf8");
  assert.match(cardSource, /VoiceLibraryPanel[\s\S]*compact/);
  assert.match(cardSource, /SpeechStylePanel[\s\S]*compact/);
});

console.log("voice-library passed");
