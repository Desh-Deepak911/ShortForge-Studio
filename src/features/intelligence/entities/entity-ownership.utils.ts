import type {
  EntityKind,
  EntityResolutionStatus,
  IntelligenceEntity,
} from "../shared/entity.types";

import { normalizeEntityName } from "./entity-utils";

const STATUS_RANK: Record<EntityResolutionStatus, number> = {
  unresolved: 0,
  ambiguous: 1,
  resolved: 2,
};

export function createOwnedEntityId(kind: EntityKind, label: string): string {
  const slug = normalizeEntityName(label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `entity:${kind}:${slug || "unknown"}`;
}

export function createOwnedEntity(input: {
  id?: string;
  kind: EntityKind;
  label: string;
  status?: EntityResolutionStatus;
  externalId?: string | number;
  parentLabel?: string;
  confidencePercent?: number;
  metadata?: IntelligenceEntity["metadata"];
}): IntelligenceEntity {
  const label = input.label.trim();
  return {
    id: input.id ?? createOwnedEntityId(input.kind, label),
    kind: input.kind,
    label,
    status: input.status ?? "unresolved",
    ...(input.externalId != null ? { externalId: input.externalId } : {}),
    ...(input.parentLabel ? { parentLabel: input.parentLabel } : {}),
    ...(input.confidencePercent != null ? { confidencePercent: input.confidencePercent } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function ensureOwnedEntity(entity: IntelligenceEntity): IntelligenceEntity {
  if (entity.id) {
    return entity;
  }

  return {
    ...entity,
    id: createOwnedEntityId(entity.kind, entity.label),
  };
}

export function ensureOwnedEntities(entities: IntelligenceEntity[]): IntelligenceEntity[] {
  return entities.map(ensureOwnedEntity);
}

function upgradeEntityStatus(
  current: EntityResolutionStatus,
  proposed?: EntityResolutionStatus,
): EntityResolutionStatus {
  if (!proposed) {
    return current;
  }

  return STATUS_RANK[proposed] > STATUS_RANK[current] ? proposed : current;
}

function labelsMatch(left: string, right: string): boolean {
  const a = normalizeEntityName(left);
  const b = normalizeEntityName(right);

  if (!a || !b) {
    return false;
  }

  return a === b || a.includes(b) || b.includes(a);
}

function mergeMetadata(
  owner: IntelligenceEntity["metadata"],
  enrichment: IntelligenceEntity["metadata"],
  canonicalLabel?: string,
): IntelligenceEntity["metadata"] | undefined {
  const merged = {
    ...(owner ?? {}),
    ...(enrichment ?? {}),
    ...(canonicalLabel && canonicalLabel !== owner?.canonicalLabel
      ? { canonicalLabel }
      : {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function findMatchingOwnedEntity(
  owners: IntelligenceEntity[],
  enrichment: IntelligenceEntity,
): IntelligenceEntity | undefined {
  if (enrichment.id) {
    const byId = owners.find((owner) => owner.id === enrichment.id);
    if (byId) {
      return byId;
    }
  }

  if (enrichment.externalId != null) {
    const byExternalId = owners.find(
      (owner) =>
        owner.kind === enrichment.kind && owner.externalId === enrichment.externalId,
    );
    if (byExternalId) {
      return byExternalId;
    }
  }

  const canonicalLabel =
    typeof enrichment.metadata?.canonicalLabel === "string"
      ? enrichment.metadata.canonicalLabel
      : undefined;
  const aliasLabel =
    typeof enrichment.metadata?.alias === "string" ? enrichment.metadata.alias : undefined;

  for (const owner of owners) {
    if (owner.kind !== enrichment.kind) {
      continue;
    }

    if (labelsMatch(owner.label, enrichment.label)) {
      return owner;
    }

    if (canonicalLabel && labelsMatch(owner.label, canonicalLabel)) {
      return owner;
    }

    if (aliasLabel && labelsMatch(owner.label, aliasLabel)) {
      return owner;
    }
  }

  return undefined;
}

/** Applies provider enrichment without changing owned identity (id/kind/label). */
export function enrichOwnedEntity(
  owner: IntelligenceEntity,
  enrichment: IntelligenceEntity,
): IntelligenceEntity {
  const canonicalLabel =
    enrichment.label !== owner.label ? enrichment.label : undefined;

  const confidencePercent = Math.max(
    owner.confidencePercent ?? 0,
    enrichment.confidencePercent ?? 0,
  );

  return {
    id: owner.id,
    kind: owner.kind,
    label: owner.label,
    status: upgradeEntityStatus(owner.status, enrichment.status),
    externalId: owner.externalId ?? enrichment.externalId,
    parentLabel: owner.parentLabel ?? enrichment.parentLabel,
    ...(confidencePercent > 0 ? { confidencePercent } : {}),
    metadata: mergeMetadata(owner.metadata, enrichment.metadata, canonicalLabel),
  };
}

/**
 * Resolver-owned entities are the source of truth.
 * Provider entities may enrich matched owners; unmatched provider entities are ignored.
 */
export function applyProviderEnrichmentToOwners(
  owners: IntelligenceEntity[],
  providerEntities: IntelligenceEntity[],
): IntelligenceEntity[] {
  const owned = ensureOwnedEntities(owners);
  if (providerEntities.length === 0) {
    return owned;
  }

  const enrichedById = new Map<string, IntelligenceEntity>(
    owned.map((entity) => [entity.id, entity]),
  );

  for (const enrichment of providerEntities) {
    const owner = findMatchingOwnedEntity(owned, enrichment);
    if (!owner) {
      continue;
    }

    enrichedById.set(owner.id, enrichOwnedEntity(enrichedById.get(owner.id)!, enrichment));
  }

  return owned.map((entity) => enrichedById.get(entity.id)!);
}

export function findMatchingOwnedEntityForHint(input: {
  owners: IntelligenceEntity[];
  kind: EntityKind;
  label: string;
}): IntelligenceEntity | undefined {
  return findMatchingOwnedEntity(input.owners, {
    id: "",
    kind: input.kind,
    label: input.label,
    status: "unresolved",
  });
}

/** Provider-side enrichment payload tied to a resolver owner when possible. */
export function createProviderEntityEnrichment(input: {
  owner?: IntelligenceEntity;
  kind: EntityKind;
  canonicalLabel: string;
  externalId?: string | number;
  parentLabel?: string;
  status?: EntityResolutionStatus;
  confidencePercent?: number;
  metadata?: IntelligenceEntity["metadata"];
}): IntelligenceEntity {
  const owner = input.owner ? ensureOwnedEntity(input.owner) : undefined;

  return {
    id: owner?.id ?? createOwnedEntityId(input.kind, input.canonicalLabel),
    kind: input.kind,
    label: owner?.label ?? input.canonicalLabel,
    status: input.status ?? "resolved",
    ...(input.externalId != null ? { externalId: input.externalId } : {}),
    ...(input.parentLabel ? { parentLabel: input.parentLabel } : {}),
    ...(input.confidencePercent != null ? { confidencePercent: input.confidencePercent } : {}),
    metadata: mergeMetadata(
      owner?.metadata,
      input.metadata,
      owner && owner.label !== input.canonicalLabel ? input.canonicalLabel : undefined,
    ),
  };
}
