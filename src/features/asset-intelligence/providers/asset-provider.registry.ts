import type { AssetProviderCapability, AssetProviderDefinition, AssetProviderId } from "./asset-provider.types";

function capabilities(
  partial: Partial<Record<AssetProviderCapability, boolean>>,
): Record<AssetProviderCapability, boolean> {
  return {
    supportsPeople: false,
    supportsSports: false,
    supportsHistorical: false,
    supportsLogos: false,
    supportsTransparent: false,
    supportsPortrait: false,
    supportsLandscape: false,
    supportsIllustrations: false,
    supportsAI: false,
    supportsVideo: false,
    supportsCommercialUse: false,
    ...partial,
  };
}

const PROVIDER_DEFINITIONS: AssetProviderDefinition[] = [
  {
    id: "manual",
    label: "Manual Upload",
    planningOnly: true,
    baseScore: 0.35,
    capabilities: capabilities({
      supportsPeople: true,
      supportsSports: true,
      supportsHistorical: true,
      supportsLogos: true,
      supportsPortrait: true,
      supportsLandscape: true,
      supportsCommercialUse: true,
    }),
  },
  {
    id: "pexels",
    label: "Pexels",
    planningOnly: true,
    baseScore: 0.82,
    capabilities: capabilities({
      supportsPeople: true,
      supportsSports: true,
      supportsHistorical: true,
      supportsPortrait: true,
      supportsLandscape: true,
      supportsVideo: true,
      supportsCommercialUse: true,
    }),
  },
  {
    id: "unsplash",
    label: "Unsplash",
    planningOnly: true,
    baseScore: 0.8,
    capabilities: capabilities({
      supportsPeople: true,
      supportsSports: true,
      supportsPortrait: true,
      supportsLandscape: true,
      supportsCommercialUse: true,
    }),
  },
  {
    id: "pixabay",
    label: "Pixabay",
    planningOnly: true,
    baseScore: 0.74,
    capabilities: capabilities({
      supportsPeople: true,
      supportsSports: true,
      supportsLandscape: true,
      supportsIllustrations: true,
      supportsVideo: true,
      supportsCommercialUse: true,
    }),
  },
  {
    id: "wikimedia",
    label: "Wikimedia Commons",
    planningOnly: true,
    baseScore: 0.7,
    capabilities: capabilities({
      supportsPeople: true,
      supportsHistorical: true,
      supportsLogos: true,
      supportsLandscape: true,
    }),
  },
  {
    id: "internal_library",
    label: "Internal Library",
    planningOnly: true,
    baseScore: 0.88,
    capabilities: capabilities({
      supportsPeople: true,
      supportsSports: true,
      supportsHistorical: true,
      supportsLogos: true,
      supportsTransparent: true,
      supportsPortrait: true,
      supportsLandscape: true,
      supportsIllustrations: true,
      supportsVideo: true,
      supportsCommercialUse: true,
    }),
  },
  {
    id: "ai_generated",
    label: "AI Generated",
    planningOnly: true,
    baseScore: 0.76,
    capabilities: capabilities({
      supportsPeople: true,
      supportsIllustrations: true,
      supportsAI: true,
      supportsTransparent: true,
      supportsPortrait: true,
      supportsLandscape: true,
      supportsLogos: true,
      supportsCommercialUse: true,
    }),
  },
];

const REGISTRY_MAP = new Map<AssetProviderId, AssetProviderDefinition>(
  PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]),
);

/** Immutable planning-only asset provider registry. */
export const ASSET_PROVIDER_REGISTRY: readonly AssetProviderDefinition[] = Object.freeze(
  PROVIDER_DEFINITIONS.map((provider) =>
    Object.freeze({
      ...provider,
      capabilities: Object.freeze({ ...provider.capabilities }),
    }),
  ),
);

/** Returns a provider definition by id. */
export function getAssetProviderDefinition(id: AssetProviderId): AssetProviderDefinition | undefined {
  return REGISTRY_MAP.get(id);
}

/** Returns all registered provider ids. */
export function listAssetProviderIds(): AssetProviderId[] {
  return ASSET_PROVIDER_REGISTRY.map((provider) => provider.id);
}

/** Returns whether a provider supports every required capability. */
export function providerSupportsCapabilities(
  provider: AssetProviderDefinition,
  required: AssetProviderCapability[],
): boolean {
  if (required.length === 0) {
    return true;
  }

  return required.every((capability) => provider.capabilities[capability]);
}
