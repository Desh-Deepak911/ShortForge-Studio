/**
 * PNG frame validation for streamed encode — signature, IHDR, size ceilings.
 */

export const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
] as const);

export function readPngIhdrSize(
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | null {
  if (bytes.byteLength < 24) return null;
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
  if (width < 1 || height < 1) return null;
  return { width, height };
}

export function assertValidStreamPngFrame(input: {
  readonly bytes: Uint8Array;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly maxSingleFrameBytes: number;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "malformed" | "dimensions" | "too_large" } {
  if (
    !Number.isSafeInteger(input.maxSingleFrameBytes) ||
    input.maxSingleFrameBytes < 1 ||
    input.bytes.byteLength > input.maxSingleFrameBytes
  ) {
    return { ok: false, reason: "too_large" };
  }
  const size = readPngIhdrSize(input.bytes);
  if (!size) return { ok: false, reason: "malformed" };
  if (
    size.width !== input.expectedWidth ||
    size.height !== input.expectedHeight
  ) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true };
}
