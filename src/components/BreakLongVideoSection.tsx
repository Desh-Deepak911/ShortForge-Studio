"use client";

import {
  AudioLines,
  Clapperboard,
  FileVideo,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import {
  studioBadge,
  studioCard,
  studioFieldLabel,
  studioIconBox,
  studioPanel,
  studioSecondaryButton,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioUploadZone,
} from "@/lib/utils/studioUi";

const COMING_SOON_MESSAGE = `Coming soon: ${PRODUCT_NAME} will extract audio, detect key moments, and create multiple shorts from one upload.`;

const PIPELINE_STEPS = [
  { step: "1", title: "Upload video", icon: Upload },
  { step: "2", title: "Extract audio", icon: AudioLines },
  { step: "3", title: "Transcribe", icon: FileVideo },
  { step: "4", title: "Detect best moments", icon: Wand2 },
  { step: "5", title: "Create short stories", icon: Sparkles },
  { step: "6", title: "Export multiple clips", icon: Clapperboard },
] as const;

export default function BreakLongVideoSection() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const managedBlobUrl = useRef<string | null>(null);

  const revokeVideoUrl = () => {
    if (managedBlobUrl.current) {
      URL.revokeObjectURL(managedBlobUrl.current);
      managedBlobUrl.current = null;
    }
  };

  const handleVideoUpload = (file: File | null) => {
    revokeVideoUrl();
    setAnalyzeMessage(null);

    if (!file) {
      setVideoUrl(null);
      setVideoName(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    managedBlobUrl.current = objectUrl;
    setVideoUrl(objectUrl);
    setVideoName(file.name);
  };

  useEffect(() => {
    return () => revokeVideoUrl();
  }, []);

  return (
    <section className={studioCard}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={studioIconBox}>
            <Scissors className="h-4.5 w-4.5 text-muted" strokeWidth={1.75} />
          </div>
          <div>
            <p className={studioStepLabel}>Coming soon</p>
            <h2 className={studioSectionTitle}>
              Break Long Video into Shorts
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Upload a full match or podcast clip and turn highlights into multiple vertical
              shorts.
            </p>
          </div>
        </div>
        <span className={`${studioBadge} self-start uppercase tracking-wide`}>
          Preview
        </span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className={`${studioFieldLabel} mb-3`}>Source video</p>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-border/30">
                  <video
                    src={videoUrl}
                    controls
                    className="aspect-video w-full bg-black object-contain"
                  >
                    Your browser does not support video preview.
                  </video>
                </div>
                {videoName && (
                  <p className="truncate text-xs text-muted">{videoName}</p>
                )}
                <label className={`${studioSecondaryButton} cursor-pointer`}>
                  <Upload className="h-4 w-4" />
                  Replace video
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      handleVideoUpload(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className={studioUploadZone}>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-elevated ring-1 ring-border/25">
                  <Upload className="h-5 w-5 text-muted" />
                </div>
                <p className="text-sm font-medium text-foreground/90">Upload a video file</p>
                <p className="mt-1.5 text-xs text-muted">MP4, MOV, or WEBM · processed in your browser</p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleVideoUpload(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAnalyzeMessage(COMING_SOON_MESSAGE)}
            disabled={!videoUrl}
            className={`${studioSecondaryButton} w-full sm:w-auto`}
          >
            <Wand2 className="h-4 w-4" strokeWidth={1.75} />
            Analyze Video
          </button>

          {analyzeMessage && (
            <div className={`${studioPanel} text-sm leading-relaxed text-muted`}>
              <p>{analyzeMessage}</p>
            </div>
          )}
        </div>

        <div>
          <p className={`${studioFieldLabel} mb-4`}>What&apos;s next</p>
          <ol className="space-y-2">
            {PIPELINE_STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.step}
                  className={`${studioPanel} flex items-center gap-3`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-elevated/60 text-xs font-medium text-muted ring-1 ring-border/25">
                    {item.step}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="text-sm font-medium text-muted">{item.title}</span>
                </li>
              );
            })}
          </ol>
          <p className={`${studioSubtleText} mt-4`}>
            Video analysis will run client-side or via dedicated APIs in a future release.
          </p>
        </div>
      </div>
    </section>
  );
}
