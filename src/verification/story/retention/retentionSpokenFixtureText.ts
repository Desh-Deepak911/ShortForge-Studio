/**
 * Shared spoken-complete fixture text helpers — Sprint 10H.2B.
 * Test doubles must emit terminal punctuation so completeness gates can pass.
 * Never truncates the base phrase (truncation creates dangling fragments).
 */

/** Pad up to a target word count and terminate with a period. Never shortens base. */
export function padSpokenWords(base: string, target: number): string {
  const cleaned = base
    .trim()
    .replace(/[.!?…]+$/u, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const desired = Math.max(3, target, tokens.length);
  while (tokens.length < desired) tokens.push("pace");
  return `${tokens.join(" ")}.`;
}

/** Join an already-complete opening sentence with a spoken-complete body. */
export function joinOpeningAndBody(opening: string, body: string): string {
  const open = opening.trim();
  const rest = body.trim().replace(/^[.!?…]+/, "").trim();
  if (!rest) return open;
  const completeBody = /[.!?…]$/u.test(rest)
    ? rest
    : `${rest.replace(/[.!?…]+$/u, "")}.`;
  return `${open} ${completeBody}`.replace(/\s+/g, " ").trim();
}
