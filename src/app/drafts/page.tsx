import { SiteNav, StudioPage } from "@/components/layout";
import DraftsDashboard from "@/features/drafts/components/DraftsDashboard";

export default function DraftsPage() {
  return (
    <StudioPage>
      <SiteNav>
        <DraftsDashboard />
      </SiteNav>
    </StudioPage>
  );
}
