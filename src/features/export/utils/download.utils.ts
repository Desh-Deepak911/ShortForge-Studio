import { getAudioEngine } from "@/features/audio";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function fetchNarrationBlob(voiceoverUrl: string): Promise<Blob> {
  return getAudioEngine().fetchVoiceoverBlobByUrl(voiceoverUrl);
}

export async function fetchBackgroundMusicBlob(musicUrl: string): Promise<Blob> {
  return getAudioEngine().fetchBackgroundMusicBlobByUrl(musicUrl);
}
