import { CreateStoryFlow } from "@/features/create";
import { StudioPage } from "@/components/layout";
import { pageMetadata } from "@/lib/constants/product-metadata";

export const metadata = pageMetadata(
  "Create",
  "Write your story — topic, tone, and Research Preview.",
);

export default function CreateStoryPage() {
  return (
    <StudioPage>
      <CreateStoryFlow />
    </StudioPage>
  );
}
