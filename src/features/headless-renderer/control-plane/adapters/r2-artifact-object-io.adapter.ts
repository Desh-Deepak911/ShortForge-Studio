/**
 * HeadlessArtifactObjectIOPort over HeadlessR2ObjectIOPort.
 */

import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type {
  HeadlessR2ObjectIOPort,
  HeadlessR2ObjectLocator,
} from "../ports/r2-object-io.port";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import { cpFail } from "../types/control-plane.types";

function toR2Locator(
  locator: HeadlessStorageLocatorIdentity,
): HeadlessR2ObjectLocator | null {
  if (locator.kind !== "object_storage") return null;
  if (locator.storeId !== "assets" && locator.storeId !== "artifacts") {
    return null;
  }
  return { storeId: locator.storeId, objectKey: locator.objectKey };
}

export function createR2ArtifactObjectIO(
  r2: HeadlessR2ObjectIOPort,
): HeadlessArtifactObjectIOPort {
  return {
    async deleteExactObject(input) {
      if (input.locator.storeId !== "artifacts") {
        return cpFail("HOSTILE_INPUT", "Artifact store required.");
      }
      const r2Locator = toR2Locator(input.locator);
      if (r2Locator == null) {
        return cpFail("HOSTILE_INPUT", "Artifact locator rejected.");
      }
      return r2.deleteObject(r2Locator, input.ownerId);
    },

    async probeExactObjectPresence(input) {
      if (input.locator.storeId !== "artifacts") {
        return cpFail("HOSTILE_INPUT", "Artifact store required.");
      }
      const r2Locator = toR2Locator(input.locator);
      if (r2Locator == null) {
        return cpFail("HOSTILE_INPUT", "Artifact locator rejected.");
      }
      return r2.probeExactObjectPresence(r2Locator, input.ownerId);
    },
  };
}
