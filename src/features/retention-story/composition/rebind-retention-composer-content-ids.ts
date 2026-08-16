/**
 * Claim-reference metadata authority — story-quality Prompt 7.
 * References prove grounding. They are not the narration.
 * Unknown IDs never authorize a claim and must not destroy supported speech.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { claimRefsSupportLinkedNarrationStatement } from "../strategy/retention-claim-linked-support";

export type RetentionContentIdProvenance =
  | "model_supplied"
  | "safely_rebound"
  | "rewrite_produced";

export interface RebindRetentionComposerContentIdsInput {
  readonly usedContentIds: readonly string[];
  readonly omittedContentIds: readonly string[];
  readonly hookClaimRefs: readonly string[];
  readonly factualSupport: readonly { readonly claimId: string }[];
  readonly narration: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
  readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
}

export interface RebindRetentionComposerContentIdsResult {
  readonly usedContentIds: readonly string[];
  readonly omittedContentIds: readonly string[];
  readonly hookClaimRefs: readonly string[];
  readonly factualSupport: readonly { readonly claimId: string }[];
  readonly droppedUnknownIds: readonly string[];
  readonly reboundIds: readonly string[];
  readonly provenance: RetentionContentIdProvenance;
}

function knownIdSet(
  contract: RetentionCreatorContentContract,
  eligibleClaimIds: ReadonlySet<string>,
): Set<string> {
  return new Set([
    ...contract.orderedUnits.map((unit) => unit.contentUnitId),
    ...contract.orderedUnits
      .map((unit) => unit.claimId)
      .filter((id): id is string => id != null),
    ...eligibleClaimIds,
  ]);
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function splitSpokenSentences(narration: string): string[] {
  return narration
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function contentTokens(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 4);
}

function unitSpokenByParaphrase(unitText: string, narration: string): boolean {
  const unitTokens = contentTokens(unitText);
  if (unitTokens.length < 3) return false;
  const spoken = new Set(contentTokens(narration));
  const hits = unitTokens.filter(
    (token) =>
      spoken.has(token) ||
      [...spoken].some(
        (item) =>
          item.length >= 5 &&
          token.length >= 5 &&
          item.startsWith(token.slice(0, 4)),
      ),
  );
  return hits.length / unitTokens.length >= 0.6;
}

function unitSupportsNarration(input: {
  readonly unitText: string;
  readonly claimId: string | null;
  readonly narration: string;
  readonly grounding?: RetentionGroundingContext | null;
  readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
}): boolean {
  const narration = input.narration.trim();
  if (!narration) return false;
  const unit = input.unitText.trim().toLowerCase();
  if (unit && narration.toLowerCase().includes(unit)) return true;
  if (unitSpokenByParaphrase(input.unitText, narration)) return true;
  if (!input.claimId || !input.grounding) return false;
  const mode = input.factHandlingMode ?? "verified_facts_only";
  return splitSpokenSentences(narration).some((sentence) =>
    claimRefsSupportLinkedNarrationStatement(
      input.grounding!,
      [input.claimId!],
      sentence,
      mode,
    ),
  );
}

export function rebindRetentionComposerContentIds(
  input: RebindRetentionComposerContentIdsInput,
): RebindRetentionComposerContentIdsResult {
  const known = knownIdSet(input.contentContract, input.eligibleClaimIds);
  const droppedUnknownIds = uniqueIds(
    [
      ...input.usedContentIds,
      ...input.omittedContentIds,
      ...input.hookClaimRefs,
      ...input.factualSupport.map((entry) => entry.claimId),
    ].filter((id) => !known.has(id)),
  );

  const modelUsed = uniqueIds(input.usedContentIds.filter((id) => known.has(id)));
  const modelOmitted = uniqueIds(
    input.omittedContentIds.filter((id) => known.has(id) && !modelUsed.includes(id)),
  );
  const modelHook = uniqueIds(input.hookClaimRefs.filter((id) => known.has(id)));
  const modelSupport = uniqueIds(
    input.factualSupport
      .map((entry) => entry.claimId)
      .filter((id) => known.has(id)),
  );

  const reboundIds: string[] = [];
  const used = [...modelUsed];
  for (const unit of input.contentContract.orderedUnits) {
    if (unit.kind === "instruction" || unit.kind === "forbidden") continue;
    const ids = [unit.contentUnitId, unit.claimId].filter(
      (id): id is string => id != null && known.has(id),
    );
    if (ids.length === 0) continue;
    if (ids.some((id) => used.includes(id))) continue;
    if (
      !unitSupportsNarration({
        unitText: unit.text,
        claimId: unit.claimId,
        narration: input.narration,
        grounding: input.grounding,
        factHandlingMode: input.factHandlingMode,
      })
    ) {
      continue;
    }
    const chosen =
      unit.claimId && known.has(unit.claimId) ? unit.claimId : unit.contentUnitId;
    used.push(chosen);
    reboundIds.push(chosen);
  }

  const omitted = uniqueIds(
    input.contentContract.orderedUnits
      .filter((unit) => unit.role === "optional")
      .flatMap((unit) =>
        [unit.contentUnitId, unit.claimId].filter(
          (id): id is string =>
            id != null &&
            known.has(id) &&
            !used.includes(id) &&
            (modelOmitted.includes(id) ||
              !unitSupportsNarration({
                unitText: unit.text,
                claimId: unit.claimId,
                narration: input.narration,
                grounding: input.grounding,
                factHandlingMode: input.factHandlingMode,
              })),
        ),
      ),
  );

  const provenance: RetentionContentIdProvenance =
    reboundIds.length > 0
      ? "safely_rebound"
      : droppedUnknownIds.length > 0 && modelUsed.length === 0
        ? "safely_rebound"
        : "model_supplied";

  return Object.freeze({
    usedContentIds: Object.freeze(uniqueIds(used)),
    omittedContentIds: Object.freeze(omitted),
    hookClaimRefs: Object.freeze(modelHook),
    factualSupport: Object.freeze(
      uniqueIds([...modelSupport, ...used]).map((claimId) =>
        Object.freeze({ claimId }),
      ),
    ),
    droppedUnknownIds: Object.freeze(droppedUnknownIds),
    reboundIds: Object.freeze(uniqueIds(reboundIds)),
    provenance,
  });
}
