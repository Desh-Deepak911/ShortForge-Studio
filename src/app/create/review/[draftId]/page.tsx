import ScriptReviewFlow from "@/features/create/components/ScriptReviewFlow";
import { StudioPage } from "@/components/layout";
import { pageMetadata } from "@/lib/constants/product-metadata";

export const metadata = pageMetadata(
  "Story",
  "Edit your story, create narration, and build your storyboard.",
);

interface ScriptReviewPageProps {
  params: Promise<{ draftId: string }>;
}

export default async function ScriptReviewPage({ params }: ScriptReviewPageProps) {
  const { draftId } = await params;
  return (
    <StudioPage>
      <ScriptReviewFlow draftId={draftId} />
    </StudioPage>
  );
}
