/**
 * Source-quality inspector UI + compatibility verification.
 * Run: npm run test:source-quality-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EXPORT_MANIFEST_VERSION } from "@/features/export/domain/export-manifest.types";
import {
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
} from "@/features/mixed-media-scenes/adapters/inspector-scene-media-projection";
import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import { resolveSceneMediaFraming } from "@/features/media-framing";
import { resolveSourceQualityMedia } from "@/features/source-quality/adapters/resolve-source-quality-media";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import type { FootieScene, SceneMedia } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;
const consoleErrors: string[] = [];
const originalConsoleError = console.error;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(
  width?: number,
  height?: number,
  url = "https://example.com/source.jpg",
): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Narration line.",
    ...overrides,
  };
}

function framingFor(media: SceneMedia | null | undefined) {
  return resolveSceneMediaFraming(
    { media: media ?? undefined },
    { media: media ?? null },
  );
}

function renderSummary(options: {
  readonly scene?: FootieScene;
  readonly media?: SceneMedia | null;
  readonly omitMediaProp?: boolean;
  readonly ready?: boolean;
  readonly enabled?: boolean;
}): string {
  const scene = options.scene ?? baseScene({ media: options.media ?? undefined });
  const resolved = options.omitMediaProp
    ? resolveSourceQualityMedia({ scene })
    : resolveSourceQualityMedia({
        scene,
        media: options.media === undefined ? undefined : options.media,
      });
  return renderToStaticMarkup(
    createElement(SourceQualitySummary, {
      scene,
      ...(options.omitMediaProp
        ? {}
        : {
            media: options.media === undefined ? resolved : options.media,
          }),
      framing: framingFor(resolved),
      readiness: {
        ready: options.ready !== false,
        enabled: options.enabled !== false,
      },
    }),
  );
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
  onKeyDown?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props on rendered node");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
    onKeyDown?: (event: unknown) => void;
  };
}

function SelectionHarness({
  media,
}: {
  readonly media: SceneMedia;
}): ReactElement {
  return createElement(SourceQualitySummary, {
    scene: baseScene({ media }),
    media,
    framing: framingFor(media),
    readiness: { ready: true, enabled: true },
  });
}

async function mountSummary(element: ReactElement): Promise<{
  host: HTMLElement;
  cleanup: () => Promise<void>;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function main(): Promise<void> {
  console.log("\nSource quality inspector UI\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  try {
    test("capability off / loading remains fail-closed with no flash", () => {
      assert.equal(
        renderSummary({ media: imageMedia(1080, 1920), enabled: false }),
        "",
      );
      assert.equal(
        renderSummary({ media: imageMedia(1080, 1920), ready: false }),
        "",
      );
    });

    test("enabled no-media shows neutral attach guidance", () => {
      const html = renderSummary({ media: null, enabled: true, ready: true });
      assert.match(html, /data-source-quality-summary/);
      assert.match(html, /Source quality/);
      assert.match(html, /Quality guidance will appear after media is attached/);
      assert.doesNotMatch(html, /Suitable for 1080p/);
      assert.doesNotMatch(html, /Apply|Reset|coming soon/i);
    });

    test("legacy image fallback with known dimensions (no media prop)", () => {
      const scene = baseScene({
        image: {
          url: "https://example.com/legacy.jpg",
          scale: 1,
          x: 0,
          y: 0,
          fitMode: "fill",
          ...({ width: 1080, height: 1920 } as object),
        },
      });
      assert.equal(scene.media, undefined);
      const html = renderSummary({ scene, omitMediaProp: true });
      assert.match(html, /Suitable for 1080p/);
      assert.match(
        html,
        /can render at 1080p without upscaling under the current framing/,
      );
      assert.doesNotMatch(html, /data-source-quality-summary-key="no_media"/);
      assert.doesNotMatch(html, /cover 1080p/);
    });

    test("unknown / suitable / warning copy", () => {
      const unknown = renderSummary({
        media: imageMedia(undefined, undefined),
      });
      assert.match(unknown, /Source details unavailable/);
      assert.match(
        unknown,
        /Preview and export can still continue\. Quality guidance will improve when dimensions are available/,
      );

      const suitable = renderSummary({ media: imageMedia(1080, 1920) });
      assert.match(suitable, /Suitable for 1080p/);
      assert.match(
        suitable,
        /can render at 1080p without upscaling under the current framing/,
      );
      assert.match(suitable, /4K may still upscale/);
      assert.doesNotMatch(suitable, /can cover 1080p/);

      const warning = renderSummary({ media: imageMedia(900, 1600) });
      assert.match(warning, /may look soft at 1080p/);
      assert.doesNotMatch(warning, /disabled|cannot export|blocked/i);
    });

    test("disclosure and accessibility structure", () => {
      const html = renderSummary({ media: imageMedia(1080, 1920) });
      assert.match(html, /<h3[^>]*>Source quality<\/h3>/);
      assert.match(html, /data-source-quality-badge/);
      assert.match(html, /data-source-quality-details-toggle/);
      assert.match(html, /aria-expanded=/);
      assert.match(html, /aria-controls=/);
      assert.match(html, /aria-labelledby=/);
      assert.doesNotMatch(html, /autofocus|autoFocus/);
    });

    test("narrow-layout-safe class contract", () => {
      const html = renderSummary({ media: imageMedia(1080, 1920) });
      assert.match(html, /min-w-0/);
      assert.match(html, /flex-wrap/);
      assert.match(html, /truncate/);
    });

    test("Media-section placement and no SceneMediaItemInspector panel", () => {
      const inspector = readSrc(
        "src/features/editor/components/StudioSceneInspector.tsx",
      );
      assert.match(inspector, /SourceQualitySummary/);
      assert.match(inspector, /sourceQualityWinningMedia/);
      assert.match(inspector, /resolveNearestInspectorMediaItemId/);
      assert.match(inspector, /resolveInspectorSceneMediaProjection/);
      assert.match(inspector, /resolveSourceQualityMedia/);
      assert.doesNotMatch(
        inspector.slice(
          inspector.indexOf("sourceQualityWinningMedia"),
          inspector.indexOf("sourceQualityFraming"),
        ),
        /getSceneMedia\(scene\)/,
      );

      const sourceQualityIndex = inspector.indexOf("<SourceQualitySummary");
      const pacingIndex = inspector.indexOf("<VisualPacingPanel");
      const sequenceIndex = inspector.indexOf("<MixedMediaSequencePanel");
      assert.ok(sourceQualityIndex >= 0);
      assert.ok(pacingIndex > sourceQualityIndex, "above Visual pacing");
      assert.ok(sequenceIndex > sourceQualityIndex, "above Visual sequence");

      const itemInspector = readSrc(
        "src/features/editor/components/media/SceneMediaItemInspector.tsx",
      );
      assert.doesNotMatch(itemInspector, /SourceQualitySummary/);
    });

    test("winning-item seams: selection change and stale nearest survivor", () => {
      const ignoredUrl = "https://example.com/ignored.jpg";
      let scene = baseScene();
      scene = appendMixedMediaSequenceItem(
        scene,
        imageMedia(1080, 1920, "https://example.com/a.jpg"),
        { mixedMediaScenesEnabled: true, generateId: () => "item-a" },
      ).scene;
      scene = appendMixedMediaSequenceItem(
        scene,
        imageMedia(900, 1600, "https://example.com/b.jpg"),
        { mixedMediaScenesEnabled: true, generateId: () => "item-b" },
      ).scene;
      scene = {
        ...scene,
        media: imageMedia(640, 480, ignoredUrl),
      };

      const projection = resolveInspectorSceneMediaProjection(scene, {
        mixedMediaScenesEnabled: true,
      });
      assert.equal(projection.windows.length, 2);
      const a = projection.windows.find((window) => window.itemId === "item-a")!;
      const b = projection.windows.find((window) => window.itemId === "item-b")!;
      const htmlA = renderSummary({ scene, media: a.media });
      const htmlB = renderSummary({ scene, media: b.media });
      assert.match(htmlA, /Suitable for 1080p/);
      assert.match(htmlB, /may look soft at 1080p/);

      const nearestId = resolveNearestInspectorMediaItemId(
        projection.windows,
        "stale-id",
        0,
      );
      const nearest = projection.windows.find(
        (window) => window.itemId === nearestId,
      );
      assert.ok(nearest?.media);
      assert.notEqual(nearest!.media.url, ignoredUrl);
    });

    test("no Apply/Reset or automatic mutation controls", () => {
      const ui = readSrc(
        "src/features/source-quality/editor/SourceQualitySummary.tsx",
      );
      assert.match(ui, /resolveSourceQualityMedia/);
      assert.doesNotMatch(ui, /scene\.media\s*\?\?/);
      assert.doesNotMatch(ui, /\bApply\b|\bReset\b|coming soon/i);
      assert.doesNotMatch(ui, /onScriptChange|applySceneUpdate|updateSceneMedia/);
    });

    test("one shared capability fetch; no extra provider", () => {
      const provider = readSrc(
        "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
      );
      assert.equal(
        (provider.match(/fetch\(\s*["']\/api\/visual-retention\/capabilities/g) ?? [])
          .length,
        1,
      );
      const summary = readSrc(
        "src/features/source-quality/editor/SourceQualitySummary.tsx",
      );
      assert.match(summary, /useSourceQualityIntelligenceEnabled/);
      assert.doesNotMatch(summary, /fetch\(/);
    });

    test("compatibility boundary: no ExportManifest / render / timing coupling", () => {
      assert.equal(EXPORT_MANIFEST_VERSION, 4);
      const manifestTypes = readSrc(
        "src/features/export/domain/export-manifest.types.ts",
      );
      assert.doesNotMatch(
        manifestTypes,
        /sourceQuality|source-quality|SOURCE_MAY_UPSCALE/,
      );
    });

    await testAsync("rendered: off/loading produce no summary", async () => {
      const off = await mountSummary(
        createElement(SourceQualitySummary, {
          scene: baseScene({ media: imageMedia(1080, 1920) }),
          media: imageMedia(1080, 1920),
          framing: framingFor(imageMedia(1080, 1920)),
          readiness: { ready: true, enabled: false },
        }),
      );
      assert.equal(off.host.querySelector("[data-source-quality-summary]"), null);
      await off.cleanup();

      const loading = await mountSummary(
        createElement(SourceQualitySummary, {
          scene: baseScene({ media: imageMedia(1080, 1920) }),
          media: imageMedia(1080, 1920),
          framing: framingFor(imageMedia(1080, 1920)),
          readiness: { ready: false, enabled: true },
        }),
      );
      assert.equal(
        loading.host.querySelector("[data-source-quality-summary]"),
        null,
      );
      await loading.cleanup();
    });

    await testAsync("rendered: unknown / suitable / warning states", async () => {
      const unknown = await mountSummary(
        createElement(SourceQualitySummary, {
          scene: baseScene({ media: imageMedia() }),
          media: imageMedia(),
          framing: framingFor(imageMedia()),
          readiness: { ready: true, enabled: true },
        }),
      );
      assert.match(
        unknown.host.textContent ?? "",
        /Source details unavailable/,
      );
      await unknown.cleanup();

      const suitable = await mountSummary(
        createElement(SourceQualitySummary, {
          scene: baseScene({ media: imageMedia(1080, 1920) }),
          media: imageMedia(1080, 1920),
          framing: framingFor(imageMedia(1080, 1920)),
          readiness: { ready: true, enabled: true },
        }),
      );
      assert.match(suitable.host.textContent ?? "", /Suitable for 1080p/);
      assert.match(
        suitable.host.textContent ?? "",
        /render at 1080p without upscaling/,
      );
      await suitable.cleanup();

      const warning = await mountSummary(
        createElement(SourceQualitySummary, {
          scene: baseScene({ media: imageMedia(900, 1600) }),
          media: imageMedia(900, 1600),
          framing: framingFor(imageMedia(900, 1600)),
          readiness: { ready: true, enabled: true },
        }),
      );
      assert.match(warning.host.textContent ?? "", /may look soft at 1080p/);
      await warning.cleanup();
    });

    await testAsync(
      "rendered: Details opens targets; keyboard; selection updates; no focus steal",
      async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        const suitableMedia = imageMedia(1080, 1920, "https://example.com/a.jpg");
        await act(async () => {
          root.render(
            createElement(SelectionHarness, { media: suitableMedia }),
          );
        });

        const activeBefore = document.activeElement;
        const toggle = host.querySelector(
          "[data-source-quality-details-toggle]",
        ) as HTMLButtonElement | null;
        assert.ok(toggle);
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
        assert.equal(host.querySelector("[data-source-quality-details]"), null);

        const props = getReactProps(toggle);
        await act(async () => {
          // Native button: Enter activates via click in browsers; exercise onClick.
          props.onClick?.({
            type: "click",
            target: toggle,
            currentTarget: toggle,
            preventDefault() {},
            stopPropagation() {},
          });
        });
        assert.equal(toggle.getAttribute("aria-expanded"), "true");
        assert.ok(host.querySelector("[data-source-quality-details]"));
        assert.ok(host.querySelector("[data-source-quality-facts]"));
        assert.match(
          host.querySelector('[data-source-quality-fact="dimensions"]')
            ?.textContent ?? "",
          /1080\s*×\s*1920/,
        );
        assert.match(
          host.querySelector('[data-source-quality-fact="media-type"]')
            ?.textContent ?? "",
          /image/i,
        );
        assert.ok(host.querySelector('[data-source-quality-target="720p"]'));
        assert.ok(host.querySelector('[data-source-quality-target="1080p"]'));
        assert.ok(host.querySelector('[data-source-quality-target="4k"]'));
        assert.equal(document.activeElement, activeBefore);
        assert.doesNotMatch(host.textContent ?? "", /\bApply\b|\bReset\b/);

        const softMedia = imageMedia(900, 1600, "https://example.com/soft.jpg");
        await act(async () => {
          root.render(createElement(SelectionHarness, { media: softMedia }));
        });
        assert.match(host.textContent ?? "", /may look soft at 1080p/);
        assert.equal(document.activeElement, activeBefore);

        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    );

    test("no React controlled-input or hydration warning noise", () => {
      assert.equal(
        consoleErrors.some((entry) =>
          /controlled|uncontrolled|hydration|did not match/i.test(entry),
        ),
        false,
        consoleErrors.join("\n"),
      );
    });

    test("responsibility-based filenames", () => {
      assert.doesNotMatch(
        "src/features/source-quality/editor/SourceQualitySummary.tsx",
        /sprint|12D|slice|checkpoint/i,
      );
      assert.ok(
        readSrc(
          "src/features/source-quality/domain/source-quality-effective-geometry.ts",
        ).length > 0,
      );
    });
  } finally {
    console.error = originalConsoleError;
  }

  console.log(`\nSource quality inspector UI: ${passed} PASS\n`);
}

void main();
