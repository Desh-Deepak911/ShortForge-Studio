import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type StudioStatusVariant = "loading" | "empty" | "success" | "warning" | "error";

/** Panel = bordered status block; centered = hero loading/empty; compact = inspector row; inline = rail/row hint. */
export type StudioStatusLayout = "panel" | "centered" | "compact" | "inline";

export interface StudioStatusProps {
  variant: StudioStatusVariant;
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  layout?: StudioStatusLayout;
  className?: string;
  children?: ReactNode;
  steps?: readonly string[];
  activeStep?: number;
  role?: string;
  "aria-label"?: string;
  "aria-live"?: "polite" | "assertive" | "off";
  "aria-busy"?: boolean;
}

export type StudioStatusStepState = "done" | "active" | "pending";
