import type { AssetIntelligenceInput } from "@/features/asset-intelligence";
import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

import type { AssetIntelligenceGoldenFixture } from "./asset-intelligence-golden-fixture.types";

/** Builds a full Asset Intelligence input from a golden fixture. */
export function buildAssetIntelligenceFixtureInput(
  fixture: AssetIntelligenceGoldenFixture,
): AssetIntelligenceInput {
  const studioIntelligence = runStudioIntelligence({
    topic: fixture.topic,
    narration: fixture.narration,
    targetDurationSec: Math.max(25, Math.round(fixture.narration.split(/\s+/).length / 2.4)),
    mode: fixture.mode,
    entities: fixture.entities,
  });

  const adapterResult = mapBlueprintsToScenes({
    collection: studioIntelligence.sceneBlueprintCollection,
    strategyId: studioIntelligence.strategyId,
    topic: fixture.topic,
    normalizedNarration: studioIntelligence.normalizedNarration,
  });

  return {
    topic: fixture.topic,
    studioIntelligence,
    mappedScenes: adapterResult.mappedScenes,
    inputEntities: fixture.entities ? [...fixture.entities] : undefined,
    entitySummaries: fixture.entitySummaries?.map((summary) => ({ ...summary })),
    sceneTexts: adapterResult.mappedScenes.map((scene) => ({
      sceneId: scene.id,
      narration: scene.narrationExcerpt,
      caption: scene.captionText,
      summary: scene.title,
      title: scene.title,
    })),
    strategyId: studioIntelligence.strategyId,
  };
}
