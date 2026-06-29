import { SiteNav, StudioPage } from "@/components/layout";
import DraftsDashboard from "@/features/drafts/components/DraftsDashboard";
import { pageMetadata } from "@/lib/constants/product-metadata";

export const metadata = pageMetadata(
  "Drafts",
  "Open saved stories from this browser.",
);

export default function DraftsPage() {
  return (
    <StudioPage>
      <SiteNav>
        <DraftsDashboard />
      </SiteNav>
    </StudioPage>
  );
}
