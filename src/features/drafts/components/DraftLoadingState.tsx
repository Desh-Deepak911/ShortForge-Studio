"use client";

import { AppShell } from "@/components/layout";
import { StudioProjectLoadingState } from "@/components/StudioLoadingState";
import { studioPanel } from "@/lib/utils/studioUi";

/** Stable SSR/client shell — no localStorage, draft title, or workflow actions. */
export default function DraftLoadingState() {
  return (
    <AppShell
      hasProject={false}
      loading
      showDraftsNav={false}
      onCreateStory={() => undefined}
      onExport={() => undefined}
      createDisabled
      exportDisabled
    >
      <div
        className={`${studioPanel} mx-auto max-w-lg px-5 py-10 sm:px-8 sm:py-12`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Opening your project"
      >
        <StudioProjectLoadingState />
      </div>
    </AppShell>
  );
}
