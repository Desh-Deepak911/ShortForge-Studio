import type {
  GenerateScriptResponse,
  GenerateScriptStreamEvent,
  GenerationLoadingStep,
} from "@/types/footiebitz";

export async function consumeGenerateScriptStream(
  response: Response,
  onProgress: (step: GenerationLoadingStep, label: string) => void,
): Promise<GenerateScriptResponse & { usedFallback?: boolean }> {
  if (!response.body) {
    throw new Error("Empty response from server");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(line) as GenerateScriptStreamEvent;

      if (event.type === "progress") {
        onProgress(event.step, event.label);
        continue;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }

      if (event.type === "complete") {
        return {
          success: event.success,
          data: event.data,
          audioFirst: event.audioFirst,
          voiceoverAudioBase64: event.voiceoverAudioBase64,
          audioFirstApplied: event.audioFirstApplied,
          generationContext: event.generationContext,
          researchApplied: event.researchApplied,
          researchWarning: event.researchWarning,
          scriptLengthWarning: event.scriptLengthWarning,
          error: event.error,
          usedFallback: event.usedFallback,
        };
      }
    }
  }

  throw new Error("Generation stream ended unexpectedly");
}
