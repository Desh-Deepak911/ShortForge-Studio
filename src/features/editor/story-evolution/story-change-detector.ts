import type {
  FootieScene,
  FootieScript,
  TransitionTimelineItem,
} from "@/features/story/types";
import { sceneImagesEqual } from "@/features/story/utils/scene.utils";
import {
  resolveSceneMediaMotion,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";

import type { StoryChangeEvent, StoryChangeType } from "./story-evolution.types";

const EMPTY_SCENE_SUBTITLE = "Add subtitle...";

function createEvent(
  type: StoryChangeType,
  partial: Omit<StoryChangeEvent, "type" | "timestamp"> = {},
): StoryChangeEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

function sceneIndexById(scenes: FootieScene[], sceneId: string): number {
  return scenes.findIndex((scene) => scene.id === sceneId);
}

function isDefaultEmptyScene(scene: FootieScene): boolean {
  return scene.subtitle.trim() === EMPTY_SCENE_SUBTITLE;
}

function scenesContentMatch(left: FootieScene, right: FootieScene): boolean {
  return (
    left.subtitle.trim() === right.subtitle.trim() &&
    (left.sceneType ?? "context") === (right.sceneType ?? "context") &&
    (left.subtitleText?.trim() ?? "") === (right.subtitleText?.trim() ?? "") &&
    (left.narration?.trim() ?? "") === (right.narration?.trim() ?? "")
  );
}

function resolveSceneDurationMs(scene: FootieScene): number {
  if (scene.durationMs != null && scene.durationMs > 0) {
    return Math.round(scene.durationMs);
  }

  return Math.max(1000, Math.round(scene.duration * 1000));
}

/** Canonical motion equality — media.motion (+ legacy imageMotion via resolveSceneMediaMotion). */
function sceneMediaMotionEqual(left: FootieScene, right: FootieScene): boolean {
  return (
    serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(left)) ===
    serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(right))
  );
}

function detectVoiceoverChanges(prev: FootieScript, next: FootieScript): StoryChangeEvent[] {
  const events: StoryChangeEvent[] = [];
  const prevHasVoiceover = Boolean(prev.voiceoverUrl?.trim());
  const nextHasVoiceover = Boolean(next.voiceoverUrl?.trim());

  if (!prevHasVoiceover && nextHasVoiceover) {
    events.push(createEvent("voiceover.attach"));
  }

  if (prevHasVoiceover && !nextHasVoiceover) {
    events.push(createEvent("voiceover.clear"));
  }

  return events;
}

function detectStructuralSceneChanges(
  prev: FootieScript,
  next: FootieScript,
): StoryChangeEvent[] {
  const events: StoryChangeEvent[] = [];
  const prevIds = prev.scenes.map((scene) => scene.id);
  const nextIds = next.scenes.map((scene) => scene.id);
  const prevIdSet = new Set(prevIds);
  const nextIdSet = new Set(nextIds);

  const removedIds = prevIds.filter((id) => !nextIdSet.has(id));
  const addedIds = nextIds.filter((id) => !prevIdSet.has(id));

  for (const sceneId of removedIds) {
    events.push(
      createEvent("scene.delete", {
        sceneId,
        sceneIndex: sceneIndexById(prev.scenes, sceneId),
      }),
    );
  }

  for (const sceneId of addedIds) {
    const scene = next.scenes.find((entry) => entry.id === sceneId);
    if (!scene) {
      continue;
    }

    const duplicateSource = prev.scenes.find(
      (source) => source.id !== sceneId && scenesContentMatch(source, scene),
    );

    if (duplicateSource && !isDefaultEmptyScene(scene)) {
      events.push(
        createEvent("scene.duplicate", {
          sceneId,
          sceneIndex: sceneIndexById(next.scenes, sceneId),
        }),
      );
      continue;
    }

    events.push(
      createEvent("scene.add", {
        sceneId,
        sceneIndex: sceneIndexById(next.scenes, sceneId),
      }),
    );
  }

  const hasStructuralCountChange = removedIds.length > 0 || addedIds.length > 0;
  if (
    !hasStructuralCountChange &&
    prevIds.length === nextIds.length &&
    prevIds.length > 0 &&
    prevIds.some((id, index) => id !== nextIds[index])
  ) {
    events.push(createEvent("scene.reorder"));
  }

  return events;
}

function detectPerSceneFieldChanges(
  prev: FootieScript,
  next: FootieScript,
  structuralTypes: Set<StoryChangeType>,
): StoryChangeEvent[] {
  const events: StoryChangeEvent[] = [];
  const skipStructural = structuralTypes.has("scene.add")
    || structuralTypes.has("scene.delete")
    || structuralTypes.has("scene.duplicate")
    || structuralTypes.has("scene.reorder");

  if (skipStructural) {
    return events;
  }

  const prevById = new Map(prev.scenes.map((scene) => [scene.id, scene]));

  for (const [index, nextScene] of next.scenes.entries()) {
    const prevScene = prevById.get(nextScene.id);
    if (!prevScene) {
      continue;
    }

    const base = {
      sceneId: nextScene.id,
      sceneIndex: index,
    };

    if (resolveSceneDurationMs(prevScene) !== resolveSceneDurationMs(nextScene)) {
      events.push(createEvent("scene.duration", base));
    }

    if ((prevScene.sceneType ?? "context") !== (nextScene.sceneType ?? "context")) {
      events.push(createEvent("scene.type", base));
    }

    if (prevScene.subtitle.trim() !== nextScene.subtitle.trim()) {
      events.push(createEvent("scene.caption", base));
    }

    if ((prevScene.subtitleText?.trim() ?? "") !== (nextScene.subtitleText?.trim() ?? "")) {
      events.push(createEvent("scene.subtitle", base));
    }

    const globalNarrationUnchanged = prev.narration.trim() === next.narration.trim();
    if (
      globalNarrationUnchanged &&
      (prevScene.narration?.trim() ?? "") !== (nextScene.narration?.trim() ?? "")
    ) {
      events.push(createEvent("narration.scene_excerpt", base));
    }

    if (!sceneImagesEqual(prevScene, nextScene)) {
      events.push(createEvent("scene.image", base));
    }

    if (!sceneMediaMotionEqual(prevScene, nextScene)) {
      events.push(createEvent("scene.motion", base));
    }
  }

  return events;
}

function transitionSignature(item: TransitionTimelineItem): string {
  return [
    item.id,
    item.fromSceneId,
    item.toSceneId,
    item.effect,
    item.durationMs,
  ].join("|");
}

function detectTransitionChanges(prev: FootieScript, next: FootieScript): StoryChangeEvent[] {
  const prevTransitions = (prev.timelineItems ?? []).filter(
    (item): item is TransitionTimelineItem => item.type === "transition",
  );
  const nextTransitions = (next.timelineItems ?? []).filter(
    (item): item is TransitionTimelineItem => item.type === "transition",
  );

  const prevSignatures = new Map(
    prevTransitions.map((item) => [item.id, transitionSignature(item)]),
  );

  const events: StoryChangeEvent[] = [];

  for (const transition of nextTransitions) {
    const previousSignature = prevSignatures.get(transition.id);
    const nextSignature = transitionSignature(transition);

    if (previousSignature !== nextSignature) {
      events.push(
        createEvent("transition", {
          transitionId: transition.id,
        }),
      );
    }
  }

  if (prevTransitions.length !== nextTransitions.length) {
    const prevSet = new Set(prevTransitions.map((item) => transitionSignature(item)));
    const nextSet = new Set(nextTransitions.map((item) => transitionSignature(item)));
    const changed = prevTransitions.length !== nextTransitions.length
      || [...prevSet].some((signature) => !nextSet.has(signature));

    if (changed && events.length === 0) {
      events.push(createEvent("transition"));
    }
  }

  return events;
}

/** Detects manual story edits between two script snapshots. */
export function detectStoryChanges(prevScript: FootieScript, nextScript: FootieScript): StoryChangeEvent[] {
  const prev = prevScript;
  const next = nextScript;
  const events: StoryChangeEvent[] = [];

  if (prev.title.trim() !== next.title.trim()) {
    events.push(createEvent("project.title"));
  }

  if (prev.narration.trim() !== next.narration.trim()) {
    events.push(createEvent("narration.global"));
  }

  events.push(...detectVoiceoverChanges(prev, next));

  const structuralEvents = detectStructuralSceneChanges(prev, next);
  events.push(...structuralEvents);

  const structuralTypes = new Set(structuralEvents.map((event) => event.type));
  events.push(...detectPerSceneFieldChanges(prev, next, structuralTypes));
  events.push(...detectTransitionChanges(prev, next));

  return events;
}

/** Returns whether scene ids were preserved across a reorder-only edit. */
export function sceneIdsPreservedOnReorder(prevScript: FootieScript, nextScript: FootieScript): boolean {
  const prevIds = prevScript.scenes.map((scene) => scene.id).sort();
  const nextIds = nextScript.scenes.map((scene) => scene.id).sort();

  if (prevIds.length !== nextIds.length) {
    return false;
  }

  return prevIds.every((id, index) => id === nextIds[index]);
}
