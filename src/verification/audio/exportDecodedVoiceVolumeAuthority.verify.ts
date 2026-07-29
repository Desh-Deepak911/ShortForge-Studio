/**
 * Sprint 11E Phase 2G.24E — decoded voice volume loudness authority.
 * Run: npm run test:export-decoded-voice-volume-authority
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  linearGainToDecibels,
  resolveVoiceGainAuthority,
  resolveVoiceStemGain,
  resolveVoiceVolumeGain,
} from "@/features/audio-mixer";
import { PEAK_PROTECTION_OUTPUT_CEILING } from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import { resolveAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.utils";
import {
  buildExportManifest,
  buildExportManifestFingerprint,
} from "@/features/export/domain";
import { resolveExportAudioMixPlan } from "@/features/export/audio/resolve-export-audio-mix-plan";
import { buildMuxVideoExportAudioFilterComplex } from "@/features/export/utils/ffmpeg.utils";
import { EXPORT_DUCKING_RELEASE_MS } from "@/features/export/utils/export-music-envelope.utils";
import { buildHeadlessAudioFilterComplex } from "@/features/headless-renderer/worker/audio/build-headless-audio-filter";
import { buildHeadlessAudioPlan } from "@/features/headless-renderer/worker/audio/build-headless-audio-plan";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import type { ExportManifestV4 } from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";

import {
  analyzeDecodedPcm,
  approximateIntegratedLoudnessDb,
  countClippedSamples,
  crestFactorLinear,
  decodeToMonoPcm,
  decodedRmsDeltaDb,
  DECODED_AUDIO_DURATION_TOLERANCE_MS,
  DECODED_AUDIO_SILENCE_RMS_LINEAR,
  measureWindowRms,
  probeAudioPtsMonotonic,
  probeMediaDurationMs,
  renderFilterComplexToFile,
  requireNativeFfmpeg,
  writeScaledSineWav,
} from "./decoded-audio-continuity.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const VOICE_PERCENT_STEPS = [0, 0.25, 0.5, 1, 1.25, 1.5, 2] as const;
const DB_TOLERANCE = 0.75;

function withVoiceStemGain(
  manifest: ExportManifestV4,
  voiceStemGain: number,
): ExportManifestV4 {
  if (!manifest.audio.voiceover) {
    throw new Error("Fixture requires voiceover.");
  }
  return {
    ...manifest,
    audio: {
      ...manifest.audio,
      voiceover: {
        ...manifest.audio.voiceover,
        volume: voiceStemGain,
      },
      applyPeakProtection: voiceStemGain > 1,
    },
  };
}

function renderVoiceOnly(input: {
  manifest: ExportManifestV4;
  voicePath: string;
  dir: string;
  codec: "opus" | "aac";
  runtime: "headless" | "browser-wasm";
  peakProtection?: boolean;
}): string {
  const bins = requireNativeFfmpeg()!;
  const planResult = buildHeadlessAudioPlan(input.manifest);
  assert.equal(planResult.ok, true);
  if (!planResult.ok) throw new Error("plan failed");
  const plan = planResult.plan;
  assert.equal(plan.combination, "voiceover");

  let filterComplex: string;
  if (input.runtime === "headless") {
    const built = buildHeadlessAudioFilterComplex({
      plan: {
        ...plan,
        applyPeakProtection:
          input.peakProtection ?? plan.applyPeakProtection,
      },
      voiceInputIndex: 0,
      musicInputIndex: null,
    });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("headless filter failed");
    filterComplex = built.build.filterComplex!;
  } else {
    filterComplex = buildMuxVideoExportAudioFilterComplex({
      hasVoiceover: true,
      hasMusic: false,
      voiceInputIndex: 0,
      musicInputIndex: null,
      durationSec: plan.outputDurationSec,
      voiceGain: plan.voiceover!.volumeGain,
    });
  }

  const out = join(
    input.dir,
    `voice-${input.runtime}-${input.codec}-${plan.voiceover!.volumeGain}.${input.codec === "opus" ? "webm" : "m4a"}`,
  );
  renderFilterComplexToFile({
    bins,
    filterComplex,
    voicePath: input.voicePath,
    outputPath: out,
    outputDurationSec: plan.outputDurationSec,
    codec: input.codec,
  });
  return out;
}

function renderVoiceWithMusic(input: {
  manifest: ExportManifestV4;
  voicePath: string;
  musicPath: string;
  dir: string;
  codec: "opus" | "aac";
  runtime: "headless" | "browser-wasm";
}): string {
  const bins = requireNativeFfmpeg()!;
  const planResult = buildHeadlessAudioPlan(input.manifest);
  assert.equal(planResult.ok, true);
  if (!planResult.ok) throw new Error("plan failed");
  const plan = planResult.plan;

  let filterComplex: string;
  if (input.runtime === "headless") {
    const built = buildHeadlessAudioFilterComplex({
      plan,
      voiceInputIndex: 0,
      musicInputIndex: 1,
    });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("headless filter failed");
    filterComplex = built.build.filterComplex!;
  } else {
    const mixSettings = {
      exportDurationMs: plan.outputDurationMs,
      volume: plan.music!.volumeGain,
      voiceGain: plan.voiceover!.volumeGain,
      musicGain: plan.music!.volumeGain,
      fadeIn: plan.music!.fadeInMs > 0,
      fadeOut: plan.music!.fadeOutMs > 0,
      fadeInSec: plan.music!.fadeInMs / 1000,
      fadeOutSec: plan.music!.fadeOutMs / 1000,
      duckingEnabled: plan.music!.applyDucking,
      duckingStrength:
        plan.music!.volumeGain > 0
          ? plan.music!.duckedVolumeGain / plan.music!.volumeGain
          : 0,
      voiceoverDurationSec: plan.music!.duckUntilMs / 1000,
      applyDucking: plan.music!.applyDucking,
      applyPeakProtection: false,
    };
    filterComplex = buildMuxVideoExportAudioFilterComplex({
      hasVoiceover: true,
      hasMusic: true,
      voiceInputIndex: 0,
      musicInputIndex: 1,
      durationSec: plan.outputDurationSec,
      voiceGain: plan.voiceover!.volumeGain,
      backgroundMusicMix: mixSettings,
    });
  }

  const out = join(
    input.dir,
    `mix-${input.runtime}-${input.codec}-${plan.voiceover!.volumeGain}.${input.codec === "opus" ? "webm" : "m4a"}`,
  );
  renderFilterComplexToFile({
    bins,
    filterComplex,
    voicePath: input.voicePath,
    musicPath: input.musicPath,
    outputPath: out,
    outputDurationSec: plan.outputDurationSec,
    codec: input.codec,
  });
  return out;
}

function decodeMetrics(path: string) {
  const bins = requireNativeFfmpeg()!;
  const { pcm, sampleRateHz } = decodeToMonoPcm(bins, path);
  const metrics = analyzeDecodedPcm(pcm, sampleRateHz);
  return {
    pcm,
    metrics,
    clipped: countClippedSamples(pcm),
    lufsApprox: approximateIntegratedLoudnessDb(pcm),
    crest: crestFactorLinear(metrics.peakAmplitude, metrics.overallRms),
    durationMs: probeMediaDurationMs(bins, path),
    ptsMonotonic: probeAudioPtsMonotonic(bins, path),
  };
}

console.log("\nexport-decoded-voice-volume-authority (Sprint 11E 2G.24E)\n");

const bins = requireNativeFfmpeg();
if (!bins) {
  console.log("  ⚠ native FFmpeg unavailable — skipping decode fixtures");
  process.exit(0);
}

test("linear percentage-to-gain mapping at supported UI steps", () => {
  for (const step of VOICE_PERCENT_STEPS) {
    assert.equal(resolveVoiceVolumeGain(step), step);
  }
  assert.ok(Math.abs(linearGainToDecibels(2) - 6.020599913279624) < 0.01);
  assert.ok(Math.abs(linearGainToDecibels(0.5) + 6.020599913279624) < 0.01);
});

test("mix plan gainAuthority exposes final-bus peak protection ceiling", () => {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice",
    durationMs: 1800,
  });
  const boosted = withVoiceStemGain(fixture.manifestV3, 2);
  const plan = resolveExportAudioMixPlan(boosted);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.gainAuthority.resolvedVoiceGain, 2);
  assert.equal(plan.plan.gainAuthority.applyPeakProtection, true);
  assert.equal(plan.plan.gainAuthority.peakProtectionPlacement, "final-bus");
  assert.equal(plan.plan.gainAuthority.finalOutputCeiling, PEAK_PROTECTION_OUTPUT_CEILING);
});

test("0% voice renders silent narration (voice-only WebM)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-0-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1600 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.6, 0.25);
  const manifest = withVoiceStemGain(fixture.manifestV3, 0);
  const out = renderVoiceOnly({
    manifest,
    voicePath,
    dir,
    codec: "opus",
    runtime: "headless",
    peakProtection: false,
  });
  const decoded = decodeMetrics(out);
  assert.ok(decoded.metrics.overallRms < DECODED_AUDIO_SILENCE_RMS_LINEAR);
  rmSync(dir, { recursive: true, force: true });
});

test("headroom source: 50% and 200% decode ~±6 dB vs 100% (voice-only MP4)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-db-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1800 });
  const voicePath = join(dir, "voice-low.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.8, 0.18);

  const ref = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 1),
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const half = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 0.5),
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const boosted = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 2),
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: true,
    }),
  );

  const halfDb = decodedRmsDeltaDb(ref.metrics.overallRms, half.metrics.overallRms);
  const boostDb = decodedRmsDeltaDb(ref.metrics.overallRms, boosted.metrics.overallRms);
  assert.ok(Math.abs(halfDb + 6.02) < DB_TOLERANCE, `50% delta ${halfDb.toFixed(2)} dB`);
  assert.ok(Math.abs(boostDb - 6.02) < DB_TOLERANCE, `200% delta ${boostDb.toFixed(2)} dB`);
  assert.ok(boosted.metrics.overallRms > ref.metrics.overallRms);
  rmSync(dir, { recursive: true, force: true });
});

test("gain monotonicity across UI steps on headroom voice-only WebM", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-mono-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1500 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.5, 0.2);

  let prevRms = -1;
  for (const step of VOICE_PERCENT_STEPS) {
    const decoded = decodeMetrics(
      renderVoiceOnly({
        manifest: withVoiceStemGain(fixture.manifestV3, step),
        voicePath,
        dir,
        codec: "opus",
        runtime: "headless",
        peakProtection: step > 1,
      }),
    );
    if (step === 0) {
      assert.ok(decoded.metrics.overallRms < DECODED_AUDIO_SILENCE_RMS_LINEAR);
    } else {
      assert.ok(decoded.metrics.overallRms >= prevRms);
      prevRms = decoded.metrics.overallRms;
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

test("150% measurably louder than 100% on normal TTS-like amplitude", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-150-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1400 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.4, 0.35);

  const ref = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 1),
      voicePath,
      dir,
      codec: "opus",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const louder = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 1.5),
      voicePath,
      dir,
      codec: "opus",
      runtime: "headless",
      peakProtection: true,
    }),
  );
  assert.ok(decodedRmsDeltaDb(ref.metrics.overallRms, louder.metrics.overallRms) > 2.5);
  rmSync(dir, { recursive: true, force: true });
});

test("hot source: 200% stays louder than 100% under peak protection", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-hot-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1200 });
  const voicePath = join(dir, "voice-hot.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.2, 0.72);

  const ref = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 1),
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const boosted = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 2),
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: true,
    }),
  );

  assert.ok(boosted.metrics.overallRms >= ref.metrics.overallRms);
  assert.ok(boosted.metrics.peakAmplitude <= PEAK_PROTECTION_OUTPUT_CEILING + 0.02);
  assert.equal(boosted.clipped, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("decoded outputs contain zero clipped samples across volume ladder", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-clip-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1200 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.2, 0.25);

  for (const step of [0.5, 1, 1.5, 2]) {
    const decoded = decodeMetrics(
      renderVoiceOnly({
        manifest: withVoiceStemGain(fixture.manifestV3, step),
        voicePath,
        dir,
        codec: "opus",
        runtime: "headless",
        peakProtection: step > 1,
      }),
    );
    assert.equal(decoded.clipped, 0, `clipping at ${step}`);
    assert.ok(decoded.metrics.peakAmplitude <= 1);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("voice-only Browser wasm vs Headless decoded loudness parity (WebM)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-parity-vo-webm-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1600 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.6, 0.22);
  const manifest = withVoiceStemGain(fixture.manifestV3, 1.5);

  const headless = decodeMetrics(
    renderVoiceOnly({
      manifest: { ...manifest, audio: { ...manifest.audio, applyPeakProtection: false } },
      voicePath,
      dir,
      codec: "opus",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const browser = decodeMetrics(
    renderVoiceOnly({
      manifest,
      voicePath,
      dir,
      codec: "opus",
      runtime: "browser-wasm",
    }),
  );
  assert.ok(
    Math.abs(
      decodedRmsDeltaDb(headless.metrics.overallRms, browser.metrics.overallRms),
    ) < 0.5,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("voice-only Browser wasm vs Headless decoded loudness parity (MP4/AAC)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-parity-vo-mp4-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1500 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.5, 0.2);
  const manifest = withVoiceStemGain(fixture.manifestV3, 2);

  const headless = decodeMetrics(
    renderVoiceOnly({
      manifest: { ...manifest, audio: { ...manifest.audio, applyPeakProtection: false } },
      voicePath,
      dir,
      codec: "aac",
      runtime: "headless",
      peakProtection: false,
    }),
  );
  const browser = decodeMetrics(
    renderVoiceOnly({
      manifest,
      voicePath,
      dir,
      codec: "aac",
      runtime: "browser-wasm",
    }),
  );
  assert.ok(
    Math.abs(
      decodedRmsDeltaDb(headless.metrics.overallRms, browser.metrics.overallRms),
    ) < 0.75,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("voice+music WebM: voice-to-music ratio rises with voice percentage", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-ratio-webm-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2000,
  });
  const voicePath = join(dir, "voice.wav");
  const musicPath = join(dir, "music.wav");
  writeScaledSineWav(bins, voicePath, 440, 2, 0.3);
  writeScaledSineWav(bins, musicPath, 220, 0.4, 0.15);

  function mixWindowRms(voiceGain: number): number {
    const decoded = decodeMetrics(
      renderVoiceWithMusic({
        manifest: withVoiceStemGain(fixture.manifestV3, voiceGain),
        voicePath,
        musicPath,
        dir,
        codec: "opus",
        runtime: "headless",
      }),
    );
    return measureWindowRms(decoded.pcm, 48_000, 0.25, 0.85);
  }

  const musicBaseline = mixWindowRms(0);
  const mix100 = mixWindowRms(1);
  const mix200 = mixWindowRms(2);
  const voiceShare100 = Math.max(0, mix100 - musicBaseline);
  const voiceShare200 = Math.max(0, mix200 - musicBaseline);
  assert.ok(voiceShare200 > voiceShare100 * 1.2);
  assert.ok(mix200 > mix100);
  rmSync(dir, { recursive: true, force: true });
});

test("voice+music MP4 parity: Browser wasm vs Headless within tolerance", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-parity-mix-mp4-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 1800,
  });
  const voicePath = join(dir, "voice.wav");
  const musicPath = join(dir, "music.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.8, 0.25);
  writeScaledSineWav(bins, musicPath, 220, 0.4, 0.12);
  const manifest = withVoiceStemGain(fixture.manifestV3, 1.25);

  const headless = decodeMetrics(
    renderVoiceWithMusic({
      manifest,
      voicePath,
      musicPath,
      dir,
      codec: "aac",
      runtime: "headless",
    }),
  );
  const browser = decodeMetrics(
    renderVoiceWithMusic({
      manifest,
      voicePath,
      musicPath,
      dir,
      codec: "aac",
      runtime: "browser-wasm",
    }),
  );
  assert.ok(
    Math.abs(
      decodedRmsDeltaDb(headless.metrics.overallRms, browser.metrics.overallRms),
    ) < 1.25,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("master volume remains independent from voice percentage stem gain", () => {
  const script: FootieScript = {
    title: "Master independence",
    narration: "Test.",
    totalDuration: 5,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 4000,
    scenes: [{ id: "s1", start: 0, end: 5, duration: 5, subtitle: "S" }],
    audioMixer: {
      voice: { volume: 2 },
      master: { volume: 0.5 },
    },
  };
  const mixer = resolveAudioMixerSettings(script);
  assert.equal(resolveVoiceStemGain(mixer), 1);
  const authority = resolveVoiceGainAuthority(mixer);
  assert.equal(authority.linearVoiceGain, 2);
  assert.equal(authority.resolvedVoiceGain, 1);
  assert.equal(authority.masterVolume, 0.5);
});

test("ducking envelope from Phase 2G.24D remains unchanged", () => {
  assert.equal(EXPORT_DUCKING_RELEASE_MS, 50);
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2000,
    musicFades: true,
  });
  const plan = resolveExportAudioMixPlan(fixture.manifestV3);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.music?.applyDucking, true);
  assert.ok((plan.plan.music?.duckUntilMs ?? 0) > 0);
});

test("preview uses Web Audio gain above 100%; export shares stem gain authority", () => {
  const preview = read("src/features/preview/utils/preview-voice-gain.utils.ts");
  const browserMix = read("src/features/export/utils/export-browser-audio-mix.utils.ts");
  const headlessFilter = read(
    "src/features/headless-renderer/worker/audio/build-headless-audio-filter.ts",
  );
  assert.match(preview, /resolveVoiceStemGain/);
  assert.match(browserMix, /mixSettings\.voiceGain/);
  assert.match(headlessFilter, /volume=\$\{gain\}/);
  assert.doesNotMatch(
    read("src/features/preview/hooks/usePreviewPlayback.ts"),
    /narrationAudio\.volume = resolvePreviewVoicePlaybackVolume/,
  );
});

test("manifest round trip preserves 200% voice stem gain", () => {
  const env = {
    browserName: "chrome",
    supportsCanvasCaptureStream: true,
    supportsManualCanvasFrameRequest: true,
    supportsMediaRecorder: true,
    supportsRequestVideoFrameCallback: true,
    supportsWebAssembly: true,
    serverRendererAvailable: false,
    ffmpegRuntimePoisoned: false,
    estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
    mp4EncoderAvailable: true,
  };
  const manifest = buildExportManifest({
    story: {
      title: "Persist",
      narration: "N",
      totalDuration: 4,
      voiceoverUrl: "blob:v",
      voiceoverDurationMs: 3500,
      scenes: [{ id: "s1", start: 0, end: 4, duration: 4, subtitle: "S" }],
      audioMixer: { voice: { volume: 2 }, master: { volume: 1 } },
    },
    environment: env,
    audioMode: "with-voice",
  });
  assert.equal(manifest.audio.voiceover?.volume, 2);
  assert.equal(manifest.audio.applyPeakProtection, true);
});

test("fingerprint changes when voice volume changes", () => {
  const base = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1500 });
  const a = withVoiceStemGain(base.manifestV3, 1);
  const b = withVoiceStemGain(base.manifestV3, 2);
  const draftA = { ...a };
  delete (draftA as { fingerprint?: string }).fingerprint;
  const draftB = { ...b };
  delete (draftB as { fingerprint?: string }).fingerprint;
  const fpA = buildExportManifestFingerprint(
    draftA as Parameters<typeof buildExportManifestFingerprint>[0],
  );
  const fpB = buildExportManifestFingerprint(
    draftB as Parameters<typeof buildExportManifestFingerprint>[0],
  );
  assert.notEqual(fpA, fpB);
});

test("audio duration and PTS remain stable across voice volume changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "dvv-dur-"));
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 1700 });
  const voicePath = join(dir, "voice.wav");
  writeScaledSineWav(bins, voicePath, 440, 1.7, 0.2);

  const baseline = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 1),
      voicePath,
      dir,
      codec: "opus",
      runtime: "headless",
    }),
  );
  const boosted = decodeMetrics(
    renderVoiceOnly({
      manifest: withVoiceStemGain(fixture.manifestV3, 2),
      voicePath,
      dir,
      codec: "opus",
      runtime: "headless",
    }),
  );

  assert.equal(baseline.ptsMonotonic, true);
  assert.equal(boosted.ptsMonotonic, true);
  assert.ok(
    Math.abs((baseline.durationMs ?? 0) - (boosted.durationMs ?? 0)) <=
      DECODED_AUDIO_DURATION_TOLERANCE_MS,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("no video profile mutation — headless 720p/1080p/4K authority unchanged", () => {
  const profiles = read(
    "src/features/headless-renderer/worker/runtime/output-profiles.ts",
  );
  assert.match(profiles, /720p/);
  assert.match(profiles, /1080p/);
  assert.match(profiles, /4k/);
  assert.doesNotMatch(profiles, /browser.*4k/i);
});

console.log(`\nexport-decoded-voice-volume-authority: ${passed} passed\n`);
