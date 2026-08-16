import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";

import { generateVoiceover } from "@/features/story/services/voiceover.service";

loadEnvFile(path.join(process.cwd(), ".env.local"));

const narration =
  "Ferran Torres arrives at PSG after two difficult seasons in Barcelona. But this is still the player who scored Spain's winning goal on the biggest stage. Now the question is whether that decisive edge can make PSG even more dangerous.";
const outputDir = path.join(process.cwd(), ".tmp", "voice-speed-production-cert");
const speeds = [0.75, 0.9, 1, 1.1, 1.25, 1.4] as const;

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const report: Array<Record<string, unknown>> = [];

  for (const speed of speeds) {
    const result = await generateVoiceover({
      narration,
      voice: "alloy",
      speed,
      stylePreset: "neutral",
      expressiveDelivery: false,
    });
    const filename = `production-${String(speed).replace(".", "_")}x.mp3`;
    await writeFile(path.join(outputDir, filename), Buffer.from(result.audioBuffer));
    report.push({
      speed,
      filename,
      durationMs: result.durationMs,
      bytes: result.audioBuffer.byteLength,
      speedRendering: result.metadata?.speedRendering,
    });
  }

  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify({ narration, voice: "alloy", model: "tts-1-hd", results: report }, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

void main();
