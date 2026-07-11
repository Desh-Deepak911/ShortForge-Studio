/**
 * Browser capability matrix for export resolution approval (Sprint 6F.1).
 */

export type ExportBrowserCapabilityClass =
  | "chromium"
  | "safari"
  | "firefox"
  | "other"
  | "node";

export interface ExportBrowserCapabilityRow {
  readonly browser: ExportBrowserCapabilityClass;
  readonly canvasToBlob: boolean;
  readonly ffmpegWasm: boolean;
  readonly requestVideoFrameCallback: boolean;
  readonly notes: string;
}

export const EXPORT_BROWSER_CAPABILITY_MATRIX: readonly ExportBrowserCapabilityRow[] =
  [
    {
      browser: "chromium",
      canvasToBlob: true,
      ffmpegWasm: true,
      requestVideoFrameCallback: true,
      notes: "Primary production browser for 720p / capability-gated 1080p.",
    },
    {
      browser: "safari",
      canvasToBlob: true,
      ffmpegWasm: true,
      requestVideoFrameCallback: true,
      notes: "Supported with warnings; WebM playback limited.",
    },
    {
      browser: "firefox",
      canvasToBlob: true,
      ffmpegWasm: true,
      requestVideoFrameCallback: true,
      notes: "Supported with warnings; device matrix incomplete.",
    },
    {
      browser: "other",
      canvasToBlob: false,
      ffmpegWasm: false,
      requestVideoFrameCallback: false,
      notes: "Treat as unsupported unless APIs probe positive.",
    },
    {
      browser: "node",
      canvasToBlob: false,
      ffmpegWasm: false,
      requestVideoFrameCallback: false,
      notes: "Verification / CI semantic path only.",
    },
  ];

export function classifyExportBrowserName(
  browserName: string,
): ExportBrowserCapabilityClass {
  const n = browserName.toLowerCase();
  if (n === "node") return "node";
  if (n.includes("chrome") || n.includes("edge") || n.includes("chromium")) {
    return "chromium";
  }
  if (n.includes("safari")) return "safari";
  if (n.includes("firefox")) return "firefox";
  return "other";
}
