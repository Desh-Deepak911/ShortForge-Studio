import {
  studioShellSectionDesc,
  studioShellSectionTitle,
} from "@/lib/utils/studioUi";

import type { StudioSectionProps } from "./studio-shell.types";

/**
 * Titled block inside inspector or sidebar panels.
 */
export default function StudioSection({
  children,
  title,
  description,
  className = "",
  id,
}: StudioSectionProps) {
  return (
    <section id={id} className={`min-w-0 space-y-3 ${className}`.trim()}>
      {title || description ? (
        <header className="min-w-0">
          {title ? <h2 className={studioShellSectionTitle}>{title}</h2> : null}
          {description ? <p className={studioShellSectionDesc}>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
