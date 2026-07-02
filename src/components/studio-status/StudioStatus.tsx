"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  studioEmptyStateCard,
  studioStatusDescription,
  studioStatusIconBox,
  studioStatusIconBoxInline,
  studioStatusSpinnerHost,
  studioStatusTitle,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import {
  StudioStatusSpinner,
  StudioStatusStepList,
  studioStatusPanelClass,
  studioStatusTokens,
} from "./StudioStatusParts";
import type { StudioStatusLayout, StudioStatusProps, StudioStatusVariant } from "./studio-status.types";

const DEFAULT_ICONS: Partial<Record<StudioStatusVariant, LucideIcon>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

function resolveAriaLive(variant: StudioStatusVariant): "polite" | "assertive" | "off" | undefined {
  if (variant === "error") {
    return "assertive";
  }

  if (variant === "loading" || variant === "success" || variant === "warning") {
    return "polite";
  }

  return undefined;
}

function resolveRole(variant: StudioStatusVariant, role?: string): string | undefined {
  if (role) {
    return role;
  }

  switch (variant) {
    case "error":
      return "alert";
    case "loading":
      return "status";
    case "success":
    case "warning":
      return "status";
    default:
      return undefined;
  }
}

function PanelStatus({
  variant,
  title,
  description,
  icon: IconProp,
  className = "",
  children,
}: {
  variant: "success" | "warning" | "error";
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  const Icon = IconProp ?? DEFAULT_ICONS[variant];
  const titleClass =
    variant === "warning" ? studioStatusTokens.warningPanelTitle : studioStatusTokens.panelTitle;
  const descriptionClass =
    variant === "warning"
      ? studioStatusTokens.warningPanelDescription
      : variant === "error"
        ? "mt-1 text-sm leading-relaxed text-red-300"
        : studioStatusDescription;

  return (
    <div
      className={`${studioStatusPanelClass(variant)} ${className}`.trim()}
      role="status"
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              variant === "success"
                ? "text-accent"
                : variant === "warning"
                  ? "text-amber-500/80"
                  : "text-red-300/90"
            }`}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? <p className={titleClass}>{title}</p> : null}
          {description ? <p className={descriptionClass}>{description}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function LoadingStatus({
  layout,
  title,
  description,
  steps,
  activeStep = 1,
  className = "",
  children,
  ariaLabel,
}: {
  layout: StudioStatusLayout;
  title?: ReactNode;
  description?: ReactNode;
  steps?: readonly string[];
  activeStep?: number;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  if (layout === "compact") {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        aria-label={typeof ariaLabel === "string" ? ariaLabel : typeof title === "string" ? title : "Loading"}
        className={`min-w-0 w-full ${className}`.trim()}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className={`mt-0.5 ${studioStatusSpinnerHost} h-8 w-8`}>
            <StudioStatusSpinner className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {title ? <p className={studioStatusTokens.compactTitle}>{title}</p> : null}
            {description ? (
              <p className={studioStatusTokens.compactDescription}>{description}</p>
            ) : null}
            {steps && steps.length > 0 ? (
              <StudioStatusStepList steps={steps} activeStep={activeStep} className="mt-4" />
            ) : null}
            {children}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label={typeof ariaLabel === "string" ? ariaLabel : typeof title === "string" ? title : "Loading"}
      className={`flex min-w-0 w-full justify-center py-6 sm:py-10 ${className}`.trim()}
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <span aria-hidden className={`mb-5 ${studioStatusSpinnerHost}`}>
          <StudioStatusSpinner />
        </span>
        {title ? <p className={studioStatusTokens.centeredTitle}>{title}</p> : null}
        {description ? (
          <p className={`${studioStatusTokens.centeredDescription} max-w-sm`}>{description}</p>
        ) : null}
        {steps && steps.length > 0 ? (
          <StudioStatusStepList
            steps={steps}
            activeStep={activeStep}
            className="mx-auto mt-6 w-full max-w-xs text-left"
          />
        ) : null}
        {children}
      </div>
    </section>
  );
}

function EmptyStatus({
  layout,
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: {
  layout: StudioStatusLayout;
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  if (layout === "inline") {
    return (
      <div
        className={`flex min-h-[4.75rem] flex-1 items-center justify-center rounded-xl border border-dashed border-border/35 bg-surface/20 px-4 py-3 sm:min-h-[5rem] ${className}`.trim()}
      >
        <div className="flex max-w-sm items-center gap-3 text-left">
          {Icon ? (
            <span className={studioStatusIconBoxInline}>
              <Icon className="h-4 w-4 text-muted/80" strokeWidth={1.75} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            {title ? <p className={studioStatusTokens.inlineTitle}>{title}</p> : null}
            {description ? (
              <p className={studioStatusTokens.inlineDescription}>{description}</p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div
        className={`flex min-h-[14rem] flex-col items-center justify-center px-3 py-10 text-center ${className}`.trim()}
      >
        {Icon ? (
          <div className={`mb-3 ${studioStatusIconBox}`}>
            <Icon className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
          </div>
        ) : null}
        {title ? <p className={studioStatusTitle}>{title}</p> : null}
        {description ? (
          <p className={`${studioSubtleText} mt-1.5 max-w-[15rem] leading-relaxed`}>{description}</p>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <section
      className={`${studioEmptyStateCard} ${className}`.trim()}
      aria-label={typeof title === "string" ? title : "Empty state"}
    >
      {Icon ? (
        <div className={studioStatusTokens.emptyIconHost}>
          <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" aria-hidden />
          <Icon className="relative h-7 w-7 text-accent" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      {title ? <h2 className={studioStatusTokens.emptyTitle}>{title}</h2> : null}
      {description ? <p className={studioStatusTokens.emptyDescription}>{description}</p> : null}
      {children}
    </section>
  );
}

/**
 * Shared Studio status surface — loading, empty, success, warning, and error.
 * Presentation only; reuse across create, review, editor, export, and publishing.
 */
export default function StudioStatus({
  variant,
  title,
  description,
  icon,
  layout,
  className = "",
  children,
  steps,
  activeStep = 1,
  role,
  "aria-label": ariaLabel,
  "aria-live": ariaLive,
  "aria-busy": ariaBusy,
}: StudioStatusProps) {
  const resolvedLayout: StudioStatusLayout =
    layout ??
    (variant === "loading"
      ? "centered"
      : variant === "empty"
        ? "centered"
        : "panel");

  if (variant === "error" || variant === "warning" || variant === "success") {
    if (resolvedLayout === "inline") {
      const textClass =
        variant === "error"
          ? "text-[10px] leading-relaxed text-red-300"
          : variant === "warning"
            ? "text-xs leading-relaxed text-amber-200/90"
            : "text-xs leading-relaxed text-accent";

      return (
        <p
          className={`${textClass} ${className}`.trim()}
          role={resolveRole(variant, role)}
          aria-live={ariaLive ?? resolveAriaLive(variant)}
        >
          {description ?? title}
        </p>
      );
    }
  }

  if (variant === "loading") {
    return (
      <LoadingStatus
        layout={resolvedLayout}
        title={title}
        description={description}
        steps={steps}
        activeStep={activeStep}
        className={className}
        ariaLabel={ariaLabel}
      >
        {children}
      </LoadingStatus>
    );
  }

  if (variant === "empty") {
    return (
      <EmptyStatus
        layout={resolvedLayout}
        title={title}
        description={description}
        icon={icon}
        className={className}
      >
        {children}
      </EmptyStatus>
    );
  }

  const panelVariant = variant as "success" | "warning" | "error";

  return (
    <div
      className={className}
      role={resolveRole(variant, role)}
      aria-live={ariaLive ?? resolveAriaLive(variant)}
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
    >
      <PanelStatus
        variant={panelVariant}
        title={title}
        description={description}
        icon={icon}
      >
        {children}
      </PanelStatus>
    </div>
  );
}

export {
  StudioStatusSpinner,
  StudioStatusStepIndicator,
  StudioStatusStepList,
  studioStatusPanelClass,
  studioStatusTokens,
} from "./StudioStatusParts";

export type {
  StudioStatusLayout,
  StudioStatusProps,
  StudioStatusStepState,
  StudioStatusVariant,
} from "./studio-status.types";
