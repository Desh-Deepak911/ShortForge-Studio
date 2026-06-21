"use client";

import { use } from "react";

import { StudioPage } from "@/components/layout";
import { DraftEditorFlow } from "@/features/drafts";

interface EditorPageProps {
  params: Promise<{ draftId: string }>;
}

export default function EditorPage({ params }: EditorPageProps) {
  const { draftId } = use(params);

  return (
    <StudioPage>
      <DraftEditorFlow draftId={draftId} />
    </StudioPage>
  );
}
