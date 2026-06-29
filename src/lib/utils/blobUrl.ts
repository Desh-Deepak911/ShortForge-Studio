export function isBlobUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("blob:");
}

export function revokeBlobUrl(url: string | null | undefined): void {
  if (isBlobUrl(url)) {
    URL.revokeObjectURL(url);
  }
}
