import { Suspense } from "react";

import { SiteNav, StudioPage } from "@/components/layout";
import SmartImageToolBridge from "@/features/tool/components/SmartImageToolBridge";
import { pageMetadata } from "@/lib/constants/product-metadata";
import { SMART_IMAGE_TOOL_NAME } from "@/lib/constants/smart-image-tool.config";

export const metadata = pageMetadata(
  SMART_IMAGE_TOOL_NAME,
  "Edit, combine, and export scene images for ShortForge shorts.",
);

export default function SmartImageToolPage() {
  return (
    <StudioPage>
      <SiteNav>
        <Suspense fallback={null}>
          <SmartImageToolBridge />
        </Suspense>
      </SiteNav>
    </StudioPage>
  );
}
