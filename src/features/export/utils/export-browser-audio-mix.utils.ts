import {
  normalizeExportAudioInput,
  type ExportAudioInput,
} from "./export-audio-input.utils";
import type { ExportBackgroundMusicMixSettings } from "./export-background-music.utils";

export const EXPORT_BROWSER_MIX_SAMPLE_RATE = 48000;
export const EXPORT_BROWSER_MIX_CHANNELS = 2;
export const EXPORT_BROWSER_MIXED_AUDIO_FILENAME = "mixed-audio.webm";

export interface ExportBrowserAudioMixOptions {
  voiceoverInput: ExportAudioInput;
  backgroundMusicInput: ExportAudioInput;
  durationSec: number;
  mixSettings: ExportBackgroundMusicMixSettings;
}

export interface ExportBrowserAudioMixResult {
  blob: Blob;
  mimeType: "audio/webm";
  fileName: typeof EXPORT_BROWSER_MIXED_AUDIO_FILENAME;
}

/** Preferred MediaRecorder MIME for export mixed audio (Opus in WebM). */
export function resolveExportBrowserMixRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function isBrowserExportAudioMixSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof OfflineAudioContext !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    resolveExportBrowserMixRecorderMimeType() !== null
  );
}

async function decodeExportAudioInput(
  input: ExportAudioInput,
  decodeContext: AudioContext,
): Promise<AudioBuffer> {
  const normalized = await normalizeExportAudioInput(input);
  const arrayBuffer = await normalized.blob.arrayBuffer();

  if (arrayBuffer.byteLength === 0) {
    throw new Error("Audio input is empty");
  }

  return decodeContext.decodeAudioData(arrayBuffer.slice(0));
}

function applyMusicFadeEnvelope(
  gain: GainNode,
  durationSec: number,
  settings: ExportBackgroundMusicMixSettings,
): void {
  const volume = Math.min(1, Math.max(0, settings.volume));

  if (settings.fadeIn && settings.fadeInSec > 0) {
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(volume, settings.fadeInSec);
  } else {
    gain.gain.setValueAtTime(volume, 0);
  }

  if (settings.fadeOut && settings.fadeOutSec > 0 && durationSec > settings.fadeOutSec) {
    const fadeOutStart = durationSec - settings.fadeOutSec;
    gain.gain.setValueAtTime(volume, fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, durationSec);
  }
}

function scheduleLoopedBuffer(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
  durationSec: number,
): void {
  let offsetSec = 0;

  while (offsetSec < durationSec) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(offsetSec);
    offsetSec += buffer.duration;
  }
}

/** Encodes a rendered AudioBuffer as 16-bit PCM WAV (test helper). */
export function encodeAudioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const sampleCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = sampleCount * blockAlign;
  const headerSize = 44;
  const output = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(output);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  let writeOffset = headerSize;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex]![sampleIndex] ?? 0));
      view.setInt16(writeOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      writeOffset += bytesPerSample;
    }
  }

  return new Blob([output], { type: "audio/wav" });
}

/**
 * Records a mixed AudioBuffer to compressed Opus/WebM via MediaRecorder.
 * Playback runs in real time while the stream is captured.
 */
export async function encodeAudioBufferToWebmOpusBlob(buffer: AudioBuffer): Promise<Blob> {
  const mimeType = resolveExportBrowserMixRecorderMimeType();
  if (!mimeType) {
    throw new Error("Browser Opus WebM encoding is not supported");
  }

  const context = new AudioContext({ sampleRate: buffer.sampleRate });

  try {
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    const recorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: 96_000,
    });

    const chunks: BlobPart[] = [];
    const recordingFinished = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        reject(new Error("MediaRecorder failed to encode mixed audio"));
      };
      recorder.onstop = () => {
        const outputType = mimeType.split(";")[0] ?? "audio/webm";
        resolve(new Blob(chunks, { type: outputType }));
      };
    });

    const playbackFinished = new Promise<void>((resolve, reject) => {
      source.onended = () => resolve();
      source.addEventListener(
        "error",
        () => reject(new Error("Audio playback failed during encoding")),
        { once: true },
      );
    });

    recorder.start(250);
    source.start(0);
    await playbackFinished;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    const blob = await recordingFinished;
    if (blob.size === 0) {
      throw new Error("Mixed Opus WebM encoding produced empty output");
    }

    return blob;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Mixes voiceover and background music in the browser, then encodes Opus/WebM
 * for FFmpeg stream-copy muxing (avoids large PCM WAV + libopus re-encode).
 */
export async function mixExportVoiceoverAndBackgroundMusic(
  options: ExportBrowserAudioMixOptions,
): Promise<ExportBrowserAudioMixResult> {
  if (!isBrowserExportAudioMixSupported()) {
    throw new Error("Browser audio mixing is not supported");
  }

  const durationSec = Math.max(0.001, options.durationSec);
  const frameCount = Math.ceil(durationSec * EXPORT_BROWSER_MIX_SAMPLE_RATE);
  const decodeContext = new AudioContext({ sampleRate: EXPORT_BROWSER_MIX_SAMPLE_RATE });

  try {
    const [voiceBuffer, musicBuffer] = await Promise.all([
      decodeExportAudioInput(options.voiceoverInput, decodeContext),
      decodeExportAudioInput(options.backgroundMusicInput, decodeContext),
    ]);

    const offlineContext = new OfflineAudioContext(
      EXPORT_BROWSER_MIX_CHANNELS,
      frameCount,
      EXPORT_BROWSER_MIX_SAMPLE_RATE,
    );

    const voiceSource = offlineContext.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    const voiceGain = offlineContext.createGain();
    voiceGain.gain.value = 1;
    voiceSource.connect(voiceGain);
    voiceGain.connect(offlineContext.destination);
    voiceSource.start(0);

    const musicGain = offlineContext.createGain();
    applyMusicFadeEnvelope(musicGain, durationSec, options.mixSettings);
    musicGain.connect(offlineContext.destination);
    scheduleLoopedBuffer(offlineContext, musicBuffer, musicGain, durationSec);

    const renderedBuffer = await offlineContext.startRendering();
    const blob = await encodeAudioBufferToWebmOpusBlob(renderedBuffer);

    return {
      blob,
      mimeType: "audio/webm",
      fileName: EXPORT_BROWSER_MIXED_AUDIO_FILENAME,
    };
  } finally {
    await decodeContext.close().catch(() => undefined);
  }
}
