/**
 * Bounded structured operational events for the hosted worker.
 * Never include secrets, locators, URLs, payloads, or raw provider errors.
 */

export type HeadlessHostedWorkerEventName =
  | "hosted.env.classified"
  | "hosted.binary.preflight"
  | "hosted.composition.ready"
  | "hosted.composition.blocked"
  | "hosted.schema.preflight"
  | "hosted.loop.started"
  | "hosted.loop.delivery"
  | "hosted.render.boundary"
  | "hosted.loop.shutdown"
  | "hosted.loop.fatal"
  | "hosted.process.exit";

export type HeadlessHostedWorkerEvent = {
  readonly name: HeadlessHostedWorkerEventName;
  readonly atMs: number;
  readonly mode?: "verify" | "render";
  readonly reasonId?: string;
  readonly status?: string;
  readonly action?: string;
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
};

export type HeadlessHostedWorkerEventSink = (
  event: HeadlessHostedWorkerEvent,
) => void;

export function emitHostedWorkerEvent(
  sink: HeadlessHostedWorkerEventSink | undefined,
  event: HeadlessHostedWorkerEvent,
): void {
  try {
    sink?.(event);
  } catch {
    // Never let diagnostics crash the worker.
  }
}

/** Safe stdout sink — JSON one-liner, no secret fields by construction. */
export function createStdoutHostedWorkerEventSink(): HeadlessHostedWorkerEventSink {
  return (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  };
}
