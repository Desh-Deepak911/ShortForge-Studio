"use client";

export interface CreatorAssetStudioToastProps {
  message: string;
  visible: boolean;
}

/**
 * Lightweight copy-success toast for Creator Asset Studio.
 */
export default function CreatorAssetStudioToast({
  message,
  visible,
}: CreatorAssetStudioToastProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      role="status"
      className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-foreground/95 px-4 py-2.5 text-sm font-medium text-background shadow-lg ring-1 ring-border/20 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {message}
    </div>
  );
}
