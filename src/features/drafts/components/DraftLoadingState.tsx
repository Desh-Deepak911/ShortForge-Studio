"use client";

import { AppShell } from "@/components/layout";
import { studioPanel, studioSubtleText } from "@/lib/utils/studioUi";

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
      <div className={`${studioPanel} mx-auto max-w-lg px-5 py-10 text-center sm:px-8 sm:py-12`}>
        <p className={studioSubtleText} role="status" aria-live="polite">
          Loading your story...
        </p>
      </div>
    </AppShell>
  );
}
