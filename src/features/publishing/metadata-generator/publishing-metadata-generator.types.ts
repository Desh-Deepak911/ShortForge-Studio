import type { CreatorTemplateId, CreatorTemplatePromptHints } from "@/features/creator-templates/creator-template.types";
import type { PlatformExportPresetId } from "@/features/export-profiles/export-profile.types";
import type { ScriptMode } from "@/types/footiebitz";

import type { PublishingMetadata, PublishingPlatform } from "../publishing.types";

export interface PublishingMetadataGeneratorInput {
  title: string;
  topic?: string;
  narration?: string;
  scriptMode?: ScriptMode;
  templateId?: CreatorTemplateId;
  templatePromptHints?: CreatorTemplatePromptHints;
  platforms: PublishingPlatform[];
  exportProfileId?: PlatformExportPresetId;
  durationSec?: number;
  keywords?: string[];
}

export interface PublishingMetadataGenerationDiagnostics {
  usedTemplateId?: CreatorTemplateId;
  usedScriptMode?: ScriptMode;
  usedTemplatePromptHints: boolean;
  narrationAvailable: boolean;
  warnings: string[];
  notes: string[];
}

export interface PublishingMetadataGeneratorResult {
  metadata: PublishingMetadata;
  diagnostics: PublishingMetadataGenerationDiagnostics;
}

export type PublishingMetadataStyleKind =
  | "educational"
  | "countdown"
  | "news"
  | "analysis"
  | "preview"
  | "history"
  | "tactical"
  | "story";

export interface ResolvedPublishingMetadataStyle {
  kind: PublishingMetadataStyleKind;
  hints: CreatorTemplatePromptHints | null;
  templateId?: CreatorTemplateId;
  scriptMode?: ScriptMode;
}
