import type { QualityMode } from "@/types/footiebitz";

export const DEFAULT_QUALITY_MODE: QualityMode = "cheap";

const VALID_QUALITY_MODES: QualityMode[] = ["cheap", "balanced", "best"];

export const QUALITY_MODELS: Record<QualityMode, string> = {
  cheap: "gpt-4.1-mini",
  balanced: "gpt-4.1",
  best: "gpt-4.1",
};

export function resolveQualityMode(qualityMode: unknown): QualityMode {
  if (
    typeof qualityMode === "string" &&
    VALID_QUALITY_MODES.includes(qualityMode as QualityMode)
  ) {
    return qualityMode as QualityMode;
  }
  return DEFAULT_QUALITY_MODE;
}

export function resolveScriptModel(qualityMode: QualityMode): string {
  return process.env.OPENAI_SCRIPT_MODEL || QUALITY_MODELS[qualityMode];
}
