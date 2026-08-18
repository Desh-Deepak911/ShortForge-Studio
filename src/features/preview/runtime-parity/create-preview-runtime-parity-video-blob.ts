/**
 * Browser-only local video blobs for the Preview runtime-parity harness.
 * Visible motion + identity marker. No network media and no FFmpeg.
 */

export async function createPreviewRuntimeParityVideoBlobUrl(input: {
  readonly marker: string;
  readonly fill: string;
  readonly durationMs?: number;
}): Promise<string | null> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 284;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function") {
    return null;
  }

  const durationMs = input.durationMs ?? 2_000;
  const fps = 10;
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";
  if (!mimeType) {
    return null;
  }

  const stream = canvas.captureStream(fps);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  const started = performance.now();

  const draw = (now: number) => {
    const elapsed = now - started;
    const x = ((elapsed / 400) % 1) * canvas.width;
    context.fillStyle = input.fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255,255,255,0.35)";
    context.fillRect(x - 12, 0, 24, canvas.height);
    context.fillStyle = "rgba(0,0,0,0.55)";
    context.fillRect(18, 110, 124, 64);
    context.fillStyle = "#ffffff";
    context.font = "700 42px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(input.marker, 80, 154);
  };

  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => resolve(null);
    recorder.onstop = () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(new Blob(chunks, { type: mimeType })));
    };
    recorder.start();
    const tick = () => {
      const now = performance.now();
      draw(now);
      if (now - started >= durationMs) {
        recorder.stop();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
