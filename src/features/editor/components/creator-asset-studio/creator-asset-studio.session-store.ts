import type { RecommendationHistoryItem } from "./useCreatorAssetStudioSession";

interface SessionStore {
  visitOrder: number[];
  historyByScene: Record<number, RecommendationHistoryItem>;
  lastRecordedKey: string;
}

const sessionStore: SessionStore = {
  visitOrder: [],
  historyByScene: {},
  lastRecordedKey: "",
};

/** Resets session store — for tests only. */
export function resetCreatorAssetStudioSessionStoreForTests(): void {
  sessionStore.visitOrder = [];
  sessionStore.historyByScene = {};
  sessionStore.lastRecordedKey = "";
}

export function recordCreatorAssetSceneVisit(
  sceneIndex: number,
  sceneTitle: string,
  recommendationQuery: string,
): void {
  const recordKey = `${sceneIndex}:${recommendationQuery}`;
  if (!recommendationQuery.trim() || sessionStore.lastRecordedKey === recordKey) {
    return;
  }

  sessionStore.lastRecordedKey = recordKey;
  sessionStore.historyByScene[sceneIndex] = {
    sceneIndex,
    sceneTitle,
    query: recommendationQuery,
  };

  if (sessionStore.visitOrder[sessionStore.visitOrder.length - 1] !== sceneIndex) {
    sessionStore.visitOrder = [
      ...sessionStore.visitOrder.filter((index) => index !== sceneIndex),
      sceneIndex,
    ];
  }
}

export function getCreatorAssetPreviousItems(sceneIndex: number): RecommendationHistoryItem[] {
  return sessionStore.visitOrder
    .filter((index) => index !== sceneIndex)
    .map((index) => sessionStore.historyByScene[index])
    .filter((item): item is RecommendationHistoryItem => Boolean(item))
    .reverse()
    .slice(0, 4);
}

export function getCreatorAssetFutureItems(input: {
  sceneIndex: number;
  sceneCount: number;
  plannedFutureItems: RecommendationHistoryItem[];
}): RecommendationHistoryItem[] {
  const visited = new Set(sessionStore.visitOrder);
  const items: RecommendationHistoryItem[] = [];
  const plannedByScene = new Map(input.plannedFutureItems.map((item) => [item.sceneIndex, item]));

  for (let index = input.sceneIndex + 1; index < input.sceneCount; index += 1) {
    if (visited.has(index) || items.length >= 3) {
      continue;
    }

    const cached = sessionStore.historyByScene[index] ?? plannedByScene.get(index);
    items.push(
      cached ?? {
        sceneIndex: index,
        sceneTitle: `Scene ${index + 1}`,
        query: "Not viewed yet",
      },
    );
  }

  return items;
}
