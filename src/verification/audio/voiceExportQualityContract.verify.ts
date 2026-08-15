import assert from "node:assert/strict";

import {
  assessVoiceExportQuality,
  VOICE_EXPORT_TARGET_LUFS,
  VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP,
} from "@/features/voice-quality";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nvoice-export-quality-contract\n");

test("measured ShortForge regression separates quiet output from transport integrity", () => {
  const result = assessVoiceExportQuality({
    integratedLufs: -26.5,
    truePeakDbtp: -7.7,
    durationSec: 24.456,
    maximumPacketGapMs: 1,
    detectedSilenceCount: 18,
    detectedSilenceDurationSec: 5.301,
    longestDetectedSilenceMs: 786,
    sourceVoiceSpeed: 1.25,
  });

  assert.equal(result.loudnessClass, "too_quiet");
  assert.equal(result.transportClass, "continuous");
  assert.equal(result.cadenceClass, "pause_heavy");
  assert.ok(result.reasons.includes("fast_speed_with_pause_heavy_cadence"));
  assert.equal(result.blocksExport, false);
});

test("measured creator reference is loudness-ready but exposes unsafe peak", () => {
  const result = assessVoiceExportQuality({
    integratedLufs: -15.1,
    truePeakDbtp: 0.4,
    durationSec: 30.9,
    maximumPacketGapMs: 0,
    detectedSilenceCount: 0,
    detectedSilenceDurationSec: 0,
    longestDetectedSilenceMs: 0,
    sourceVoiceSpeed: 1,
  });

  assert.equal(result.loudnessClass, "creator_ready");
  assert.equal(result.transportClass, "continuous");
  assert.equal(result.cadenceClass, "continuous");
  assert.ok(result.reasons.includes("true_peak_above_safe_ceiling"));
  assert.equal(result.blocksExport, false);
});

test("real packet discontinuity is not mislabeled as a cadence pause", () => {
  const result = assessVoiceExportQuality({
    integratedLufs: -16,
    truePeakDbtp: -1.5,
    durationSec: 20,
    maximumPacketGapMs: 80,
    detectedSilenceCount: 1,
    detectedSilenceDurationSec: 0.3,
    longestDetectedSilenceMs: 300,
  });

  assert.equal(result.transportClass, "packet_gap");
  assert.equal(result.cadenceClass, "continuous");
  assert.deepEqual(result.reasons, ["transport_packet_gap"]);
});

test("natural pauses remain accepted and never block export", () => {
  const result = assessVoiceExportQuality({
    integratedLufs: -17,
    truePeakDbtp: -2,
    durationSec: 30,
    maximumPacketGapMs: 0,
    detectedSilenceCount: 8,
    detectedSilenceDurationSec: 3,
    longestDetectedSilenceMs: 520,
    sourceVoiceSpeed: 1.15,
  });

  assert.equal(result.cadenceClass, "continuous");
  assert.equal(result.reasons.length, 0);
  assert.equal(result.blocksExport, false);
});

test("missing measurements remain unknown instead of failing", () => {
  const result = assessVoiceExportQuality({});
  assert.equal(result.loudnessClass, "unknown");
  assert.equal(result.transportClass, "unknown");
  assert.equal(result.cadenceClass, "unknown");
  assert.equal(result.blocksExport, false);
});

test("targets preserve safe headroom rather than copying clipped reference peaks", () => {
  assert.equal(VOICE_EXPORT_TARGET_LUFS, -16);
  assert.equal(VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP, -1);
});

console.log(`\nvoice-export-quality-contract: ${passed} passed\n`);
