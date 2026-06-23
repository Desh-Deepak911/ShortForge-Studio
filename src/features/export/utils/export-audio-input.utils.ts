import type { AudioTrack } from "@/features/audio/types/audio.types";

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "video/webm": ".webm",
};

export interface ExportNormalizedAudioInput {
  blob: Blob;
  mimeType: string;
  extension: string;
  fileName: string;
}

export interface ExportAudioInputPayload {
  blob?: Blob | File;
  src?: string;
  base64?: string;
  fileName?: string;
  mimeType?: string;
  /** Virtual filename prefix when no fileName is provided. Defaults to `audio`. */
  fallbackBaseName?: string;
}

export type ExportAudioInput =
  | Blob
  | File
  | string
  | AudioTrack
  | ExportAudioInputPayload;

function isAudioTrack(value: ExportAudioInput): value is AudioTrack {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value instanceof Blob) {
    return false;
  }

  const candidate = value as AudioTrack;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.src === "string" &&
    (candidate.type === "voiceover" || candidate.type === "background")
  );
}

function isExportAudioInputPayload(
  value: ExportAudioInput,
): value is ExportAudioInputPayload {
  if (!value || typeof value !== "object" || value instanceof Blob) {
    return false;
  }

  return !isAudioTrack(value);
}

function isObjectUrl(value: string): boolean {
  return value.startsWith("blob:");
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeRawBase64(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 16) {
    return false;
  }

  if (trimmed.includes("://") || /\s/.test(trimmed)) {
    return false;
  }

  return /^[A-Za-z0-9+/]+=*$/.test(trimmed);
}

function normalizeMimeType(value: string | undefined | null): string {
  const trimmed = value?.split(";")[0]?.trim().toLowerCase();
  return trimmed || "audio/mpeg";
}

function extensionFromFileName(fileName: string | undefined): string | null {
  const match = fileName?.match(/(\.[a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!match || !SUPPORTED_EXTENSIONS.has(match)) {
    return null;
  }

  return match;
}

/** Maps a MIME type to a supported FFmpeg input extension. */
export function resolveExportAudioExtensionFromMime(mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);

  if (MIME_TO_EXTENSION[normalized]) {
    return MIME_TO_EXTENSION[normalized]!;
  }

  if (normalized.includes("wav")) {
    return ".wav";
  }

  if (normalized.includes("ogg")) {
    return ".ogg";
  }

  if (normalized.includes("aac")) {
    return ".aac";
  }

  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return ".m4a";
  }

  if (normalized.includes("webm")) {
    return ".webm";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return ".mp3";
  }

  return ".mp3";
}

function resolveExtension(options: {
  mimeType: string;
  fileName?: string;
}): string {
  return (
    extensionFromFileName(options.fileName) ??
    resolveExportAudioExtensionFromMime(options.mimeType)
  );
}

function resolveOutputFileName(
  fileName: string | undefined,
  extension: string,
  fallbackBaseName: string,
): string {
  const trimmed = fileName?.trim();
  if (trimmed) {
    if (/\.[a-z0-9]+$/i.test(trimmed)) {
      return trimmed;
    }

    return `${trimmed}${extension}`;
  }

  return `${fallbackBaseName}${extension}`;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^,]*?),([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid data URL audio input");
  }

  const metadata = match[1] ?? "";
  const payload = match[2] ?? "";
  const mimeType = normalizeMimeType(metadata.split(";")[0] || undefined);
  const isBase64 = metadata.includes(";base64");

  const bytes = isBase64
    ? decodeBase64ToBytes(payload)
    : Uint8Array.from(decodeURIComponent(payload), (char) => char.charCodeAt(0));

  if (bytes.length === 0) {
    throw new Error("Audio input is empty");
  }

  return { mimeType, bytes };
}

function ensureNonEmptyBlob(blob: Blob, emptyMessage = "Audio input is empty"): Blob {
  if (blob.size === 0) {
    throw new Error(emptyMessage);
  }

  return blob;
}

function createBlobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: mimeType });
}

async function fetchAudioBlobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio input (${response.status})`);
  }

  const blob = await response.blob();
  return ensureNonEmptyBlob(blob);
}

function inferMimeTypeFromFileName(fileName: string | undefined): string | null {
  const extension = extensionFromFileName(fileName);
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".m4a" || extension === ".aac") return "audio/mp4";
  if (extension === ".webm") return "audio/webm";
  if (extension === ".mp3") return "audio/mpeg";
  return null;
}

/** Maps a supported file name extension to MIME type for export/draft hydration. */
export function inferExportAudioMimeTypeFromFileName(
  fileName: string | undefined,
): string | null {
  return inferMimeTypeFromFileName(fileName);
}

const UNTRUSTED_BLOB_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

function mimeTypeConflictsWithFileName(blobMime: string, fileName?: string): boolean {
  const extension = extensionFromFileName(fileName);
  if (!extension) {
    return false;
  }

  const expectedMime = inferMimeTypeFromFileName(fileName);
  if (!expectedMime) {
    return false;
  }

  const normalizedBlobMime = normalizeMimeType(blobMime);
  if (UNTRUSTED_BLOB_MIME_TYPES.has(normalizedBlobMime)) {
    return true;
  }

  return resolveExportAudioExtensionFromMime(normalizedBlobMime) !== extension;
}

/** Resolves export MIME from explicit hint, file name, or blob metadata. */
export function resolveExportAudioMimeType(options: {
  blobType?: string;
  fileName?: string;
  explicitMimeType?: string;
}): string {
  if (options.explicitMimeType?.trim()) {
    return normalizeMimeType(options.explicitMimeType);
  }

  const fromFileName = inferMimeTypeFromFileName(options.fileName);
  const blobType = options.blobType?.trim() ?? "";

  if (fromFileName && (!blobType || mimeTypeConflictsWithFileName(blobType, options.fileName))) {
    return fromFileName;
  }

  if (blobType) {
    return normalizeMimeType(blobType);
  }

  return fromFileName ?? "audio/mpeg";
}

function resolveMimeTypeFromBlob(blob: Blob, fileName?: string, explicitMimeType?: string): string {
  return resolveExportAudioMimeType({
    blobType: blob.type,
    fileName,
    explicitMimeType,
  });
}

async function normalizeFromBlobLike(
  blob: Blob,
  options: {
    fileName?: string;
    mimeType?: string;
    fallbackBaseName?: string;
  } = {},
): Promise<ExportNormalizedAudioInput> {
  const nonEmptyBlob = ensureNonEmptyBlob(blob);
  const fileNameHint = options.fileName ?? (blob instanceof File ? blob.name : undefined);
  const mimeType = resolveMimeTypeFromBlob(nonEmptyBlob, fileNameHint, options.mimeType);
  const extension = resolveExtension({ mimeType, fileName: fileNameHint });
  const normalizedBlob =
    nonEmptyBlob.type === mimeType
      ? nonEmptyBlob
      : new Blob([await nonEmptyBlob.arrayBuffer()], { type: mimeType });

  return {
    blob: normalizedBlob,
    mimeType,
    extension,
    fileName: resolveOutputFileName(
      fileNameHint,
      extension,
      options.fallbackBaseName ?? "audio",
    ),
  };
}

async function normalizeFromBase64(
  base64: string,
  options: {
    fileName?: string;
    mimeType?: string;
    fallbackBaseName?: string;
  } = {},
): Promise<ExportNormalizedAudioInput> {
  const bytes = decodeBase64ToBytes(base64);
  if (bytes.length === 0) {
    throw new Error("Audio input is empty");
  }

  const mimeType = normalizeMimeType(
    options.mimeType ?? inferMimeTypeFromFileName(options.fileName) ?? "audio/mpeg",
  );
  const blob = createBlobFromBytes(bytes, mimeType);

  return normalizeFromBlobLike(blob, options);
}

async function normalizeFromUrl(
  url: string,
  options: {
    fileName?: string;
    mimeType?: string;
    fallbackBaseName?: string;
  } = {},
): Promise<ExportNormalizedAudioInput> {
  if (isDataUrl(url)) {
    const { mimeType, bytes } = parseDataUrl(url);
    const blob = createBlobFromBytes(bytes, mimeType);
    return normalizeFromBlobLike(blob, {
      ...options,
      mimeType: options.mimeType ?? mimeType,
    });
  }

  const blob = await fetchAudioBlobFromUrl(url);
  return normalizeFromBlobLike(blob, options);
}

async function normalizeFromString(
  value: string,
  options: {
    fileName?: string;
    mimeType?: string;
    fallbackBaseName?: string;
  } = {},
): Promise<ExportNormalizedAudioInput> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Audio input is empty");
  }

  if (isObjectUrl(trimmed) || isHttpUrl(trimmed) || isDataUrl(trimmed)) {
    return normalizeFromUrl(trimmed, options);
  }

  if (looksLikeRawBase64(trimmed)) {
    return normalizeFromBase64(trimmed, options);
  }

  throw new Error("Unsupported audio input string");
}

/**
 * Normalizes export audio into FFmpeg-ready bytes.
 * Accepts blobs, files, object URLs, HTTP URLs, base64, data URLs, and audio tracks.
 */
export async function normalizeExportAudioInput(
  audioTrack: ExportAudioInput,
): Promise<ExportNormalizedAudioInput> {
  if (typeof audioTrack === "string") {
    return normalizeFromString(audioTrack);
  }

  if (audioTrack instanceof Blob) {
    return normalizeFromBlobLike(audioTrack, {
      fileName: audioTrack instanceof File ? audioTrack.name : undefined,
    });
  }

  if (isAudioTrack(audioTrack)) {
    const fallbackBaseName = audioTrack.type === "background" ? "music" : "audio";
    const metadataMimeType = audioTrack.metadata?.mimeType;
    return normalizeExportAudioInput({
      src: audioTrack.src,
      fileName: audioTrack.fileName,
      mimeType: typeof metadataMimeType === "string" ? metadataMimeType : undefined,
      fallbackBaseName,
    });
  }

  if (isExportAudioInputPayload(audioTrack)) {
    const fallbackBaseName = audioTrack.fallbackBaseName ?? "audio";

    if (audioTrack.blob) {
      return normalizeFromBlobLike(audioTrack.blob, {
        fileName: audioTrack.fileName ?? (audioTrack.blob instanceof File ? audioTrack.blob.name : undefined),
        mimeType: audioTrack.mimeType,
        fallbackBaseName,
      });
    }

    if (audioTrack.base64?.trim()) {
      return normalizeFromBase64(audioTrack.base64, {
        fileName: audioTrack.fileName,
        mimeType: audioTrack.mimeType,
        fallbackBaseName,
      });
    }

    if (audioTrack.src?.trim()) {
      return normalizeFromString(audioTrack.src, {
        fileName: audioTrack.fileName,
        mimeType: audioTrack.mimeType,
        fallbackBaseName,
      });
    }
  }

  throw new Error("Audio input is missing");
}

/** Virtual FFmpeg filename for a normalized voiceover input. */
export function buildFfmpegVoiceInputFilename(extension: string): string {
  return `voice${extension}`;
}

/** Virtual FFmpeg filename for a normalized background music input. */
export function buildFfmpegMusicInputFilename(extension: string): string {
  return `music${extension}`;
}
