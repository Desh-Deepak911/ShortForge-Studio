"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";

import {
  analyzeIntent,
  intentMatchesScriptMode,
  resolveSuggestedContentTypeLabel,
} from "@/features/intelligence";
import { studioPanel, studioSubtleText } from "@/lib/studioUi";
import type { ScriptMode } from "@/types/footiebitz";

const MIN_TOPIC_LENGTH = 4;

interface ContentTypeSuggestionProps {
  topic: string;
  context?: string;
  scriptMode: ScriptMode;
  loading?: boolean;
}

export default function ContentTypeSuggestion({
  topic,
  context,
  scriptMode,
  loading = false,
}: ContentTypeSuggestionProps) {
  const analysis = useMemo(
    () => analyzeIntent({ topic, context }),
    [topic, context],
  );

  const trimmedTopic = topic.trim();
  const hasBrief = trimmedTopic.length >= MIN_TOPIC_LENGTH || Boolean(context?.trim());
  const label = resolveSuggestedContentTypeLabel(analysis.intent);
  const matchesSelection = intentMatchesScriptMode(analysis.intent, scriptMode);
  const showConfidence = matchesSelection && analysis.confidencePercent > 0;

  if (loading || !hasBrief || analysis.confidencePercent <= 0) {
    return null;
  }

  return (
    <div
      className={`${studioPanel} border border-border/30 bg-surface-elevated/25`}
      aria-live="polite"
      aria-label="Suggested content type"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent/80" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground/90">
            Suggested Content Type
          </p>

          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <dt className="text-muted">
                {matchesSelection ? "Detected:" : "Suggested:"}
              </dt>
              <dd className="font-medium text-foreground/95">{label}</dd>
            </div>

            {showConfidence ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <dt className="text-muted">Confidence:</dt>
                <dd className="font-medium tabular-nums text-foreground/95">
                  {analysis.confidencePercent}%
                </dd>
              </div>
            ) : null}
          </dl>

          {!matchesSelection ? (
            <p className={studioSubtleText}>
              Your selected content type stays unchanged — this is a hint only.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
