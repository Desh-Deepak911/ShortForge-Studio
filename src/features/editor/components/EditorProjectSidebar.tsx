"use client";

import {
  ArrowLeftRight,
  Clapperboard,
  Clock,
  Film,
  Flag,
  ImageIcon,
  Info,
  Layers,
  Mic,
  Sparkles,
} from "lucide-react";

import { getCanonicalVoiceover } from "@/features/audio";
import { useEditorSelection } from "@/features/editor/selection";
import { getSceneImageUrl, sceneHasImage } from "@/features/story/utils";
import {
  formatDisplayDurationMs,
  formatDisplayDurationSec,
  formatDisplayTimeRangeSec,
} from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioBadge,
  studioFieldLabel,
  studioInfoCallout,
  studioShellSectionDesc,
  studioShellSectionTitle,
  studioSidebarSceneItem,
  studioSidebarSceneItemActive,
  studioSidebarSceneList,
  studioSidebarSceneMeta,
  studioSidebarSceneThumb,
  studioSidebarSceneTitle,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { FootieScene, FootieScript, SceneType } from "@/features/story/types";

export interface EditorProjectSidebarProps {
  script: FootieScript;
  projectTitle: string;
}

const SCENE_TYPE_ICONS: Record<SceneType, typeof Sparkles> = {
  intro: Sparkles,
  context: Info,
  match: Clapperboard,
  transition: ArrowLeftRight,
  ending: Flag,
};

function resolveVoiceoverStatus(script: FootieScript): { label: string; ready: boolean } {
  const voiceover = getCanonicalVoiceover(script);
  if (voiceover?.url) {
    const durationLabel =
      voiceover.durationMs != null
        ? formatDisplayDurationMs(voiceover.durationMs)
        : script.voiceoverDurationMs != null
          ? formatDisplayDurationMs(script.voiceoverDurationMs)
          : null;

    return {
      label: durationLabel != null ? `Voiceover ready · ${durationLabel}` : "Voiceover ready",
      ready: true,
    };
  }

  return { label: "No voiceover yet", ready: false };
}

function SceneTypeIcon({ sceneType }: { sceneType: SceneType }) {
  const Icon = SCENE_TYPE_ICONS[sceneType];
  return <Icon className="h-3 w-3 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />;
}

interface SidebarSceneRowProps {
  scene: FootieScene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function SidebarSceneRow({ scene, index, isSelected, onSelect }: SidebarSceneRowProps) {
  const imageUrl = getSceneImageUrl(scene);
  const hasImage = sceneHasImage(scene);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={`${studioSidebarSceneItem} ${isSelected ? studioSidebarSceneItemActive : ""}`}
    >
      <div className={studioSidebarSceneThumb}>
        {hasImage && imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/data scene thumbnails
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-muted/45" strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <span className="min-w-0 flex-1 text-left">
        <span className={`${studioSidebarSceneTitle} flex items-center gap-1.5`}>
          {scene.sceneType ? <SceneTypeIcon sceneType={scene.sceneType} /> : null}
          Scene {index + 1}
        </span>
        <span className={studioSidebarSceneMeta}>
          {formatDisplayDurationSec(scene.duration)} ·{" "}
          {formatDisplayTimeRangeSec(scene.start, scene.end)}
        </span>
      </span>
    </button>
  );
}

/**
 * Editor sidebar — project context and compact scene navigation only.
 */
export default function EditorProjectSidebar({
  script,
  projectTitle,
}: EditorProjectSidebarProps) {
  const selection = useEditorSelection();
  const scenes = script.scenes;
  const safeIndex = selection.selectedSceneIndex;
  const voiceoverStatus = resolveVoiceoverStatus(script);

  const handleSceneSelect = (scene: FootieScene) => {
    selection.selectScene(scene.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="min-w-0 space-y-2">
        <p className={studioShellSectionTitle}>{projectTitle}</p>
        <p className={studioShellSectionDesc}>Project navigation</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className={studioBadge}>
            <Layers className="h-3 w-3" />
            {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
          </span>
          <span className={studioBadge}>
            <Clock className="h-3 w-3" />
            {formatDisplayDurationSec(script.totalDuration)}
          </span>
          <span className={`${studioBadge} ${voiceoverStatus.ready ? "" : "text-muted"}`}>
            <Mic className="h-3 w-3" />
            {voiceoverStatus.ready ? "Voiceover" : "No VO"}
          </span>
        </div>
        <p className={`${studioSubtleText} text-[11px]`}>{voiceoverStatus.label}</p>
      </header>

      <section aria-label="Scene editing">
        <div className={studioInfoCallout}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground/90">Scene editing</p>
            <p className={`${studioSubtleText} text-[11px] leading-relaxed`}>
              Insert, duplicate, reorder, and delete scenes directly from the timeline.
            </p>
            <p className={`${studioSubtleText} text-[11px] leading-relaxed`}>
              Tip: Use the ⋮ menu on any timeline scene (or right-click on desktop) for editing actions.
            </p>
          </div>
        </div>
      </section>

      <section id="studio-sidebar-scenes" className="min-w-0 flex-1 scroll-mt-24">
        <div className="mb-2 flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
          <p className={`${studioFieldLabel} mb-0`}>Scenes</p>
        </div>
        {scenes.length === 0 ? (
          <p className={studioSubtleText}>No scenes yet.</p>
        ) : (
          <nav aria-label="Scene list" className={studioSidebarSceneList}>
            {scenes.map((scene, index) => (
              <SidebarSceneRow
                key={scene.id}
                scene={scene}
                index={index}
                isSelected={index === safeIndex}
                onSelect={() => handleSceneSelect(scene)}
              />
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
