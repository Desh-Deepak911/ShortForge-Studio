"use client";

import type { NormalizedAssetResult } from "@/features/asset-search/orchestrator";
import StudioOverlay from "@/components/studio-overlay/StudioOverlay";
import {
  studioBadge,
  studioPrimaryButton,
  studioScrollbarVertical,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import {
  formatDimensions,
  formatLicenseBadgeLabel,
  formatOrientationLabel,
  formatProviderDisplayName,
  formatScoreLabel,
} from "./asset-browser.utils";
import type { AssetBrowserAttachState } from "./asset-browser.types";

export interface AssetBrowserDetailsProps {
  asset: NormalizedAssetResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachEnabled?: boolean;
  attachState?: AssetBrowserAttachState;
  attachErrorMessage?: string;
  onAttach?: () => void;
}

export default function AssetBrowserDetails({
  asset,
  open,
  onOpenChange,
  attachEnabled = false,
  attachState = "idle",
  attachErrorMessage,
  onAttach,
}: AssetBrowserDetailsProps) {
  if (!asset) {
    return null;
  }

  const dimensions = formatDimensions(asset);

  return (
    <StudioOverlay
      open={open}
      onOpenChange={onOpenChange}
      variant="modal-center"
      title={asset.title}
      description={
        attachEnabled
          ? "Review asset details, then attach to the selected scene."
          : "Read-only asset details."
      }
      titleId="asset-browser-details-title"
      closeLabel="Close asset details"
      maxWidthClassName="max-w-3xl"
      keepMounted={false}
      panelClassName="max-h-[92vh] overflow-hidden"
      footer={
        attachEnabled ? (
          <button
            type="button"
            className={`${studioPrimaryButton} w-full sm:w-auto`}
            disabled={attachState === "loading" || attachState === "success"}
            onClick={onAttach}
          >
            Attach to Scene
          </button>
        ) : undefined
      }
    >
      <div className={`-mx-1 max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain px-1 ${studioScrollbarVertical}`}>
        <div className="overflow-hidden rounded-2xl bg-surface-elevated/20 ring-1 ring-border/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.previewUrl} alt={asset.title} className="max-h-[24rem] w-full object-contain" />
        </div>

        {asset.description ? (
          <p className={`${studioSubtleText} mt-4`}>{asset.description}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className={studioBadge}>{formatProviderDisplayName(asset.providerId)}</span>
          <span className={studioBadge}>{formatLicenseBadgeLabel(asset.license.licenseType)}</span>
          {asset.orientation ? (
            <span className={studioBadge}>{formatOrientationLabel(asset.orientation)}</span>
          ) : null}
          {dimensions ? <span className={studioBadge}>{dimensions}</span> : null}
          <span className={studioBadge}>{formatScoreLabel(asset.score)}</span>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className={studioSubtleText}>Creator</dt>
            <dd className="mt-1 text-foreground/90">{asset.attribution.creatorName ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className={studioSubtleText}>Provider</dt>
            <dd className="mt-1 text-foreground/90">{asset.attribution.providerName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={studioSubtleText}>Attribution</dt>
            <dd className="mt-1 text-foreground/90">{asset.attribution.requiredText}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={studioSubtleText}>Tags</dt>
            <dd className="mt-1 text-foreground/90">
              {asset.tags.length > 0 ? asset.tags.join(", ") : "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={studioSubtleText}>Preview URL</dt>
            <dd className="mt-1 break-all font-mono text-[12px] text-foreground/85">{asset.previewUrl}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={studioSubtleText}>Full resolution URL</dt>
            <dd className="mt-1 break-all font-mono text-[12px] text-foreground/85">
              {asset.fullResolutionUrl}
            </dd>
          </div>
        </dl>

        {attachEnabled ? (
          <div className="mt-6 space-y-2 border-t border-border/15 pt-4">
            {attachState === "loading" ? (
              <p className={studioSubtleText}>Preparing asset…</p>
            ) : null}
            {attachState === "success" ? (
              <p className="text-sm font-medium text-emerald-400/90">Attached to scene</p>
            ) : null}
            {attachState === "error" ? (
              <p className="text-sm text-red-400/90">
                {attachErrorMessage ??
                  "We couldn't prepare this asset. Try another result or upload manually."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </StudioOverlay>
  );
}
