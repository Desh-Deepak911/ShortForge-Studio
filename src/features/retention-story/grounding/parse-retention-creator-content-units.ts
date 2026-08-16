/**
 * Deterministic creator-content unit parser — story-quality Prompt 2.
 * Preserves source order. Does not invent words or relationships.
 */

import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import { RETENTION_MAX_CLAIM_TEXT_CHARS } from "../domain/retention-story-contract.constants";
import {
  retentionStableHash,
  retentionStableStringify,
} from "../domain/retention-story-fingerprint";
import type {
  RetentionContentUnitKind,
  RetentionContentUnitRole,
  RetentionContentUnitSourceField,
  RetentionCreatorContentUnit,
} from "../domain/retention-creator-content-contract.types";

export const RETENTION_MAX_CREATOR_CONTENT_UNITS_PER_FIELD = 16;

const SECTION_HEADING =
  /^(?:#{1,3}\s*)?(?:brief|manual\s+notes?|additional\s+(?:notes?|context)|facts?|required\s+facts?|optional\s+facts?|creative\s+premise|premise|controlling\s+idea|required|optional|must\s+include|nice\s+to\s+have)\s*:?\s*$/iu;

const REQUIRED_HEADING =
  /^(?:#{1,3}\s*)?(?:required(?:\s+facts?)?|must\s+include)\s*:?\s*$/iu;

const OPTIONAL_HEADING =
  /^(?:#{1,3}\s*)?(?:optional(?:\s+facts?)?|nice\s+to\s+have)\s*:?\s*$/iu;

const INSTRUCTION_ONLY =
  /^(?:(?:please\s+)?(?:tell|create|write|explain|cover|show|describe|make|build|craft|generate|develop|produce|preview|recap|review|analyze|compare|rank|preserve)\b(?:\s+(?:me|us))?(?:\s+(?:a|an|the))?(?:\s+story\s+(?:about|of))?|focus\s+on\b|keep\s+the\s+narration\b|end\s+on\b|avoid\s+(?:invent|naming|adding)\b)/iu;

const FORBIDDEN_INSTRUCTION =
  /^(?:do\s+not|don't|never)\s+(?:claim|invent|say|name|add|include|assert|mention)\b/iu;

const UNCERTAINTY_MARKERS =
  /\b(?:maybe|might|may|reportedly|allegedly|unconfirmed|uncertain|unclear|possibly|perhaps|rumou?red)\b/iu;

const INTERPRETIVE_MARKERS =
  /\b(?:because|means|suggests|shows|proves|should|must|deserves|matters|why|whether)\b/iu;

const FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "is",
  "was",
  "are",
  "were",
]);

function stripListMarker(text: string): string {
  return text.replace(/^(?:[-*•]+|\d+[.)])\s+/u, "").trim();
}

function buildContentUnitId(input: {
  readonly sourceField: RetentionContentUnitSourceField;
  readonly creatorOrder: number;
  readonly text: string;
}): string {
  const digest = retentionStableHash(
    retentionStableStringify({
      kind: "creator_content_unit",
      sourceField: input.sourceField,
      creatorOrder: input.creatorOrder,
      text: input.text,
    }),
  );
  return sanitizeRetentionText(`rs:u:${digest}`, 128);
}

function extractEntityTokens(text: string): readonly string[] {
  const tokens = text
    .normalize("NFC")
    .split(/[^\p{L}\p{N}'’-]+/u)
    .filter((token) => {
      if (token.length < 2) return false;
      if (FUNCTION_WORDS.has(token.toLowerCase())) return false;
      return /[A-Z]|\d/u.test(token[0] ?? "") || token.length >= 4;
    });
  return Object.freeze([...new Set(tokens)].slice(0, 12));
}

function classifyKind(text: string): RetentionContentUnitKind {
  if (FORBIDDEN_INSTRUCTION.test(text)) return "forbidden";
  if (INSTRUCTION_ONLY.test(text)) return "instruction";
  if (UNCERTAINTY_MARKERS.test(text)) return "uncertain";
  if (INTERPRETIVE_MARKERS.test(text) && !/\b\d{4}\b|\b\d+\s*[-–]\s*\d+\b/u.test(text)) {
    return "interpretive";
  }
  return "factual";
}

function splitSafeClauses(text: string): readonly string[] {
  const trimmed = text.trim();
  if (trimmed.length < 48) return Object.freeze([trimmed]);
  const parts = trimmed
    .split(/\s*[;–—]\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
  if (parts.length < 2) return Object.freeze([trimmed]);
  const wordCounts = parts.map(
    (part) => part.split(/\s+/u).filter(Boolean).length,
  );
  if (wordCounts.some((count) => count < 5)) return Object.freeze([trimmed]);
  return Object.freeze(parts);
}

function collectBlocks(normalized: string): readonly {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}[] {
  const blocks: Array<{ text: string; start: number; end: number }> = [];
  const lines = normalized.split("\n");
  let offset = 0;
  for (const line of lines) {
    const start = offset;
    offset += line.length + 1;
    const cleaned = stripListMarker(line.trim());
    if (!cleaned) continue;
    blocks.push({
      // A creator may paste several complete facts on one line. Bound the
      // field globally, then split it into semantic units before applying the
      // per-unit limit. Truncating the whole line here silently discarded all
      // later facts from rich briefs.
      text: sanitizeRetentionText(
        cleaned,
        RETENTION_MAX_CLAIM_TEXT_CHARS *
          RETENTION_MAX_CREATOR_CONTENT_UNITS_PER_FIELD,
      ),
      start,
      end: start + line.length,
    });
  }
  return Object.freeze(blocks);
}

/**
 * Parse one creator field into ordered semantic units.
 * Instruction-only lines stay classified but are not eligible facts.
 */
export function parseRetentionCreatorContentUnits(input: {
  readonly text: string | null | undefined;
  readonly sourceField: RetentionContentUnitSourceField;
  readonly defaultRole?: RetentionContentUnitRole;
  readonly startOrder?: number;
}): readonly RetentionCreatorContentUnit[] {
  const raw = String(input.text ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n");
  if (!raw.trim()) return Object.freeze([]);

  const bounded = raw.slice(
    0,
    RETENTION_MAX_CLAIM_TEXT_CHARS * RETENTION_MAX_CREATOR_CONTENT_UNITS_PER_FIELD,
  );
  const blocks = collectBlocks(bounded);
  const units: RetentionCreatorContentUnit[] = [];
  let role: RetentionContentUnitRole = input.defaultRole ?? "essential";
  let order = input.startOrder ?? 0;

  for (const block of blocks) {
    if (REQUIRED_HEADING.test(block.text)) {
      role = "essential";
      continue;
    }
    if (OPTIONAL_HEADING.test(block.text)) {
      role = "optional";
      continue;
    }
    if (SECTION_HEADING.test(block.text)) continue;

    const sentences = block.text
      .split(/(?<=[.!?…])\s+/u)
      .map((part) => part.trim())
      .filter(Boolean);
    const pieces = sentences.length > 0 ? sentences : [block.text];

    for (const piece of pieces) {
      // Sentence splitting can separate an inline numbered marker ("2.")
      // from the entry that follows it. It is structure, never story fact.
      if (/^\d+[.)]?$/u.test(piece)) continue;
      const clauses = splitSafeClauses(piece);
      const parentId =
        clauses.length > 1
          ? buildContentUnitId({
              sourceField: input.sourceField,
              creatorOrder: order,
              text: piece,
            })
          : null;
      for (const clause of clauses) {
        const boundedClause = sanitizeRetentionText(
          clause,
          RETENTION_MAX_CLAIM_TEXT_CHARS,
        );
        if (!boundedClause) continue;
        const kind = classifyKind(boundedClause);
        const contentUnitId = buildContentUnitId({
          sourceField: input.sourceField,
          creatorOrder: order,
          text: boundedClause,
        });
        units.push(
          Object.freeze({
            contentUnitId,
            claimId: null,
            sourceField: input.sourceField,
            creatorOrder: order,
            sourceSpan: Object.freeze({
              start: block.start,
              end: block.end,
            }),
            role,
            kind,
            authority:
              kind === "forbidden"
                ? ("forbidden" as const)
                : ("creator_supplied_unverified" as const),
            entityTokens: extractEntityTokens(boundedClause),
            parentContentUnitId: parentId,
            requiresUncertainty: kind === "uncertain",
            text: boundedClause,
          }),
        );
        order += 1;
        if (units.length >= RETENTION_MAX_CREATOR_CONTENT_UNITS_PER_FIELD) {
          return Object.freeze(units);
        }
      }
    }
  }

  return Object.freeze(units);
}

export function creatorContentUnitIsClaimEligible(
  unit: RetentionCreatorContentUnit,
): boolean {
  if (unit.kind === "instruction") return false;
  if (unit.kind === "forbidden") return true;
  return (
    unit.kind === "factual" ||
    unit.kind === "interpretive" ||
    unit.kind === "uncertain"
  );
}
