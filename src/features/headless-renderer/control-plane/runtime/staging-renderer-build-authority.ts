/**
 * Server-owned renderer identity accepted by the staging website control plane.
 *
 * The browser never supplies this value. Keep the equality assertion with the
 * hosted worker identity in the staging website integration authority suite.
 */
export const STAGING_HEADLESS_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.13" as const;
