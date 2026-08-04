"use client";

import type { ReactNode } from "react";

import { studioSubtleText } from "@/lib/utils/studioUi";

import type { VisualRetentionPresetApplicationPlanV1 } from "../domain/build-visual-retention-preset-plan";
import type { VisualRetentionPresetDefinitionV1 } from "../domain/visual-retention-preset.types";

export interface VisualRetentionPresetPlanPreviewProps {
  readonly preset: VisualRetentionPresetDefinitionV1;
  readonly plan: VisualRetentionPresetApplicationPlanV1;
}

function collectAffectedCounts(plan: VisualRetentionPresetApplicationPlanV1): {
  readonly sceneCount: number;
  readonly mediaCount: number;
} {
  const scenes = new Set<string>();
  const mediaKeys = new Set<string>();
  for (const action of plan.actions) {
    if ("sceneId" in action && typeof action.sceneId === "string") {
      scenes.add(action.sceneId);
    }
    if (
      action.kind === "apply-motion-preset" ||
      action.kind === "apply-media-look"
    ) {
      mediaKeys.add(`${action.sceneId}::${action.mediaItemId ?? "scene"}`);
    }
  }
  return { sceneCount: scenes.size, mediaCount: mediaKeys.size };
}

/** Deduplicate identical messages for display; counts stay on plan summary / data-*. */
function uniqueMessages(messages: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const message of messages) {
    if (seen.has(message)) continue;
    seen.add(message);
    out.push(message);
  }
  return out;
}

function bulletList(
  label: string,
  items: readonly string[],
  testId: string,
): ReactNode {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0" data-visual-retention-preset-preview-group={testId}>
      <p className="text-[11px] font-medium text-foreground/85">{label}</p>
      <ul className={`${studioSubtleText} mt-0.5 list-disc space-y-0.5 pl-4`}>
        {items.map((item, index) => (
          <li key={`${testId}:${index}`} className="min-w-0 break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact plain-language plan preview before Apply.
 * Does not expose fingerprints, JSON, or technical codes as visible copy.
 */
export default function VisualRetentionPresetPlanPreview({
  preset,
  plan,
}: VisualRetentionPresetPlanPreviewProps) {
  const { sceneCount, mediaCount } = collectAffectedCounts(plan);
  const summary = plan.summary;
  const isTerminal = plan.status === "terminal";

  const pacingItems: string[] = [];
  if (summary.suggestPacingCount > 0) {
    pacingItems.push(
      summary.suggestPacingCount === 1
        ? "1 pacing suggestion (draft)"
        : `${summary.suggestPacingCount} pacing suggestions (draft)`,
    );
  }

  const motionItems: string[] = [];
  if (summary.applyMotionCount > 0) {
    motionItems.push(
      summary.applyMotionCount === 1
        ? "1 motion update"
        : `${summary.applyMotionCount} motion updates`,
    );
  }

  const lookItems: string[] = [];
  if (summary.applyLookCount > 0) {
    lookItems.push(
      summary.applyLookCount === 1
        ? "1 look update"
        : `${summary.applyLookCount} look updates`,
    );
  }

  const engagementItems: string[] = [];
  if (summary.addEngagementCount > 0) {
    engagementItems.push(
      summary.addEngagementCount === 1
        ? "1 engagement prompt"
        : `${summary.addEngagementCount} engagement prompts`,
    );
  }

  const outroItems: string[] = [];
  if (summary.enableBrandStingCount > 0) {
    outroItems.push(
      summary.enableBrandStingCount === 1
        ? "1 ShortForge Studio outro"
        : `${summary.enableBrandStingCount} ShortForge Studio outros`,
    );
  }

  const skipMessages = uniqueMessages(plan.skipped.map((entry) => entry.message));
  const conflictMessages = uniqueMessages(
    plan.conflicts.map((entry) => entry.message),
  );

  return (
    <div
      className="min-w-0 max-w-full space-y-2 overflow-x-hidden rounded-xl bg-surface-elevated/35 px-3 py-2.5 ring-1 ring-border/20"
      data-visual-retention-preset-plan-preview
      data-visual-retention-preset-plan-status={plan.status}
      data-visual-retention-preset-plan-terminal={plan.terminalCode ?? ""}
      data-visual-retention-preset-plan-actions={String(summary.actionCount)}
      data-visual-retention-preset-plan-skipped={String(summary.skippedCount)}
      data-visual-retention-preset-plan-conflicts={String(summary.conflictCount)}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground/90">
          Plan preview · {preset.title}
        </p>
        <p className={`${studioSubtleText} mt-1 break-words`}>
          {summary.actionCount} planned
          {summary.skippedCount > 0 ? ` · ${summary.skippedCount} skipped` : ""}
          {summary.conflictCount > 0
            ? ` · ${summary.conflictCount} conflict${summary.conflictCount === 1 ? "" : "s"}`
            : ""}
          {sceneCount > 0 ? ` · ${sceneCount} scene${sceneCount === 1 ? "" : "s"}` : ""}
          {mediaCount > 0
            ? ` · ${mediaCount} media target${mediaCount === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      {isTerminal ? (
        <p
          className={`${studioSubtleText} break-words`}
          data-visual-retention-preset-plan-terminal-message
        >
          {plan.terminalMessage ??
            "This preset is unavailable for the current story."}
        </p>
      ) : null}

      <details className="min-w-0" data-visual-retention-preset-plan-details>
        <summary className="cursor-pointer text-[11px] font-medium text-foreground/80">
          What would change
        </summary>
        <div className="mt-2 min-w-0 space-y-2">
          {bulletList("Pacing suggestions", pacingItems, "pacing")}
          {bulletList("Motion", motionItems, "motion")}
          {bulletList("Looks", lookItems, "looks")}
          {bulletList("Engagement prompt", engagementItems, "engagement")}
          {bulletList("Outro", outroItems, "outro")}
          {bulletList("Skipped", skipMessages, "skipped")}
          {bulletList("Conflicts", conflictMessages, "conflicts")}
          {!isTerminal &&
          summary.actionCount === 0 &&
          skipMessages.length === 0 &&
          conflictMessages.length === 0 ? (
            <p className={`${studioSubtleText} break-words`}>
              No changes are planned for this story.
            </p>
          ) : null}
          {!isTerminal &&
          summary.actionCount === 0 &&
          (skipMessages.length > 0 || conflictMessages.length > 0) ? (
            <p
              className={`${studioSubtleText} break-words`}
              data-visual-retention-preset-plan-zero-actions
            >
              Nothing new would be applied — settings already match or were skipped.
            </p>
          ) : null}
        </div>
      </details>

      <p
        className={`${studioSubtleText} break-words`}
        data-visual-retention-preset-plan-apply-gate
      >
        No changes are applied until you choose Apply.
      </p>
      <p
        className={`${studioSubtleText} break-words`}
        data-visual-retention-preset-plan-pacing-note
      >
        Pacing is suggested as a draft; scene timing is not changed automatically.
      </p>
    </div>
  );
}
