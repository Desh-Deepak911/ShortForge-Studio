"use client";

import { ChevronDown } from "lucide-react";

import type { AssetSearchProviderId } from "@/features/asset-search/orchestrator";

import type { AssetBrowserFilters } from "./asset-browser.types";
import {
  formatLicenseBadgeLabel,
  formatOrientationLabel,
  formatProviderDisplayName,
} from "./asset-browser.utils";
import { studioFieldLabel, studioSelect, studioSelectChevron } from "@/lib/utils/studioUi";

export interface AssetBrowserFiltersProps {
  filters: AssetBrowserFilters;
  availableProviders: AssetSearchProviderId[];
  onFiltersChange: (filters: AssetBrowserFilters) => void;
  disabled?: boolean;
}

const ORIENTATION_OPTIONS = ["all", "landscape", "portrait", "square"] as const;
const LICENSE_OPTIONS = ["all", "commercial", "editorial", "creative_commons"] as const;
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "score", label: "Highest Score" },
] as const;

export default function AssetBrowserFiltersPanel({
  filters,
  availableProviders,
  onFiltersChange,
  disabled = false,
}: AssetBrowserFiltersProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1.5">
        <span className={studioFieldLabel}>Provider</span>
        <div className="relative">
          <select
            disabled={disabled}
            value={filters.providerId}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                providerId: event.target.value as AssetBrowserFilters["providerId"],
              })
            }
            className={studioSelect}
            aria-label="Filter by provider"
          >
            <option value="all">All providers</option>
            {availableProviders.map((providerId) => (
              <option key={providerId} value={providerId}>
                {formatProviderDisplayName(providerId)}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} aria-hidden />
        </div>
      </label>

      <label className="space-y-1.5">
        <span className={studioFieldLabel}>Orientation</span>
        <div className="relative">
          <select
            disabled={disabled}
            value={filters.orientation}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                orientation: event.target.value as AssetBrowserFilters["orientation"],
              })
            }
            className={studioSelect}
            aria-label="Filter by orientation"
          >
            {ORIENTATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All orientations" : formatOrientationLabel(option)}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} aria-hidden />
        </div>
      </label>

      <label className="space-y-1.5">
        <span className={studioFieldLabel}>License</span>
        <div className="relative">
          <select
            disabled={disabled}
            value={filters.license}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                license: event.target.value as AssetBrowserFilters["license"],
              })
            }
            className={studioSelect}
            aria-label="Filter by license"
          >
            {LICENSE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All licenses" : formatLicenseBadgeLabel(option)}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} aria-hidden />
        </div>
      </label>

      <label className="space-y-1.5">
        <span className={studioFieldLabel}>Sort</span>
        <div className="relative">
          <select
            disabled={disabled}
            value={filters.sort}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                sort: event.target.value as AssetBrowserFilters["sort"],
              })
            }
            className={studioSelect}
            aria-label="Sort assets"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} aria-hidden />
        </div>
      </label>
    </section>
  );
}
