/**
 * Resolve system Chrome/Chromium — never auto-download browsers.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.HEADLESS_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

export function resolveSystemChromeExecutable():
  | { readonly ok: true; readonly executable: string; readonly version: string }
  | { readonly ok: false; readonly message: string } {
  for (const executable of CANDIDATES) {
    if (!existsSync(executable)) continue;
    let version = "unknown";
    try {
      version = execFileSync(executable, ["--version"], {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 16 * 1024,
      })
        .trim()
        .replace(/\s+/g, " ");
    } catch {
      /* keep unknown */
    }
    return { ok: true, executable, version };
  }
  return {
    ok: false,
    message:
      "No system Chrome/Chromium executable found. Set HEADLESS_CHROME_PATH or install Google Chrome.",
  };
}
