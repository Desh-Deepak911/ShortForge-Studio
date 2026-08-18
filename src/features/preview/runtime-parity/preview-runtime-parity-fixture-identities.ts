/**
 * Generic fixture identities for the Preview runtime-parity corpus.
 * Visual color is only an operator marker. Production logic must key off ids.
 */

export const PREVIEW_RUNTIME_PARITY_PUBLIC_DIR = "/preview-runtime-parity" as const;

export const PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES = [
  {
    id: "parity-video-a",
    marker: "A",
    fill: "#c41e3a",
    fileName: "video-a.svg",
  },
  {
    id: "parity-video-b",
    marker: "B",
    fill: "#1b8a4a",
    fileName: "video-b.svg",
  },
  {
    id: "parity-video-c",
    marker: "C",
    fill: "#1e4fc4",
    fileName: "video-c.svg",
  },
] as const;

export const PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES = [
  {
    id: "parity-image-p",
    marker: "P",
    fill: "#d97706",
    fileName: "image-p.svg",
  },
  {
    id: "parity-image-q",
    marker: "Q",
    fill: "#7c3aed",
    fileName: "image-q.svg",
  },
] as const;

export type PreviewRuntimeParityVideoIdentityId =
  (typeof PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES)[number]["id"];
export type PreviewRuntimeParityImageIdentityId =
  (typeof PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES)[number]["id"];

export function previewRuntimeParityPublicUrl(fileName: string): string {
  return `${PREVIEW_RUNTIME_PARITY_PUBLIC_DIR}/${fileName}`;
}

export function isPreviewRuntimeParityFixtureId(value: string): boolean {
  return (
    PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES.some((entry) => entry.id === value) ||
    PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES.some((entry) => entry.id === value)
  );
}
