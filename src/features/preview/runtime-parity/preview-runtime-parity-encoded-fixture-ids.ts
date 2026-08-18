/**
 * Client-safe encoded-fixture identities for Prompt 6.
 * File synthesis stays in the Node-only ensure helper.
 */

export const PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS = [
  "video-a",
  "video-b",
  "video-c",
  "image-p",
  "image-q",
] as const;

export type PreviewRuntimeParityEncodedFixtureId =
  (typeof PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS)[number];

export function previewRuntimeParityEncodedPublicUrl(
  id: PreviewRuntimeParityEncodedFixtureId,
): string {
  return `/api/dev/preview-runtime-parity-encoded/${id}`;
}
