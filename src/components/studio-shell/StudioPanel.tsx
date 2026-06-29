import { studioShellPanelSurface } from "@/lib/utils/studioUi";

import type { StudioPanelProps } from "./studio-shell.types";

/**
 * Nested surface inside shell regions — lighter than full-page cards.
 */
export default function StudioPanel({
  children,
  className = "",
  id,
  bleed = false,
}: StudioPanelProps) {
  const paddingClass = bleed ? "p-0 ring-0" : "";

  return (
    <div id={id} className={`${studioShellPanelSurface} ${paddingClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
