import assert from "node:assert/strict";

import {
  buildPitchPreservedVoiceSpeedFfmpegArgs,
  renderPitchPreservedVoiceSpeed,
  shouldRenderPitchPreservedVoiceSpeed,
} from "@/features/voice-quality/server/render-pitch-preserved-voice-speed";
import { resolveVoiceoverDurationMs } from "@/features/story/utils/audio-first.utils";

function buildToneWav(durationSec: number): ArrayBuffer {
  const sampleRate = 24_000;
  const sampleCount = Math.round(sampleRate * durationSec);
  const dataLength = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return buffer;
}

async function main(): Promise<void> {
  console.log("voice-speed-clarity");

  assert.equal(shouldRenderPitchPreservedVoiceSpeed(1), false);
  for (const speed of [0.75, 0.9, 1.1, 1.25, 1.4]) {
    assert.equal(shouldRenderPitchPreservedVoiceSpeed(speed), true);
    const args = buildPitchPreservedVoiceSpeedFfmpegArgs(speed);
    assert.ok(args.includes(`atempo=${speed}`));
    assert.equal(args.some((arg) => /asetrate|rubberband/i.test(arg)), false);
  }
  console.log("  ✓ every non-1 preset selects pitch-preserving tempo");

  const sourceDurationMs = 2400;
  const source = buildToneWav(sourceDurationMs / 1000);
  for (const speed of [0.75, 0.9, 1.1, 1.25, 1.4]) {
    const rendered = await renderPitchPreservedVoiceSpeed({
      losslessAudio: source,
      speed,
    });
    assert.ok(rendered.byteLength > 1000);
    const measured = resolveVoiceoverDurationMs(rendered, "");
    const expected = sourceDurationMs / speed;
    assert.ok(
      Math.abs(measured.durationMs - expected) < 180,
      `${speed}x duration ${measured.durationMs}ms not near ${expected}ms`,
    );
  }
  console.log("  ✓ decoded duration tracks all slow and fast presets");

  console.log("voice-speed-clarity: pass");
}

void main();
