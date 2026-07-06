"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";

import {
  studioInspectorNestedSection,
  studioInspectorNestedSummary,
  studioInspectorNestedTitle,
  studioInspectorSection,
  studioInspectorSectionBody,
  studioInspectorSectionContent,
  studioInspectorSectionContentInner,
  studioInspectorSectionIcon,
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
  /** Optional section icon — presentation only. */
  icon?: LucideIcon;
  /** Nested accordions use a lighter surface inside inspector sections. */
  variant?: "default" | "nested";
  className?: string;
  id?: string;
}

/**
 * Shared Studio accordion — document-flow body inside the inspector scroll host.
 * Use nested variant for sub-sections (caption advanced, export details).
 */
export default function StudioAccordion({
  title,
  description,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  icon: Icon,
  variant = "default",
  className = "",
  id,
}: StudioAccordionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const isNested = variant === "nested";

  const handleSummaryClick = (event: MouseEvent<HTMLElement>) => {
    if (!isControlled) {
      return;
    }

    event.preventDefault();
    onOpenChange?.(!isOpen);
  };

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (isControlled) {
      event.preventDefault();
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
      <summary className={summaryClass} onClick={handleSummaryClick}>
        {Icon && !isNested ? (
          <span className={studioInspectorSectionIcon} aria-hidden>
            <Icon className="h-3.5 w-3.5 text-foreground/75" strokeWidth={1.75} />
          </span>
        ) : null}
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
