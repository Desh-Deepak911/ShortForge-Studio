import type { EntityConfidence } from "@/features/intelligence/entities/entity-types";

export type EntityPreviewStatus = "idle" | "loading" | "ready" | "partial";

export interface EntityPreviewField {
  value: string;
  confidence: EntityConfidence;
  source: "inferred" | "api-football" | "manual";
  externalId?: number;
  ambiguous?: boolean;
  usedForResearch?: boolean;
  reasoning?: string;
}

/** Detected entities shown in Create → Research Preview. */
export interface EntityPreviewDisplay {
  status: EntityPreviewStatus;
  player?: EntityPreviewField;
  competition?: EntityPreviewField;
  teams: EntityPreviewField[];
  season?: EntityPreviewField;
  overallConfidence: EntityConfidence;
  ambiguities: string[];
  warnings?: string[];
}

export const EMPTY_ENTITY_PREVIEW: EntityPreviewDisplay = {
  status: "idle",
  teams: [],
  overallConfidence: { tier: "low", percent: 0 },
  ambiguities: [],
};
