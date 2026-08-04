"use client";

import { FileText } from "lucide-react";

import StoryReview from "@/components/StoryReview";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import { useInspectorContext } from "@/features/editor/inspector/InspectorContext";
import VisualRetentionPresetsPanel from "@/features/visual-retention-presets/editor/VisualRetentionPresetsPanel";
import type { FootieScript } from "@/features/story/types";
import {
  useEngagementOverlaysEnabled,
  useKeyframedVisualEffectsEnabled,
  useMixedMediaScenesEnabled,
  useShortForgeBrandStingEnabled,
  useVisualBeatDensityEnabled,
  useVisualRetentionCapabilitiesReady,
  useVisualRetentionPresetsEnabled,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { studioInspectorStack } from "@/lib/utils/studioUi";

export interface EditorProjectInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project-level story settings. Audio lives in its own inspector tab.
 * Visual Retention Presets mount here only — never Scene/Timeline/Export.
 * Requires a stable non-empty storyId; keyed remount resets local preset UI.
 */
export default function EditorProjectInspector({
  script,
  onScriptChange,
}: EditorProjectInspectorProps) {
  const { storyId: rawStoryId } = useInspectorContext();
  const capabilitiesReady = useVisualRetentionCapabilitiesReady();
  const visualRetentionPresetsEnabled = useVisualRetentionPresetsEnabled();
  const mixedMediaScenesEnabled = useMixedMediaScenesEnabled();
  const visualBeatDensityEnabled = useVisualBeatDensityEnabled();
  const keyframedVisualEffectsEnabled = useKeyframedVisualEffectsEnabled();
  const engagementOverlaysEnabled = useEngagementOverlaysEnabled();
  const shortForgeBrandStingEnabled = useShortForgeBrandStingEnabled();

  const storyId =
    typeof rawStoryId === "string" && rawStoryId.trim()
      ? rawStoryId.trim()
      : null;

  const showVisualRetentionPresets =
    storyId != null &&
    capabilitiesReady === true &&
    visualRetentionPresetsEnabled === true;

  return (
    <div className={`${studioInspectorStack} pb-1`}>
      <InspectorSection
        icon={FileText}
        title="Project"
        description="Story title and narration text."
      >
        <StoryReview
          story={script}
          onStoryChange={onScriptChange}
          variant="storyboard"
        />
      </InspectorSection>
      {showVisualRetentionPresets ? (
        <VisualRetentionPresetsPanel
          key={storyId}
          script={script}
          onScriptChange={onScriptChange}
          projectKey={storyId}
          capabilities={{
            ready: capabilitiesReady,
            visualRetentionPresetsEnabled,
            mixedMediaScenesEnabled,
            visualBeatDensityEnabled,
            keyframedVisualEffectsEnabled,
            engagementOverlaysEnabled,
            shortForgeBrandStingEnabled,
          }}
        />
      ) : null}
    </div>
  );
}
