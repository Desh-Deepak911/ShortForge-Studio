/** True in local development builds — gates timeline diagnostics UI. */
export const isTimelineDevDiagnosticsEnabled =
  process.env.NODE_ENV === "development";
