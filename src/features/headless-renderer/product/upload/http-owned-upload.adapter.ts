"use client";

import { validateHeadlessPublicJobView } from "../client/validate-public-job-view";
import type {
  OwnedUploadPort,
  OwnedUploadRequest,
  OwnedUploadResult,
} from "./owned-upload.port";

type UploadCapability = {
  readonly objectId: string;
  readonly purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
  readonly slotKey: string | null;
  readonly putUrl: string;
  readonly requiredHeaders: {
    readonly "Content-Type": string;
    readonly "Content-Length"?: string;
  };
};

const PREPARE_PATH = "/api/headless-render/uploads";

function failed(
  code: "CONFIGURATION_UNAVAILABLE" | "ABORTED" | "PARTIAL_FAILURE" | "INVALID_SOURCE",
  message: string,
): OwnedUploadResult {
  return { ok: false, code, message };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class HttpOwnedUploadAdapter implements OwnedUploadPort {
  constructor(private readonly fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  async uploadOwnedBundle(request: OwnedUploadRequest): Promise<OwnedUploadResult> {
    if (request.signal?.aborted) {
      return failed("ABORTED", "Export cancelled.");
    }
    if (
      request.sourceObjects == null ||
      request.rendererProfile == null ||
      request.idempotencyKey == null
    ) {
      return failed("INVALID_SOURCE", "Server export assets are incomplete.");
    }

    let preparedResponse: Response;
    try {
      preparedResponse = await this.fetchImpl(PREPARE_PATH, {
        method: "POST",
        credentials: "same-origin",
        signal: request.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: 1,
          operationId: request.operationId,
          projectId: request.draftId,
          manifest: JSON.parse(new TextDecoder().decode(request.manifestBytes)),
          assetBundle: JSON.parse(new TextDecoder().decode(request.assetBundleBytes)),
          rendererProfile: request.rendererProfile,
          idempotencyKey: request.idempotencyKey,
        }),
      });
    } catch {
      return request.signal?.aborted
        ? failed("ABORTED", "Export cancelled.")
        : failed("PARTIAL_FAILURE", "Could not prepare server export assets.");
    }

    const prepared = await safeJson(preparedResponse);
    if (!preparedResponse.ok || prepared == null || typeof prepared !== "object") {
      return failed(
        preparedResponse.status === 503
          ? "CONFIGURATION_UNAVAILABLE"
          : "PARTIAL_FAILURE",
        "Could not prepare server export assets.",
      );
    }
    const jobId = (prepared as { jobId?: unknown }).jobId;
    const capabilities = (prepared as { uploads?: unknown }).uploads;
    if (typeof jobId !== "string" || !Array.isArray(capabilities)) {
      return failed("PARTIAL_FAILURE", "Could not prepare server export assets.");
    }

    const bytesFor = (capability: UploadCapability): Uint8Array | null => {
      if (capability.purpose === "manifest") return request.manifestBytes;
      if (capability.purpose === "asset_bundle_record") {
        return request.assetBundleBytes;
      }
      return (
        request.sourceObjects?.find(
          (source) => source.slotKey === capability.slotKey,
        )?.bytes ?? null
      );
    };

    for (const raw of capabilities) {
      const capability = raw as UploadCapability;
      const bytes = bytesFor(capability);
      if (
        bytes == null ||
        typeof capability.putUrl !== "string" ||
        typeof capability.objectId !== "string" ||
        (capability.requiredHeaders?.["Content-Length"] != null &&
          capability.requiredHeaders["Content-Length"] !== String(bytes.byteLength))
      ) {
        return failed("PARTIAL_FAILURE", "Server upload authority was rejected.");
      }
      try {
        const uploaded = await this.fetchImpl(capability.putUrl, {
          method: "PUT",
          signal: request.signal,
          headers: {
            "Content-Type": capability.requiredHeaders["Content-Type"],
            ...(capability.requiredHeaders["Content-Length"] != null
              ? {
                  "Content-Length":
                    capability.requiredHeaders["Content-Length"],
                }
              : {}),
          },
          body: new Blob([bytes.slice().buffer as ArrayBuffer]),
        });
        if (!uploaded.ok) {
          return failed("PARTIAL_FAILURE", "Could not upload server export assets.");
        }
      } catch {
        return request.signal?.aborted
          ? failed("ABORTED", "Export cancelled.")
          : failed("PARTIAL_FAILURE", "Could not upload server export assets.");
      }
    }

    let completedResponse: Response;
    try {
      completedResponse = await this.fetchImpl(`${PREPARE_PATH}/${encodeURIComponent(jobId)}/complete`, {
        method: "POST",
        credentials: "same-origin",
        signal: request.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: 1,
          operationId: request.operationId,
          objectIds: capabilities.map((capability) => capability.objectId),
        }),
      });
    } catch {
      return failed("PARTIAL_FAILURE", "Could not finalize server export assets.");
    }
    const completed = await safeJson(completedResponse);
    if (!completedResponse.ok || completed == null || typeof completed !== "object") {
      return failed("PARTIAL_FAILURE", "Could not finalize server export assets.");
    }
    const view = validateHeadlessPublicJobView(
      (completed as { view?: unknown }).view,
    );
    if (!view || view.jobId !== jobId) {
      return failed("PARTIAL_FAILURE", "Server export response was invalid.");
    }

    return {
      ok: true,
      manifestObjectKey: "server-owned",
      assetBundleObjectKey: "server-owned",
      manifestFingerprint: request.manifestFingerprint,
      assetBundleFingerprint: request.assetBundleFingerprint,
      createdJob: { jobId, view },
    };
  }
}
