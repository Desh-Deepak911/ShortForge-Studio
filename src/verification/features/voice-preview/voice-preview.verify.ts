/**
 * Voice preview verification
 * (run: npm run test:voice-preview).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT,
  MAX_VOICE_PREVIEW_SAMPLE_LENGTH,
  buildVoicePreviewCacheKey,
  parseVoicePreviewRequest,
  resolveVoicePreviewSampleText,
} from "@/features/voice-preview/voice-preview.utils";
import {
  TTS_MODEL_EXPRESSIVE,
  TTS_MODEL_NEUTRAL,
  resolveSpeechStyleInstructionsForVoice,
  resolveTtsModelForVoice,
} from "@/features/speech-style";
import {
  getVoicePreviewCacheSizeForTests,
  resetVoicePreviewCacheForTests,
} from "@/features/voice-preview/voice-preview.cache";
import { stopVoicePreview } from "@/features/voice-preview/voice-preview.playback";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as NodeModule;

const VOICE_PREVIEW_ROOT = join(process.cwd(), "src/features/voice-preview");
const VOICE_CARD_PATH = join(process.cwd(), "src/features/voice-library/VoiceCard.tsx");
const USE_VOICE_PREVIEW_PATH = join(process.cwd(), "src/features/voice-preview/useVoicePreview.ts");
const ROUTE_PATH = join(process.cwd(), "src/app/api/voice-preview/route.ts");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function collectVoicePreviewSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectVoicePreviewSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

class MockAudio {
  static instances: MockAudio[] = [];
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url?: string) {
    if (url) {
      this.src = url;
    }
    MockAudio.instances.push(this);
  }

  pause() {
    return undefined;
  }

  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
    }
  }

  load() {
    if (this.onerror) {
      this.onerror();
    }
  }

  async play() {
    return undefined;
  }
}

async function runVoicePreviewTests() {
  const { generateVoicePreview, getVoicePreviewGenerationCallCountForTests, resetVoicePreviewGenerationCallCountForTests, setVoicePreviewTtsGeneratorForTests } =
    await import("@/features/voice-preview/voice-preview.service");
  const {
    getActiveVoicePreviewVoiceId,
    resetVoicePreviewPlaybackForTests,
    startVoicePreview,
  } = await import("@/features/voice-preview/voice-preview.playback");

  resetVoicePreviewCacheForTests();
  resetVoicePreviewGenerationCallCountForTests();
  setVoicePreviewTtsGeneratorForTests(null);
  resetVoicePreviewPlaybackForTests();

  test("API validates voice", () => {
    const missingVoice = parseVoicePreviewRequest({});
    assert.equal(missingVoice.ok, false);
    if (!missingVoice.ok) {
      assert.match(missingVoice.error, /Voice is required/i);
    }

    const blankVoice = parseVoicePreviewRequest({ voice: "   " });
    assert.equal(blankVoice.ok, false);

    const valid = parseVoicePreviewRequest({ voice: "cedar" });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.value.voice, "cedar");
    }

    const fallback = parseVoicePreviewRequest({ voice: "unknown-voice" });
    assert.equal(fallback.ok, true);
    if (fallback.ok) {
      assert.equal(fallback.value.voice, "alloy");
    }
  });

  test("API clamps sample length", () => {
    const longSample = "a".repeat(MAX_VOICE_PREVIEW_SAMPLE_LENGTH + 40);
    const parsed = parseVoicePreviewRequest({ voice: "nova", sampleText: longSample });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.sampleText.length, MAX_VOICE_PREVIEW_SAMPLE_LENGTH);
    }
  });

  test("API uses default sample text", () => {
    assert.equal(resolveVoicePreviewSampleText(undefined), DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT);
    assert.equal(resolveVoicePreviewSampleText("   "), DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT);

    const parsed = parseVoicePreviewRequest({ voice: "nova" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.sampleText, DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT);
    }
  });

  await testAsync("cache hit avoids duplicate generation", async () => {
    resetVoicePreviewCacheForTests();
    resetVoicePreviewGenerationCallCountForTests();

    const fakeMp3 = new ArrayBuffer(8);
    setVoicePreviewTtsGeneratorForTests(async () => fakeMp3);

    const request = { voice: "nova", speed: 1 as const, sampleText: DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT, stylePreset: "neutral" as const, expressiveDelivery: false };

    const first = await generateVoicePreview(request);
    assert.equal(first.cacheHit, false);
    assert.equal(getVoicePreviewGenerationCallCountForTests(), 1);
    assert.equal(getVoicePreviewCacheSizeForTests(), 1);

    const second = await generateVoicePreview(request);
    assert.equal(second.cacheHit, true);
    assert.equal(getVoicePreviewGenerationCallCountForTests(), 1);
    assert.equal(buildVoicePreviewCacheKey(request.voice, request.speed, request.sampleText, request.stylePreset, request.expressiveDelivery), `${request.voice}|${request.speed}|${request.stylePreset}|0|${request.sampleText}`);
  });

  test("VoiceCard preview does not call voice selection", () => {
    const cardSource = readFileSync(VOICE_CARD_PATH, "utf8");
    const hookSource = readFileSync(USE_VOICE_PREVIEW_PATH, "utf8");

    assert.match(cardSource, /onClick=\{handlePreview\}/);
    assert.match(cardSource, /onClick=\{\(\) => onSelect\(voice\.id\)\}/);
    assert.match(cardSource, /useVoicePreview/);
    assert.match(cardSource, /studioCard/);
    assert.doesNotMatch(cardSource, /studioChipActive.*flex h-full/);
    assert.match(hookSource, /stopPropagation\(\)/);
    assert.doesNotMatch(hookSource, /onSelect/);
    assert.doesNotMatch(hookSource, /onScriptChange/);
  });

  test("preview model resolution routes gpt-4o-only voices correctly", () => {
    for (const voice of ["ballad", "marin", "verse", "cedar"] as const) {
      assert.equal(resolveTtsModelForVoice(voice), TTS_MODEL_EXPRESSIVE);
      const resolved = resolveSpeechStyleInstructionsForVoice(voice, "neutral", false);
      assert.equal(resolved.model, TTS_MODEL_EXPRESSIVE);
    }

    assert.equal(resolveTtsModelForVoice("nova"), TTS_MODEL_NEUTRAL);
    assert.equal(resolveTtsModelForVoice("cedar"), TTS_MODEL_EXPRESSIVE);
  });

  await testAsync("only one audio element active", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      const blobA = new Blob(["a"], { type: "audio/mpeg" });
      const blobB = new Blob(["b"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blobA);
      assert.equal(getActiveVoicePreviewVoiceId(), "nova");
      assert.equal(MockAudio.instances.length, 1);

      await startVoicePreview("cedar", blobB);
      assert.equal(getActiveVoicePreviewVoiceId(), "cedar");
      assert.equal(MockAudio.instances.length, 2);
      assert.equal(MockAudio.instances[0].src, "");

      stopVoicePreview();
      assert.equal(getActiveVoicePreviewVoiceId(), null);
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  await testAsync("natural end does not invoke onError", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      let ended = false;
      let errored = false;
      const blob = new Blob(["a"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blob, {
        onEnded: () => {
          ended = true;
        },
        onError: () => {
          errored = true;
        },
      });

      MockAudio.instances[0]?.onended?.();
      assert.equal(ended, true);
      assert.equal(errored, false);
      assert.equal(getActiveVoicePreviewVoiceId(), null);
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  await testAsync("stopVoicePreview teardown does not invoke onError", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      let errored = false;
      const blob = new Blob(["a"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blob, {
        onError: () => {
          errored = true;
        },
      });

      stopVoicePreview();
      assert.equal(errored, false);
      assert.equal(getActiveVoicePreviewVoiceId(), null);
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  await testAsync("switching preview voices does not set false onError", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      let errorA = false;
      let errorB = false;
      const blobA = new Blob(["a"], { type: "audio/mpeg" });
      const blobB = new Blob(["b"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blobA, {
        onError: () => {
          errorA = true;
        },
      });
      await startVoicePreview("cedar", blobB, {
        onError: () => {
          errorB = true;
        },
      });

      assert.equal(errorA, false);
      assert.equal(errorB, false);
      assert.equal(getActiveVoicePreviewVoiceId(), "cedar");
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  await testAsync("superseded audio onerror is ignored", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      let errorA = false;
      const blobA = new Blob(["a"], { type: "audio/mpeg" });
      const blobB = new Blob(["b"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blobA, {
        onError: () => {
          errorA = true;
        },
      });

      const staleAudio = MockAudio.instances[0];
      await startVoicePreview("cedar", blobB);
      staleAudio?.onerror?.();

      assert.equal(errorA, false);
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  await testAsync("active playback error still invokes onError", async () => {
    resetVoicePreviewPlaybackForTests();
    MockAudio.instances = [];
    const previousAudio = globalThis.Audio;
    globalThis.Audio = MockAudio as unknown as typeof Audio;

    try {
      let errored = false;
      const blob = new Blob(["a"], { type: "audio/mpeg" });

      await startVoicePreview("nova", blob, {
        onError: () => {
          errored = true;
        },
      });

      MockAudio.instances[0]?.onerror?.();
      assert.equal(errored, true);
      assert.equal(getActiveVoicePreviewVoiceId(), null);
    } finally {
      globalThis.Audio = previousAudio;
    }
  });

  test("useVoicePreview guards stale preview sessions", () => {
    const hookSource = readFileSync(USE_VOICE_PREVIEW_PATH, "utf8");
    assert.match(hookSource, /previewGenerationRef/);
    assert.match(hookSource, /previewGenerationRef\.current !== generation/);
    assert.match(hookSource, /setError\(null\)/);
  });

  test("no draft persistence import", () => {
    const forbidden = [/features\/drafts/, /draft-session-store/, /voiceoverAudioBase64/];
    const sources = collectVoicePreviewSources(VOICE_PREVIEW_ROOT);

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${filePath} must not persist preview audio`);
      }
    }

    const routeSource = readFileSync(ROUTE_PATH, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(routeSource, pattern, "voice-preview route must stay stateless");
    }
  });

  test("no export import", () => {
    const forbidden = [/features\/export/];
    const sources = [...collectVoicePreviewSources(VOICE_PREVIEW_ROOT), ROUTE_PATH];

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${filePath} must not touch export`);
      }
    }
  });

  test("no VideoPreview import", () => {
    const forbidden = [/VideoPreview/, /features\/preview/];
    const sources = [...collectVoicePreviewSources(VOICE_PREVIEW_ROOT), ROUTE_PATH, VOICE_CARD_PATH];

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${filePath} must stay separate from canvas preview`);
      }
    }
  });

  test("voice preview route returns audio/mpeg", () => {
    const routeSource = readFileSync(ROUTE_PATH, "utf8");
    assert.match(routeSource, /audio\/mpeg/);
    assert.match(routeSource, /generateVoicePreview/);
    assert.match(routeSource, /parseVoicePreviewRequest/);
    assert.match(routeSource, /422/);
    assert.doesNotMatch(routeSource, /applyVoiceoverRegeneration/);
    assert.doesNotMatch(routeSource, /onScriptChange/);
  });

  await testAsync("preview service passes resolved model to TTS generator", async () => {
    resetVoicePreviewCacheForTests();
    resetVoicePreviewGenerationCallCountForTests();

    let capturedModel: string | undefined;
    setVoicePreviewTtsGeneratorForTests(async (input) => {
      capturedModel = input.model;
      return new ArrayBuffer(8);
    });

    await generateVoicePreview({
      voice: "ballad",
      speed: 1,
      sampleText: DEFAULT_VOICE_PREVIEW_SAMPLE_TEXT,
      stylePreset: "neutral",
      expressiveDelivery: false,
    });

    assert.equal(capturedModel, TTS_MODEL_EXPRESSIVE);
    setVoicePreviewTtsGeneratorForTests(null);
  });
}

console.log("voice-preview");

runVoicePreviewTests()
  .then(() => {
    console.log("voice-preview passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
