"use client";

import type { SceneMedia } from "@/features/story/types";
import {
  normalizeMediaVisualAdjustments,
  type SceneMediaVisualAdjustments,
} from "@/features/media-visual-adjustments";
import {
  studioFieldLabel,
  studioInputCompact,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

interface MediaVisualAdjustmentsPanelProps {
  media: SceneMedia;
  disabled?: boolean;
  onChange: (patch: Partial<SceneMediaVisualAdjustments>) => void;
  onReset: () => void;
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-3">
        <span className={studioFieldLabel}>{label}</span>
        <span className="text-[11px] tabular-nums text-muted">{Math.round(value * 100) / 100}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </label>
  );
}

export default function MediaVisualAdjustmentsPanel({
  media,
  disabled = false,
  onChange,
  onReset,
}: MediaVisualAdjustmentsPanelProps) {
  const value = normalizeMediaVisualAdjustments(media.visualAdjustments);
  return (
    <section className="space-y-3 border-t border-border/20 pt-3" data-media-visual-adjustments>
      <div>
        <p className={studioFieldLabel}>Adjustments</p>
        <p className={studioSubtleText}>Applied identically to preview and exported image/video frames.</p>
      </div>
      <RangeControl label="Brightness" value={value.brightness} min={0} max={200} suffix="%" disabled={disabled} onChange={(brightness) => onChange({ brightness })} />
      <RangeControl label="Contrast" value={value.contrast} min={0} max={200} suffix="%" disabled={disabled} onChange={(contrast) => onChange({ contrast })} />
      <RangeControl label="Saturation" value={value.saturation} min={0} max={200} suffix="%" disabled={disabled} onChange={(saturation) => onChange({ saturation })} />

      <label className="flex items-center justify-between gap-3 text-xs text-foreground/85">
        <span>Shadow</span>
        <input type="checkbox" checked={value.shadowEnabled} disabled={disabled} onChange={(event) => onChange({ shadowEnabled: event.currentTarget.checked })} />
      </label>
      {value.shadowEnabled ? (
        <div className="space-y-3 rounded-lg bg-background/25 p-2.5 ring-1 ring-border/20">
          <label className="flex items-center justify-between gap-3">
            <span className={studioFieldLabel}>Color</span>
            <input className={studioInputCompact} type="color" value={value.shadowColor} disabled={disabled} onChange={(event) => onChange({ shadowColor: event.currentTarget.value })} aria-label="Shadow color" />
          </label>
          <RangeControl label="Opacity" value={value.shadowOpacity} min={0} max={1} step={0.05} disabled={disabled} onChange={(shadowOpacity) => onChange({ shadowOpacity })} />
          <RangeControl label="Blur" value={value.shadowBlur} min={0} max={48} suffix="px" disabled={disabled} onChange={(shadowBlur) => onChange({ shadowBlur })} />
          <RangeControl label="Horizontal" value={value.shadowOffsetX} min={-48} max={48} suffix="px" disabled={disabled} onChange={(shadowOffsetX) => onChange({ shadowOffsetX })} />
          <RangeControl label="Vertical" value={value.shadowOffsetY} min={-48} max={48} suffix="px" disabled={disabled} onChange={(shadowOffsetY) => onChange({ shadowOffsetY })} />
        </div>
      ) : null}
      <button type="button" className={studioSecondaryButton} disabled={disabled} onClick={onReset}>Reset adjustments</button>
    </section>
  );
}
