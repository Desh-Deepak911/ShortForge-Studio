/**
 * Deterministic test principal — authentication only. Never used as production authority.
 */

import { cpOk } from "../types/control-plane.types";
import type {
  HeadlessAuthenticatedPrincipal,
  HeadlessPrincipalPort,
} from "../ports/principal.port";
import { validateHeadlessAuthenticatedPrincipal } from "../services/validate-authenticated-principal";

export class TestHeadlessPrincipalAdapter implements HeadlessPrincipalPort {
  private readonly principal: HeadlessAuthenticatedPrincipal;

  constructor(principal: HeadlessAuthenticatedPrincipal) {
    const validated = validateHeadlessAuthenticatedPrincipal(principal);
    if (!validated.ok) {
      throw new Error("TestHeadlessPrincipalAdapter requires a valid principal fixture.");
    }
    this.principal = validated.value;
  }

  async resolvePrincipal() {
    return cpOk(this.principal);
  }
}
