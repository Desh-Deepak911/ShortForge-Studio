"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { studioGhostButton } from "@/lib/utils/studioUi";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      // Clipboard API requires a secure context (HTTPS or localhost).
    }
  }, [text]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const feedbackLabel = copied ? "Copied" : label;

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text.trim()}
      aria-label={feedbackLabel}
      title={!text.trim() ? "Nothing to copy" : feedbackLabel}
      aria-live="polite"
      className={`${studioGhostButton} ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}
