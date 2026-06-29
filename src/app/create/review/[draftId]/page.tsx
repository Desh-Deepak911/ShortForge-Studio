import ScriptReviewFlow from "@/features/create/components/ScriptReviewFlow";
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
  return <ScriptReviewFlow draftId={draftId} />;
}
