const FAST_CADENCE_SPEED = 1.2;
const FAST_CADENCE_INSTRUCTION =
  "Keep the delivery continuous at the selected faster pace. Use brief natural pauses only at sentence boundaries; do not add long dramatic pauses. Do not add, omit, or change any words or facts.";

/**
 * Removes formatting-driven long pauses for fast delivery without changing
 * words, facts, ordering, or the persisted narration. Provider speed remains
 * the sole speed authority.
 */
export function prepareNarrationForVoiceCadence(
  narration: string,
  speed: number,
): string {
  const trimmed = narration.trim();
  if (!trimmed || !Number.isFinite(speed) || speed < FAST_CADENCE_SPEED) {
    return trimmed;
  }

  return trimmed
    .replace(/\r?\n+/g, " ")
    .replace(/(?:\.{2,}|…+)/g, ",")
    .replace(/[—–]+/g, ",")
    .replace(/[!?]{2,}/g, (marks) => (marks.includes("?") ? "?" : "!"))
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

/** Adds cadence guidance only for instruction-capable TTS models. */
export function prepareVoiceCadenceInstructions(input: {
  readonly model: string;
  readonly speed: number;
  readonly instructions?: string;
}): string | undefined {
  const existing = input.instructions?.trim();
  if (
    input.model !== "gpt-4o-mini-tts" ||
    !Number.isFinite(input.speed) ||
    input.speed < FAST_CADENCE_SPEED
  ) {
    return existing || undefined;
  }
  return existing
    ? `${existing}\n\n${FAST_CADENCE_INSTRUCTION}`
    : FAST_CADENCE_INSTRUCTION;
}
