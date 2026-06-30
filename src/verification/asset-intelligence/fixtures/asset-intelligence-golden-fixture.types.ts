import type { AssetEntitySummaryInput, AssetEntityType } from "@/features/asset-intelligence";
import type { ScriptMode } from "@/types/footiebitz";

/** Golden fixture contract for Asset Intelligence verification. */
export interface AssetIntelligenceGoldenFixture {
  name: string;
  topic: string;
  mode: ScriptMode;
  narration: string;
  entities?: string[];
  entitySummaries?: AssetEntitySummaryInput[];
  expectedEntityTypes: AssetEntityType[];
  /** Partial name matches — at least one entity per entry must be detected. */
  expectedPrimaryEntities: string[];
  /** Visual/theme terms expected across query candidates for the fixture. */
  expectedAssetThemes: string[];
  minimumQueryCandidatesPerScene: number;
  /** Maximum allowed share for the most repeated primary entity. */
  maxRepeatedPrimaryEntityRatio: number;
  /** When true, diversity warnings should be present. */
  expectedDiversityWarnings?: boolean;
  /** Minimum acceptable candidate quality score in `[0, 1]`. */
  minimumCandidateQualityScore?: number;
}
