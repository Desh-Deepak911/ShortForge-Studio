"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode, type SyntheticEvent } from "react";

import {
  studioInspectorNestedSection,
  studioInspectorNestedSummary,
  studioInspectorNestedTitle,
  studioInspectorSection,
  studioInspectorSectionBody,
  studioInspectorSectionContent,
  studioInspectorSectionContentInner,
  studioInspectorSectionSummary,
  studioInspectorSectionTitle,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface StudioAccordionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Nested accordions use a lighter surface inside inspector sections. */
  variant?: "default" | "nested";
  className?: string;
  id?: string;
}

/**
 * Shared Studio accordion — same animation and chevron as InspectorSection.
 * Use nested variant for sub-sections (caption advanced, export details).
 */
export default function StudioAccordion({
  title,
  description,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  variant = "default",
  className = "",
  id,
}: StudioAccordionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const isNested = variant === "nested";

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (isControlled) {
      event.preventDefault();
      onOpenChange?.(!isOpen);
      return;
    }

    setUncontrolledOpen(event.currentTarget.open);
  };

  const sectionClass = isNested ? studioInspectorNestedSection : studioInspectorSection;
  const summaryClass = isNested ? studioInspectorNestedSummary : studioInspectorSectionSummary;
  const titleClass = isNested ? studioInspectorNestedTitle : studioInspectorSectionTitle;

  return (
    <details
      id={id}
      open={isOpen}
      className={`${sectionClass} ${className}`.trim()}
      onToggle={handleToggle}
    >
      <summary className={summaryClass}>
        <span className="min-w-0 flex-1">
          <span className={titleClass}>{title}</span>
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
