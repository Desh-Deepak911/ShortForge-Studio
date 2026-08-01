/**
 * Shared polite guidance region for StudioNumberStepper.
 * Kept as a renderable unit so verification can assert real markup, not helpers only.
 */

export interface StudioNumberStepperGuidanceProps {
  readonly id: string;
  readonly guidance: string | null;
}

export default function StudioNumberStepperGuidance({
  id,
  guidance,
}: StudioNumberStepperGuidanceProps) {
  return (
    <span
      id={id}
      role="status"
      aria-live="polite"
      className="sr-only"
      data-studio-number-stepper-guidance
    >
      {guidance ?? ""}
    </span>
  );
}
