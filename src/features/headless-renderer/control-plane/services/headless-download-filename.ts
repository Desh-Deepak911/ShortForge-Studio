const MAX_DOWNLOAD_FILENAME_LENGTH = 120;

export function resolveHeadlessDownloadFilename(input: {
  readonly requestedFilename: string | null | undefined;
  readonly format: "webm" | "mp4";
}): string {
  const extension = `.${input.format}`;
  const raw = String(input.requestedFilename ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/]/g, "-")
    .replace(/\.\.+/g, ".")
    .trim();
  const withoutExtension = raw.replace(/\.(?:webm|mp4)$/i, "");
  const safeBase = withoutExtension
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_DOWNLOAD_FILENAME_LENGTH - extension.length);
  return `${safeBase || "shortforge-export"}${extension}`;
}

export function contentDispositionForHeadlessDownload(filename: string): string {
  const safe = filename.replace(/["\r\n\\]/g, "-");
  return `attachment; filename="${safe}"`;
}
