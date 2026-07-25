/**
 * Test/QA artifact object IO over MemoryHeadlessStorageAdapter.
 * Not a production durable provider.
 */

import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { MemoryHeadlessStorageAdapter } from "./memory-storage.adapter";
import { cpFail, cpOk } from "../types/control-plane.types";

export function createMemoryArtifactObjectIO(
  storage: MemoryHeadlessStorageAdapter,
): HeadlessArtifactObjectIOPort {
  return {
    async deleteExactObject(input) {
      return storage.deleteObject(input.locator, input.ownerId);
    },

    async probeExactObjectPresence(input) {
      if (storage.testingProbeFail) {
        return cpFail("INTERNAL_ERROR", "Object presence probe failed.");
      }
      if (storage.testingHasObject(input.locator)) {
        return cpOk("present" as const);
      }
      return cpOk("absent" as const);
    },
  };
}
