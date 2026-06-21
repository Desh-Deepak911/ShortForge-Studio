import type { ReactNode } from "react";

interface StudioPageProps {
  children: ReactNode;
}

export default function StudioPage({ children }: StudioPageProps) {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="studio-grid pointer-events-none fixed inset-0 opacity-60" />
      {children}
    </div>
  );
}
