import { SiteNav } from "@/components/layout";
import StudioPage from "@/components/layout/StudioPage";
import LandingPage from "@/components/LandingPage";
import { pageMetadata, PRODUCT_DESCRIPTION } from "@/lib/constants/product-metadata";

export const metadata = pageMetadata("Home", PRODUCT_DESCRIPTION);

export default function HomePage() {
  return (
    <StudioPage>
      <SiteNav>
        <LandingPage />
      </SiteNav>
    </StudioPage>
  );
}
