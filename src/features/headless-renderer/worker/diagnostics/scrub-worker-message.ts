/**
 * Bounded safe worker diagnostics — never surface paths/URLs/captions/args.
 */

const SAFE_MESSAGES: Record<string, string> = {
  cancelled: "Job cancelled.",
  timeout: "Worker deadline exceeded.",
  chromium: "Chromium render failed.",
  encode: "Native encode failed.",
  probe: "Artifact probe validation failed.",
  upload: "Artifact upload failed.",
  stage: "Worker stage transition failed.",
  quota: "Worker workspace quota exceeded.",
  capability: "Requested capability is not supported in Phase 1.",
  claim: "Worker claim was rejected or expired.",
  internal: "Worker failed.",
};

export function scrubWorkerMessage(
  kind: keyof typeof SAFE_MESSAGES,
  _raw?: unknown,
): string {
  void _raw;
  return SAFE_MESSAGES[kind] ?? SAFE_MESSAGES.internal;
}

export function scrubWorkerText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[redacted]")
    .replace(/file:\/\/\S+/gi, "[redacted]")
    .replace(/data:[^\s;]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted-data]")
    .replace(/\/(?:Users|home|var|tmp|private|opt|Applications)\/\S+/g, "[redacted-path]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[redacted-path]")
    .replace(/\b(?:cap_|job_|art_|dlv:|claim_)[A-Za-z0-9:_-]+/g, "[redacted-id]")
    .slice(0, 240);
}
