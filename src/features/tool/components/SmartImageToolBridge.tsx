"use client";

import { ArrowLeft, ExternalLink, Images, Layers, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import {
  SMART_IMAGE_TOOL_NAME,
} from "@/lib/constants/smart-image-tool.config";
import {
  buildSmartEditImageToolUrl,
  resolveSafeStudioReturnPath,
} from "@/lib/utils/smart-image-tool.utils";
import {
  studioGlass,
  studioIconBox,
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const WORKFLOW_STEPS = [
  {
    icon: Images,
    title: "Edit photos",
    description: "Crop, adjust, and refine individual scene images before they go into your short.",
  },
  {
    icon: Layers,
    title: "Combine & collage",
    description: "Merge multiple photos or build collages for richer scene visuals.",
  },
  {
    icon: Upload,
    title: "Re-upload to ShortForge",
    description: "Download edited assets from the tool, then replace the scene image in Studio.",
  },
] as const;

/**
 * Optional help/landing page for the Smart Image Tool — not the default Smart Edit path.
 */
export default function SmartImageToolBridge() {
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get("returnTo");
  const draftId = searchParams.get("draftId") ?? undefined;
  const sceneId = searchParams.get("sceneId") ?? undefined;

  const backHref = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return resolveSafeStudioReturnPath(returnToParam, origin);
  }, [returnToParam]);

  const externalToolUrl = useMemo(() => {
    const returnTo =
      returnToParam?.trim() ||
      (typeof window !== "undefined" ? `${window.location.origin}${backHref}` : backHref);

    return buildSmartEditImageToolUrl({
      returnTo,
      ...(draftId ? { draftId } : {}),
      ...(sceneId ? { sceneId } : {}),
    });
  }, [backHref, draftId, returnToParam, sceneId]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className={`${studioPanel} overflow-hidden`}>
        <div className={`${studioGlass} border-b border-border/20 px-5 py-6 sm:px-8 sm:py-8`}>
          <div className="flex items-start gap-4">
            <div className={`${studioIconBox} h-11 w-11 shrink-0 sm:h-12 sm:w-12`}>
              <Images className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className={studioStepLabel}>ShortForge Studio</p>
              <h1 className={`${studioSectionTitle} mt-1`}>{SMART_IMAGE_TOOL_NAME}</h1>
              <p className={`${studioSectionDesc} mt-2 max-w-prose`}>
                {SMART_IMAGE_TOOL_NAME} is the dedicated image editor for ShortForge scenes. From
                the editor, use Smart Edit to open it directly — this page is an optional overview.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          <section aria-labelledby="smart-image-tool-capabilities">
            <h2 id="smart-image-tool-capabilities" className="sr-only">
              What you can do
            </h2>
            <ul className="space-y-4">
              {WORKFLOW_STEPS.map((step) => (
                <li
                  key={step.title}
                  className="flex gap-3 rounded-xl bg-surface-elevated/30 px-4 py-3.5 ring-1 ring-border/20"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/15">
                    <step.icon className="h-4 w-4 text-accent" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground/90">{step.title}</p>
                    <p className={`${studioSubtleText} mt-1 leading-relaxed`}>{step.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className={`${studioSubtleText} rounded-xl bg-background/25 px-4 py-3 ring-1 ring-border/20`}>
            Automatic image handoff is not available yet. Edit the image in the tool, download it,
            then replace the image in your scene from the Studio inspector.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={externalToolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={studioPrimaryButton}
            >
              Open {SMART_IMAGE_TOOL_NAME}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            <Link href={backHref} className={studioSecondaryButton}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Studio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
