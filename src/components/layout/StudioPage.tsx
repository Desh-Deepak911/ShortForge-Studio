import type { ReactNode } from "react";

interface StudioPageProps {
  children: ReactNode;
}

export default function StudioPage({ children }: StudioPageProps) {
  return (
    <div className="relative min-h-screen min-w-0 overflow-x-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="studio-grid pointer-events-none fixed inset-0 -z-10 opacity-60"
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
