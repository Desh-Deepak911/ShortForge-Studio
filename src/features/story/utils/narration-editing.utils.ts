/**
 * Presents generated narration as one editable paragraph.
 * Spoken wording and punctuation are preserved; only layout whitespace changes.
 */
export function normalizeNarrationForEditing(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Removes pasted/entered line breaks without trimming an in-progress edit. */
export function keepNarrationInSingleParagraph(value: string): string {
  return value.replace(/[ \t]*\r?\n+[ \t]*/g, " ");
}
