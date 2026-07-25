/**
 * Production project authorization — blocked until Neon ownership (Phase 2B.2).
 */

import { cpFail } from "../types/control-plane.types";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";

export class UnavailableHeadlessProjectAuthorizationAdapter
  implements HeadlessProjectAuthorizationPort
{
  async claimUnownedProject() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Project ownership authorization is not configured.",
    );
  }

  async assertProjectAccess() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Project ownership authorization is not configured.",
    );
  }
}
