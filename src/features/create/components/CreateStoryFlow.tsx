"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { ResearchPreviewDevCall } from "@/features/create/types/research-preview-dev.types";
import {
  IDLE_RESEARCH_PREVIEW,
  type ResearchPreviewState,
} from "@/features/create/types/research-preview.types";
import { buildEntityPreviewFromExecution } from "@/features/create/utils/entity-preview-from-execution.utils";
import { resolveResearchPreviewStatusFromPreview } from "@/features/create/utils/research-preview-assembled.utils";
import { buildGenerateScriptResearchPreview } from "@/features/create/utils/research-preview.utils";
import { fetchIntelligenceResearch } from "@/features/create/utils/research-preview-intelligence.client.utils";
import { intelligenceQueryToAnalysis } from "@/features/intelligence/shared/intelligence-analysis.utils";

import BreakLongVideoSection from "@/components/BreakLongVideoSection";
import { StudioShell, StudioSection } from "@/components/studio-shell";
import StudioLoadingState from "@/components/StudioLoadingState";
import BriefCanvas from "@/features/create/components/BriefCanvas";
import CreateBriefInspector from "@/features/create/components/CreateBriefInspector";
import CreateStudioHeader from "@/features/create/components/CreateStudioHeader";
import {
  applyCreatorTemplateToBrief,
  getCreatorTemplate,
  mergeCreationBriefWithTemplateSelection,
  type CreatorTemplateId,
} from "@/features/creator-templates";
import { createDraft } from "@/features/drafts";
import type { StoryCreationBrief } from "@/features/drafts/types";
import { seedDraftSession } from "@/features/drafts/session";
import {
  reconcileHookStyleSelection,
  validateWriteMyOwnOpening,
  type HookStyleSelection,
} from "@/features/hook-engine/presentation";
import {
  reconcileStoryStrategySelection,
  type StoryStrategySelection,
} from "@/features/retention-story/presentation";
import { normalizeNarrationForEditing } from "@/features/story/utils/narration-editing.utils";
import { consumeGenerateScriptStream } from "@/lib/utils/generateScriptStream";
import { SAMPLE_TOPICS, WORKFLOW_STEPS } from "@/lib/constants/studioConstants";
import { studioPanel, studioSubtleText } from "@/lib/utils/studioUi";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type {
  GenerateScriptResponse,
  QualityMode,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";
import {
  DEFAULT_SCENE_COUNT,
  DEFAULT_SCRIPT_MODE,
} from "@/types/footiebitz";

/**
 * Prompt entry, generation options, and post-success draft persistence.
 * Generation API handling is unchanged from the original single-page studio flow.
 */
export default function CreateStoryFlow() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [scriptMode, setScriptMode] = useState<ScriptMode>(DEFAULT_SCRIPT_MODE);
  const [context, setContext] = useState("");
  // Smart Research is an explicit creator choice. Never auto-enable a
  // provider-backed feature when its providers may not be configured.
  const [enableResearch, setEnableResearch] = useState(false);
  const [tone, setTone] = useState<Tone>("dramatic");
  const [duration, setDuration] = useState<number>(30);
  const [qualityMode, setQualityMode] = useState<QualityMode>("cheap");
  const [sceneCount, setSceneCount] = useState<number>(DEFAULT_SCENE_COUNT);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    CreatorTemplateId | ""
  >("");
  const [storyStrategy, setStoryStrategy] =
    useState<StoryStrategySelection>("auto");
  const [
    storyStrategyCompatibilityNotice,
    setStoryStrategyCompatibilityNotice,
  ] = useState<string | null>(null);
  const [hookStyle, setHookStyle] = useState<HookStyleSelection>("auto");
  const [userAuthoredHook, setUserAuthoredHook] = useState("");
  const [hookStyleCompatibilityNotice, setHookStyleCompatibilityNotice] =
    useState<string | null>(null);
  const [factHandlingMode, setFactHandlingMode] = useState<
    "verified_facts_only" | "creative_premise"
  >("verified_facts_only");
  const [premiseDetails, setPremiseDetails] = useState("");
  const [reliabilityMode, setReliabilityMode] = useState<
    "flexible" | "precise"
  >("flexible");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchPreview, setResearchPreview] = useState<ResearchPreviewState>(
    IDLE_RESEARCH_PREVIEW,
  );
  const topicInputRef = useRef<HTMLTextAreaElement>(null);

  const resetResearchPreview = useCallback(() => {
    setResearchPreview(IDLE_RESEARCH_PREVIEW);
  }, []);

  const scrollToBrief = useCallback(() => {
    document
      .getElementById("studio-brief")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => topicInputRef.current?.focus(), 320);
  }, []);

  const handleScriptModeChange = useCallback(
    (mode: ScriptMode) => {
      setScriptMode(mode);
      const reconciled = reconcileHookStyleSelection(hookStyle, mode);
      setHookStyle(reconciled.selection);
      setHookStyleCompatibilityNotice(reconciled.compatibilityNotice);
      resetResearchPreview();
    },
    [hookStyle, resetResearchPreview],
  );

  const handleDurationChange = useCallback(
    (nextDuration: number) => {
      setDuration(nextDuration);
      const reconciled = reconcileStoryStrategySelection(
        storyStrategy,
        nextDuration,
      );
      setStoryStrategy(reconciled.selection);
      setStoryStrategyCompatibilityNotice(reconciled.compatibilityNotice);
    },
    [storyStrategy],
  );

  const handleStoryStrategyChange = useCallback(
    (selection: StoryStrategySelection) => {
      setStoryStrategy(selection);
      setStoryStrategyCompatibilityNotice(null);
    },
    [],
  );

  const handleHookStyleChange = useCallback((selection: HookStyleSelection) => {
    setHookStyle(selection);
    setHookStyleCompatibilityNotice(null);
    if (selection !== "user_written") {
      setUserAuthoredHook("");
    }
  }, []);

  const buildCurrentCreationBrief = useCallback((): StoryCreationBrief => {
    return {
      topic: topic.trim(),
      tone,
      duration,
      qualityMode,
      sceneCount,
      scriptMode,
      enableResearch,
      ...(context.trim() ? { context: context.trim() } : {}),
      ...(storyStrategy !== "auto" ? { formatStrategyId: storyStrategy } : {}),
      ...(hookStyle !== "auto" ? { hookStyle } : {}),
      factHandlingMode,
      ...(factHandlingMode === "creative_premise" && premiseDetails.trim()
        ? { premiseDetails: premiseDetails.trim() }
        : {}),
    };
  }, [
    context,
    duration,
    enableResearch,
    factHandlingMode,
    hookStyle,
    premiseDetails,
    qualityMode,
    sceneCount,
    scriptMode,
    storyStrategy,
    tone,
    topic,
  ]);

  const handleTemplateChange = useCallback(
    (templateId: CreatorTemplateId | "") => {
      if (!templateId) {
        setSelectedTemplateId("");
        return;
      }

      const template = getCreatorTemplate(templateId);
      if (!template) {
        return;
      }

      setSelectedTemplateId(templateId);

      const nextBrief = applyCreatorTemplateToBrief(
        buildCurrentCreationBrief(),
        template,
      );
      const nextScriptMode = nextBrief.scriptMode ?? DEFAULT_SCRIPT_MODE;

      setScriptMode(nextScriptMode);
      setDuration(nextBrief.duration);
      setSceneCount(nextBrief.sceneCount);
      // Template must not overwrite a compatible explicit Hook Style; reset only if incompatible.
      const reconciledHook = reconcileHookStyleSelection(
        hookStyle,
        nextScriptMode,
      );
      setHookStyle(reconciledHook.selection);
      setHookStyleCompatibilityNotice(reconciledHook.compatibilityNotice);
      // Duration from template may invalidate explicit Story Strategy — reset to Auto.
      const reconciledStrategy = reconcileStoryStrategySelection(
        storyStrategy,
        nextBrief.duration,
      );
      setStoryStrategy(reconciledStrategy.selection);
      setStoryStrategyCompatibilityNotice(
        reconciledStrategy.compatibilityNotice,
      );
      resetResearchPreview();
    },
    [buildCurrentCreationBrief, hookStyle, resetResearchPreview, storyStrategy],
  );

  const runIntelligenceResearch = useCallback(async () => {
    if (!enableResearch) {
      setResearchPreview({
        status: "error",
        errorMessage: "Enable Smart Research to gather supporting information.",
      });
      return;
    }

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setResearchPreview({
        status: "error",
        errorMessage: "Enter a topic before running Research Preview.",
      });
      return;
    }

    setResearchPreview({
      status: "loading",
    });

    try {
      const isDev = process.env.NODE_ENV === "development";
      const researchStartedAt = performance.now();

      const { ok, status, payload } = await fetchIntelligenceResearch({
        topic: trimmedTopic,
        mode: scriptMode,
        manualContext: context.trim() || undefined,
      });

      const researchFinishedAt = performance.now();
      const assembledContext = payload.assembledContext;

      if (!assembledContext || !payload.intelligenceQuery) {
        throw new Error("Research returned no supporting information.");
      }

      const intelligenceQuery = payload.intelligenceQuery;
      const intelligenceAnalysis =
        intelligenceQueryToAnalysis(intelligenceQuery);

      const devCalls: ResearchPreviewDevCall[] | undefined = isDev
        ? [
            {
              endpoint: "/api/research-football",
              status,
              ok,
              durationMs: Math.round(researchFinishedAt - researchStartedAt),
            },
          ]
        : undefined;

      setResearchPreview({
        status: resolveResearchPreviewStatusFromPreview({
          assembledContext,
          executionStatus: payload.executionStatus,
          httpOk: ok,
        }),
        topic: trimmedTopic,
        mode: scriptMode,
        intelligenceAnalysis,
        intelligenceQuery,
        assembledContext,
        executionStatus: payload.executionStatus,
        entityPreview: buildEntityPreviewFromExecution({
          intelligenceQuery,
          assembledContext,
        }),
        ...(isDev && payload.providerResults
          ? { providerResults: payload.providerResults }
          : {}),
        ...(isDev && payload.providerDiagnostics
          ? { providerDiagnostics: payload.providerDiagnostics }
          : {}),
        ...(isDev && payload.providerExecutionSummary
          ? { providerExecutionSummary: payload.providerExecutionSummary }
          : {}),
        ...(isDev && payload.canonicalResearchBundle
          ? { canonicalResearchBundle: payload.canonicalResearchBundle }
          : {}),
        ...(isDev && payload.knowledgeGraph
          ? { knowledgeGraph: payload.knowledgeGraph }
          : {}),
        ...(isDev && payload.graphContext
          ? { graphContext: payload.graphContext }
          : {}),
        ...(devCalls ? { devCalls } : {}),
        ...(ok
          ? {}
          : {
              errorMessage:
                assembledContext.warnings[0] ??
                "Research couldn't be completed for this topic.",
            }),
      });
    } catch (err) {
      setResearchPreview({
        status: "error",
        errorMessage:
          err instanceof TypeError
            ? "Check your connection and try again."
            : err instanceof Error
              ? err.message
              : "Research isn't available right now. You can still write your story.",
      });
    }
  }, [context, enableResearch, scriptMode, topic]);

  const previewResearch = useCallback(async () => {
    await runIntelligenceResearch();
  }, [runIntelligenceResearch]);

  /** Re-runs preview via the same executor path — no cached query reuse on the client. */
  const refreshResearchPreview = useCallback(async () => {
    await runIntelligenceResearch();
  }, [runIntelligenceResearch]);

  const generateScript = async () => {
    if (!topic.trim()) {
      setError("Enter a topic first.");
      return;
    }

    if (hookStyle === "user_written") {
      const opening = validateWriteMyOwnOpening(userAuthoredHook);
      if (!opening.ok) {
        setError(opening.message);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const trimmedTopic = topic.trim();
      const manualContext = context.trim() || undefined;
      const researchPreviewPayload =
        buildGenerateScriptResearchPreview(researchPreview);
      const selectedTemplate = selectedTemplateId
        ? getCreatorTemplate(selectedTemplateId)
        : null;
      const creationBrief = mergeCreationBriefWithTemplateSelection(
        buildCurrentCreationBrief(),
        selectedTemplate,
      );
      const writeMyOwn =
        hookStyle === "user_written"
          ? validateWriteMyOwnOpening(userAuthoredHook)
          : null;

      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: trimmedTopic,
          scriptMode,
          context: manualContext,
          enableResearch,
          ...(researchPreviewPayload
            ? { researchPreview: researchPreviewPayload }
            : {}),
          tone,
          duration,
          qualityMode,
          sceneCount,
          mode: "script-only",
          stream: true,
          ...(creationBrief.templateId
            ? { templateId: creationBrief.templateId }
            : {}),
          ...(creationBrief.templatePromptHints
            ? { templatePromptHints: creationBrief.templatePromptHints }
            : {}),
          ...(storyStrategy !== "auto"
            ? { formatStrategyId: storyStrategy }
            : {}),
          ...(hookStyle !== "auto" ? { hookStyle } : {}),
          ...(writeMyOwn?.ok ? { userAuthoredHook: writeMyOwn.text } : {}),
          factHandlingMode,
          ...(factHandlingMode === "creative_premise" && premiseDetails.trim()
            ? { premiseDetails: premiseDetails.trim() }
            : {}),
          ...(reliabilityMode !== "flexible"
            ? { creationReliabilityMode: reliabilityMode }
            : {}),
        }),
      });

      let data: GenerateScriptResponse;

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("ndjson")) {
        data = await consumeGenerateScriptStream(response, () => {
          // Script-only generation — single-step loading UI; ignore pipeline progress.
        });
      } else {
        try {
          data = (await response.json()) as GenerateScriptResponse;
        } catch {
          throw new Error("Invalid response from server");
        }
      }

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error ?? "Failed to create story");
      }

      const nextScript = syncFootieScript({
        ...data.data,
        narration: normalizeNarrationForEditing(data.data.narration),
      });

      const draft = createDraft({
        script: nextScript,
        creationBrief: {
          ...creationBrief,
          // Persist original creator notes only — never overwrite with
          // assembled/generated research prose (Sprint 10H.4A).
          ...(context.trim() ? { context: context.trim() } : {}),
          ...(data.researchApplied ? { researchApplied: true } : {}),
          ...(data.researchWarning
            ? { researchWarning: data.researchWarning }
            : {}),
          ...(data.hookPlan ? { hookPlan: data.hookPlan } : {}),
          ...(data.retentionPlan ? { retentionPlan: data.retentionPlan } : {}),
          ...(data.retentionValidation
            ? { retentionValidation: data.retentionValidation }
            : {}),
          ...(data.generationDisposition
            ? { generationDisposition: data.generationDisposition }
            : {}),
          // Rewrite evidence lives on linked retentionValidation (10G.1) — do not
          // persist a standalone retentionRewriteUsed boolean as authority.
          ...(storyStrategy !== "auto"
            ? { formatStrategyId: storyStrategy }
            : {}),
          ...(hookStyle !== "auto" ? { hookStyle } : {}),
          factHandlingMode,
          ...(factHandlingMode === "creative_premise" && premiseDetails.trim()
            ? { premiseDetails: premiseDetails.trim() }
            : {}),
        },
        prompt: topic.trim(),
        pipelineStage: "script_review",
      });

      seedDraftSession(draft);
      router.replace(`/create/review/${draft.id}`);
      return;
    } catch (err) {
      setLoading(false);
      if (err instanceof TypeError) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
  };

  const trimmedTopic = topic.trim();
  const hasTopic = trimmedTopic.length > 0;
  const loadingShellClass = loading
    ? "pointer-events-none select-none opacity-60"
    : undefined;

  return (
    <StudioShell
      aria-label="Create story brief"
      viewportMode="document"
      compactMode
      focusMode={false}
      canvasCenterContent={false}
      header={
        <CreateStudioHeader
          loading={loading}
          hasTopic={hasTopic}
          onWriteStory={scrollToBrief}
        />
      }
      sidebar={
        <div className={loadingShellClass}>
          <StudioSection title="Your path">
            <ol className="space-y-1.5">
              {WORKFLOW_STEPS.map((item, index) => (
                <li
                  key={item.title}
                  className={`rounded-xl px-3 py-2.5 ${
                    index === 0
                      ? "bg-accent/10 ring-1 ring-accent/25"
                      : "bg-surface/25 ring-1 ring-border/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        index === 0 ? "bg-accent" : "bg-muted/40"
                      }`}
                    />
                    <p className="text-xs font-medium text-foreground/90">
                      {item.title}
                    </p>
                  </div>
                  {index === 0 ? (
                    <p className={`${studioSubtleText} mt-1 pl-4`}>
                      {item.desc}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </StudioSection>
        </div>
      }
      canvas={
        loading ? (
          <StudioLoadingState
            variant="create-story"
            enableResearch={enableResearch}
          />
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-6">
            <BriefCanvas
              topic={topic}
              onTopicChange={(value) => {
                setTopic(value);
                resetResearchPreview();
              }}
              topicInputRef={topicInputRef}
              scriptMode={scriptMode}
              onScriptModeChange={handleScriptModeChange}
              context={context}
              tone={tone}
              onToneChange={setTone}
              duration={duration}
              onDurationChange={handleDurationChange}
              storyStrategy={storyStrategy}
              onStoryStrategyChange={handleStoryStrategyChange}
              storyStrategyCompatibilityNotice={
                storyStrategyCompatibilityNotice
              }
              hookStyle={hookStyle}
              onHookStyleChange={handleHookStyleChange}
              userAuthoredHook={userAuthoredHook}
              onUserAuthoredHookChange={setUserAuthoredHook}
              selectedTemplateId={selectedTemplateId}
              onTemplateChange={handleTemplateChange}
              sceneCount={sceneCount}
              enableResearch={enableResearch}
              factHandlingMode={factHandlingMode}
              onFactHandlingModeChange={setFactHandlingMode}
              premiseDetails={premiseDetails}
              onPremiseDetailsChange={setPremiseDetails}
              reliabilityMode={reliabilityMode}
              onReliabilityModeChange={setReliabilityMode}
              hookStyleCompatibilityNotice={hookStyleCompatibilityNotice}
              sampleTopics={SAMPLE_TOPICS}
              loading={loading}
              error={error}
              onClearError={() => setError(null)}
              onUseAutoHook={() => {
                setHookStyle("auto");
                setUserAuthoredHook("");
                setHookStyleCompatibilityNotice(null);
              }}
              onSubmit={() => {
                void generateScript();
              }}
            />
            <BreakLongVideoSection />
          </div>
        )
      }
      inspector={
        <div className={loadingShellClass}>
          <CreateBriefInspector
            context={context}
            onContextChange={(value) => {
              setContext(value);
              resetResearchPreview();
            }}
            enableResearch={enableResearch}
            onEnableResearchChange={(enabled) => {
              setEnableResearch(enabled);
              resetResearchPreview();
            }}
            qualityMode={qualityMode}
            onQualityModeChange={setQualityMode}
            sceneCount={sceneCount}
            onSceneCountChange={setSceneCount}
            duration={duration}
            loading={loading}
            topic={topic}
            scriptMode={scriptMode}
            tone={tone}
            factHandlingMode={factHandlingMode}
            premiseDetails={premiseDetails}
            storyStrategy={storyStrategy}
            hookStyle={hookStyle}
            userAuthoredHook={userAuthoredHook}
            reliabilityMode={reliabilityMode}
            onApplyRecommendedSettings={(next) => {
              setQualityMode(next.qualityMode);
              setStoryStrategy(next.storyStrategy);
              setStoryStrategyCompatibilityNotice(null);
              setFactHandlingMode(next.factHandlingMode);
              setHookStyle(next.hookStyle);
              setHookStyleCompatibilityNotice(null);
              if (next.hookStyle !== "user_written") {
                setUserAuthoredHook("");
              }
              setReliabilityMode(next.reliabilityMode);
            }}
            researchPreview={researchPreview}
            entityPreview={researchPreview.entityPreview}
            onPreviewResearch={() => {
              void previewResearch();
            }}
            onRefreshResearchPreview={() => {
              void refreshResearchPreview();
            }}
          />
        </div>
      }
    />
  );
}
