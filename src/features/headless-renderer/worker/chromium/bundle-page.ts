/**
 * Load the private Chromium page IIFE for the headless renderer.
 *
 * Production / deployable workers ship `page-render.iife.js` beside the worker
 * artifact (built by `npm run build:headless-worker`). Runtime must not require
 * the repository `src/` tree or the esbuild package.
 *
 * Local development may fall back to on-the-fly esbuild when page-entry source
 * is present and no shipped artifact is found (requires esbuild as a dependency).
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  readShippedPageArtifactAuthority,
  resolveShippedPageArtifactPath,
} from "./shipped-page-artifact";

function resolveTsPath(candidate: string): string | null {
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (existsSync(`${candidate}.ts`)) return `${candidate}.ts`;
  if (existsSync(`${candidate}.tsx`)) return `${candidate}.tsx`;
  const indexTs = join(candidate, "index.ts");
  if (existsSync(indexTs)) return indexTs;
  const indexTsx = join(candidate, "index.tsx");
  if (existsSync(indexTsx)) return indexTsx;
  return null;
}

async function buildPageFromSource(input: {
  maxBytes: number;
}): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; message: string; quota?: boolean }
> {
  const entry = join(
    process.cwd(),
    "src/features/headless-renderer/worker/chromium/page-entry.ts",
  );
  if (!existsSync(entry)) {
    return {
      ok: false,
      message: "Page bundle artifact missing and source entry unavailable.",
    };
  }
  try {
    const esbuild = await import("esbuild");
    const srcRoot = join(process.cwd(), "src");
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: ["chrome120"],
      write: false,
      sourcemap: false,
      logLevel: "silent",
      plugins: [
        {
          name: "footie-alias",
          setup(build) {
            build.onResolve({ filter: /^@\// }, (args) => {
              const resolved = resolveTsPath(join(srcRoot, args.path.slice(2)));
              if (!resolved)
                return {
                  path: args.path,
                  namespace: "file",
                  errors: [{ text: `Unresolved ${args.path}` }],
                };
              return { path: resolved };
            });
          },
        },
      ],
      external: [
        "@ffmpeg/ffmpeg",
        "@ffmpeg/util",
        "server-only",
        "puppeteer-core",
      ],
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });
    const file = result.outputFiles?.[0];
    if (!file) {
      return { ok: false, message: "Page bundle produced no output." };
    }
    const bytes = new Uint8Array(file.contents);
    if (bytes.byteLength > input.maxBytes) {
      return {
        ok: false,
        message: "Generated bundle exceeds byte ceiling.",
        quota: true,
      };
    }
    return { ok: true, bytes };
  } catch {
    return {
      ok: false,
      message: "Page bundle failed.",
    };
  }
}

export async function bundleHeadlessRendererPage(input: {
  maxBytes: number;
  env?: NodeJS.ProcessEnv | Record<string, unknown>;
}): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; message: string; quota?: boolean }
> {
  const env = input.env ?? process.env;
  if (resolveShippedPageArtifactPath(env) != null) {
    const shipped = readShippedPageArtifactAuthority(env);
    if (shipped.ok) {
      if (shipped.byteLength > input.maxBytes) {
        return {
          ok: false,
          message: "Generated bundle exceeds byte ceiling.",
          quota: true,
        };
      }
      return { ok: true, bytes: shipped.bytes };
    }
    return { ok: false, message: "Page bundle artifact unreadable." };
  }
  return buildPageFromSource(input);
}

/** Build HTML string only — disk write requires an active WorkspaceByteBudget reservation. */
export function buildHeadlessRendererHtml(scriptFileName: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ShortForge Headless Renderer</title>
  <style>
    html, body { margin: 0; background: #000; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script src="./${scriptFileName}"></script>
</body>
</html>
`;
}
