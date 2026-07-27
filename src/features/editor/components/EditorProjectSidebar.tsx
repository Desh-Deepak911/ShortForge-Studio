"use client";

import {
  ArrowLeftRight,
  Clapperboard,
  Clock,
  Film,
  Flag,
  ImageIcon,
  ImagePlus,
  Info,
  Layers,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";

import { getCanonicalVoiceover } from "@/features/audio";
import { useEditorSelection } from "@/features/editor/selection";
import {
  getSceneImageUrl,
  sceneHasImage,
  sceneHasMedia,
} from "@/features/story/utils";
import {
  formatDisplayDurationMs,
  formatDisplayDurationSec,
  formatDisplayTimeRangeSec,
} from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioBadge,
  studioFieldLabel,
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
import type {
  FootieScene,
  FootieScript,
  SceneType,
} from "@/features/story/types";

export interface EditorProjectSidebarProps {
  script: FootieScript;
  projectTitle: string;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCollapsedToggle?: () => void;
  onRequestMediaForScene?: (sceneId: string) => void;
}

const SCENE_TYPE_ICONS: Record<SceneType, typeof Sparkles> = {
  intro: Sparkles,
  context: Info,
  match: Clapperboard,
  transition: ArrowLeftRight,
  ending: Flag,
};

function resolveVoiceoverStatus(script: FootieScript): {
  label: string;
  ready: boolean;
} {
  const voiceover = getCanonicalVoiceover(script);
  if (voiceover?.url) {
    const durationLabel =
      voiceover.durationMs != null
        ? formatDisplayDurationMs(voiceover.durationMs)
        : script.voiceoverDurationMs != null
          ? formatDisplayDurationMs(script.voiceoverDurationMs)
          : null;

    return {
      label:
        durationLabel != null
          ? `Voiceover ready · ${durationLabel}`
          : "Voiceover ready",
      ready: true,
    };
  }

  return { label: "No voiceover yet", ready: false };
}

function SceneTypeIcon({ sceneType }: { sceneType: SceneType }) {
  const Icon = SCENE_TYPE_ICONS[sceneType];
  return (
    <Icon
      className="h-3 w-3 shrink-0 text-muted"
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

interface SidebarSceneRowProps {
  scene: FootieScene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean;
  onRequestMedia?: () => void;
}

function SidebarSceneRow({
  scene,
  index,
  isSelected,
  onSelect,
  compact = false,
  onRequestMedia,
}: SidebarSceneRowProps) {
  const imageUrl = getSceneImageUrl(scene);
  const hasImage = sceneHasImage(scene);

  const hasMedia = sceneHasMedia(scene);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        data-scene-sidebar-id={scene.id}
        aria-current={isSelected ? "true" : undefined}
        className={`${studioSidebarSceneItem} ${compact ? "justify-center px-1.5 py-2" : ""} ${isSelected ? studioSidebarSceneItemActive : ""}`}
        title={
          compact
            ? `Scene ${index + 1} · ${formatDisplayDurationSec(scene.duration)}`
            : undefined
        }
      >
        <div className={studioSidebarSceneThumb}>
          {hasImage && imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob/data scene thumbnails
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <ImageIcon
              className="h-3.5 w-3.5 text-muted/45"
              strokeWidth={1.75}
              aria-hidden
            />
          )}
        </div>
        {compact ? (
          <span className="sr-only">Scene {index + 1}</span>
        ) : (
          <span className="min-w-0 flex-1 text-left">
            <span
              className={`${studioSidebarSceneTitle} flex items-center gap-1.5`}
            >
              {scene.sceneType ? (
                <SceneTypeIcon sceneType={scene.sceneType} />
              ) : null}
              Scene {index + 1}
            </span>
            <span className={studioSidebarSceneMeta}>
              {formatDisplayDurationSec(scene.duration)} ·{" "}
              {formatDisplayTimeRangeSec(scene.start, scene.end)}
            </span>
          </span>
        )}
      </button>
      {!compact && !hasMedia && onRequestMedia ? (
        <button
          type="button"
          onClick={onRequestMedia}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400/10 px-2 py-1.5 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-300/20 transition hover:bg-amber-400/15"
        >
          <ImagePlus className="h-3 w-3" aria-hidden />
          Add media
        </button>
      ) : null}
    </div>
  );
}

/**
 * Editor sidebar — project context and compact scene navigation only.
 */
export default function EditorProjectSidebar({
  script,
  projectTitle,
  collapsed = false,
  mobileOpen = false,
  onCollapsedToggle,
  onRequestMediaForScene,
}: EditorProjectSidebarProps) {
  const selection = useEditorSelection();
  const compact = collapsed && !mobileOpen;
  const scenes = script.scenes;
  const safeIndex = selection.selectedSceneIndex;
  const voiceoverStatus = resolveVoiceoverStatus(script);

  const handleSceneSelect = (scene: FootieScene) => {
    selection.selectScene(scene.id);
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${compact ? "gap-2" : "gap-4"}`}
    >
      <header className={compact ? "flex justify-center" : "min-w-0 space-y-2"}>
        {compact ? (
          <button
            type="button"
            onClick={onCollapsedToggle}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated/45 text-muted ring-1 ring-border/35 transition hover:text-foreground"
            aria-label="Open scenes panel"
            title="Open scenes (Ctrl/⌘ Shift B)"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={studioShellSectionTitle}>Scenes</p>
                <p
                  className={`${studioShellSectionDesc} truncate`}
                  title={projectTitle}
                >
                  {projectTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={onCollapsedToggle}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-elevated/50 hover:text-foreground"
                aria-label="Collapse scenes panel"
                title="Collapse scenes (Ctrl/⌘ Shift B)"
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className={studioBadge}>
                <Layers className="h-3 w-3" />
                {scenes.length}
              </span>
              <span className={studioBadge}>
                <Clock className="h-3 w-3" />
                {formatDisplayDurationSec(script.totalDuration)}
              </span>
              <span
                className={`${studioBadge} ${voiceoverStatus.ready ? "" : "text-muted"}`}
              >
                <Mic className="h-3 w-3" />
                {voiceoverStatus.ready ? "Voice" : "No VO"}
              </span>
            </div>
          </>
        )}
      </header>

      <section
        id="studio-sidebar-scenes"
        className="min-w-0 flex-1 scroll-mt-24"
      >
        {!compact ? (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
              <p className={`${studioFieldLabel} mb-0`}>Project timeline</p>
            </div>
            <span className="text-[10px] text-muted">⋮ for actions</span>
          </div>
        ) : null}
        {scenes.length === 0 ? (
          <p className={studioSubtleText}>No scenes yet.</p>
        ) : (
          <nav
            aria-label="Scene list"
            className={compact ? "flex flex-col gap-2" : studioSidebarSceneList}
          >
            {scenes.map((scene, index) => (
              <SidebarSceneRow
                key={scene.id}
                scene={scene}
                index={index}
                isSelected={index === safeIndex}
                onSelect={() => handleSceneSelect(scene)}
                onRequestMedia={() => {
                  handleSceneSelect(scene);
                  onRequestMediaForScene?.(scene.id);
                }}
                compact={compact}
              />
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
