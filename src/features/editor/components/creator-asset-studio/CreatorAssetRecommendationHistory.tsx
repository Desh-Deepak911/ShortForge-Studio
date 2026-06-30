"use client";

import type { RecommendationHistoryItem } from "@/features/editor/components/creator-asset-studio/useCreatorAssetStudioSession";
import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetRecommendationHistoryProps {
  previousItems: readonly RecommendationHistoryItem[];
  currentItem: RecommendationHistoryItem;
  futureItems: readonly RecommendationHistoryItem[];
}

function HistoryRow({
  label,
  item,
  tone,
}: {
  label: string;
  item: RecommendationHistoryItem;
  tone: "muted" | "current" | "future";
}) {
  const toneClass =
    tone === "current"
      ? "bg-accent/10 ring-accent/20"
      : tone === "future"
        ? "bg-background/20 ring-border/15 opacity-80"
        : "bg-background/25 ring-border/15";

  return (
    <div className={`rounded-xl px-3.5 py-3 ring-1 transition-all duration-300 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xs font-medium text-foreground/85">
        Scene {item.sceneIndex + 1} · {item.sceneTitle}
      </p>
      <p className="mt-1 truncate text-xs text-muted">{item.query}</p>
    </div>
  );
}

/**
 * Session-only recommendation history — previously viewed, current, and future.
 */
export default function CreatorAssetRecommendationHistory({
  previousItems,
  currentItem,
  futureItems,
}: CreatorAssetRecommendationHistoryProps) {
  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3">
        <p className={studioShellSectionTitle}>Recommendation History</p>
        <p className={studioSubtleText}>Session timeline — no persistence</p>
      </header>

      <div className="space-y-2">
        {previousItems.map((item) => (
          <HistoryRow key={`previous-${item.sceneIndex}-${item.query}`} label="Previously viewed" item={item} tone="muted" />
        ))}

        <HistoryRow label="Current recommendation" item={currentItem} tone="current" />

        {futureItems.map((item) => (
          <HistoryRow key={`future-${item.sceneIndex}-${item.query}`} label="Future recommendation" item={item} tone="future" />
        ))}
      </div>
    </section>
  );
}
