/**
 * Deterministic local SVG fixture markup.
 * Videos include a moving stripe so motion is visible without network media.
 */

export function buildPreviewRuntimeParitySvgFixture(input: {
  readonly marker: string;
  readonly fill: string;
  readonly kind: "video" | "image";
}): string {
  const motion =
    input.kind === "video"
      ? `<rect x="-80" y="0" width="80" height="1920" fill="rgba(255,255,255,0.28)">
  <animate attributeName="x" values="-80;1080;-80" dur="2s" repeatCount="indefinite"/>
</rect>`
      : `<path d="M0 0 L1080 1920 M1080 0 L0 1920" stroke="rgba(255,255,255,0.22)" stroke-width="36"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img">
  <rect width="1080" height="1920" fill="${input.fill}"/>
  ${motion}
  <rect x="90" y="780" width="900" height="360" rx="36" fill="rgba(0,0,0,0.55)"/>
  <text x="540" y="930" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="220" font-weight="700" fill="#ffffff">${input.marker}</text>
  <text x="540" y="1080" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="48" fill="#ffffff">${input.kind === "video" ? "VIDEO" : "IMAGE"} ${input.marker}</text>
</svg>
`;
}
