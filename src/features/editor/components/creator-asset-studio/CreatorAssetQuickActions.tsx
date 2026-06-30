"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import CreatorAssetStudioToast from "@/features/editor/components/creator-asset-studio/CreatorAssetStudioToast";
import { copyPlanningText } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioCompactButton } from "@/lib/utils/studioUi";

export interface CreatorAssetQuickActionsProps {
  searchQuery: string;
  recommendationText: string;
  providerLabel: string;
}

type CopyAction = "query" | "recommendation" | "provider" | null;

/**
 * Quick copy actions for creator workflow — planning metadata only.
 */
export default function CreatorAssetQuickActions({
  searchQuery,
  recommendationText,
  providerLabel,
}: CreatorAssetQuickActionsProps) {
  const [copiedAction, setCopiedAction] = useState<CopyAction>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const handleCopy = useCallback(async (action: CopyAction, value: string, message: string) => {
    const success = await copyPlanningText(value);
    if (!success) {
      return;
    }

    setCopiedAction(action);
    setToastMessage(message);
    setToastVisible(true);
    window.setTimeout(() => {
      setCopiedAction(null);
      setToastVisible(false);
    }, 1800);
  }, []);

  const actions = [
    {
      id: "query" as const,
      label: "Copy Search Query",
      value: searchQuery,
      toast: "Search query copied",
      disabled: !searchQuery.trim(),
    },
    {
      id: "recommendation" as const,
      label: "Copy Recommendation",
      value: recommendationText,
      toast: "Recommendation copied",
      disabled: !recommendationText.trim(),
    },
    {
      id: "provider" as const,
      label: "Copy Provider",
      value: providerLabel,
      toast: "Provider copied",
      disabled: !providerLabel.trim(),
    },
  ];

  return (
    <>
      <section className="rounded-2xl bg-surface-elevated/20 p-3 ring-1 ring-border/15 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)] hover:ring-border/30 motion-reduce:transform-none motion-reduce:shadow-none">
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              aria-label={action.label}
              onClick={() => handleCopy(action.id, action.value, action.toast)}
              className={`${studioCompactButton} min-w-0 flex-1 sm:flex-none`}
            >
              {copiedAction === action.id ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copiedAction === action.id ? "Copied" : action.label}
            </button>
          ))}
        </div>
      </section>

      <CreatorAssetStudioToast message={toastMessage} visible={toastVisible} />
    </>
  );
}
