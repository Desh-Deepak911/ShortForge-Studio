/** Fetches a remote or blob URL and normalizes the response to an audio Blob. */
export async function fetchAudioBlobFromUrl(
  url: string,
  emptyMessage: string,
  failureMessage: string,
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(failureMessage);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error(emptyMessage);
  }

  if (blob.type.includes("audio") || blob.type.includes("video/webm")) {
    return blob;
  }

  return new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });
}

export function normalizeVoiceoverBlob(blob: Blob): Blob {
  if (blob.type.includes("audio")) {
    return blob;
  }

  return new Blob([blob], { type: "audio/mpeg" });
}
