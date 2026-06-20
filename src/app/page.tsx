"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import BreakLongVideoSection from "@/components/BreakLongVideoSection";
import StoryComposer from "@/components/StoryComposer";
import StudioEmptyState from "@/components/StudioEmptyState";
import StudioLoadingState from "@/components/StudioLoadingState";
import StoryWorkspace from "@/components/StoryWorkspace";
import StudioShell from "@/components/StudioShell";
import { applyStoryUpdate, syncFootieScript } from "@/lib/voiceover";
import {
  studioCard,
  studioPanel,
  studioSectionTitle,
  studioStepLabel,
} from "@/lib/studioUi";
import type {
  FootieScript,
  GenerateScriptResponse,
  QualityMode,
  Tone,
} from "@/types/footiebitz";

const SAMPLE_TOPICS = [
  "Top 5 matches to watch: USA vs Iran, Portugal vs Argentina, Morocco vs Senegal, England vs Spain, France vs Norway",
  "Real Madrid comeback",
  "Messi masterclass",
  "Champions League final drama",
  "Last-minute winner",
  "Derby day chaos",
] as const;

const WORKFLOW_STEPS = [
  { step: "01", title: "Story Brief", desc: "Describe your topic, duration, and tone" },
  { step: "02", title: "Story Draft", desc: "Refine the title and full narration" },
  { step: "03", title: "Production Timeline", desc: "Set scene timing, subtitles, and images" },
  { step: "04", title: "Narration", desc: "Generate spoken audio from your story" },
  { step: "05", title: "Preview", desc: "Review your vertical short before export" },
  { step: "06", title: "Export", desc: "Download a finished WebM short" },
] as const;

function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${studioCard} ${className}`}>
      {children}
    </section>
  );
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("dramatic");
  const [duration, setDuration] = useState<number>(30);
  const [qualityMode, setQualityMode] = useState<QualityMode>("cheap");
  const [script, setScript] = useState<FootieScript | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLTextAreaElement>(null);

  /** Legacy stories without timelineItems are upgraded for display and editing. */
  const studioScript = useMemo((): FootieScript | null => {
    if (!script) {
      return null;
    }

    if (script.timelineItems?.length || script.scenes.length === 0) {
      return script;
    }

    return syncFootieScript(script);
  }, [script]);

  const totalDuration = studioScript?.totalDuration ?? 0;

  const previewSceneIndex =
    studioScript && studioScript.scenes.length > 0
      ? Math.min(selectedSceneIndex, studioScript.scenes.length - 1)
      : 0;

  const handleStoryChange = useCallback((next: FootieScript) => {
    setScript((prev) => (prev ? applyStoryUpdate(prev, next) : syncFootieScript(next)));
  }, []);

  const scrollToBrief = useCallback(() => {
    document.getElementById("studio-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => topicInputRef.current?.focus(), 320);
  }, []);

  const scrollToExport = useCallback(() => {
    document.getElementById("studio-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const generateScript = async () => {
    if (!topic.trim()) {
      setError("Enter a content brief first.");
      return;
    }

    setLoading(true);
    setError(null);
    setScript(null);
    setSelectedSceneIndex(0);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), tone, duration, qualityMode }),
      });

      let data: GenerateScriptResponse;
      try {
        data = (await response.json()) as GenerateScriptResponse;
      } catch {
        throw new Error("Invalid response from server");
      }

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error ?? "Failed to create story");
      }

      setScript(syncFootieScript(data.data));
      setSelectedSceneIndex(0);
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
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="studio-grid pointer-events-none fixed inset-0 opacity-60" />

      <StudioShell
        hasProject={Boolean(studioScript) || loading}
        projectTitle={loading ? "New story" : studioScript?.title}
        projectMeta={
          loading
            ? "Building storyboard…"
            : studioScript
              ? `${totalDuration}s · ${studioScript.scenes.length} scenes`
              : undefined
        }
        loading={loading}
        onCreateStory={scrollToBrief}
        onExport={scrollToExport}
        createDisabled={loading}
        exportDisabled={!studioScript || studioScript.scenes.length === 0}
      >
        {!script && !loading && <StudioEmptyState onGenerate={handleGenerateStory} />}

        <div className="flex min-w-0 flex-col gap-4 sm:gap-7">
          {!script && !loading && (
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
              sampleTopics={SAMPLE_TOPICS}
              loading={loading}
              error={error}
              onClearError={() => setError(null)}
              onSubmit={generateScript}
            />
          )}

          {!script && !loading && (
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
            <StudioLoadingState topic={topic} tone={tone} duration={duration} />
          )}

          {script && studioScript && !loading && (
            <StoryWorkspace
              script={studioScript}
              onScriptChange={handleStoryChange}
              selectedSceneIndex={previewSceneIndex}
              onSelectedSceneChange={setSelectedSceneIndex}
              onScrollToExport={scrollToExport}
            />
          )}

          {!script && !loading && <BreakLongVideoSection />}
        </div>
      </StudioShell>
    </div>
  );
}
