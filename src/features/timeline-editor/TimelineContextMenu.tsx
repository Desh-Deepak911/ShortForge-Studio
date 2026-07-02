"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type TimelineContextMenuAction =
  | "duplicate"
  | "delete"
  | "insert-before"
  | "insert-after";

export interface TimelineContextMenuState {
  sceneId: string;
  sceneNumber: number;
  x: number;
  y: number;
}

export interface TimelineContextMenuProps {
  menu: TimelineContextMenuState;
  canDelete: boolean;
  onAction: (action: TimelineContextMenuAction) => void;
  onClose: () => void;
}

const menuPanelClassName =
  "min-w-[10.5rem] rounded-xl bg-surface-elevated/95 p-1 shadow-lg ring-1 ring-border/30 backdrop-blur-sm";

const menuItemClassName =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground/90 outline-none hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-45";

const menuItemDestructiveClassName =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-300/90 outline-none hover:bg-red-950/20 focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-45";

function clampMenuPosition(x: number, y: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  const margin = 8;
  const estimatedWidth = 168;
  const estimatedHeight = 156;
  const maxX = window.innerWidth - estimatedWidth - margin;
  const maxY = window.innerHeight - estimatedHeight - margin;

  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}

export default function TimelineContextMenu({
  menu,
  canDelete,
  onAction,
  onClose,
}: TimelineContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const position = clampMenuPosition(menu.x, menu.y);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (panel?.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={`Scene ${menu.sceneNumber} actions`}
      className={menuPanelClassName}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 60,
      }}
    >
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        onClick={() => onAction("insert-before")}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Insert before
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        onClick={() => onAction("insert-after")}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Insert after
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        onClick={() => onAction("duplicate")}
      >
        <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Duplicate
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemDestructiveClassName}
        disabled={!canDelete}
        title={canDelete ? "Delete scene" : "Cannot delete the last scene"}
        onClick={() => onAction("delete")}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Delete
      </button>
    </div>,
    document.body,
  );
}
