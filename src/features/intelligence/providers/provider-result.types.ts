import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";

import type { ConfidenceScore } from "../shared/confidence.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { FactProvenance, IntelligenceFact } from "../shared/knowledge.types";

import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
import type { ResearchProviderId } from "./provider.types";

/** Outcome of a single provider research execution. */
export type IntelligenceResearchResultStatus =
  | "success"
  | "partial"
  | "unsupported"
  | "failed";

/** Ordered list snapshot returned by ranking providers. */
export interface IntelligenceResearchRanking {
  metric: "goals" | "assists" | "unknown";
  limit: number;
  entries: Array<{
    rank: number;
    label: string;
    value?: number | null;
    entityId?: string | number;
  }>;
}

/** Result-level provenance for a provider research bundle. */
export interface ResearchResultProvenance {
  /** Primary data source for this result bundle. */
  source: ResearchProviderId | "inferred" | "user";
  fetchedAt?: string;
  /** Provider operations that produced this result. */
  operations?: string[];
  /** Per-fact lineage when structured facts are present. */
  facts?: FactProvenance[];
}

/** Canonical provider research payload for provider execution and plan outcomes. */
export interface IntelligenceResearchResult {
  queryId: string;
  providerId: ResearchProviderId;
  status: IntelligenceResearchResultStatus;
  facts: IntelligenceFact[];
  entities: IntelligenceEntity[];
  rankings: IntelligenceResearchRanking[];
  fixtures: FootballResearchFixture[];
  statistics: FootballResearchStatistic[];
  events: FootballResearchEvent[];
  lineups: FootballResearchLineup[];
  warnings: string[];
  confidence?: ConfidenceScore;
  provenance: ResearchResultProvenance;
  diagnostics?: ProviderDiagnosticEntry[];
  /**
   * Dev-only upstream payload — providers may attach raw API responses here.
   * Strip before serializing to production clients or persisting drafts.
   */
  raw?: unknown;
}

/** Required fields when constructing an empty provider result. */
export type IntelligenceResearchResultSeed = Pick<
  IntelligenceResearchResult,
  "queryId" | "providerId" | "status"
> &
  Partial<
    Omit<
      IntelligenceResearchResult,
      "queryId" | "providerId" | "status" | "provenance"
    >
  > & {
    provenance?: Partial<ResearchResultProvenance> &
      Pick<ResearchResultProvenance, "source">;
  };

export function createIntelligenceResearchResult(
  seed: IntelligenceResearchResultSeed,
): IntelligenceResearchResult {
  return {
    queryId: seed.queryId,
    providerId: seed.providerId,
    status: seed.status,
    facts: seed.facts ?? [],
    entities: seed.entities ?? [],
    rankings: seed.rankings ?? [],
    fixtures: seed.fixtures ?? [],
    statistics: seed.statistics ?? [],
    events: seed.events ?? [],
    lineups: seed.lineups ?? [],
    warnings: seed.warnings ?? [],
    confidence: seed.confidence,
    provenance: {
      source: seed.provenance?.source ?? seed.providerId,
      fetchedAt: seed.provenance?.fetchedAt,
      operations: seed.provenance?.operations,
      facts: seed.provenance?.facts,
    },
    diagnostics: seed.diagnostics,
    ...(process.env.NODE_ENV === "development" && seed.raw !== undefined
      ? { raw: seed.raw }
      : {}),
  };
}

/** Whether a result may include dev-only raw payloads. */
export function canAttachRawResearchPayload(): boolean {
  return process.env.NODE_ENV === "development";
}
