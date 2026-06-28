"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode, type SyntheticEvent } from "react";

import {
  studioInspectorSection,
  studioInspectorSectionBody,
  studioInspectorSectionContent,
  studioInspectorSectionContentInner,
  studioInspectorSectionSummary,
  studioInspectorSectionTitle,
  studioSubtleText,
} from "@/lib/studioUi";

export interface InspectorSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** When true, section starts expanded (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled open state — when set, overrides user toggle until released. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  id?: string;
}

/**
 * Collapsible inspector block — compact sections for scene properties.
 * Sections stack in document flow; body uses grid rows for smooth expand/collapse.
 */
export default function InspectorSection({
  title,
  description,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className = "",
  id,
}: InspectorSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (isControlled) {
      event.preventDefault();
      onOpenChange?.(!isOpen);
      return;
    }

    setUncontrolledOpen(event.currentTarget.open);
  };

  return (
    <details
      id={id}
      open={isOpen}
      className={`${studioInspectorSection} ${className}`.trim()}
      onToggle={handleToggle}
    >
      <summary className={studioInspectorSectionSummary}>
        <span className="min-w-0 flex-1">
          <span className={studioInspectorSectionTitle}>{title}</span>
          {description ? (
            <span className={`${studioSubtleText} mt-0.5 block text-[11px] leading-snug`}>
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open/details:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
      </summary>
      <div className={studioInspectorSectionContent}>
        <div className={studioInspectorSectionContentInner}>
          <div className={studioInspectorSectionBody}>{children}</div>
        </div>
      </div>
    </details>
  );
}
