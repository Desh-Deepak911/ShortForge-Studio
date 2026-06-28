"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type {
  ResearchPreviewDevCall,
} from "@/features/create/types/research-preview-dev.types";
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
import { AppShell } from "@/components/layout";
import { Card } from "@/components/ui";
import StoryComposer from "@/components/StoryComposer";
import StudioEmptyState from "@/components/StudioEmptyState";
import StudioLoadingState from "@/components/StudioLoadingState";
import { createDraft } from "@/features/drafts";
import { seedDraftSession } from "@/features/drafts/session";
import { consumeGenerateScriptStream } from "@/lib/generateScriptStream";
import { SAMPLE_TOPICS, WORKFLOW_STEPS } from "@/lib/studioConstants";
import {
  studioPanel,
  studioSectionTitle,
  studioStepLabel,
} from "@/lib/studioUi";
import { syncFootieScript } from "@/lib/voiceover";
import type {
  GenerateScriptResponse,
  QualityMode,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";
import { DEFAULT_SCENE_COUNT, DEFAULT_SCRIPT_MODE, isResearchDefaultEnabledForScriptMode } from "@/types/footiebitz";

/**
 * Prompt entry, generation options, and post-success draft persistence.
 * Generation API handling is unchanged from the original single-page studio flow.
 */
export default function CreateStoryFlow() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [scriptMode, setScriptMode] = useState<ScriptMode>(DEFAULT_SCRIPT_MODE);
  const [context, setContext] = useState("");
  const [enableResearch, setEnableResearch] = useState(() =>
    isResearchDefaultEnabledForScriptMode(DEFAULT_SCRIPT_MODE),
  );
  const [tone, setTone] = useState<Tone>("dramatic");
  const [duration, setDuration] = useState<number>(30);
  const [qualityMode, setQualityMode] = useState<QualityMode>("cheap");
  const [sceneCount, setSceneCount] = useState<number>(DEFAULT_SCENE_COUNT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchPreview, setResearchPreview] = useState<ResearchPreviewState>(IDLE_RESEARCH_PREVIEW);
  const topicInputRef = useRef<HTMLTextAreaElement>(null);

  const resetResearchPreview = useCallback(() => {
    setResearchPreview(IDLE_RESEARCH_PREVIEW);
  }, []);

  const scrollToBrief = useCallback(() => {
    document.getElementById("studio-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => topicInputRef.current?.focus(), 320);
  }, []);

  const handleScriptModeChange = useCallback((mode: ScriptMode) => {
    setScriptMode(mode);
    setEnableResearch(isResearchDefaultEnabledForScriptMode(mode));
    resetResearchPreview();
  }, [resetResearchPreview]);

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
        const intelligenceAnalysis = intelligenceQueryToAnalysis(intelligenceQuery);

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
          ...(isDev && payload.providerResults ? { providerResults: payload.providerResults } : {}),
          ...(isDev && payload.providerDiagnostics
            ? { providerDiagnostics: payload.providerDiagnostics }
            : {}),
          ...(isDev && payload.providerExecutionSummary
            ? { providerExecutionSummary: payload.providerExecutionSummary }
            : {}),
          ...(isDev && payload.canonicalResearchBundle
            ? { canonicalResearchBundle: payload.canonicalResearchBundle }
            : {}),
          ...(isDev && payload.knowledgeGraph ? { knowledgeGraph: payload.knowledgeGraph } : {}),
          ...(isDev && payload.graphContext ? { graphContext: payload.graphContext } : {}),
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

    setLoading(true);
    setError(null);

    try {
      const trimmedTopic = topic.trim();
      const manualContext = context.trim() || undefined;
      const researchPreviewPayload = buildGenerateScriptResearchPreview(researchPreview);

      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: trimmedTopic,
          scriptMode,
          context: manualContext,
          enableResearch,
          ...(researchPreviewPayload ? { researchPreview: researchPreviewPayload } : {}),
          tone,
          duration,
          qualityMode,
          sceneCount,
          mode: "script-only",
          stream: true,
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

      const nextScript = syncFootieScript(data.data);

      const draft = createDraft({
        script: nextScript,
        creationBrief: {
          topic: topic.trim(),
          tone,
          duration,
          qualityMode,
          sceneCount,
          scriptMode,
          enableResearch,
          ...(data.generationContext
            ? { context: data.generationContext }
            : context.trim()
              ? { context: context.trim() }
              : {}),
          ...(data.researchApplied ? { researchApplied: true } : {}),
          ...(data.researchWarning ? { researchWarning: data.researchWarning } : {}),
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

  const handleGenerateStory = () => {
    if (topic.trim()) {
      void generateScript();
      return;
    }
    scrollToBrief();
  };

  return (
    <AppShell
      hasProject={false}
      loading={loading}
      onCreateStory={scrollToBrief}
      onExport={scrollToBrief}
      createDisabled={loading}
      exportDisabled
    >
      {!loading && (
        <>
          <StoryComposer
            topic={topic}
            onTopicChange={(value) => {
              setTopic(value);
              resetResearchPreview();
            }}
            topicInputRef={topicInputRef}
            scriptMode={scriptMode}
            onScriptModeChange={handleScriptModeChange}
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
            tone={tone}
            onToneChange={setTone}
            duration={duration}
            onDurationChange={setDuration}
            qualityMode={qualityMode}
            onQualityModeChange={setQualityMode}
            sceneCount={sceneCount}
            onSceneCountChange={setSceneCount}
            sampleTopics={SAMPLE_TOPICS}
            loading={loading}
            error={error}
            onClearError={() => setError(null)}
            onSubmit={generateScript}
            researchPreview={researchPreview}
            entityPreview={researchPreview.entityPreview}
            onPreviewResearch={() => {
              void previewResearch();
            }}
            onRefreshResearchPreview={() => {
              void refreshResearchPreview();
            }}
          />

          <div className="hidden sm:block">
            <StudioEmptyState onGenerate={handleGenerateStory} />
          </div>

          <Card className="hidden lg:block">
            <p className={studioStepLabel}>Your path</p>
            <h2 className={`${studioSectionTitle} mt-2`}>From idea to export</h2>
            <div className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3">
              {WORKFLOW_STEPS.map((item) => (
                <div
                  key={item.title}
                  className={`${studioPanel} transition hover:bg-surface-elevated/40 hover:ring-border/30`}
                >
                  <p className="text-sm font-medium text-foreground/90">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {loading && (
        <StudioLoadingState
          variant="script-only"
          topic={topic}
          tone={tone}
          duration={duration}
        />
      )}

      {!loading && <BreakLongVideoSection />}
    </AppShell>
  );
}
