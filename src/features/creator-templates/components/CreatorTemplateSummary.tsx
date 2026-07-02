"use client";

import { resolveScriptModeLabel } from "@/features/creator-templates/creator-template-picker.utils";
import type { CreatorTemplate } from "@/features/creator-templates/creator-template.types";
import { getCaptionPreset } from "@/features/caption-engine/caption-preset.registry";
import { getSpeechStylePreset } from "@/features/speech-style/speech-style.registry";
import { studioCardTag, studioSubtleText } from "@/lib/utils/studioUi";
import type { ScriptMode } from "@/types/footiebitz";

export interface CreatorTemplateSummaryProps {
  template: CreatorTemplate;
  scriptMode: ScriptMode;
  sceneCount: number;
  duration: number;
}

export default function CreatorTemplateSummary({
  template,
  scriptMode,
  sceneCount,
  duration,
}: CreatorTemplateSummaryProps) {
  const speechStyleLabel = template.defaults.speechStylePreset
    ? getSpeechStylePreset(template.defaults.speechStylePreset)?.label
    : undefined;
  const captionPresetLabel = template.defaults.captionPreset
    ? getCaptionPreset(template.defaults.captionPreset)?.label
    : undefined;

  return (
    <div
      className="rounded-lg bg-surface-elevated/30 px-2.5 py-2 ring-1 ring-border/20"
      aria-live="polite"
    >
      <p className="text-[11px] font-medium text-foreground/90">{template.title}</p>
      <dl className="mt-1.5 space-y-1">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Structure</dt>
          <dd className={`${studioSubtleText} text-[11px] leading-snug`}>
            {template.promptHints.structure}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Tone</dt>
          <dd className={`${studioSubtleText} text-[11px] leading-snug`}>{template.promptHints.tone}</dd>
        </div>
        <div className="flex flex-wrap gap-0.5 pt-0.5">
          {speechStyleLabel ? (
            <span className={`${studioCardTag} normal-case tracking-normal`}>
              Speech: {speechStyleLabel}
            </span>
          ) : null}
          {captionPresetLabel ? (
            <span className={`${studioCardTag} normal-case tracking-normal`}>
              Captions: {captionPresetLabel}
            </span>
          ) : null}
          <span className={`${studioCardTag} normal-case tracking-normal`}>
            {sceneCount} scenes · {duration}s · {resolveScriptModeLabel(scriptMode)}
          </span>
        </div>
      </dl>
      <p className={`${studioSubtleText} mt-2 text-[10px] leading-snug`}>
        You can still override these settings.
      </p>
    </div>
  );
}
