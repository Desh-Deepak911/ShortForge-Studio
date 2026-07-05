"use client";

import {
  resolveCaptionSafeAreaGuideInsets,
  resolveCaptionThirdsGuidePercents,
  shouldShowCaptionCenterGuides,
} from "./caption-layout-drag.utils";

export interface CaptionLayoutGuidesProps {
  visible: boolean;
  safeAreaEnabled: boolean;
  centerX: number;
  centerY: number;
}

export default function CaptionLayoutGuides({
  visible,
  safeAreaEnabled,
  centerX,
  centerY,
}: CaptionLayoutGuidesProps) {
  if (!visible) {
    return null;
  }

  const safeArea = resolveCaptionSafeAreaGuideInsets(safeAreaEnabled);
  const centerGuides = shouldShowCaptionCenterGuides(centerX, centerY);
  const thirds = resolveCaptionThirdsGuidePercents();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[14]">
      {safeAreaEnabled ? (
        <div
          className="absolute rounded-sm border border-dashed border-white/25"
          style={{
            top: `${safeArea.top}%`,
            right: `${safeArea.right}%`,
            bottom: `${safeArea.bottom}%`,
            left: `${safeArea.left}%`,
          }}
        />
      ) : null}

      <div className="absolute bottom-[8%] left-1/2 top-[8%] w-px -translate-x-1/2 bg-accent/45" />
      <div className="absolute left-[6%] right-[6%] top-1/2 h-px -translate-y-1/2 bg-accent/45" />

      {thirds.vertical.map((leftPercent) => (
        <div
          key={`third-v-${leftPercent}`}
          className="absolute bottom-[8%] top-[8%] w-px bg-white/20"
          style={{ left: `${leftPercent}%` }}
        />
      ))}
      {thirds.horizontal.map((topPercent) => (
        <div
          key={`third-h-${topPercent}`}
          className="absolute left-[6%] right-[6%] h-px bg-white/20"
          style={{ top: `${topPercent}%` }}
        />
      ))}

      {centerGuides.vertical ? (
        <div className="absolute bottom-[8%] left-1/2 top-[8%] w-px -translate-x-1/2 bg-accent/70" />
      ) : null}
      {centerGuides.horizontal ? (
        <div className="absolute left-[6%] right-[6%] top-1/2 h-px -translate-y-1/2 bg-accent/70" />
      ) : null}
    </div>
  );
}
