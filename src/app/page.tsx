import { SiteNav } from "@/components/layout";
import StudioPage from "@/components/layout/StudioPage";
import LandingPage from "@/components/LandingPage";

export default function HomePage() {
  return (
    <StudioPage>
      <SiteNav>
        <LandingPage />
      </SiteNav>
    </StudioPage>
  );
}
