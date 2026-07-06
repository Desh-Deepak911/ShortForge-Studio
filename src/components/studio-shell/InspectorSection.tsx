"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import StudioAccordion from "./StudioAccordion";

export interface InspectorSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: LucideIcon;
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
 */
export default function InspectorSection(props: InspectorSectionProps) {
  return <StudioAccordion {...props} variant="default" />;
}
