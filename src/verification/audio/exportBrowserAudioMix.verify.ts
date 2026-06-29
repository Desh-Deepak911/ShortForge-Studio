/**
 * Browser export audio mix verification (run: npm run test:export-browser-audio-mix).
 */
import assert from "node:assert/strict";

import {
  encodeAudioBufferToWavBlob,
  EXPORT_BROWSER_MIX_CHANNELS,
  EXPORT_BROWSER_MIX_SAMPLE_RATE,
  isBrowserExportAudioMixSupported,
  resolveExportBrowserMixRecorderMimeType,
} from "@/features/export/utils/export-browser-audio-mix.utils";

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("exportBrowserAudioMix");

  await test("isBrowserExportAudioMixSupported is false in Node", () => {
    assert.equal(isBrowserExportAudioMixSupported(), false);
  });

  await test("resolveExportBrowserMixRecorderMimeType is null in Node", () => {
    assert.equal(resolveExportBrowserMixRecorderMimeType(), null);
  });

  await test("encodeAudioBufferToWavBlob writes a stereo 48kHz WAV header", async () => {
    const sampleCount = 4;
    const buffer = {
      numberOfChannels: EXPORT_BROWSER_MIX_CHANNELS,
      length: sampleCount,
      sampleRate: EXPORT_BROWSER_MIX_SAMPLE_RATE,
      getChannelData: (channelIndex: number) => {
        const channel = new Float32Array(sampleCount);
        for (let index = 0; index < sampleCount; index += 1) {
          channel[index] = channelIndex === 0 ? 0.25 : -0.25;
        }
        return channel;
      },
    } as AudioBuffer;

    const blob = encodeAudioBufferToWavBlob(buffer);
    assert.equal(blob.type, "audio/wav");
    assert.equal(blob.size, 44 + sampleCount * EXPORT_BROWSER_MIX_CHANNELS * 2);

    const view = new DataView(await blob.arrayBuffer());
    assert.equal(
      String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)),
      "RIFF",
    );
    assert.equal(view.getUint16(22, true), EXPORT_BROWSER_MIX_CHANNELS);
    assert.equal(view.getUint32(24, true), EXPORT_BROWSER_MIX_SAMPLE_RATE);
  });

  console.log("All export browser audio mix checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
