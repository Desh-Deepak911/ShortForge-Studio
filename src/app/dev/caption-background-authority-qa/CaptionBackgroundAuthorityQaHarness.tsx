"use client";

import { useEffect, useRef } from "react";

import CaptionPreviewOverlay from "@/features/caption-layout-drag/CaptionPreviewOverlay";
import {
  resolveCaptionBackgroundAuthority,
  resolveExportCaptionStyle,
  type CaptionStyle,
} from "@/features/caption-style";
import { drawExportSubtitlesCaption } from "@/features/export/utils/export-caption-canvas.utils";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CASES: Array<{
  id: string;
  label: string;
  style: Partial<CaptionStyle>;
  text: string;
}> = [
  {
    id: "off",
    label: "Background off",
    style: { backgroundEnabled: false, backgroundOpacity: 45, backgroundColor: "#000000" },
    text: "No box behind this caption",
  },
  {
    id: "zero",
    label: "Opacity 0%",
    style: { backgroundEnabled: true, backgroundOpacity: 0, backgroundColor: "#000000" },
    text: "Zero opacity still has no box",
  },
  {
    id: "ten",
    label: "Opacity 10%",
    style: { backgroundEnabled: true, backgroundOpacity: 10, backgroundColor: "#000000" },
    text: "Ten percent stays light",
  },
  {
    id: "forty-five",
    label: "Opacity 45%",
    style: { backgroundEnabled: true, backgroundOpacity: 45, backgroundColor: "#000000" },
    text: "Expected box at forty-five",
  },
];

function buildCaseStory(entry: (typeof CASES)[number]): FootieScript {
  return syncFootieScript({
    title: "Caption background QA",
    narration: entry.text,
    totalDuration: 3,
    scenes: [
      {
        id: `caption-bg-${entry.id}`,
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: entry.text,
        captionMode: "generated",
        captionStyle: entry.style,
        captionLayout: { version: 2, anchor: "bottom_center" },
        media: {
          type: "image",
          url: "/preview-runtime-parity/image-p.svg",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  } as FootieScript);
}

function CaseRow({ entry }: { entry: (typeof CASES)[number] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const story = buildCaseStory(entry);
  const scene = story.scenes[0]!;
  const authority = resolveCaptionBackgroundAuthority({
    sceneStyle: scene.captionStyle,
    sceneLayout: scene.captionLayout,
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.fillStyle = "#3a6b3a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawExportSubtitlesCaption({
      ctx,
      width: canvas.width,
      height: canvas.height,
      scale: canvas.width / 1080,
      display: {
        activeChunk: entry.text,
        lines: [entry.text],
        effect: "fade-up",
        sceneElapsedMs: 800,
        chunkElapsedMs: 800,
        activeChunkDurationMs: 2000,
        effectProgress: 1,
      },
      scene,
      script: story,
    });
  }, [entry.text, scene, story]);

  return (
    <section
      className="grid gap-4 rounded-lg border border-white/10 p-4 md:grid-cols-2"
      data-caption-background-case={entry.id}
    >
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">{entry.label}</h2>
        <div
          className="relative overflow-hidden bg-emerald-800"
          style={{ width: 270, height: 480 }}
          data-caption-background-preview={entry.id}
        >
          <CaptionPreviewOverlay
            scene={scene}
            script={story}
            pillClassName="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
            draggable={false}
          >
            <p className="preview-narration-subtitle-text">{entry.text}</p>
          </CaptionPreviewOverlay>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-white/70">Browser / Headless shared canvas draw</p>
        <canvas
          ref={canvasRef}
          width={270}
          height={480}
          className="block bg-emerald-800"
          data-caption-background-canvas={entry.id}
        />
        <pre
          className="mt-2 max-w-[270px] overflow-auto text-[10px] text-white/80"
          data-caption-background-manifest={entry.id}
        >
          {JSON.stringify(
            {
              backgroundEnabled: authority.backgroundEnabled,
              backgroundOpacity: authority.effectiveOpacityPercent,
              drawsFill: authority.drawsFill,
              drawsBorder: authority.drawsBorder,
              drawsBlur: authority.drawsBlur,
              drawsScrim: authority.drawsScrim,
              exportStyleEnabled: resolveExportCaptionStyle(scene, story).resolvedStyle
                .backgroundEnabled,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </section>
  );
}

export function CaptionBackgroundAuthorityQaHarness() {
  return (
    <main className="min-h-screen space-y-6 bg-zinc-950 p-6 text-white">
      <h1 className="text-lg font-semibold">Caption background authority</h1>
      <p className="max-w-2xl text-sm text-white/70">
        Local development only. Preview and the shared export canvas must agree: off and 0% have
        no box; 10% stays light; 45% keeps the authored fill. No blur, border, or scrim.
      </p>
      {CASES.map((entry) => (
        <CaseRow key={entry.id} entry={entry} />
      ))}
    </main>
  );
}
