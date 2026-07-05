"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import ExportDrawer from "@/components/studio-shell/ExportDrawer";
import type { AssetSearchProviderId, NormalizedAssetResult } from "@/features/asset-search/orchestrator";

import AssetBrowserDetails from "./AssetBrowserDetails";
import AssetBrowserEmptyState from "./AssetBrowserEmptyState";
import AssetBrowserFiltersPanel from "./AssetBrowserFilters";
import AssetBrowserGrid from "./AssetBrowserGrid";
import AssetBrowserLoading from "./AssetBrowserLoading";
import AssetBrowserPagination from "./AssetBrowserPagination";
import AssetBrowserSearchBar from "./AssetBrowserSearchBar";
import type { AssetBrowserFilters, AssetBrowserAttachState, AssetBrowserProps } from "./asset-browser.types";
import {
  ASSET_BROWSER_DEBOUNCE_MS,
  ASSET_BROWSER_DEFAULT_LIMIT,
  DEFAULT_ASSET_BROWSER_FILTERS,
} from "./asset-browser.types";
import { attachBrowserAssetToScene } from "./asset-browser.attach.utils";
import { resolveHandoffProviderOrder } from "./asset-browser.handoff.utils";
import {
  applyAssetBrowserFilters,
  createAssetBrowserDebounce,
  fetchAssetBrowserResults,
  formatProviderDisplayName,
  resolveEmptyStateKind,
} from "./asset-browser.utils";
import { studioSubtleText } from "@/lib/utils/studioUi";

/**
 * Unified asset browser — search, filter, paginate, inspect, and attach from studio handoff.
 */
export default function AssetBrowser({
  open,
  onOpenChange,
  initialSearchContext,
  context,
  attachContext,
}: AssetBrowserProps) {
  const [query, setQuery] = useState(initialSearchContext.query);
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearchContext.query);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AssetBrowserFilters>(DEFAULT_ASSET_BROWSER_FILTERS);
  const [rawResults, setRawResults] = useState<NormalizedAssetResult[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AssetSearchProviderId[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchSucceeded, setSearchSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [disabledReason, setDisabledReason] = useState<string | undefined>();
  const [selectedAsset, setSelectedAsset] = useState<NormalizedAssetResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [attachState, setAttachState] = useState<AssetBrowserAttachState>("idle");
  const [attachErrorMessage, setAttachErrorMessage] = useState<string | undefined>();

  const debouncer = useMemo(() => createAssetBrowserDebounce(ASSET_BROWSER_DEBOUNCE_MS), []);
  const requestVersionRef = useRef(0);

  const handoffProviderHint = useMemo(() => {
    const order = resolveHandoffProviderOrder(initialSearchContext.rankedProviderIds);
    return order.length > 0
      ? order.map((providerId) => formatProviderDisplayName(providerId)).join(" → ")
      : null;
  }, [initialSearchContext.rankedProviderIds]);

  const resetBrowserState = useCallback(
    (nextQuery: string) => {
      debouncer.cancel();
      setQuery(nextQuery);
      setDebouncedQuery(nextQuery);
      setPage(1);
      setFilters(DEFAULT_ASSET_BROWSER_FILTERS);
      setErrorMessage(undefined);
      setDisabledReason(undefined);
      setRawResults([]);
      setAvailableProviders([]);
      setTotalResults(0);
      setHasNextPage(false);
      setSearchSucceeded(false);
    },
    [debouncer],
  );

  const performSearch = useCallback(
    async (input: { query: string; page: number; orientation: AssetBrowserFilters["orientation"] }) => {
      const trimmedQuery = input.query.trim();
      if (!trimmedQuery) {
        setRawResults([]);
        setAvailableProviders([]);
        setTotalResults(0);
        setHasNextPage(false);
        setSearchSucceeded(false);
        setLoading(false);
        return;
      }

      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      setLoading(true);
      setErrorMessage(undefined);

      try {
        const response = await fetchAssetBrowserResults({
          context,
          query: trimmedQuery,
          page: input.page,
          limit: ASSET_BROWSER_DEFAULT_LIMIT,
          orientation: input.orientation === "all" ? "any" : input.orientation,
          semanticSlot: initialSearchContext.semanticSlot,
          visualIntent: initialSearchContext.visualIntent,
        });

        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setDisabledReason(response.disabledReason);
        setRawResults(response.results);
        setTotalResults(response.totalResults);
        setHasNextPage(response.hasNextPage);
        setSearchSucceeded(response.success);
        setAvailableProviders(
          Array.from(new Set(response.results.map((asset) => asset.providerId))).sort(),
        );

        if (!response.success && response.results.length === 0) {
          setErrorMessage(response.error ?? "Asset search failed");
        }
      } catch (error) {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setRawResults([]);
        setAvailableProviders([]);
        setTotalResults(0);
        setHasNextPage(false);
        setSearchSucceeded(false);
        setErrorMessage(error instanceof Error ? error.message : "Asset search failed");
      } finally {
        if (requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      }
    },
    [context, initialSearchContext.semanticSlot, initialSearchContext.visualIntent],
  );

  const handleDrawerOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        resetBrowserState(initialSearchContext.query);
        void performSearch({
          query: initialSearchContext.query,
          page: 1,
          orientation: DEFAULT_ASSET_BROWSER_FILTERS.orientation,
        });
      }

      onOpenChange(nextOpen);
    },
    [initialSearchContext.query, onOpenChange, performSearch, resetBrowserState],
  );

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      debouncer.schedule(() => {
        setDebouncedQuery(nextQuery);
        setPage(1);
        void performSearch({
          query: nextQuery,
          page: 1,
          orientation: filters.orientation,
        });
      });
    },
    [debouncer, filters.orientation, performSearch],
  );

  const handleFiltersChange = useCallback(
    (nextFilters: AssetBrowserFilters) => {
      const orientationChanged = nextFilters.orientation !== filters.orientation;
      setFilters(nextFilters);

      if (orientationChanged) {
        const nextPage = 1;
        setPage(nextPage);
        void performSearch({
          query: debouncedQuery,
          page: nextPage,
          orientation: nextFilters.orientation,
        });
      }
    },
    [debouncedQuery, filters.orientation, performSearch],
  );

  const handlePreviousPage = useCallback(() => {
    const nextPage = Math.max(1, page - 1);
    setPage(nextPage);
    void performSearch({
      query: debouncedQuery,
      page: nextPage,
      orientation: filters.orientation,
    });
  }, [debouncedQuery, filters.orientation, page, performSearch]);

  const handleNextPage = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    void performSearch({
      query: debouncedQuery,
      page: nextPage,
      orientation: filters.orientation,
    });
  }, [debouncedQuery, filters.orientation, page, performSearch]);

  const displayedResults = useMemo(
    () => applyAssetBrowserFilters(rawResults, filters),
    [filters, rawResults],
  );

  const emptyStateKind = resolveEmptyStateKind({
    query: debouncedQuery,
    disabledReason,
    success: searchSucceeded,
    resultCount: displayedResults.length,
    error: errorMessage,
  });

  const handleViewDetails = useCallback((asset: NormalizedAssetResult) => {
    setSelectedAsset(asset);
    setAttachState("idle");
    setAttachErrorMessage(undefined);
    setDetailsOpen(true);
  }, []);

  const handleAttachSelectedAsset = useCallback(async () => {
    if (!attachContext?.enabled || !selectedAsset) {
      return;
    }

    const sceneId = initialSearchContext.sceneId.trim();
    if (!sceneId) {
      setAttachState("error");
      setAttachErrorMessage("Select a scene before attaching an asset.");
      return;
    }

    setAttachState("loading");
    setAttachErrorMessage(undefined);

    const assetSnapshot = structuredClone(selectedAsset) as NormalizedAssetResult;

    const result = await attachBrowserAssetToScene({
      script: attachContext.script,
      sceneId,
      asset: assetSnapshot,
      initialSearchContext,
      searchContext: attachContext.searchContext,
      recommendationQuery: attachContext.recommendationQuery,
      planningScriptHash: attachContext.planningScriptHash,
    });

    if (result.success && result.script) {
      attachContext.onScriptChange(result.script, { intent: "media" });
      setAttachState("success");
      window.setTimeout(() => {
        setDetailsOpen(false);
        onOpenChange(false);
        setAttachState("idle");
        setAttachErrorMessage(undefined);
      }, 900);
      return;
    }

    setAttachState("error");
    setAttachErrorMessage(
      result.error ??
        "We couldn't prepare this asset. Try another result or upload manually.",
    );
  }, [attachContext, initialSearchContext, onOpenChange, selectedAsset]);

  return (
    <>
      <ExportDrawer
        open={open}
        onOpenChange={handleDrawerOpenChange}
        title="Asset Browser"
        description={
          attachContext?.enabled
            ? "Browse normalized search results and attach to the selected scene."
            : "Browse normalized search results."
        }
      >
        <div className="space-y-4">
          <section className="rounded-2xl bg-surface-elevated/20 p-3.5 ring-1 ring-border/15">
            <p className={studioSubtleText}>
              Scene {initialSearchContext.sceneIndex + 1} · {initialSearchContext.sceneId}
            </p>
            {initialSearchContext.visualIntent ? (
              <p className={`${studioSubtleText} mt-1`}>
                Visual intent: {initialSearchContext.visualIntent}
              </p>
            ) : null}
            {initialSearchContext.semanticSlot ? (
              <p className={`${studioSubtleText} mt-1`}>
                Semantic slot: {initialSearchContext.semanticSlot}
              </p>
            ) : null}
            {handoffProviderHint ? (
              <p className={`${studioSubtleText} mt-1`}>Provider order: {handoffProviderHint}</p>
            ) : null}
          </section>

          <AssetBrowserSearchBar query={query} onQueryChange={handleQueryChange} disabled={loading} />

          <AssetBrowserFiltersPanel
            filters={filters}
            availableProviders={availableProviders}
            onFiltersChange={handleFiltersChange}
            disabled={loading}
          />

          {loading ? <AssetBrowserLoading /> : null}

          {!loading && emptyStateKind !== "none" ? (
            <AssetBrowserEmptyState kind={emptyStateKind} message={errorMessage ?? disabledReason} />
          ) : null}

          {!loading && displayedResults.length > 0 ? (
            <>
              <AssetBrowserGrid assets={displayedResults} onViewDetails={handleViewDetails} />
              <AssetBrowserPagination
                page={page}
                limit={ASSET_BROWSER_DEFAULT_LIMIT}
                totalResults={totalResults}
                hasNextPage={hasNextPage}
                disabled={loading}
                onPrevious={handlePreviousPage}
                onNext={handleNextPage}
              />
            </>
          ) : null}
        </div>
      </ExportDrawer>

      <AssetBrowserDetails
        asset={selectedAsset}
        open={detailsOpen}
        onOpenChange={(nextOpen) => {
          setDetailsOpen(nextOpen);
          if (!nextOpen) {
            setAttachState("idle");
            setAttachErrorMessage(undefined);
          }
        }}
        attachEnabled={Boolean(attachContext?.enabled)}
        attachState={attachState}
        attachErrorMessage={attachErrorMessage}
        onAttach={() => {
          void handleAttachSelectedAsset();
        }}
      />
    </>
  );
}
