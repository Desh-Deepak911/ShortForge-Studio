import type { AssetProviderId } from "@/features/asset-intelligence/providers/asset-provider.types";
import type {
  AssetLicenseType,
  AssetSearchProviderId,
  NormalizedAssetResult,
} from "@/features/asset-search/orchestrator";
import type {
  FootieScript,
  SceneImage,
  SceneImageFitMode,
  SceneMedia,
} from "@/features/story/types";

/** Where a scene image attachment originated. */
export type AssetAttachSource = "manual_upload" | "asset_search" | "smart_edit" | "data_url";

/** How a remote asset was converted into a playable scene image URL. */
export type AssetMaterializationStrategy = "blob" | "data_url" | "remote" | "ingested_base64";

/** Planning/browser handoff metadata preserved at attach time. */
export interface AssetAttachHandoff {
  storyId: string;
  sceneIndex: number;
  recommendationQuery?: string;
  semanticSlot?: string;
  visualIntent?: string;
  rankedProviderIds?: AssetProviderId[];
  planningScriptHash?: string;
}

/** Snapshot of attribution and license at attach time. */
export interface AssetAttributionMetadata {
  providerName: string;
  providerUrl: string;
  creatorName?: string;
  creatorUrl?: string;
  requiredText: string;
  licenseType: AssetLicenseType;
  licenseUrl?: string;
  requiresAttribution: boolean;
  commercialUse: boolean;
  editorialOnly: boolean;
}

/** Persisted attachment metadata stored on FootieScene. */
export interface AssetAttachMetadata {
  attachSource: AssetAttachSource;
  normalizedAssetId: string;
  providerId: AssetSearchProviderId;
  title: string;
  sourcePreviewUrl: string;
  sourceFullResolutionUrl: string;
  attribution: AssetAttributionMetadata;
  attachedAt: string;
  handoff?: AssetAttachHandoff;
  materialization: {
    strategy: AssetMaterializationStrategy;
    persisted: boolean;
  };
}

/** Input for materializing a normalized asset into a playable URL. */
export interface MaterializeAssetUrlInput {
  asset: Readonly<NormalizedAssetResult>;
  sourceUrl: string;
  preferFullResolution?: boolean;
}

/** Result from injectable asset URL materialization. */
export interface AssetMaterializationResult {
  success: boolean;
  playableUrl?: string;
  strategy: AssetMaterializationStrategy;
  persisted?: boolean;
  warnings?: string[];
  error?: string;
}

export type MaterializeAssetUrlFn = (
  input: MaterializeAssetUrlInput,
) => Promise<AssetMaterializationResult>;

/** Attach request — NormalizedAssetResult is read-only and never mutated. */
export interface AssetAttachInput {
  script: FootieScript;
  sceneId: string;
  asset: Readonly<NormalizedAssetResult>;
  source: AssetAttachSource;
  handoff?: AssetAttachHandoff;
  options?: {
    fitMode?: SceneImageFitMode;
    preferFullResolution?: boolean;
    /**
     * Explicit source-quality capture gate. When true, known asset dimensions
     * are copied onto attached SceneMedia. When false, legacy image-only attach.
     */
    sourceQualityIntelligenceEnabled?: boolean;
  };
}

/** Attach response — includes previous scene state for future revert support. */
export interface AssetAttachResult {
  success: boolean;
  script?: FootieScript;
  sceneId: string;
  sceneImage?: SceneImage;
  sceneMedia?: SceneMedia;
  attachMetadata?: AssetAttachMetadata;
  warnings: string[];
  error?: string;
  previousSceneImage?: SceneImage;
  previousAttachMetadata?: AssetAttachMetadata;
}
export interface AssetAttachDependencies {
  materializeAssetUrl: MaterializeAssetUrlFn;
  applyUpdate?: (
    script: FootieScript,
    sceneId: string,
    updates: {
      image?: SceneImage;
      uploadedImage?: string;
      assetAttachment?: AssetAttachMetadata;
      media?: SceneMedia;
    },
  ) => FootieScript;
}
