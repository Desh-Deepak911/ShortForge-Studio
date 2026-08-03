/**
 * Source-quality adjustment accessibility and focus verification.
 * Run via: npm run test:source-quality-adjustment-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  act,
  createElement,
  useLayoutEffect,
  useState,
  type ReactElement,
} from "react";
import { createRoot } from "react-dom/client";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  appendMixedMediaSequenceItem,
  removeMixedMediaSequenceItem,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import { resolveSourceQualityWinningAdjustmentTarget } from "@/features/source-quality/adapters/resolve-source-quality-adjustment-target";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

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
  width: number,
  height: number,
  options: { readonly scale?: number; readonly url?: string } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width,
    height,
    fitMode: "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function baseScene(media: SceneMedia, narration = "Narration line."): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration,
    media,
    image: {
      url: media.url!,
      fitMode: "fill",
      x: 0,
      y: 0,
      scale: media.transform?.scale ?? 1,
      rotation: 0,
    },
  };
}

function scriptFor(scene: FootieScene): FootieScript {
  return syncFootieScript({
    title: "SQ adjustment a11y",
    narration: scene.narration ?? "Narration line.",
    totalDuration: 6,
    scenes: [scene],
    exportSettings: {
      fileName: "sq-adj-a11y",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

function framingFor(media: SceneMedia) {
  return resolveSceneMediaFraming({ media }, { media });
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
  };
}

async function click(node: Element | null): Promise<void> {
  assert.ok(node);
  const props = getReactProps(node);
  await act(async () => {
    props.onClick?.({
      type: "click",
      target: node,
      currentTarget: node,
      preventDefault() {},
      stopPropagation() {},
    });
  });
}

async function openDetails(host: HTMLElement): Promise<HTMLButtonElement> {
  const toggle = host.querySelector(
    "[data-source-quality-details-toggle]",
  ) as HTMLButtonElement;
  assert.ok(toggle);
  if (toggle.getAttribute("aria-expanded") !== "true") {
    await click(toggle);
  }
  return toggle;
}

function FocusHarness({
  initialScript,
  selectedMediaItemId = null,
  mixedMediaScenesEnabled = false,
}: {
  readonly initialScript: FootieScript;
  readonly selectedMediaItemId?: string | null;
  readonly mixedMediaScenesEnabled?: boolean;
}): ReactElement {
  const [script, setScript] = useState(initialScript);
  const scene = script.scenes[0]!;
  const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
    mixedMediaScenesEnabled,
    selectedMediaItemId,
  });
  return createElement(SourceQualitySummary, {
    script,
    scene,
    onScriptChange: setScript,
    media: target.media,
    framing: target.media
      ? framingFor(target.media)
      : framingFor(imageMedia(1080, 1920)),
    mediaItemId: target.mediaItemId,
    mixedMediaScenesEnabled,
    readiness: { ready: true, enabled: true },
  });
}

async function main(): Promise<void> {
  console.log("\nSource quality adjustment accessibility\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  try {
    test("source contracts: live region, alert, focus refs, clear button names", () => {
      const controls = readSrc(
        "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
      );
      assert.match(controls, /role="status"/);
      assert.match(controls, /aria-live="polite"/);
      assert.match(controls, /role="alert"/);
      assert.match(controls, /pendingFocusRef/);
      assert.match(controls, /useLayoutEffect/);
      assert.match(controls, /Apply suggested adjustment/);
      assert.match(controls, /Undo adjustment/);
      assert.match(controls, /Keep adjustment/);
      assert.match(controls, /Dismiss saved adjustment info/);
      assert.match(controls, /min-w-0/);
      assert.match(controls, /flex-wrap/);
      assert.doesNotMatch(controls, /setTimeout|setInterval/);
      assert.doesNotMatch(controls, /sourceQualityAdjustmentCommandRunner/);
    });

    await testAsync("Apply success focuses Undo adjustment", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(FocusHarness, {
            initialScript: scriptFor(
              baseScene(imageMedia(1080, 1920, { scale: 1.4 })),
            ),
          }),
        );
      });
      await openDetails(host);
      await click(host.querySelector("[data-source-quality-adjustment-apply]"));
      const undo = host.querySelector(
        "[data-source-quality-adjustment-undo]",
      ) as HTMLButtonElement | null;
      assert.ok(undo);
      assert.equal(document.activeElement, undo);
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync("Undo success focuses Apply when available", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(FocusHarness, {
            initialScript: scriptFor(
              baseScene(imageMedia(1080, 1920, { scale: 1.4 })),
            ),
          }),
        );
      });
      await openDetails(host);
      await click(host.querySelector("[data-source-quality-adjustment-apply]"));
      await click(host.querySelector("[data-source-quality-adjustment-undo]"));
      const apply = host.querySelector(
        "[data-source-quality-adjustment-apply]",
      ) as HTMLButtonElement | null;
      assert.ok(apply);
      assert.equal(document.activeElement, apply);
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync("Keep success focuses Apply or Details toggle", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(FocusHarness, {
            initialScript: scriptFor(
              baseScene(imageMedia(1080, 1920, { scale: 1.4 })),
            ),
          }),
        );
      });
      const toggle = await openDetails(host);
      await click(host.querySelector("[data-source-quality-adjustment-apply]"));
      await click(host.querySelector("[data-source-quality-adjustment-keep]"));
      const apply = host.querySelector(
        "[data-source-quality-adjustment-apply]",
      ) as HTMLButtonElement | null;
      assert.ok(apply || document.activeElement === toggle);
      if (apply) {
        assert.equal(document.activeElement, apply);
      }
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync(
      "failure retains focus and shows plain-language alert",
      async () => {
        // Real refusal: rendered guidance/recommendation targets media A, while
        // the latest script snapshot holds media B (different fingerprint).
        const displayMedia = imageMedia(1080, 1920, {
          scale: 1.4,
          url: "https://example.com/display.jpg",
        });
        const scriptMedia = imageMedia(1080, 1920, {
          scale: 1.4,
          url: "https://example.com/script.jpg",
        });
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => {
          root.render(
            createElement(SourceQualitySummary, {
              script: scriptFor(baseScene(scriptMedia)),
              scene: baseScene(scriptMedia),
              onScriptChange: () => {},
              media: displayMedia,
              framing: framingFor(displayMedia),
              mediaItemId: null,
              readiness: { ready: true, enabled: true },
            }),
          );
        });
        await openDetails(host);
        const apply = host.querySelector(
          "[data-source-quality-adjustment-apply]",
        ) as HTMLButtonElement;
        assert.ok(apply);
        await click(apply);
        assert.equal(document.activeElement, apply);
        const alert = host.querySelector(
          "[data-source-quality-adjustment-alert]",
        );
        assert.ok(alert);
        assert.match(alert.textContent ?? "", /out of date|could not be verified|no longer matches|unavailable/i);
        assert.doesNotMatch(alert.textContent ?? "", /SOURCE_QUALITY_/);
        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    );

    await testAsync(
      "external story/capability/selection updates do not steal focus",
      async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        function ExternalHarness({
          narration,
          enabled,
          media,
        }: {
          readonly narration: string;
          readonly enabled: boolean;
          readonly media: SceneMedia;
        }): ReactElement {
          const [script, setScript] = useState(
            scriptFor(baseScene(media, narration)),
          );
          const scene = {
            ...script.scenes[0]!,
            narration,
            media,
          };
          const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
            mixedMediaScenesEnabled: false,
          });
          return createElement(SourceQualitySummary, {
            script: { ...script, scenes: [scene] },
            scene,
            onScriptChange: setScript,
            media: target.media,
            framing: framingFor(target.media!),
            mediaItemId: target.mediaItemId,
            readiness: { ready: true, enabled },
          });
        }
        const media = imageMedia(1080, 1920, { scale: 1.4 });
        await act(async () => {
          root.render(
            createElement(ExternalHarness, {
              narration: "One",
              enabled: true,
              media,
            }),
          );
        });
        const toggle = await openDetails(host);
        toggle.focus();
        assert.equal(document.activeElement, toggle);
        await act(async () => {
          root.render(
            createElement(ExternalHarness, {
              narration: "Two concurrent narration",
              enabled: true,
              media,
            }),
          );
        });
        assert.equal(document.activeElement, toggle);
        await act(async () => {
          root.render(
            createElement(ExternalHarness, {
              narration: "Two concurrent narration",
              enabled: true,
              media: imageMedia(1080, 1920, {
                scale: 1.4,
                url: "https://example.com/other.jpg",
              }),
            }),
          );
        });
        assert.notEqual(
          document.activeElement?.getAttribute(
            "data-source-quality-adjustment-apply",
          ),
          "",
        );
        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    );

    await testAsync(
      "concurrent narration change survives Apply commit",
      async () => {
        const media = imageMedia(1080, 1920, { scale: 1.4 });
        const bridge = {
          latest: scriptFor(baseScene(media, "Original narration")),
          setScript: null as null | ((next: FootieScript) => void),
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        function ConcurrentHarness(): ReactElement {
          const [script, setScript] = useState(bridge.latest);
          useLayoutEffect(() => {
            bridge.latest = script;
            bridge.setScript = setScript;
          }, [script, setScript]);
          const scene = script.scenes[0]!;
          const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
            mixedMediaScenesEnabled: false,
          });
          return createElement(SourceQualitySummary, {
            script,
            scene,
            onScriptChange: (next) => setScript(next),
            media: target.media,
            framing: framingFor(target.media!),
            mediaItemId: target.mediaItemId,
            readiness: { ready: true, enabled: true },
          });
        }
        await act(async () => {
          root.render(createElement(ConcurrentHarness));
        });
        await openDetails(host);
        assert.ok(bridge.setScript);
        await act(async () => {
          bridge.setScript!({
            ...bridge.latest,
            scenes: [
              {
                ...bridge.latest.scenes[0]!,
                narration: "Edited concurrently",
                subtitle: "Edited subtitle",
              },
            ],
          });
        });
        await click(host.querySelector("[data-source-quality-adjustment-apply]"));
        assert.equal(bridge.latest.scenes[0]!.narration, "Edited concurrently");
        assert.equal(bridge.latest.scenes[0]!.subtitle, "Edited subtitle");
        assert.equal(bridge.latest.scenes[0]!.media?.transform?.scale, 1);
        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    );

    await testAsync(
      "deleted selected item is not recreated; action targets nearest survivor",
      async () => {
        let scene: FootieScene = {
          id: "scene-1",
          start: 0,
          end: 6,
          duration: 6,
          startMs: 0,
          endMs: 6_000,
          durationMs: 6_000,
          subtitle: "Fallback",
          narration: "Narration line.",
        };
        scene = appendMixedMediaSequenceItem(
          scene,
          imageMedia(1080, 1920, {
            url: "https://example.com/keep.jpg",
            scale: 1.5,
          }),
          { mixedMediaScenesEnabled: true, generateId: () => "item-keep" },
        ).scene;
        scene = appendMixedMediaSequenceItem(
          scene,
          imageMedia(1080, 1920, {
            url: "https://example.com/gone.jpg",
            scale: 1.7,
          }),
          { mixedMediaScenesEnabled: true, generateId: () => "item-gone" },
        ).scene;
        scene = removeMixedMediaSequenceItem(scene, "item-gone", {
          mixedMediaScenesEnabled: true,
        }).scene;
        assert.equal(
          scene.visualSequence?.items.some((item) => item.id === "item-gone"),
          false,
        );
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        const bridge = { latest: scriptFor(scene) };
        await act(async () => {
          root.render(
            createElement(function DeletedHarness() {
              const [script, setScript] = useState(bridge.latest);
              bridge.latest = script;
              const active = script.scenes[0]!;
              const target = resolveSourceQualityWinningAdjustmentTarget(active, {
                mixedMediaScenesEnabled: true,
                selectedMediaItemId: "item-gone",
                previousIndexHint: 1,
              });
              assert.equal(target.mediaItemId, "item-keep");
              return createElement(SourceQualitySummary, {
                script,
                scene: active,
                onScriptChange: setScript,
                media: target.media,
                framing: framingFor(target.media!),
                mediaItemId: target.mediaItemId,
                mixedMediaScenesEnabled: true,
                readiness: { ready: true, enabled: true },
              });
            }),
          );
        });
        await openDetails(host);
        await click(host.querySelector("[data-source-quality-adjustment-apply]"));
        const after = bridge.latest.scenes[0]!;
        assert.equal(
          after.visualSequence?.items.some((item) => item.id === "item-gone"),
          false,
        );
        const keep = after.visualSequence!.items.find(
          (item) => item.id === "item-keep",
        )!;
        assert.equal(keep.media.transform?.scale, 1);
        assert.ok(keep.media.sourceQualityAdjustmentProvenance);
        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    );

    test("stale reasons and suggestion text are readable", () => {
      const controls = readSrc(
        "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
      );
      assert.match(controls, /STALE_REASON_COPY/);
      assert.match(controls, /describeProposedChanges/);
      assert.match(
        controls,
        /Timing, media order,\s*narration, captions, and music will not change/,
      );
    });

    test("no React controlled-input or hydration warning noise", () => {
      assert.equal(
        consoleErrors.some((entry) =>
          /controlled|uncontrolled|hydration|did not match/i.test(entry),
        ),
        false,
        consoleErrors.join("\n"),
      );
    });
  } finally {
    console.error = originalConsoleError;
  }

  console.log(`\nSource quality adjustment accessibility: ${passed} PASS\n`);
}

void main();
