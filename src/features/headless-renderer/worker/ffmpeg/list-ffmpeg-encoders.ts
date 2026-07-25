/**
 * Capability preflight: prove selected FFmpeg encoders exist (no silent fallback).
 */

import { execFileSync } from "node:child_process";

let cached: { executable: string; encoders: ReadonlySet<string> } | null = null;

export function listFfmpegEncoders(ffmpegExecutable: string): ReadonlySet<string> {
  if (cached && cached.executable === ffmpegExecutable) {
    return cached.encoders;
  }
  const out = execFileSync(ffmpegExecutable, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });
  const encoders = new Set<string>();
  for (const line of out.split("\n")) {
    // " V....D libx264  ..." / " A....D aac ..." — flag field is 6 chars of letters/dots.
    const match = /^\s*[A-Z\.]{6}\s+(\S+)/.exec(line);
    if (match?.[1]) {
      encoders.add(match[1]);
    }
  }
  cached = { executable: ffmpegExecutable, encoders };
  // Return a detached copy — never the mutable cache Set.
  return new Set(encoders);
}

/** Test-only — clear encoder cache between fixtures. */
export function clearFfmpegEncoderCacheForTests(): void {
  cached = null;
}

export function assertFfmpegEncodersPresent(input: {
  ffmpegExecutable: string;
  required: readonly string[];
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: readonly string[] } {
  let encoders: ReadonlySet<string>;
  try {
    encoders = listFfmpegEncoders(input.ffmpegExecutable);
  } catch {
    return { ok: false, missing: [...input.required] };
  }
  const missing = input.required.filter((name) => !encoders.has(name));
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}
