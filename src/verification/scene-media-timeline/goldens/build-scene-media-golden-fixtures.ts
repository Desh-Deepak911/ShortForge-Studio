/**
 * Sprint 8E golden fixture registry builders.
 * Self-contained story/scene graphs — no binary persistence.
 */

import {
  appendSceneMediaImageItem,
  buildTemporarySceneForMediaItemEdit,
  createSequentialMediaItemIdGenerator,
  ensureStoredSceneMediaTimeline,
  updateSceneMediaItemDurationWeight,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import { buildMediaFramingPatch } from "@/features/media-framing";
import { buildMediaMotionPatch } from "@/features/media-motion";
import { buildVideoTrimPatch } from "@/features/media-playback";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { duplicateScene } from "@/features/story/utils/timeline.utils";

import {
  type SceneMediaGoldenDescriptor,
  type SceneMediaGoldenId,
  SCENE_MEDIA_GOLDEN_IDS,
} from "./scene-media-golden-ids";
import {
  SCENE_MEDIA_GOLDEN_SOLID,
  SCENE_MEDIA_GOLDEN_VIDEO,
  goldenImageMedia,
  goldenVideoMedia,
} from "./scene-media-golden-media";

export const SCENE_MEDIA_GOLDEN_PROJECTS: readonly SceneMediaGoldenDescriptor[] = [
  {
    id: "sm-legacy-single-image",
    title: "Legacy single image (no stored timeline)",
    evidenceFocus: "legacy-compat",
  },
  {
    id: "sm-two-equal-images",
    title: "Two images equal weights",
    evidenceFocus: "timeline-windows",
  },
  {
    id: "sm-three-unequal-images",
    title: "Three images unequal weights",
    evidenceFocus: "timeline-windows",
  },
  {
    id: "sm-image-to-video-trim",
    title: "Image → video with trim",
    evidenceFocus: "mixed-media",
  },
  {
    id: "sm-video-to-image",
    title: "Video → image",
    evidenceFocus: "mixed-media",
  },
  {
    id: "sm-multi-video-independent-trims",
    title: "Multiple videos with independent trims",
    evidenceFocus: "mixed-media",
  },
  {
    id: "sm-per-item-framing-motion",
    title: "Per-item framing and motion",
    evidenceFocus: "inspector",
  },
  {
    id: "sm-transition-multi-item-peers",
    title: "Scene transition with multi-item peers",
    evidenceFocus: "transitions",
  },
  {
    id: "sm-placeholder-missing-media",
    title: "Placeholder / missing media failure",
    evidenceFocus: "failure",
  },
  {
    id: "sm-malformed-export-manifest-v2",
    title: "Malformed ExportManifest v2 failure",
    evidenceFocus: "failure",
  },
  {
    id: "sm-draft-reload-duplicate",
    title: "Draft save/reload and scene duplication",
    evidenceFocus: "persistence",
  },
  {
    id: "sm-legacy-explicit-edit-conversion",
    title: "First explicit legacy edit → stored timeline",
    evidenceFocus: "legacy-compat",
  },
] as const;

export interface SceneMediaGoldenFixture {
  readonly id: SceneMediaGoldenId;
  readonly descriptor: SceneMediaGoldenDescriptor;
  readonly story: FootieScript;
  /** Scene under test (first multi-item scene when multiple). */
  readonly primarySceneId: string;
  readonly notes: string;
}

function baseScene(
  id: string,
  durationMs: number,
  media?: SceneMedia,
  extras: Partial<FootieScene> = {},
): FootieScene {
  const startMs = extras.startMs ?? 0;
  return {
    id,
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    duration: durationMs / 1000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle: extras.subtitle ?? `Caption ${id}`,
    narration: extras.narration ?? "Narration stays put.",
    captionMode: "subtitles",
    ...(media ? { media, image: media.type === "image" && media.url
      ? { url: media.url, scale: 1, x: 0, y: 0, rotation: 0 }
      : undefined } : {}),
    ...extras,
  };
}

function storyFromScenes(title: string, scenes: FootieScene[]): FootieScript {
  return syncFootieScript({
    title,
    narration: scenes.map((s) => s.narration ?? "").join(" ").trim() || "Narration.",
    totalDuration: scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    scenes,
  });
}

function withIdGen(prefix: string) {
  return createSequentialMediaItemIdGenerator(prefix);
}

function twoEqualImages(): FootieScene {
  const generateId = withIdGen("g2");
  let scene = baseScene("scene-equal", 6000, goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA));
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemB),
    { generateId },
  ).scene;
  return scene;
}

function threeUnequalImages(): FootieScene {
  const generateId = withIdGen("g3");
  let scene = baseScene("scene-unequal", 6000, goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA));
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemB),
    { generateId },
  ).scene;
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
    { generateId },
  ).scene;
  const ids = scene.mediaTimeline!.items.map((i) => i.id);
  scene = updateSceneMediaItemDurationWeight(scene, ids[0]!, 1).scene;
  scene = updateSceneMediaItemDurationWeight(scene, ids[1]!, 2).scene;
  scene = updateSceneMediaItemDurationWeight(scene, ids[2]!, 3).scene;
  return scene;
}

function imageToVideoTrim(): FootieScene {
  const generateId = withIdGen("g4");
  let scene = baseScene("scene-img-vid", 6000, goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA));
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemB),
    { generateId },
  ).scene;
  const id2 = scene.mediaTimeline!.items[1]!.id;
  scene = updateSceneMediaItemMedia(
    scene,
    id2,
    goldenVideoMedia(SCENE_MEDIA_GOLDEN_VIDEO.clipA),
  ).scene;
  const trim = buildVideoTrimPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { trimStartMs: 500, trimEndMs: 3500 },
  );
  scene = updateSceneMediaItemMedia(scene, id2, trim!.media).scene;
  return scene;
}

function videoToImage(): FootieScene {
  const generateId = withIdGen("g5");
  let scene = baseScene(
    "scene-vid-img",
    6000,
    goldenVideoMedia(SCENE_MEDIA_GOLDEN_VIDEO.clipA, {
      trimStartMs: 0,
      trimEndMs: 4000,
    }),
  );
  // Seed stored timeline then replace second with image.
  scene = ensureStoredSceneMediaTimeline(scene).scene;
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemB),
    { generateId },
  ).scene;
  return scene;
}

function multiVideoIndependentTrims(): FootieScene {
  const generateId = withIdGen("g6");
  let scene = baseScene(
    "scene-multi-vid",
    9000,
    goldenVideoMedia(SCENE_MEDIA_GOLDEN_VIDEO.clipA, {
      trimStartMs: 0,
      trimEndMs: 3000,
    }),
  );
  scene = ensureStoredSceneMediaTimeline(scene).scene;
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemB),
    { generateId },
  ).scene;
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
    { generateId },
  ).scene;
  const ids = scene.mediaTimeline!.items.map((i) => i.id);
  scene = updateSceneMediaItemMedia(
    scene,
    ids[1]!,
    goldenVideoMedia(SCENE_MEDIA_GOLDEN_VIDEO.clipB, {
      trimStartMs: 200,
      trimEndMs: 2200,
    }),
  ).scene;
  scene = updateSceneMediaItemMedia(
    scene,
    ids[2]!,
    goldenVideoMedia(SCENE_MEDIA_GOLDEN_VIDEO.clipC, {
      trimStartMs: 1000,
      trimEndMs: 4000,
    }),
  ).scene;
  return scene;
}

function perItemFramingMotion(): FootieScene {
  let scene = twoEqualImages();
  scene = { ...scene, id: "scene-framing" };
  const id1 = scene.mediaTimeline!.items[0]!.id;
  const id2 = scene.mediaTimeline!.items[1]!.id;
  const framed = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { zoom: 1.6, positionX: 18, positionY: -10 },
  );
  scene = updateSceneMediaItemMedia(scene, id2, framed!.media!).scene;
  const motion = buildMediaMotionPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { enabled: true, presetId: "slow-zoom-in" },
  );
  scene = updateSceneMediaItemMedia(scene, id2, motion!.media).scene;
  // Keep first item distinct framing for independence proof.
  const framed1 = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[0]!.media),
    { zoom: 1.1, positionX: -5 },
  );
  scene = updateSceneMediaItemMedia(scene, id1, framed1!.media!).scene;
  return scene;
}

function transitionMultiItemPeers(): {
  scenes: FootieScene[];
  timelineItems: NonNullable<FootieScript["timelineItems"]>;
} {
  const from = { ...twoEqualImages(), id: "scene-from" };
  const generateId = withIdGen("g8b");
  let to = baseScene(
    "scene-to",
    6000,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
    { startMs: 6000 },
  );
  to = appendSceneMediaImageItem(
    to,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA),
    { generateId },
  ).scene;
  return {
    scenes: [from, to],
    timelineItems: [
      {
        id: "transition-from-to",
        type: "transition",
        fromSceneId: "scene-from",
        toSceneId: "scene-to",
        effect: "fade",
        durationMs: 400,
        label: "Fade",
      },
    ],
  };
}

function placeholderMissing(): FootieScene {
  const scene = twoEqualImages();
  return {
    ...scene,
    id: "scene-placeholder",
    media: { type: "placeholder" },
    image: undefined,
    mediaTimeline: {
      version: 1,
      items: [
        {
          ...scene.mediaTimeline!.items[0]!,
          media: { type: "placeholder" },
        },
        scene.mediaTimeline!.items[1]!,
      ],
    },
  };
}

function draftReloadDuplicate(): { story: FootieScript; primarySceneId: string } {
  const original = twoEqualImages();
  const duplicated = duplicateScene(original);
  const story = storyFromScenes("Draft reload duplicate", [
    { ...original, id: "scene-original" },
    { ...duplicated, id: "scene-dup", startMs: 6000, endMs: 12000, start: 6, end: 12 },
  ]);
  return { story, primarySceneId: "scene-original" };
}

function legacyExplicitEditConversion(): {
  legacy: FootieScene;
  converted: FootieScene;
} {
  const legacy = baseScene(
    "scene-legacy-edit",
    6000,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA),
  );
  // No stored timeline on legacy.
  const { mediaTimeline: _drop, ...withoutTimeline } = legacy as FootieScene & {
    mediaTimeline?: unknown;
  };
  void _drop;
  const cleanLegacy: FootieScene = { ...withoutTimeline };
  const converted = ensureStoredSceneMediaTimeline(cleanLegacy).scene;
  return { legacy: cleanLegacy, converted };
}

export function buildSceneMediaGoldenFixture(
  id: SceneMediaGoldenId,
): SceneMediaGoldenFixture {
  const descriptor = SCENE_MEDIA_GOLDEN_PROJECTS.find((p) => p.id === id)!;

  switch (id) {
    case "sm-legacy-single-image": {
      const scene = baseScene(
        "scene-legacy",
        4000,
        goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemA),
      );
      const { mediaTimeline: _m, ...legacy } = scene as FootieScene & {
        mediaTimeline?: unknown;
      };
      void _m;
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [legacy]),
        primarySceneId: "scene-legacy",
        notes: "No stored mediaTimeline; virtual first-item projection only.",
      };
    }
    case "sm-two-equal-images": {
      const scene = twoEqualImages();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Equal 3000/3000 windows on 6000ms scene.",
      };
    }
    case "sm-three-unequal-images": {
      const scene = threeUnequalImages();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Weights 1:2:3 on 6000ms scene.",
      };
    }
    case "sm-image-to-video-trim": {
      const scene = imageToVideoTrim();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Second item video trim 500–3500.",
      };
    }
    case "sm-video-to-image": {
      const scene = videoToImage();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "First video, second image.",
      };
    }
    case "sm-multi-video-independent-trims": {
      const scene = multiVideoIndependentTrims();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Three video items with distinct trim windows.",
      };
    }
    case "sm-per-item-framing-motion": {
      const scene = perItemFramingMotion();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Independent framing/motion on items.",
      };
    }
    case "sm-transition-multi-item-peers": {
      const { scenes, timelineItems } = transitionMultiItemPeers();
      const story = storyFromScenes(descriptor.title, scenes);
      return {
        id,
        descriptor,
        story: syncFootieScript({
          ...story,
          timelineItems,
        }),
        primarySceneId: scenes[0]!.id,
        notes: "Fade transition; both scenes multi-item.",
      };
    }
    case "sm-placeholder-missing-media": {
      const scene = placeholderMissing();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "First item placeholder; later item drawable.",
      };
    }
    case "sm-malformed-export-manifest-v2": {
      // Story itself is valid; malformed manifest is derived in verify.
      const scene = twoEqualImages();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [scene]),
        primarySceneId: scene.id,
        notes: "Valid story used as base for intentional manifest corruption.",
      };
    }
    case "sm-draft-reload-duplicate": {
      const { story, primarySceneId } = draftReloadDuplicate();
      return {
        id,
        descriptor,
        story,
        primarySceneId,
        notes: "Original + duplicated scene with independent graphs.",
      };
    }
    case "sm-legacy-explicit-edit-conversion": {
      const { converted } = legacyExplicitEditConversion();
      return {
        id,
        descriptor,
        story: storyFromScenes(descriptor.title, [converted]),
        primarySceneId: converted.id,
        notes: "Stored timeline created only via ensureStoredSceneMediaTimeline.",
      };
    }
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown golden id: ${String(_exhaustive)}`);
    }
  }
}

export function listSceneMediaGoldenFixtures(): readonly SceneMediaGoldenFixture[] {
  return SCENE_MEDIA_GOLDEN_IDS.map((id) => buildSceneMediaGoldenFixture(id));
}

export function getLegacyExplicitEditPair(): {
  legacy: FootieScene;
  converted: FootieScene;
} {
  return legacyExplicitEditConversion();
}
