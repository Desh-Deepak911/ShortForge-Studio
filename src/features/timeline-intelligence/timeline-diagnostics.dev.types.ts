/** True when explicit timeline debug env is set — gates preview/export dev logs. */
export const isTimelineDevDiagnosticsEnabled =
  process.env.NEXT_PUBLIC_TIMELINE_DEBUG === "true";
