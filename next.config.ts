import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: [
    "@ffmpeg/ffmpeg",
    "@ffmpeg/util",
    "puppeteer-core",
    "esbuild",
    "ffmpeg-static",
  ],
  outputFileTracingIncludes: {
    "/api/generate-voiceover": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/voice-preview": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
