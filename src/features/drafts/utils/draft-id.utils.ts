/** Stable draft id helper shared by draft builders and storage. */
export function createDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
