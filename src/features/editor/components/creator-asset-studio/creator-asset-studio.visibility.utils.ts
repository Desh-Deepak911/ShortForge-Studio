import type { StoryCreationBrief } from "@/features/drafts/types";
import type { FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";

/**
 * Creator Asset Studio is visible when Asset Intelligence is enabled
 * or outside production builds.
 */
export function isCreatorAssetStudioVisible(): boolean {
  return (
    process.env.ASSET_INTELLIGENCE_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_ASSET_INTELLIGENCE_ENABLED === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export interface CreatorAssetStudioScriptContext {
  topic?: string;
  scriptMode?: ScriptMode;
  entities?: string[];
}

/** Resolves planning context from a draft brief and script. */
export function resolveCreatorAssetStudioScriptContext(
  script: FootieScript,
  creationBrief?: StoryCreationBrief | null,
): CreatorAssetStudioScriptContext {
  return {
    topic: creationBrief?.topic?.trim() || script.title.trim(),
    scriptMode: creationBrief?.scriptMode,
    entities: creationBrief?.topic ? [creationBrief.topic] : undefined,
  };
}
