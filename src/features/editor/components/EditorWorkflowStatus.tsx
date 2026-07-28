"use client";

import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { FootieScript } from "@/features/story/types";
import { useOptionalStorySync } from "@/features/story-sync/StorySyncContext";
import {
  resolveStorySyncBanner,
  resolveStorySyncSteps,
  type StorySyncStepTone,
} from "@/features/story-sync/story-sync.utils";
import SynchronizationStep from "@/features/story-sync/components/SynchronizationStep";
import {
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
  studioWorkflowStatusPopoverPanel,
  studioWorkflowStatusPopoverScroll,
} from "@/lib/utils/studioUi";

const TONE_DOT: Record<StorySyncStepTone, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-300",
  neutral: "bg-muted/70",
};

const VIEWPORT_MARGIN_PX = 8;
const PANEL_GAP_PX = 8;
const PANEL_WIDTH_PX = 368;
const PANEL_MAX_HEIGHT_PX = 384;

export interface EditorWorkflowStatusProps {
  script: FootieScript;
  persistWarning?: string | null;
  saveDraftConfirmation?: string | null;
  warning?: string | null;
  onUpdateNarration?: () => void;
  onGenerateVoice?: () => void;
  onExportUpdated?: () => void;
  persistActionLabel?: string;
  onPersistAction?: () => void;
}

type PopoverPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function measurePopoverPosition(
  triggerRect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
): PopoverPosition {
  const width = Math.min(PANEL_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  let left = triggerRect.right - width;
  left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(left, viewportWidth - width - VIEWPORT_MARGIN_PX),
  );

  const spaceBelow =
    viewportHeight - triggerRect.bottom - PANEL_GAP_PX - VIEWPORT_MARGIN_PX;
  const spaceAbove =
    triggerRect.top - PANEL_GAP_PX - VIEWPORT_MARGIN_PX;
  const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(
    PANEL_MAX_HEIGHT_PX,
    Math.max(120, openBelow ? spaceBelow : spaceAbove),
  );
  const top = openBelow
    ? triggerRect.bottom + PANEL_GAP_PX
    : Math.max(
        VIEWPORT_MARGIN_PX,
        triggerRect.top - PANEL_GAP_PX - maxHeight,
      );

  return { left, top, width, maxHeight };
}

export default function EditorWorkflowStatus({
  script,
  persistWarning,
  saveDraftConfirmation,
  warning,
  onUpdateNarration,
  onGenerateVoice,
  onExportUpdated,
  persistActionLabel = "Retry save",
  onPersistAction,
}: EditorWorkflowStatusProps) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const storySync = useOptionalStorySync();
  const steps = useMemo(
    () => (storySync ? resolveStorySyncSteps(storySync.state, script) : []),
    [script, storySync],
  );
  const banner =
    storySync && !storySync.isBannerDismissed
      ? resolveStorySyncBanner(storySync.state, script)
      : null;
  const needsAttention =
    Boolean(persistWarning || warning || banner) ||
    steps.some((step) => step.tone === "warning");
  const label = persistWarning
    ? "Save failed"
    : needsAttention
      ? "Review updates"
      : saveDraftConfirmation
        ? "Saved"
        : "Ready";
  const panelTitle = persistWarning ? "Save failed" : "Project status";

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") {
      return;
    }

    setPosition(
      measurePopoverPosition(
        trigger.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleBannerPrimary = () => {
    if (!banner) {
      return;
    }
    if (banner.kind === "narration") {
      onUpdateNarration?.();
    } else if (banner.kind === "voice") {
      onGenerateVoice?.();
    } else {
      onExportUpdated?.();
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePanel();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, open]);

  useEffect(() => {
    if (!open || !panelRef.current) {
      return;
    }

    const focusTimer = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const firstFocusable = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => window.cancelAnimationFrame(focusTimer);
  }, [open]);

  const panel =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={panelTitle}
            data-editor-workflow-status-panel
            className={studioWorkflowStatusPopoverPanel}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <div className={studioWorkflowStatusPopoverScroll}>
              <p className="text-sm font-semibold text-foreground">{panelTitle}</p>

              {persistWarning ? (
                <div className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100 ring-1 ring-amber-300/20">
                  <p>{persistWarning}</p>
                  {onPersistAction ? (
                    <button
                      type="button"
                      onClick={onPersistAction}
                      className={`${studioPrimaryButton} mt-2 min-h-8 px-3 py-1.5 text-[11px]`}
                    >
                      {persistActionLabel}
                    </button>
                  ) : null}
                </div>
              ) : saveDraftConfirmation ? (
                <p className="mt-3 text-[11px] text-emerald-200/90">
                  {saveDraftConfirmation}
                </p>
              ) : null}

              {banner ? (
                <div className="mt-3 rounded-xl bg-surface-elevated px-3 py-3 ring-1 ring-border/30">
                  <p className="text-sm font-medium text-foreground">
                    {banner.title}
                  </p>
                  {banner.description ? (
                    <p className={`${studioSubtleText} mt-1 text-[11px]`}>
                      {banner.description}
                    </p>
                  ) : null}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={handleBannerPrimary}
                      className={`${studioPrimaryButton} min-h-8 px-3 py-1.5 text-[11px]`}
                    >
                      {banner.primaryLabel}
                    </button>
                    <button
                      type="button"
                      onClick={storySync?.dismissBanner}
                      className={`${studioSecondaryButton} min-h-8 px-3 py-1.5 text-[11px]`}
                    >
                      {banner.secondaryLabel}
                    </button>
                  </div>
                </div>
              ) : null}

              {steps.length > 0 ? (
                <div
                  className="mt-3 space-y-1.5 border-t border-border/20 pt-3"
                  role="list"
                >
                  <div
                    className="mb-2 flex items-center gap-1.5"
                    aria-label="Synchronization summary"
                  >
                    {steps.map((step) => (
                      <span
                        key={step.id}
                        className={`h-2 w-2 rounded-full ${TONE_DOT[step.tone]}`}
                        aria-hidden
                      />
                    ))}
                  </div>
                  {steps.map((step) => {
                    const actionLabel =
                      step.id === "narration" && storySync?.state.narrationDirty
                        ? "Update"
                        : step.id === "voice" && storySync?.state.voiceDirty
                          ? "Regenerate"
                          : undefined;
                    const onAction =
                      step.id === "narration" && storySync?.state.narrationDirty
                        ? onUpdateNarration
                        : step.id === "voice" && storySync?.state.voiceDirty
                          ? onGenerateVoice
                          : undefined;
                    return (
                      <div key={step.id} role="listitem">
                        <SynchronizationStep
                          step={step}
                          actionLabel={actionLabel}
                          onAction={onAction}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {warning ? (
                <p
                  className="mt-3 text-[11px] leading-relaxed text-amber-100/90"
                  role="status"
                >
                  {warning}
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0" data-editor-workflow-status>
      <button
        ref={triggerRef}
        type="button"
        className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-[11px] font-medium ring-1 transition ${
          needsAttention
            ? "bg-amber-400/10 text-amber-100 ring-amber-300/20 hover:bg-amber-400/15"
            : "bg-emerald-400/10 text-emerald-100 ring-emerald-300/20 hover:bg-emerald-400/15"
        }`}
        aria-label={`Workflow status: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {needsAttention ? (
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {panel}
    </div>
  );
}
