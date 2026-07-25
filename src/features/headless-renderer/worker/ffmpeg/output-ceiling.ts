/**
 * FFmpeg output ceiling classification — exact-cap is quota exhaustion.
 */

export function isOutputAtOrOverCeiling(
  byteLength: number,
  maxOutputBytes: number,
): boolean {
  if (
    !Number.isSafeInteger(byteLength) ||
    !Number.isSafeInteger(maxOutputBytes) ||
    byteLength < 0 ||
    maxOutputBytes < 1
  ) {
    return true;
  }
  return byteLength >= maxOutputBytes;
}
