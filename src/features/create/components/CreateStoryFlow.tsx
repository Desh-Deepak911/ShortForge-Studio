"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import BreakLongVideoSection from "@/components/BreakLongVideoSection";
import { AppShell } from "@/components/layout";
import { Card } from "@/components/ui";
import StoryComposer from "@/components/StoryComposer";
import StudioEmptyState from "@/components/StudioEmptyState";
import StudioLoadingState from "@/components/StudioLoadingState";
import { createDraft } from "@/features/drafts";
import { getAudioEngine } from "@/features/audio";
import { consumeGenerateScriptStream } from "@/lib/generateScriptStream";
import { SAMPLE_TOPICS, WORKFLOW_STEPS } from "@/lib/studioConstants";
import {
  studioPanel,
  studioSectionTitle,
  studioStepLabel,
} from "@/lib/studioUi";
import { attachVoiceoverToScript, syncFootieScript } from "@/lib/voiceover";
import type {
  GenerateScriptResponse,
  GenerationLoadingStep,
  QualityMode,
  Tone,
} from "@/types/footiebitz";
import { DEFAULT_SCENE_COUNT } from "@/types/footiebitz";

/**
 * Prompt entry, generation options, and post-success draft persistence.
 * Generation API handling is unchanged from the original single-page studio flow.
 */
export default function CreateStoryFlow() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("dramatic");
  const [duration, setDuration] = useState<number>(30);
  const [qualityMode, setQualityMode] = useState<QualityMode>("cheap");
  const [sceneCount, setSceneCount] = useState<number>(DEFAULT_SCENE_COUNT);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<GenerationLoadingStep>(1);
  const [error, setError] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBrief = useCallback(() => {
    document.getElementById("studio-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => topicInputRef.current?.focus(), 320);
  }, []);

  const generateScript = async () => {
    if (!topic.trim()) {
      setError("Enter a content brief first.");
      return;
    }

    setLoading(true);
    setLoadingStep(1);
    setError(null);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          duration,
          qualityMode,
          sceneCount,
          stream: true,
        }),
      });

      let data: GenerateScriptResponse;

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("ndjson")) {
        data = await consumeGenerateScriptStream(response, (step) => {
          setLoadingStep(step);
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

      let nextScript = syncFootieScript(data.data);

      const voiceoverBase64 =
        data.audioFirst?.voiceover?.audioBase64 ?? data.voiceoverAudioBase64;
      const voiceoverDurationMs =
        data.audioFirst?.voiceover?.durationMs ?? data.data.voiceoverDurationMs;

      if (voiceoverBase64) {
        nextScript = attachVoiceoverToScript(nextScript, {
          voiceoverUrl: getAudioEngine().materializeVoiceoverBase64(voiceoverBase64),
          voiceoverDurationMs,
          voiceSettings: data.audioFirst?.voiceover?.metadata
            ? {
                ...(data.audioFirst.voiceover.metadata.voice
                  ? { voice: data.audioFirst.voiceover.metadata.voice }
                  : {}),
                ...(data.audioFirst.voiceover.metadata.speed != null
                  ? { speed: data.audioFirst.voiceover.metadata.speed }
                  : {}),
              }
            : undefined,
        });
      } else if (voiceoverDurationMs != null && voiceoverDurationMs > 0) {
        nextScript = { ...nextScript, voiceoverDurationMs };
      }

      const draft = createDraft({
        script: nextScript,
        creationBrief: {
          topic: topic.trim(),
          tone,
          duration,
          qualityMode,
          sceneCount,
        },
        prompt: topic.trim(),
      });

      router.push(`/editor/${draft.id}`);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
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
      {!loading && <StudioEmptyState onGenerate={handleGenerateStory} />}

      <div className="flex min-w-0 flex-col gap-4 sm:gap-7">
        {!loading && (
          <StoryComposer
            topic={topic}
            onTopicChange={setTopic}
            topicInputRef={topicInputRef}
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
          />
        )}

        {!loading && (
          <Card>
            <p className={studioStepLabel}>Workflow</p>
            <h2 className={`${studioSectionTitle} mt-2`}>How it works</h2>
            <div className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3">
              {WORKFLOW_STEPS.map((item) => (
                <div
                  key={item.step}
                  className={`${studioPanel} transition hover:bg-surface-elevated/40 hover:ring-border/30`}
                >
                  <span className="text-xs font-medium text-muted">{item.step}</span>
                  <p className="mt-2 text-sm font-medium text-foreground/90">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {loading && (
          <StudioLoadingState
            topic={topic}
            tone={tone}
            duration={duration}
            loadingStep={loadingStep}
          />
        )}

        {!loading && <BreakLongVideoSection />}
      </div>
    </AppShell>
  );
}
