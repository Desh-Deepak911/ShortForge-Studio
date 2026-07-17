/**
 * Sprint 9D golden fixture builders — self-contained story graphs.
 */

import { createSequentialMediaItemIdGenerator } from "@/features/scene-media-timeline";
import {
  resetSceneMediaTransitionBoundary,
  setSceneMediaTransitionBoundary,
} from "@/features/scene-media-transitions";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
  TransitionEffect,
  TransitionTimelineItem,
} from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  INTRA_SCENE_TRANSITION_GOLDEN_IDS,
  type IntraSceneTransitionGoldenDescriptor,
  type IntraSceneTransitionGoldenId,
} from "./intra-scene-transition-golden-ids";
import {
  istImageA,
  istImageB,
  istImageC,
  istVideoA,
  istVideoB,
} from "./intra-scene-transition-golden-media";

export const INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS: readonly IntraSceneTransitionGoldenDescriptor[] =
  [
    {
      id: "ist-hard-cut-absence",
      title: "No stored boundary → hard cut",
      description: "Two drawable items with no mediaTransitions track.",
      evidenceClass: "automated-semantic",
      expectedPreview: "hard-cut",
      expectedExport: "hard-cut-v3-empty",
      expectedManifest: { kind: "v3", hasBoundaries: false },
    },
    {
      id: "ist-hard-cut-explicit-removal",
      title: "Explicit Cut removal → hard cut",
      description: "Boundary set then cleared with Cut (absence).",
      evidenceClass: "automated-semantic",
      expectedPreview: "hard-cut",
      expectedExport: "hard-cut-v3-empty",
      expectedManifest: { kind: "v3", hasBoundaries: false },
    },
    {
      id: "ist-fade",
      title: "Fade",
      description: "Image→image fade 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-slide-left",
      title: "Slide Left",
      description: "Image→image slide-left 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-slide-right",
      title: "Slide Right",
      description: "Image→image slide-right 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-zoom-in",
      title: "Zoom In",
      description: "Image→image zoom-in 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-zoom-out",
      title: "Zoom Out",
      description: "Image→image zoom-out 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-blur",
      title: "Blur",
      description: "Image→image blur 500ms.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-multi-boundary-abc",
      title: "A→B then B→C",
      description: "Three items with consecutive fade + slide-left.",
      evidenceClass: "automated-semantic",
      expectedPreview: "multi-overlay",
      expectedExport: "multi-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-image-to-image",
      title: "Image→image",
      description: "Drawable image peers with fade.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-image-to-video",
      title: "Image→video",
      description: "Image outgoing, trimmed video incoming.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-video-to-image",
      title: "Video→image",
      description: "Trimmed video outgoing, image incoming.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-video-to-video",
      title: "Video→video",
      description: "Two trimmed videos with fade.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-duration-under-clamp",
      title: "Requested duration under clamp",
      description: "500ms requested on 3000ms windows (clamp 1200) → effective 500.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-duration-clamped-40pct",
      title: "Requested duration reduced by 40% clamp",
      description: "1000ms requested on 1000ms windows → effective 400.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-placeholder-fallback",
      title: "Placeholder peer fallback",
      description: "Stored fade with non-drawable peer → hard cut in Preview/Export.",
      evidenceClass: "automated-semantic",
      expectedPreview: "hard-cut",
      expectedExport: "hard-cut-v3-empty",
      expectedManifest: { kind: "v3", hasBoundaries: false },
    },
    {
      id: "ist-legacy-single-media",
      title: "Legacy single-media scene",
      description: "No stored timeline — ordinary single media.",
      evidenceClass: "automated-semantic",
      expectedPreview: "legacy-ordinary",
      expectedExport: "legacy-ordinary",
      expectedManifest: { kind: "v3", hasBoundaries: false },
    },
    {
      id: "ist-scene-to-scene-priority",
      title: "Scene-to-scene over intra-scene",
      description: "Two scenes; transitionOut overlaps second scene start.",
      evidenceClass: "automated-semantic",
      expectedPreview: "scene-to-scene-wins",
      expectedExport: "scene-to-scene-priority",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-captions-during-overlay",
      title: "Captions through overlay",
      description: "Subtitles present; overlay must not suppress them in Preview/Export.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "active-overlay-v3",
      expectedManifest: { kind: "v3", hasBoundaries: true },
    },
    {
      id: "ist-v2-hard-cut-compat",
      title: "Frozen v2 / 8D hard-cut",
      description: "Same story as fade fixture but validated as frozen v2 hard-cut.",
      evidenceClass: "automated-semantic",
      expectedPreview: "active-overlay",
      expectedExport: "v2-hard-cut",
      expectedManifest: { kind: "v2-hard-cut" },
    },
    {
      id: "ist-fingerprint-tamper-reject",
      title: "Fingerprint-tampered v3 rejection",
      description: "Valid v3 with effect mutated without fingerprint rebuild.",
      evidenceClass: "automated-semantic",
      expectedPreview: "n/a-reject",
      expectedExport: "reject-integrity",
      expectedManifest: { kind: "reject-v3" },
    },
    {
      id: "ist-malformed-boundary-reject",
      title: "Malformed/stale boundary rejection",
      description: "Stored Cut effect in v3 track must fail integrity.",
      evidenceClass: "automated-semantic",
      expectedPreview: "n/a-reject",
      expectedExport: "reject-integrity",
      expectedManifest: { kind: "reject-v3" },
    },
  ] as const;

export interface IntraSceneTransitionGoldenFixture {
  readonly id: IntraSceneTransitionGoldenId;
  readonly descriptor: IntraSceneTransitionGoldenDescriptor;
  readonly story: FootieScript;
  readonly primarySceneId: string;
  /** Stable media item IDs for the primary scene (no URLs). */
  readonly mediaItemIds: readonly string[];
  readonly notes: string;
}

function baseScene(
  id: string,
  durationMs: number,
  media: SceneMedia | undefined,
  extras: Partial<FootieScene> = {},
): FootieScene {
  return {
    id,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: extras.subtitle ?? "Caption stays visible",
    narration: extras.narration ?? "Voiceover continues.",
    captionMode: extras.captionMode ?? "subtitles",
    ...(media ? { media } : {}),
    ...extras,
  };
}

function storyFrom(title: string, scenes: FootieScene[]): FootieScript {
  return syncFootieScript({
    title,
    narration: scenes.map((s) => s.narration ?? "").join(" ").trim() || "Narration.",
    totalDuration: scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    scenes,
  });
}

function twoItem(
  prefix: string,
  first: SceneMedia,
  second: SceneMedia,
  durationMs: number,
): { scene: FootieScene; a: string; b: string } {
  const generateId = createSequentialMediaItemIdGenerator(prefix);
  const a = generateId();
  const b = generateId();
  const scene = baseScene(`scene-${prefix}`, durationMs, first, {
    mediaTimeline: {
      version: 1,
      items: [
        { id: a, media: first, durationWeight: 1 },
        { id: b, media: second, durationWeight: 1 },
      ],
    },
  });
  return { scene, a, b };
}

function withEffect(
  prefix: string,
  effect: Exclude<TransitionEffect, "cut">,
  first: SceneMedia,
  second: SceneMedia,
  durationMs = 6000,
  requestedMs: 300 | 500 | 800 | 1000 = 500,
): { scene: FootieScene; a: string; b: string } {
  const pair = twoItem(prefix, first, second, durationMs);
  const next = setSceneMediaTransitionBoundary(
    pair.scene,
    pair.a,
    pair.b,
    effect,
    requestedMs,
  ).scene;
  return { scene: next, a: pair.a, b: pair.b };
}

function descriptorOf(id: IntraSceneTransitionGoldenId): IntraSceneTransitionGoldenDescriptor {
  const found = INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown golden id: ${id}`);
  }
  return found;
}

function fixture(
  id: IntraSceneTransitionGoldenId,
  scene: FootieScene,
  mediaItemIds: readonly string[],
  notes: string,
  extraScenes: FootieScene[] = [],
): IntraSceneTransitionGoldenFixture {
  return {
    id,
    descriptor: descriptorOf(id),
    story: storyFrom(id, [scene, ...extraScenes]),
    primarySceneId: scene.id,
    mediaItemIds,
    notes,
  };
}

export function buildIntraSceneTransitionGoldenFixture(
  id: IntraSceneTransitionGoldenId,
): IntraSceneTransitionGoldenFixture {
  switch (id) {
    case "ist-hard-cut-absence": {
      const { scene, a, b } = twoItem("cut0", istImageA(), istImageB(), 6000);
      return fixture(id, scene, [a, b], "No track → hard cut");
    }
    case "ist-hard-cut-explicit-removal": {
      const { scene, a, b } = withEffect("cut1", "fade", istImageA(), istImageB());
      const cleared = resetSceneMediaTransitionBoundary(scene, a, b).scene;
      return fixture(id, cleared, [a, b], "Cut clears persisted boundary");
    }
    case "ist-fade": {
      const { scene, a, b } = withEffect("fade", "fade", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Fade 500ms");
    }
    case "ist-slide-left": {
      const { scene, a, b } = withEffect("sl", "slide-left", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Slide left");
    }
    case "ist-slide-right": {
      const { scene, a, b } = withEffect("sr", "slide-right", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Slide right");
    }
    case "ist-zoom-in": {
      const { scene, a, b } = withEffect("zi", "zoom-in", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Zoom in");
    }
    case "ist-zoom-out": {
      const { scene, a, b } = withEffect("zo", "zoom-out", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Zoom out");
    }
    case "ist-blur": {
      const { scene, a, b } = withEffect("blur", "blur", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Blur");
    }
    case "ist-multi-boundary-abc": {
      const generateId = createSequentialMediaItemIdGenerator("abc");
      const a = generateId();
      const b = generateId();
      const c = generateId();
      let scene = baseScene("scene-abc", 9000, istImageA(), {
        mediaTimeline: {
          version: 1,
          items: [
            { id: a, media: istImageA(), durationWeight: 1 },
            { id: b, media: istImageB(), durationWeight: 1 },
            { id: c, media: istImageC(), durationWeight: 1 },
          ],
        },
      });
      scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
      scene = setSceneMediaTransitionBoundary(scene, b, c, "slide-left", 500).scene;
      return fixture(id, scene, [a, b, c], "A→B fade, B→C slide-left");
    }
    case "ist-image-to-image": {
      const { scene, a, b } = withEffect("i2i", "fade", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Image→image");
    }
    case "ist-image-to-video": {
      const { scene, a, b } = withEffect("i2v", "fade", istImageA(), istVideoB());
      return fixture(id, scene, [a, b], "Image→video");
    }
    case "ist-video-to-image": {
      const { scene, a, b } = withEffect("v2i", "fade", istVideoA(), istImageB());
      return fixture(id, scene, [a, b], "Video→image");
    }
    case "ist-video-to-video": {
      const { scene, a, b } = withEffect("v2v", "fade", istVideoA(), istVideoB());
      return fixture(id, scene, [a, b], "Video→video");
    }
    case "ist-duration-under-clamp": {
      const { scene, a, b } = withEffect(
        "dur-u",
        "fade",
        istImageA(),
        istImageB(),
        6000,
        500,
      );
      return fixture(id, scene, [a, b], "500 < clamp 1200");
    }
    case "ist-duration-clamped-40pct": {
      const { scene, a, b } = withEffect(
        "dur-c",
        "fade",
        istImageA(),
        istImageB(),
        2000,
        1000,
      );
      return fixture(id, scene, [a, b], "1000 clamped to 400");
    }
    case "ist-placeholder-fallback": {
      const { scene, a, b } = withEffect("ph", "fade", istImageA(), {
        type: "placeholder",
      });
      return fixture(id, scene, [a, b], "Non-drawable peer → omit transition");
    }
    case "ist-legacy-single-media": {
      const scene = baseScene("scene-legacy", 4000, istImageA());
      return fixture(id, scene, [], "Legacy single image");
    }
    case "ist-scene-to-scene-priority": {
      const { scene: sceneA, a, b } = withEffect(
        "s2s",
        "fade",
        istImageA(),
        istImageB(),
        6000,
        500,
      );
      const sceneB: FootieScene = {
        ...baseScene("scene-b", 4000, istImageC(), {
          subtitle: "Second scene",
        }),
        startMs: 6000,
        endMs: 10_000,
        start: 6,
        end: 10,
      };
      const transition: TransitionTimelineItem = {
        id: "tr-s2s",
        type: "transition",
        fromSceneId: sceneA.id,
        toSceneId: sceneB.id,
        effect: "fade",
        durationMs: 500,
        label: "Fade",
      };
      const story = storyFrom(id, [sceneA, sceneB]);
      return {
        id,
        descriptor: descriptorOf(id),
        story: {
          ...story,
          timelineItems: [...(story.timelineItems ?? []), transition],
        },
        primarySceneId: sceneA.id,
        mediaItemIds: [a, b],
        notes: "Scene-to-scene transitionOut + intra-scene fade",
      };
    }
    case "ist-captions-during-overlay": {
      const { scene, a, b } = withEffect("cap", "fade", istImageA(), istImageB());
      const captioned = {
        ...scene,
        subtitle: "Caption must remain visible over overlay",
        captionMode: "subtitles" as const,
      };
      return fixture(id, captioned, [a, b], "Captions over overlay");
    }
    case "ist-v2-hard-cut-compat": {
      const { scene, a, b } = withEffect("v2", "fade", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Story has fade; Export v2 path is hard-cut");
    }
    case "ist-fingerprint-tamper-reject": {
      const { scene, a, b } = withEffect("fp", "fade", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Tamper effect after build → reject");
    }
    case "ist-malformed-boundary-reject": {
      const { scene, a, b } = withEffect("mal", "fade", istImageA(), istImageB());
      return fixture(id, scene, [a, b], "Inject cut into frozen track → reject");
    }
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unhandled golden id: ${_exhaustive}`);
    }
  }
}

export function listIntraSceneTransitionGoldenIds(): readonly IntraSceneTransitionGoldenId[] {
  return INTRA_SCENE_TRANSITION_GOLDEN_IDS;
}

export function assertGoldenRegistryComplete(): void {
  const ids = new Set(INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS.map((p) => p.id));
  for (const id of INTRA_SCENE_TRANSITION_GOLDEN_IDS) {
    if (!ids.has(id)) {
      throw new Error(`Missing golden project descriptor for ${id}`);
    }
  }
  if (INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS.length !== INTRA_SCENE_TRANSITION_GOLDEN_IDS.length) {
    throw new Error("Golden project count mismatch");
  }
}
