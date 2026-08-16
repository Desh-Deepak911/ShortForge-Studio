import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import nextEnv from "@next/env";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);
const projectDir = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(projectDir);

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required for the live voice-speed audit.");
}

const outputDir = path.join(projectDir, ".tmp", "voice-speed-clarity-audit");
const speeds = [1, 1.1, 1.25, 1.4];
const narration =
  "Ferran Torres arrives at PSG after two difficult seasons in Barcelona. But this is still the player who scored Spain's winning goal on the biggest stage. Now the question is whether that decisive edge can make PSG even more dangerous.";

await mkdir(outputDir, { recursive: true });
const openai = new OpenAI({ apiKey });

async function synthesize(speed) {
  const response = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "alloy",
    input: narration,
    response_format: "mp3",
    speed,
  });
  const filename = path.join(outputDir, `provider-${String(speed).replace(".", "_")}x.mp3`);
  await writeFile(filename, Buffer.from(await response.arrayBuffer()));
  return filename;
}

async function transform(input, speed, method) {
  const suffix = String(speed).replace(".", "_");
  const output = path.join(outputDir, `${method}-${suffix}x.mp3`);
  const filter =
    method === "rubberband"
      ? `rubberband=tempo=${speed}:pitch=1:transients=crisp:detector=compound:phase=laminar:window=long:smoothing=on:formant=preserved:pitchq=quality`
      : `atempo=${speed}`;
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-af",
    `${filter},aresample=48000`,
    "-ar",
    "48000",
    "-ac",
    "2",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    output,
  ]);
  return output;
}

const providerFiles = new Map();
for (const speed of speeds) {
  providerFiles.set(speed, await synthesize(speed));
}

const cleanMaster = providerFiles.get(1);
for (const speed of speeds.slice(1)) {
  await transform(cleanMaster, speed, "atempo");
  await transform(cleanMaster, speed, "rubberband");
}

await writeFile(
  path.join(outputDir, "README.txt"),
  [
    "Voice-speed clarity audit",
    "",
    `Narration: ${narration}`,
    "Voice/model: alloy / tts-1-hd",
    "provider-*: speed baked by the TTS provider",
    "atempo-*: clean 1.0x master with FFmpeg pitch-preserving tempo",
    "rubberband-*: clean 1.0x master with high-quality Rubber Band tempo",
    "",
  ].join("\n"),
);

console.log(outputDir);
