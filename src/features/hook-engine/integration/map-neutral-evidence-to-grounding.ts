/**
 * Map neutral research evidence → Hook grounding claims (Sprint 7D).
 */

import type {
  HookGroundingClaim,
  HookOpeningIntent,
} from "../domain/hook-contract.types";
import { HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE } from "../domain/hook-contract.constants";
import type { HookNeutralResearchEvidence } from "./neutral-research-evidence.types";

export function mapNeutralEvidenceToGroundingClaims(
  evidence: HookNeutralResearchEvidence | undefined,
): {
  readonly claims: readonly HookGroundingClaim[];
  readonly unavailableResearch: boolean;
  readonly researchFingerprint?: string;
  readonly openingIntent?: HookOpeningIntent;
} {
  if (!evidence) {
    return { claims: Object.freeze([]), unavailableResearch: false };
  }

  const claims: HookGroundingClaim[] = evidence.facts.map((fact) => {
    if (fact.provenance === "forbidden") {
      return Object.freeze({
        claimId: fact.factId,
        text: fact.text,
        provenance: "forbidden" as const,
        verificationStatus: "forbidden" as const,
        ...(fact.sourceRef ? { sourceRef: fact.sourceRef } : {}),
        permittedForFactualHookUse: false,
      });
    }
    if (fact.provenance === "user_manual") {
      return Object.freeze({
        claimId: fact.factId,
        text: fact.text,
        provenance: "user_provided_unverified" as const,
        verificationStatus: "unverified" as const,
        ...(fact.sourceRef ? { sourceRef: fact.sourceRef } : {}),
        permittedForFactualHookUse: false,
      });
    }
    if (fact.provenance === "qualitative") {
      return Object.freeze({
        claimId: fact.factId,
        text: fact.text,
        provenance: "qualitative_context" as const,
        verificationStatus: "unverified" as const,
        ...(fact.sourceRef ? { sourceRef: fact.sourceRef } : {}),
        permittedForFactualHookUse: false,
      });
    }
    // provider_verified
    const permitted = fact.verified && fact.permittedForFactualHookUse;
    return Object.freeze({
      claimId: fact.factId,
      text: fact.text,
      provenance: "research_verified" as const,
      verificationStatus: fact.verified ? ("verified" as const) : ("unverified" as const),
      ...(fact.sourceRef ? { sourceRef: fact.sourceRef } : {}),
      permittedForFactualHookUse: permitted,
    });
  });

  let openingIntent: HookOpeningIntent | undefined;
  if (
    evidence.openingBeat?.evidenceLedSurprise === true &&
    evidence.openingBeat.factIds.length > 0
  ) {
    openingIntent = Object.freeze({
      kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
      claimRefs: Object.freeze([...evidence.openingBeat.factIds]),
    });
  }

  return {
    claims: Object.freeze(claims),
    unavailableResearch: evidence.unavailableResearch === true,
    ...(evidence.researchFingerprint
      ? { researchFingerprint: evidence.researchFingerprint }
      : {}),
    ...(openingIntent ? { openingIntent } : {}),
  };
}
