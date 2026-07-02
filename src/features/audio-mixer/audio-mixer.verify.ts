/**
 * Audio mixer foundation verification
 * (run: npm run test:audio-mixer).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./audio-mixer.peak-protection.verify";

import {
  createDefaultAudioMixerSettings,
  DEFAULT_DUCKING_STRENGTH,
  DEFAULT_MASTER_MIX_VOLUME,
  DEFAULT_MUSIC_MIX_VOLUME,
  DEFAULT_VOICE_MIX_VOLUME,
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolveVoiceStemGain,
} from "@/features/audio-mixer";
import {
  resolveExportBackgroundMusicMixSettings,
  resolveExportVoiceStemGain,
} from "@/features/export/utils/export-background-music.utils";
import {
  resolvePreviewBackgroundMusicPlaybackVolume,
} from "@/features/preview/utils/preview-background-music.utils";
import {
  resolvePreviewVoicePlaybackVolume,
  resolvePreviewVoiceStemGain,
  shouldRoutePreviewVoiceThroughGainNode,
} from "@/features/preview/utils/preview-voice-gain.utils";
import type { FootieScript } from "@/features/story/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = __dirname;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function buildLegacyScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Mixer QA",
    narration: "Test narration.",
    totalDuration: 6,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 6,
        duration: 6,
        subtitle: "Scene one",
      },
    ],
    ...overrides,
  };
}

function collectModuleSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectModuleSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("audioMixer");

test("old draft without audioMixer resolves defaults", () => {
  const resolved = resolveAudioMixerSettings(buildLegacyScript());

  assert.equal(resolved.voice.volume, DEFAULT_VOICE_MIX_VOLUME);
  assert.equal(resolved.master.volume, DEFAULT_MASTER_MIX_VOLUME);
  assert.equal(resolved.music.volume, DEFAULT_MUSIC_MIX_VOLUME);
  assert.equal(resolved.music.duckingEnabled, true);
  assert.equal(resolved.music.duckingStrength, DEFAULT_DUCKING_STRENGTH);
  assert.equal(resolved.music.fadeInMs, 2000);
  assert.equal(resolved.music.fadeOutMs, 2000);
  assert.equal(resolved.voice.normalize, false);
  assert.equal(resolved.music.normalize, false);
  assert.equal(resolved.master.limiterEnabled, false);
});

test("existing background music volume is preserved", () => {
  const resolved = resolveAudioMixerSettings(
    buildLegacyScript({
      backgroundMusic: {
        enabled: true,
        source: "upload",
        fileUrl: "blob:music",
        volume: 0.42,
        duckingEnabled: false,
        fadeIn: false,
        fadeOut: true,
      },
    }),
  );

  assert.equal(resolved.music.volume, 0.42);
  assert.equal(resolved.music.duckingEnabled, false);
  assert.equal(resolved.music.fadeInMs, 0);
  assert.equal(resolved.music.fadeOutMs, 2000);
});

test("audioMixer overrides merge with legacy music fields", () => {
  const resolved = resolveAudioMixerSettings(
    buildLegacyScript({
      backgroundMusic: {
        enabled: true,
        source: "upload",
        fileUrl: "blob:music",
        volume: 0.25,
        duckingEnabled: true,
        fadeIn: true,
        fadeOut: true,
      },
      audioMixer: {
        music: {
          volume: 0.5,
          duckingStrength: 0.2,
          fadeInMs: 1500,
        },
        voice: {
          volume: 1.25,
          normalize: true,
          targetLufs: -16,
        },
      },
    }),
  );

  assert.equal(resolved.music.volume, 0.5);
  assert.equal(resolved.music.duckingStrength, 0.2);
  assert.equal(resolved.music.fadeInMs, 1500);
  assert.equal(resolved.music.fadeOutMs, 2000);
  assert.equal(resolved.voice.volume, 1.25);
  assert.equal(resolved.voice.normalize, true);
  assert.equal(resolved.voice.targetLufs, -16);
});

test("clamp invalid volume and ducking values", () => {
  const resolved = resolveAudioMixerSettings(
    buildLegacyScript({
      audioMixer: {
        voice: { volume: 99 },
        music: { volume: -3, duckingStrength: 2.5 },
        master: { volume: Number.NaN },
      },
    }),
  );

  assert.equal(resolved.voice.volume, 2);
  assert.equal(resolved.music.volume, 0);
  assert.equal(resolved.music.duckingStrength, 1);
  assert.equal(resolved.master.volume, DEFAULT_MASTER_MIX_VOLUME);
});

test("resolver does not mutate script", () => {
  const script = buildLegacyScript({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.33,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: false,
    },
  });
  const snapshot = structuredClone(script);

  resolveAudioMixerSettings(script);

  assert.deepEqual(script, snapshot);
});

test("createDefaultAudioMixerSettings returns normalized defaults", () => {
  const defaults = createDefaultAudioMixerSettings();

  assert.equal(defaults.voice?.volume, DEFAULT_VOICE_MIX_VOLUME);
  assert.equal(defaults.music?.volume, DEFAULT_MUSIC_MIX_VOLUME);
  assert.equal(defaults.master?.volume, DEFAULT_MASTER_MIX_VOLUME);
  assert.equal(defaults.music?.duckingStrength, DEFAULT_DUCKING_STRENGTH);
});

test("stem gains multiply voice/music volume by master volume", () => {
  const script = buildLegacyScript({
    audioMixer: {
      voice: { volume: 1.2 },
      music: { volume: 0.5 },
      master: { volume: 0.8 },
    },
  });
  const mixer = resolveAudioMixerSettings(script);

  assert.equal(resolveVoiceStemGain(mixer), 0.96);
  assert.equal(resolveMusicStemGain(mixer), 0.4);
});

test("legacy draft preview and export gains match previous defaults", () => {
  const script = buildLegacyScript({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });

  assert.equal(resolvePreviewVoicePlaybackVolume(script), 1);
  assert.equal(resolvePreviewVoiceStemGain(script), 1);
  assert.equal(resolveExportVoiceStemGain(script), 1);
  assert.equal(
    resolvePreviewBackgroundMusicPlaybackVolume({
      script,
      elapsedSec: 5,
      totalDurationSec: 10,
      voiceoverIsPlaying: true,
    }),
    0.2 * DEFAULT_DUCKING_STRENGTH,
  );

  const exportSettings = resolveExportBackgroundMusicMixSettings(script, true, 10_000);
  assert.ok(exportSettings);
  assert.equal(exportSettings!.voiceGain, 1);
  assert.equal(exportSettings!.musicGain, 0.2);
  assert.equal(exportSettings!.volume, 0.2);
  assert.equal(resolveExportVoiceStemGain(script), 1);
});

test("music volume 0.01 maps through mixer to export and preview stem gain", () => {
  const script = buildLegacyScript({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.01,
      duckingEnabled: false,
      fadeIn: false,
      fadeOut: false,
    },
  });

  const exportSettings = resolveExportBackgroundMusicMixSettings(script, true, 5_000);
  assert.equal(exportSettings?.musicGain, 0.01);

  assert.equal(
    resolvePreviewBackgroundMusicPlaybackVolume({
      script,
      elapsedSec: 1,
      totalDurationSec: 10,
      voiceoverIsPlaying: false,
    }),
    0.01,
  );
});

test("ducking settings remain available from resolved mixer", () => {
  const script = buildLegacyScript({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.3,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
    audioMixer: {
      music: { duckingStrength: 0.2, duckingEnabled: true },
    },
  });

  const mixer = resolveAudioMixerSettings(script);
  assert.equal(mixer.music.duckingEnabled, true);
  assert.equal(mixer.music.duckingStrength, 0.2);
});

test("preview voice stem gain matches export for boosted voice levels", () => {
  for (const voiceVolume of [1, 1.5, 2]) {
    const script = buildLegacyScript({
      voiceoverUrl: "blob:voice",
      audioMixer: {
        voice: { volume: voiceVolume },
        master: { volume: 1 },
      },
    });

    assert.equal(resolvePreviewVoiceStemGain(script), voiceVolume);
    assert.equal(resolveExportVoiceStemGain(script), voiceVolume);
    assert.equal(
      shouldRoutePreviewVoiceThroughGainNode(voiceVolume, false),
      voiceVolume > 1,
    );
  }
});

test("preview voice boost uses gain node path above 100%", () => {
  const audioEngineSource = readFileSync(
    join(process.cwd(), "src/features/audio/services/audio-engine.service.ts"),
    "utf8",
  );
  const previewHook = readFileSync(
    join(process.cwd(), "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );

  assert.match(audioEngineSource, /syncNarrationPreviewGain/);
  assert.match(audioEngineSource, /createMediaElementSource/);
  assert.match(audioEngineSource, /createGain/);
  assert.match(previewHook, /syncNarrationPreviewGain/);
  assert.match(previewHook, /resolvePreviewVoiceStemGain/);
  assert.doesNotMatch(previewHook, /narrationAudio\.volume = resolvePreviewVoicePlaybackVolume/);
});

test("uploaded and generated voiceover preview paths remain unchanged", () => {
  const previewHook = readFileSync(
    join(process.cwd(), "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );
  const audioEngineSource = readFileSync(
    join(process.cwd(), "src/features/audio/services/audio-engine.service.ts"),
    "utf8",
  );

  assert.match(previewHook, /getNarrationAudioElementBySrc/);
  assert.match(previewHook, /resolvePlayableVoiceoverFromStory/);
  assert.match(previewHook, /applyVoiceoverPlaybackRate/);
  assert.match(audioEngineSource, /getStableVoiceoverPlaybackUrl/);
});

test("music preview volume path is unaffected by voice boost routing", () => {
  const previewMusicUtils = readFileSync(
    join(process.cwd(), "src/features/preview/utils/preview-background-music.utils.ts"),
    "utf8",
  );
  const previewHook = readFileSync(
    join(process.cwd(), "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );

  assert.match(previewMusicUtils, /clampHtmlMediaElementVolume/);
  assert.match(previewMusicUtils, /resolveMusicStemGain/);
  assert.match(previewHook, /resolvePreviewBackgroundMusicPlaybackVolume/);
  assert.match(previewHook, /musicAudio\.volume/);
});

test("export ducking settings align with preview multiplier during voiceover", () => {
  const ffmpegUtils = readFileSync(
    join(process.cwd(), "src/features/export/utils/ffmpeg.utils.ts"),
    "utf8",
  );
  const exportMusicUtils = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-background-music.utils.ts"),
    "utf8",
  );

  assert.match(exportMusicUtils, /resolveAudioMixerSettings/);
  assert.match(exportMusicUtils, /resolveExportDuckedMusicGain/);
  assert.match(exportMusicUtils, /applyDucking/);
  assert.match(ffmpegUtils, /buildExportBackgroundMusicFilterChain/);
  assert.match(ffmpegUtils, /buildExportFfmpegPeakLimiterFilterChain/);
  assert.doesNotMatch(exportMusicUtils, /loudnorm/);
  assert.doesNotMatch(ffmpegUtils, /loudnorm/);
});

test("preview and export modules apply mixer stem gains", () => {
  const previewHook = readFileSync(
    join(process.cwd(), "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );
  const exportMix = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-browser-audio-mix.utils.ts"),
    "utf8",
  );
  const ffmpegUtils = readFileSync(
    join(process.cwd(), "src/features/export/utils/ffmpeg.utils.ts"),
    "utf8",
  );

  assert.match(previewHook, /resolvePreviewVoiceStemGain/);
  assert.match(exportMix, /mixSettings\.voiceGain/);
  assert.match(exportMix, /settings\.musicGain/);
  assert.match(ffmpegUtils, /voiceGain/);
  assert.match(ffmpegUtils, /buildExportFfmpegPeakLimiterFilterChain/);
  assert.doesNotMatch(ffmpegUtils, /loudnorm/);
  assert.doesNotMatch(ffmpegUtils, /dynaudnorm/);
});

test("audio mixer module has no preview, export, ffmpeg, or UI imports", () => {
  const forbiddenPatterns = [
    /@\/features\/preview\//,
    /@\/features\/export\//,
    /from ["']@\/features\/export\//,
    /from ["'].*ffmpeg/,
    /OfflineAudioContext/,
    /HTMLAudioElement/,
    /@\/features\/editor\/components/,
    /ProjectAudioStudio/,
    /usePreviewPlayback/,
  ];

  for (const filePath of collectModuleSources(MODULE_ROOT)) {
    const contents = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${filePath} must remain foundation-only`);
    }
  }
});

console.log("All audio mixer checks passed.");
