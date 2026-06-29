"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import ScriptCanvas from "@/features/create/components/ScriptCanvas";
import ReviewInspector from "@/features/create/components/ReviewInspector";
import ReviewStudioHeader, {
  type ReviewPrimaryAction,
} from "@/features/create/components/ReviewStudioHeader";
import { StudioShell, StudioSection } from "@/components/studio-shell";
import { AppShell } from "@/components/layout";
import { getCanonicalVoiceover } from "@/features/audio";
import DraftLoadingState from "@/features/drafts/components/DraftLoadingState";
import { isEditorReadyDraft } from "@/features/drafts";
import { useReviewStoryDocument } from "@/features/drafts/hooks/useReviewStoryDocument";
import { useDraftPersistFeedback } from "@/features/drafts/hooks/useDraftPersistFeedback";
import type { Draft, DraftPersistedScript } from "@/features/drafts";
import type { FootieScript } from "@/features/story/types";
import {
  resolveBriefQualityLabel,
  resolveBriefResearchConfidenceLabel,
  resolveBriefToneLabel,
} from "@/features/create/utils/review-brief-display.utils";
import { consumeGenerateScriptStream } from "@/lib/utils/generateScriptStream";
import {
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioPanel,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { applyStoryUpdate, syncFootieScript } from "@/lib/utils/voiceover";
import type { GenerateScriptResponse, GenerationLoadingStep } from "@/types/footiebitz";
import {
  DEFAULT_SCENE_COUNT,
  MAX_SCENE_COUNT,
  MIN_SCENE_COUNT,
  resolveScriptMode,
  SCRIPT_MODE_OPTIONS,
} from "@/types/footiebitz";

interface ScriptReviewFlowProps {
  draftId: string;
}

type ReviewStep = 2 | 3 | 4 | 5;

const REVIEW_WORKFLOW_STEPS = [
  { key: "brief", title: "Brief", description: "Topic and settings" },
  { key: "script", title: "Script", description: "Title and narration" },
  { key: "narration", title: "Narration", description: "Spoken audio" },
  { key: "storyboard", title: "Storyboard", description: "Timed scenes" },
  { key: "editor", title: "Editor", description: "Visuals and export" },
] as const;

function resolveReviewWorkflowStepState(
  stepKey: (typeof REVIEW_WORKFLOW_STEPS)[number]["key"],
  activeStep: ReviewStep,
  hasVoiceover: boolean,
  hasStoryboard: boolean,
): "complete" | "current" | "upcoming" {
  if (stepKey === "brief") {
    return "complete";
  }
  if (stepKey === "script") {
    return activeStep === 2 ? "current" : "complete";
  }
  if (stepKey === "narration") {
    if (hasVoiceover) {
      return "complete";
    }
    return activeStep === 3 ? "current" : "upcoming";
  }
  if (stepKey === "storyboard") {
    if (hasStoryboard) {
      return "complete";
    }
    return activeStep === 4 || activeStep === 5 ? "current" : "upcoming";
  }
  if (hasStoryboard) {
    return activeStep === 5 ? "current" : "upcoming";
  }
  return "upcoming";
}

function logCreateScenes(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (details) {
    console.log(`[Create Scenes] ${message}`, details);
  } else {
    console.log(`[Create Scenes] ${message}`);
  }
}

function resolveReviewHasVoiceover(
  script: FootieScript,
  options?: {
    pipelineStage?: Draft["pipelineStage"];
    draftHasVoiceover?: boolean;
  },
): boolean {
  if (getCanonicalVoiceover(script)?.url) {
    return true;
  }

  if ((script as DraftPersistedScript).voiceoverAudioBase64) {
    return true;
  }

  if (
    options?.pipelineStage === "voiceover_ready" &&
    script.voiceoverDurationMs != null &&
    script.voiceoverDurationMs > 0
  ) {
    return true;
  }

  return Boolean(options?.draftHasVoiceover);
}

function resolveActiveReviewStep(
  script: FootieScript,
  pipelineStage?: Draft["pipelineStage"],
  draftHasVoiceover?: boolean,
): ReviewStep {
  if (script.scenes.length > 0 || pipelineStage === "editor_ready") {
    return 5;
  }

  if (resolveReviewHasVoiceover(script, { pipelineStage, draftHasVoiceover })) {
    return 4;
  }

  return 2;
}

function mergeStoryboardOntoScript(current: FootieScript, generated: FootieScript): FootieScript {
  return syncFootieScript({
    ...current,
    title: generated.title,
    narration: generated.narration,
    totalDuration: generated.totalDuration,
    scenes: generated.scenes,
    timelineItems: generated.timelineItems,
  });
}

function ScriptReviewFlowContent({ draftId }: ScriptReviewFlowProps) {
  const router = useRouter();
  const saveMessageTimeoutRef = useRef<number | null>(null);
  const scriptAutosaveReadyRef = useRef(false);
  const persistedVoiceoverUrlRef = useRef<string | undefined>(undefined);
  const isCreatingScenesRef = useRef(false);
  const {
    isLoading,
    isNotFound,
    draft: loadedDraft,
    script,
    updateScript,
    applyEditorReadyScript,
    setCreationBrief,
    schedulePersist,
    flushPersist,
  } = useReviewStoryDocument(draftId);
  const scriptRef = useRef(script);
  const loadedDraftRef = useRef(loadedDraft);

  useLayoutEffect(() => {
    scriptRef.current = script;
    loadedDraftRef.current = loadedDraft;
  }, [loadedDraft, script]);

  const { persistWarning, autosaveSavedMessage } = useDraftPersistFeedback(draftId);
  const [sceneCountOverride, setSceneCountOverride] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isCreatingScenes, setIsCreatingScenes] = useState(false);
  const [createScenesError, setCreateScenesError] = useState<string | null>(null);
  const [scenesCreatedSuccessfully, setScenesCreatedSuccessfully] = useState(false);
  const [storyboardStep, setStoryboardStep] = useState<GenerationLoadingStep>(3);
  const [voiceApplyControl, setVoiceApplyControl] = useState<{
    apply: () => void;
    canApply: boolean;
    loading: boolean;
    label: string;
  } | null>(null);

  const handleVoiceApplyControlReady = useCallback(
    (control: { apply: () => void; canApply: boolean; loading: boolean; label: string }) => {
      setVoiceApplyControl((previous) => {
        if (
          previous &&
          previous.canApply === control.canApply &&
          previous.loading === control.loading &&
          previous.label === control.label
        ) {
          return previous.apply === control.apply ? previous : control;
        }
        return control;
      });
    },
    [],
  );

  const creationBrief = loadedDraft?.creationBrief;
  const sceneCount =
    sceneCountOverride ?? loadedDraft?.creationBrief?.sceneCount ?? DEFAULT_SCENE_COUNT;
  const pipelineStage = loadedDraft?.pipelineStage;

  const activeStep = script
    ? resolveActiveReviewStep(script, pipelineStage, loadedDraft?.hasVoiceover)
    : 2;
  const hasVoiceover = Boolean(
    script &&
      resolveReviewHasVoiceover(script, {
        pipelineStage,
        draftHasVoiceover: loadedDraft?.hasVoiceover,
      }),
  );
  const hasStoryboard = Boolean(script && script.scenes.length > 0);
  const hasNarration = Boolean(script?.narration?.trim());
  const scriptMode = resolveScriptMode(creationBrief?.scriptMode);
  const scriptModeLabel =
    SCRIPT_MODE_OPTIONS.find((option) => option.value === scriptMode)?.label ?? "Story";
  const researchConfidenceLabel = resolveBriefResearchConfidenceLabel(creationBrief);
  const briefToneLabel = resolveBriefToneLabel(creationBrief?.tone);
  const briefQualityLabel = resolveBriefQualityLabel(creationBrief?.qualityMode);
  const targetDurationSeconds = creationBrief?.duration ?? script?.totalDuration ?? 30;
  const voiceoverDurationMs =
    script != null
      ? getCanonicalVoiceover(script)?.durationMs ?? script.voiceoverDurationMs
      : undefined;
  const scriptVoiceoverUrl =
    script != null ? getCanonicalVoiceover(script)?.url : undefined;

  useEffect(() => {
    if (isLoading || isCreatingScenesRef.current || !loadedDraftRef.current) {
      return;
    }

    persistedVoiceoverUrlRef.current = getCanonicalVoiceover(scriptRef.current ?? undefined)?.url;
    scriptAutosaveReadyRef.current = false;
  }, [isLoading, loadedDraft?.id]);

  useEffect(() => {
    if (isLoading || isCreatingScenesRef.current || !loadedDraft) {
      return;
    }

    if (isEditorReadyDraft(loadedDraft)) {
      router.replace(`/editor/${draftId}`);
    }
  }, [draftId, isLoading, loadedDraft, router]);

  useEffect(() => {
    const currentScript = scriptRef.current;
    if (
      !currentScript ||
      isCreatingScenesRef.current ||
      currentScript.scenes.length > 0 ||
      pipelineStage === "editor_ready"
    ) {
      return;
    }

    if (!scriptAutosaveReadyRef.current) {
      scriptAutosaveReadyRef.current = true;
      return;
    }

    schedulePersist("script_review");

    setSaveMessage("Story saved.");

    if (saveMessageTimeoutRef.current != null) {
      window.clearTimeout(saveMessageTimeoutRef.current);
    }

    saveMessageTimeoutRef.current = window.setTimeout(() => {
      setSaveMessage(null);
    }, 2500);
  }, [pipelineStage, schedulePersist, script?.title, script?.narration, script?.scenes.length]);

  useEffect(() => {
    const currentScript = scriptRef.current;
    if (
      !currentScript ||
      isCreatingScenesRef.current ||
      currentScript.scenes.length > 0 ||
      pipelineStage === "editor_ready"
    ) {
      return;
    }

    const voiceoverUrl = getCanonicalVoiceover(currentScript)?.url;
    if (!voiceoverUrl) {
      return;
    }

    const isUnpersistedEphemeral =
      voiceoverUrl.startsWith("blob:") &&
      voiceoverUrl !== persistedVoiceoverUrlRef.current;

    if (!isUnpersistedEphemeral) {
      persistedVoiceoverUrlRef.current = voiceoverUrl;
      return;
    }

    persistedVoiceoverUrlRef.current = voiceoverUrl;
    schedulePersist("voiceover_ready");
    setSaveMessage("Narration saved.");
  }, [pipelineStage, schedulePersist, scriptVoiceoverUrl]);

  const handleStoryChange = useCallback(
    (next: FootieScript) => {
      updateScript((current) => syncFootieScript(applyStoryUpdate(current, next)));
      setSaveMessage(null);
    },
    [updateScript],
  );

  const handleSceneCountChange = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) {
        return;
      }

      const nextCount = Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, Math.round(value)));
      setSceneCountOverride(nextCount);

      if (!creationBrief) {
        return;
      }

      setCreationBrief({ ...creationBrief, sceneCount: nextCount });
    },
    [creationBrief, setCreationBrief],
  );

  const handleOpenEditor = useCallback(() => {
    if (!script || script.scenes.length === 0) {
      setCreateScenesError("Build your storyboard before opening the editor.");
      return;
    }

    setCreateScenesError(null);
    router.push(`/editor/${draftId}`);
    void flushPersist("editor_ready");
  }, [draftId, flushPersist, router, script]);

  const handleCreateScenes = useCallback(async () => {
    if (!script || !creationBrief) {
      setCreateScenesError("Missing brief. Start again from Create.");
      return;
    }

    const measuredVoiceoverDurationMs =
      getCanonicalVoiceover(script)?.durationMs ?? script.voiceoverDurationMs;
    if (!measuredVoiceoverDurationMs || measuredVoiceoverDurationMs <= 0) {
      setCreateScenesError("Create narration first — your storyboard is timed to match it.");
      return;
    }

    isCreatingScenesRef.current = true;
    setIsCreatingScenes(true);
    setCreateScenesError(null);
    setScenesCreatedSuccessfully(false);
    setStoryboardStep(3);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scenes-only",
          topic: creationBrief.topic,
          title: script.title,
          narration: script.narration,
          voiceoverDurationMs: measuredVoiceoverDurationMs,
          tone: creationBrief.tone,
          duration: creationBrief.duration,
          qualityMode: creationBrief.qualityMode,
          sceneCount,
          stream: true,
        }),
      });

      let data: GenerateScriptResponse;

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("ndjson")) {
        data = await consumeGenerateScriptStream(response, (step) => {
          setStoryboardStep(step);
        });
      } else {
        data = (await response.json()) as GenerateScriptResponse;
      }

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error ?? "Failed to build storyboard");
      }

      logCreateScenes("scenes API success", {
        sceneCount: data.data.scenes.length,
      });

      const nextScriptWithScenes = mergeStoryboardOntoScript(script, data.data);
      scriptAutosaveReadyRef.current = true;

      applyEditorReadyScript(nextScriptWithScenes);
      setScenesCreatedSuccessfully(true);
      isCreatingScenesRef.current = false;
      setIsCreatingScenes(false);

      router.push(`/editor/${draftId}`);

      void flushPersist("editor_ready", nextScriptWithScenes);
    } catch (error) {
      isCreatingScenesRef.current = false;
      setIsCreatingScenes(false);
      setScenesCreatedSuccessfully(false);
      setCreateScenesError(
        error instanceof Error ? error.message : "Failed to build storyboard",
      );
    }
  }, [applyEditorReadyScript, creationBrief, draftId, flushPersist, router, sceneCount, script]);

  const handlePrimaryAction = useCallback(() => {
    if (hasStoryboard || scenesCreatedSuccessfully) {
      handleOpenEditor();
      return;
    }

    if (hasVoiceover && voiceoverDurationMs && voiceoverDurationMs > 0) {
      void handleCreateScenes();
      return;
    }

    voiceApplyControl?.apply();
  }, [
    handleCreateScenes,
    handleOpenEditor,
    hasStoryboard,
    hasVoiceover,
    scenesCreatedSuccessfully,
    voiceApplyControl,
    voiceoverDurationMs,
  ]);

  let primaryAction: ReviewPrimaryAction;

  if (isCreatingScenes) {
    primaryAction = {
      label: "Building storyboard",
      onClick: handlePrimaryAction,
      disabled: true,
      loading: true,
    };
  } else if (hasStoryboard || scenesCreatedSuccessfully) {
    primaryAction = {
      label: "Open Editor",
      onClick: handlePrimaryAction,
      disabled: false,
    };
  } else if (hasVoiceover && voiceoverDurationMs && voiceoverDurationMs > 0) {
    primaryAction = {
      label: "Build Storyboard",
      onClick: handlePrimaryAction,
      disabled: !hasNarration,
      disabledReason: !hasNarration
        ? "Add script text in the canvas before building your storyboard."
        : undefined,
    };
  } else {
    primaryAction = {
      label: voiceApplyControl?.label ?? "Create Narration",
      onClick: handlePrimaryAction,
      disabled: !voiceApplyControl?.canApply || Boolean(voiceApplyControl?.loading),
      loading: voiceApplyControl?.loading,
      disabledReason: !hasNarration
        ? "Add script text in the canvas before creating narration."
        : undefined,
    };
  }

  useEffect(() => {
    return () => {
      if (saveMessageTimeoutRef.current != null) {
        window.clearTimeout(saveMessageTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return <DraftLoadingState />;
  }

  if (isNotFound || !loadedDraft || !script) {
    return (
      <AppShell
        hasProject={false}
        onCreateStory={() => router.push("/create")}
        onExport={() => undefined}
        exportDisabled
      >
        <div className={`${studioPanel} mx-auto max-w-lg space-y-5 px-5 py-10 text-center sm:px-8 sm:py-12`}>
          <h1 className={studioSectionTitle}>Draft not found</h1>
          <p className={studioSectionDesc}>
            This project could not be found. It may have been deleted or saved in another browser.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/drafts" className={studioPrimaryButton}>
              View drafts
            </Link>
            <Link href="/create" className={studioSecondaryButton}>
              Create
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <StudioShell
      aria-label="Script review"
      canvasCenterContent={false}
      header={
        <ReviewStudioHeader
          projectTitle={script.title}
          primaryAction={primaryAction}
          persistWarning={persistWarning}
        />
      }
      sidebar={
        <StudioSection title="Workflow" description="Brief through editor.">
          <ol className="space-y-2">
            {REVIEW_WORKFLOW_STEPS.map((step) => {
              const state = resolveReviewWorkflowStepState(
                step.key,
                activeStep,
                hasVoiceover,
                hasStoryboard || scenesCreatedSuccessfully,
              );

              return (
                <li
                  key={step.key}
                  className={`${studioPanel} ${
                    state === "current" ? "ring-1 ring-accent/30" : ""
                  } ${state === "complete" ? "opacity-80" : ""}`}
                >
                  <p className="text-sm font-medium text-foreground/90">{step.title}</p>
                  <p className={`${studioSubtleText} mt-1`}>{step.description}</p>
                </li>
              );
            })}
          </ol>
        </StudioSection>
      }
      canvas={
        <ScriptCanvas
          script={script}
          onStoryChange={handleStoryChange}
          targetDurationSeconds={targetDurationSeconds}
          saveMessage={saveMessage}
          autosaveSavedMessage={autosaveSavedMessage}
        />
      }
      inspector={
        <ReviewInspector
          script={script}
          onScriptChange={handleStoryChange}
          creationBrief={creationBrief}
          scriptMode={scriptMode}
          scriptModeLabel={scriptModeLabel}
          targetDurationSeconds={targetDurationSeconds}
          researchConfidenceLabel={researchConfidenceLabel}
          briefToneLabel={briefToneLabel}
          briefQualityLabel={briefQualityLabel}
          sceneCount={sceneCount}
          onSceneCountChange={handleSceneCountChange}
          hasVoiceover={hasVoiceover}
          voiceoverDurationMs={voiceoverDurationMs}
          hasStoryboard={hasStoryboard}
          hasNarration={hasNarration}
          isCreatingScenes={isCreatingScenes}
          scenesCreatedSuccessfully={scenesCreatedSuccessfully}
          storyboardStep={storyboardStep}
          createScenesError={createScenesError}
          voiceControlsDisabled={isCreatingScenes}
          onVoiceApplyControlReady={handleVoiceApplyControlReady}
        />
      }
    />
  );
}

export default function ScriptReviewFlow({ draftId }: ScriptReviewFlowProps) {
  return <ScriptReviewFlowContent key={draftId} draftId={draftId} />;
}
