"use client";

import { Focus, RotateCcw } from "lucide-react";

import type { EditorPreviewSize } from "@/features/editor/workspace-layout";

interface EditorCanvasToolbarProps {
  previewSize: EditorPreviewSize;
  focusMode: boolean;
  onPreviewSizeChange: (size: EditorPreviewSize) => void;
  onFocusModeToggle: () => void;
  onResetLayout: () => void;
}

export default function EditorCanvasToolbar({
  previewSize,
  focusMode,
  onPreviewSizeChange,
  onFocusModeToggle,
  onResetLayout,
}: EditorCanvasToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/30 px-2.5 py-2"
      role="toolbar"
      aria-label="Preview workspace"
    >
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Preview size"
      >
        {(["fit", "100", "125"] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onPreviewSizeChange(size)}
            className={`min-h-7 rounded-lg px-2.5 text-[10px] font-semibold transition ${
              previewSize === size
                ? "bg-accent/15 text-accent ring-1 ring-accent/25"
                : "text-muted hover:bg-surface-elevated/50 hover:text-foreground"
            }`}
            aria-pressed={previewSize === size}
          >
            {size === "fit" ? "Fit" : `${size}%`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onFocusModeToggle}
          className={`flex min-h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition ${
            focusMode
              ? "bg-accent/15 text-accent ring-1 ring-accent/25"
              : "text-muted hover:bg-surface-elevated/50 hover:text-foreground"
          }`}
          aria-pressed={focusMode}
          title="Hide side panels (Ctrl/⌘ Shift F)"
        >
          <Focus className="h-3.5 w-3.5" aria-hidden />
          Preview
        </button>
        <button
          type="button"
          onClick={onResetLayout}
          className="flex min-h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold text-muted transition hover:bg-surface-elevated/50 hover:text-foreground"
          title="Reset panels, timeline and preview size"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset layout
        </button>
      </div>
    </div>
  );
}
