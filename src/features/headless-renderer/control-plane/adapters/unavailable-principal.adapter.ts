/**
 * Production principal gate when Clerk authentication is not configured.
 */

import { cpFail } from "../types/control-plane.types";
import type { HeadlessPrincipalPort } from "../ports/principal.port";

export class UnavailableHeadlessPrincipalAdapter implements HeadlessPrincipalPort {
  async resolvePrincipal() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Headless control plane has no production authentication provider configured.",
    );
  }
}
