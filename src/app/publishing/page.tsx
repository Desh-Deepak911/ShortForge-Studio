import { SiteNav, StudioPage } from "@/components/layout";
import { PublishingQueuePanel } from "@/features/publishing/queue";
import { pageMetadata } from "@/lib/constants/product-metadata";

export const metadata = pageMetadata(
  "Publishing",
  "Track manual uploads and copy platform metadata from this browser.",
);

export default function PublishingPage() {
  return (
    <StudioPage>
      <SiteNav>
        <PublishingQueuePanel />
      </SiteNav>
    </StudioPage>
  );
}