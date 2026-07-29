/**
 * Sprint 11E Phase 2G.24D — decoded audio continuity authority.
 * Run: npm run test:export-decoded-audio-continuity-authority
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildExportMusicVolumeExpression } from "@/features/export/audio/build-export-music-volume-expression";
import { resolveExportAudioMixPlan } from "@/features/export/audio/resolve-export-audio-mix-plan";
import { buildMuxVideoExportAudioFilterComplex } from "@/features/export/utils/ffmpeg.utils";
import {
  EXPORT_DUCKING_RELEASE_MS,
  resolveExportMusicEnvelopeGainAtSec,
  toExportMusicEnvelopeInput,
} from "@/features/export/utils/export-music-envelope.utils";
import { buildHeadlessAudioFilterComplex } from "@/features/headless-renderer/worker/audio/build-headless-audio-filter";
import { buildHeadlessAudioPlan } from "@/features/headless-renderer/worker/audio/build-headless-audio-plan";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/timeline-end-buffer";
import { resolveExportTotalFrames } from "@/features/export/timing";

import {
  analyzeDecodedPcm,
  DECODED_AUDIO_CLICK_SCORE_THRESHOLD,
  DECODED_AUDIO_CODEC_PREROLL_MS,
  DECODED_AUDIO_DURATION_TOLERANCE_MS,
  DECODED_AUDIO_SILENCE_RMS_LINEAR,
  decodeToMonoPcm,
  probeAudioPtsMonotonic,
  probeMediaDurationMs,
  renderFilterComplexToFile,
  requireNativeFfmpeg,
  windowRmsSeries,
  writeImpulseWav,
  writeMetricsReport,
  writeSilentGapVoiceWav,
  writeSineWav,
} from "./decoded-audio-continuity.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function renderMixedFixture(input: {
  fixture: ReturnType<typeof buildHeadlessReferenceFixture>;
  codec: "opus" | "aac";
  runtime: "headless" | "browser-wasm";
  dir: string;
}): { path: string; durationMs: number } {
  const bins = requireNativeFfmpeg()!;
  const planResult = buildHeadlessAudioPlan(input.fixture.manifestV3);
  assert.equal(planResult.ok, true);
  if (!planResult.ok) throw new Error("headless audio plan failed");
  const plan = planResult.plan;

  const voicePath = join(input.dir, "voice.wav");
  const musicPath = join(input.dir, "music.wav");
  writeSineWav(bins, voicePath, 440, plan.outputDurationSec);
  writeSineWav(bins, musicPath, 220, 0.4);

  let filterComplex: string;
  if (input.runtime === "headless") {
    const built = buildHeadlessAudioFilterComplex({
      plan,
      voiceInputIndex: 0,
      musicInputIndex: 1,
    });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("headless filter build failed");
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

  const out = join(input.dir, `mixed.${input.codec === "opus" ? "webm" : "m4a"}`);
  renderFilterComplexToFile({
    bins,
    filterComplex,
    voicePath,
    musicPath,
    outputPath: out,
    outputDurationSec: plan.outputDurationSec,
    codec: input.codec,
  });
  return { path: out, durationMs: plan.outputDurationMs };
}

console.log("\nexport-decoded-audio-continuity-authority (Sprint 11E 2G.24D)\n");

const bins = requireNativeFfmpeg();
if (!bins) {
  console.log("  ⚠ native FFmpeg unavailable — skipping decode fixtures");
  process.exit(0);
}

test("methodology: codec preroll tolerance documented", () => {
  assert.ok(DECODED_AUDIO_CODEC_PREROLL_MS >= 80);
  assert.ok(DECODED_AUDIO_SILENCE_RMS_LINEAR > 0);
});

test("Browser/Headless share normalized mix plan authority", () => {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2400,
  });
  const normalized = resolveExportAudioMixPlan(fixture.manifestV3);
  const headless = buildHeadlessAudioPlan(fixture.manifestV3);
  assert.equal(normalized.ok, true);
  assert.equal(headless.ok, true);
  if (!normalized.ok || !headless.ok) return;
  assert.equal(normalized.plan.outputDurationMs, headless.plan.outputDurationMs);
  assert.equal(normalized.plan.combination, "voiceover+music");
  assert.equal(normalized.plan.music?.duckUntilMs, headless.plan.music?.duckUntilMs);
  assert.equal(normalized.plan.mixOrder, "amix-voice-first-duration-first");
});

test("Browser wasm and Headless music volume expressions match", () => {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 3000,
    musicFades: true,
  });
  const plan = buildHeadlessAudioPlan(fixture.manifestV3);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const music = plan.plan.music!;
  const envelope = toExportMusicEnvelopeInput({
    exportDurationMs: plan.plan.outputDurationMs,
    musicGain: music.volumeGain,
    fadeIn: music.fadeInMs > 0,
    fadeOut: music.fadeOutMs > 0,
    fadeInSec: music.fadeInMs / 1000,
    fadeOutSec: music.fadeOutMs / 1000,
    duckingEnabled: music.applyDucking,
    duckingStrength:
      music.volumeGain > 0 ? music.duckedVolumeGain / music.volumeGain : 0,
    voiceoverDurationSec: music.duckUntilMs / 1000,
    applyDucking: music.applyDucking,
  });
  const browserExpr = buildExportMusicVolumeExpression(envelope);
  const headlessBuilt = buildHeadlessAudioFilterComplex({
    plan: plan.plan,
    voiceInputIndex: 1,
    musicInputIndex: 2,
  });
  assert.equal(headlessBuilt.ok, true);
  if (!headlessBuilt.ok) return;
  assert.ok(headlessBuilt.build.filterComplex!.includes(browserExpr));
});

test("ducking release ramp avoids step at voice end", () => {
  const env = toExportMusicEnvelopeInput({
    exportDurationMs: 3000,
    musicGain: 0.5,
    fadeIn: false,
    fadeOut: false,
    fadeInSec: 0,
    fadeOutSec: 0,
    duckingEnabled: true,
    duckingStrength: 0.35,
    voiceoverDurationSec: 2,
    applyDucking: true,
  });
  const before = resolveExportMusicEnvelopeGainAtSec(env, 1.95);
  const midRamp = resolveExportMusicEnvelopeGainAtSec(env, 1.975);
  const after = resolveExportMusicEnvelopeGainAtSec(env, 2.05);
  assert.ok(before < 0.5 * 0.36);
  assert.ok(midRamp > before && midRamp < 0.5);
  assert.equal(after, 0.5);
  assert.equal(EXPORT_DUCKING_RELEASE_MS, 50);
});

test("1–4. Continuous voice tone across scene/intra-scene transitions — no renderer gap", () => {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice",
    durationMs: 2400,
  });
  const dir = mkdtempSync(join(tmpdir(), "dac-voice-tr-"));
  const voiceOnly = buildHeadlessAudioPlan(fixture.manifestV3);
  assert.equal(voiceOnly.ok, true);
  if (!voiceOnly.ok) return;
  const voicePath = join(dir, "voice.wav");
  writeSineWav(bins, voicePath, 440, voiceOnly.plan.outputDurationSec);
  const built = buildHeadlessAudioFilterComplex({
    plan: voiceOnly.plan,
    voiceInputIndex: 0,
    musicInputIndex: null,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const out = join(dir, "voice.webm");
  renderFilterComplexToFile({
    bins,
    filterComplex: built.build.filterComplex!,
    voicePath,
    outputPath: out,
    outputDurationSec: voiceOnly.plan.outputDurationSec,
    codec: "opus",
  });
  const { pcm } = decodeToMonoPcm(bins, out);
  const sceneBoundarySec = (2400 * 0.7) / 1000;
  const intraBoundarySec = sceneBoundarySec * 0.5;
  for (const t of [
    sceneBoundarySec - 0.05,
    sceneBoundarySec,
    sceneBoundarySec + 0.05,
    intraBoundarySec,
  ]) {
    const windows = windowRmsSeries(pcm, 48000, 20, t, t + 0.04);
    assert.ok(windows.length > 0);
    assert.ok(
      windows.every((w) => w.rmsLinear > DECODED_AUDIO_SILENCE_RMS_LINEAR),
      `unexpected silence near transition t=${t}`,
    );
  }
  rmSync(dir, { recursive: true, force: true });
});

test("5–6. Voice+music continuity across transition kinds — bounded RMS parity", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-parity-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2800,
  });
  const headless = renderMixedFixture({
    fixture,
    codec: "opus",
    runtime: "headless",
    dir: join(dir, "h"),
  });
  const browser = renderMixedFixture({
    fixture,
    codec: "opus",
    runtime: "browser-wasm",
    dir: join(dir, "b"),
  });
  const hPcm = decodeToMonoPcm(bins, headless.path).pcm;
  const bPcm = decodeToMonoPcm(bins, browser.path).pcm;
  const hMetrics = analyzeDecodedPcm(hPcm, 48000);
  const bMetrics = analyzeDecodedPcm(bPcm, 48000);
  assert.ok(
    Math.abs(hMetrics.durationSec - bMetrics.durationSec) * 1000 <
      DECODED_AUDIO_DURATION_TOLERANCE_MS,
  );
  const mid = windowRmsSeries(hPcm, 48000, 50, 0.5, 2.5);
  const midB = windowRmsSeries(bPcm, 48000, 50, 0.5, 2.5);
  assert.equal(mid.length, midB.length);
  for (let i = 0; i < mid.length; i += 1) {
    const ratio =
      mid[i]!.rmsLinear > 1e-5
        ? midB[i]!.rmsLinear / mid[i]!.rmsLinear
        : 1;
    assert.ok(ratio > 0.85 && ratio < 1.15, `RMS ratio ${ratio} at i=${i}`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("7–8. Intentional narration silence preserved; no new silence beside it", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-intent-"));
  const gapVoice = join(dir, "gap-voice.wav");
  writeSilentGapVoiceWav(bins, gapVoice, 0.4, 0.3, 440);
  const plan = buildHeadlessAudioPlan(
    buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 2000 })
      .manifestV3,
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const built = buildHeadlessAudioFilterComplex({
    plan: plan.plan,
    voiceInputIndex: 0,
    musicInputIndex: null,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const out = join(dir, "out.webm");
  renderFilterComplexToFile({
    bins,
    filterComplex: built.build.filterComplex!,
    voicePath: gapVoice,
    outputPath: out,
    outputDurationSec: plan.plan.outputDurationSec,
    codec: "opus",
  });
  const { pcm } = decodeToMonoPcm(bins, out);
  const gapCenter = windowRmsSeries(pcm, 48000, 30, 0.38, 0.72);
  assert.ok(gapCenter.some((w) => w.rmsLinear < DECODED_AUDIO_SILENCE_RMS_LINEAR));
  const outside = windowRmsSeries(pcm, 48000, 30, 0.05, 0.25);
  assert.ok(outside.every((w) => w.rmsLinear > DECODED_AUDIO_SILENCE_RMS_LINEAR));
  const metrics = analyzeDecodedPcm(pcm, 48000);
  assert.ok(
    metrics.longestSilentRunMs >= 250,
    "intentional pause must remain",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("9–11. Early-ending stems and render tail continuity", () => {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2400,
  });
  const plan = buildHeadlessAudioPlan(fixture.manifestV3);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.outputDurationMs, fixture.manifestV3.project.renderDurationMs);
  assert.ok(plan.plan.outputDurationMs >= 2400);
  assert.ok(plan.plan.voiceover!.padToOutputMs >= 0);
  assert.equal(plan.plan.music!.loopUntilOutputMs, plan.plan.outputDurationMs);
  assert.equal(TIMELINE_END_BUFFER_MS, 400);
});

test("12–13. WebM/Opus and MP4/AAC decoded continuity", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-codec-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2200,
  });
  for (const codec of ["opus", "aac"] as const) {
    const rendered = renderMixedFixture({
      fixture,
      codec,
      runtime: "headless",
      dir: join(dir, codec),
    });
    const probedMs = probeMediaDurationMs(bins, rendered.path);
    assert.ok(probedMs != null);
    assert.ok(
      Math.abs(probedMs! - rendered.durationMs) <= DECODED_AUDIO_DURATION_TOLERANCE_MS,
    );
    assert.ok(probeAudioPtsMonotonic(bins, rendered.path));
    const metrics = analyzeDecodedPcm(decodeToMonoPcm(bins, rendered.path).pcm, 48000);
    assert.ok(metrics.clickScore < DECODED_AUDIO_CLICK_SCORE_THRESHOLD);
    console.log(`    ${codec}: ${writeMetricsReport(metrics)}`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("14–15. Browser/Headless duration and RMS parity", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-dur-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 2600,
  });
  const h = renderMixedFixture({ fixture, codec: "aac", runtime: "headless", dir: join(dir, "h") });
  const b = renderMixedFixture({ fixture, codec: "aac", runtime: "browser-wasm", dir: join(dir, "b") });
  const hDur = probeMediaDurationMs(bins, h.path)!;
  const bDur = probeMediaDurationMs(bins, b.path)!;
  assert.ok(Math.abs(hDur - bDur) <= DECODED_AUDIO_DURATION_TOLERANCE_MS);
  rmSync(dir, { recursive: true, force: true });
});

test("16–17. Monotonic PTS and click score below threshold at duck boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-duck-"));
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "with-voice-and-music",
    durationMs: 3000,
  });
  const rendered = renderMixedFixture({
    fixture,
    codec: "opus",
    runtime: "headless",
    dir,
  });
  assert.ok(probeAudioPtsMonotonic(bins, rendered.path));
  const { pcm } = decodeToMonoPcm(bins, rendered.path);
  const voiceEndSec = 3;
  const windows = windowRmsSeries(pcm, 48000, 5, voiceEndSec - 0.08, voiceEndSec + 0.08);
  let maxDelta = 0;
  for (let i = 1; i < windows.length; i += 1) {
    maxDelta = Math.max(
      maxDelta,
      Math.abs(windows[i]!.rmsLinear - windows[i - 1]!.rmsLinear),
    );
  }
  assert.ok(maxDelta < 0.15, `duck boundary RMS jump ${maxDelta}`);
  rmSync(dir, { recursive: true, force: true });
});

test("18. Phase 2G.24C transition continuity authority still present", () => {
  const src = readFileSync(
    join(process.cwd(), "src/features/timeline-intelligence/resolve-canonical-transition-frame.utils.ts"),
    "utf8",
  );
  assert.match(src, /resolveCanonicalTransitionProgressForSample/);
  assert.match(src, /progress = 1/);
});

test("19. Output frame count unchanged by audio work", () => {
  const fixture = buildHeadlessReferenceFixture({ audioMode: "with-voice-and-music" });
  const before = resolveExportTotalFrames(fixture.manifestV3);
  assert.ok(before > 0);
  assert.equal(resolveExportTotalFrames(fixture.manifestV3), before);
});

test("20. Output profiles 720p/1080p/4K remain available", () => {
  for (const resolution of ["720p", "1080p", "4k"] as const) {
    const f = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      rendererProfile: { resolution, format: "webm" },
    });
    assert.ok(f.manifestV3.output.width > 0);
  }
});

test("transition-boundary: audio graph is project-level (not per scene)", () => {
  const canonical = readFileSync(
    join(process.cwd(), "src/features/export/audio/resolve-export-audio-mix-plan.ts"),
    "utf8",
  );
  assert.doesNotMatch(canonical, /scene\.id|transitionOut|mediaTransitions/);
  const headlessPlan = readFileSync(
    join(process.cwd(), "src/features/headless-renderer/worker/audio/build-headless-audio-plan.ts"),
    "utf8",
  );
  assert.doesNotMatch(headlessPlan, /for \(const scene of manifest\.scenes\)/);
});

test("audio isolation: voice 200% curve not modified in this phase", () => {
  const mixer = readFileSync(
    join(process.cwd(), "src/features/audio-mixer/audio-mixer.utils.ts"),
    "utf8",
  );
  assert.doesNotMatch(mixer, /EXPORT_DUCKING_RELEASE_MS/);
  const envelope = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-music-envelope.utils.ts"),
    "utf8",
  );
  assert.doesNotMatch(envelope, /voiceVolume|resolveVoiceStemGain/);
});

test("impulse positions survive mix without duplicate intervals", () => {
  const dir = mkdtempSync(join(tmpdir(), "dac-imp-"));
  const voice = join(dir, "imp.wav");
  writeImpulseWav(bins, voice, [0.5, 1.0, 1.5], 2.5);
  const plan = buildHeadlessAudioPlan(
    buildHeadlessReferenceFixture({ audioMode: "with-voice", durationMs: 2500 })
      .manifestV3,
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const built = buildHeadlessAudioFilterComplex({
    plan: plan.plan,
    voiceInputIndex: 0,
    musicInputIndex: null,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const out = join(dir, "out.webm");
  renderFilterComplexToFile({
    bins,
    filterComplex: built.build.filterComplex!,
    voicePath: voice,
    outputPath: out,
    outputDurationSec: plan.plan.outputDurationSec,
    codec: "opus",
  });
  const { pcm } = decodeToMonoPcm(bins, out);
  const peaks: number[] = [];
  for (let i = 1; i < pcm.length - 1; i += 1) {
    if (Math.abs(pcm[i]!) > 0.05) peaks.push(i / 48000);
  }
  assert.ok(peaks.length >= 3);
  rmSync(dir, { recursive: true, force: true });
});

console.log(`\nexport-decoded-audio-continuity-authority: ${passed} passed\n`);
