import type { HeadlessPrincipalPort } from "../ports/principal.port";
import { validateHeadlessAuthenticatedPrincipal } from "../services/validate-authenticated-principal";
import { cpFail } from "../types/control-plane.types";
import {
  HEADLESS_STAGING_SESSION_COOKIE,
  type StagingSessionConfiguration,
} from "../runtime/staging-session-environment";
import {
  readCookieValue,
  verifyStagingSessionToken,
} from "../runtime/staging-session-token";

export class StagingSessionPrincipalAdapter implements HeadlessPrincipalPort {
  constructor(
    private readonly configuration: StagingSessionConfiguration,
    private readonly now: () => number = Date.now,
  ) {}

  async resolvePrincipal(context: unknown) {
    if (!(context instanceof Request)) {
      return cpFail("UNAUTHENTICATED", "Staging access session required.");
    }
    const token = readCookieValue(context, HEADLESS_STAGING_SESSION_COOKIE);
    if (token == null) {
      return cpFail("UNAUTHENTICATED", "Staging access session required.");
    }
    const resolved = verifyStagingSessionToken({
      configuration: this.configuration,
      token,
      nowMs: this.now(),
    });
    if (resolved == null) {
      return cpFail("UNAUTHENTICATED", "Staging access session invalid.");
    }
    return validateHeadlessAuthenticatedPrincipal(resolved);
  }
}
