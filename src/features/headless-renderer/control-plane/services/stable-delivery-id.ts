/**
 * Stable queue delivery identity — derived from jobId/ownedObjectId + attempt.
 * Recovery must mint a new identity for a new attempt; never reuse an acked id.
 */

export function stableHeadlessDeliveryId(
  jobId: string,
  attempt: number,
): string {
  return `dlv:${jobId}:${attempt}`;
}

export function stableHeadlessVerifyDeliveryId(
  ownedObjectId: string,
  attempt: number,
): string {
  return `dlv:verify:${ownedObjectId}:${attempt}`;
}
