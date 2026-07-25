import type {
  HeadlessCreateJobClientBody,
  HeadlessRenderClient,
} from "../client/headless-render-client.port";
import { creatorMessageForClientError } from "../client/creator-messages";
import type { HeadlessClientResult } from "../client/public-job.types";
import type {
  OwnedUploadFailure,
  OwnedUploadPort,
  OwnedUploadRequest,
  OwnedUploadSuccess,
} from "../upload/owned-upload.port";

type CreateBodyAfterUpload = Omit<
  HeadlessCreateJobClientBody,
  | "manifestObjectKey"
  | "assetBundleObjectKey"
  | "manifestFingerprint"
  | "assetBundleFingerprint"
>;

export type DispatchOwnedHeadlessJobResult =
  | {
      readonly ok: false;
      readonly stage: "upload";
      readonly failure: OwnedUploadFailure;
    }
  | {
      readonly ok: false;
      readonly stage: "create";
      readonly upload: OwnedUploadSuccess;
      readonly failure: Extract<HeadlessClientResult<never>, { readonly ok: false }>;
    }
  | {
      readonly ok: true;
      readonly upload: OwnedUploadSuccess;
      readonly job: Extract<
        Awaited<ReturnType<HeadlessRenderClient["createJob"]>>,
        { readonly ok: true }
      >["value"];
    };

function freezeUploadSuccess(upload: OwnedUploadSuccess): OwnedUploadSuccess {
  return Object.freeze({
    ok: true as const,
    manifestObjectKey: upload.manifestObjectKey,
    assetBundleObjectKey: upload.assetBundleObjectKey,
    manifestFingerprint: upload.manifestFingerprint,
    assetBundleFingerprint: upload.assetBundleFingerprint,
    ...(upload.createdJob != null
      ? {
          createdJob: Object.freeze({
            jobId: upload.createdJob.jobId,
            view: upload.createdJob.view,
          }),
        }
      : {}),
  });
}

function uploadAborted(): DispatchOwnedHeadlessJobResult {
  return Object.freeze({
    ok: false as const,
    stage: "upload" as const,
    failure: Object.freeze({
      ok: false as const,
      code: "ABORTED" as const,
      message: "Export cancelled.",
    }),
  });
}

function safeUploadFailure(message?: string): DispatchOwnedHeadlessJobResult {
  return Object.freeze({
    ok: false as const,
    stage: "upload" as const,
    failure: Object.freeze({
      ok: false as const,
      code: "PARTIAL_FAILURE" as const,
      message:
        message && message.length > 0 && message.length <= 180
          ? message
          : "Could not prepare server export assets. Try again or use Browser Export.",
    }),
  });
}

function safeCreateFailure(
  upload: OwnedUploadSuccess,
): DispatchOwnedHeadlessJobResult {
  return Object.freeze({
    ok: false as const,
    stage: "create" as const,
    upload: freezeUploadSuccess(upload),
    failure: Object.freeze({
      ok: false as const,
      code: "CREATE_REJECTED" as const,
      message: creatorMessageForClientError("CREATE_REJECTED"),
    }),
  });
}

/**
 * Provider-neutral product orchestration boundary used by HeadlessExportSection.
 *
 * Upload must succeed before createJob can run. The staging HTTP upload adapter
 * returns the owner-bound created job after durable upload completion. Legacy
 * testing adapters may omit it and use createJob through the same port.
 * Thrown errors fail closed with safe creator messages.
 */
export async function dispatchOwnedHeadlessJob(input: {
  readonly client: HeadlessRenderClient;
  readonly uploadPort: OwnedUploadPort;
  readonly uploadRequest: OwnedUploadRequest;
  readonly createBody?: CreateBodyAfterUpload;
  readonly signal?: AbortSignal;
}): Promise<DispatchOwnedHeadlessJobResult> {
  const signal = input.signal ?? input.uploadRequest.signal;
  if (signal?.aborted) {
    return uploadAborted();
  }

  let upload: Awaited<ReturnType<OwnedUploadPort["uploadOwnedBundle"]>>;
  try {
    upload = await input.uploadPort.uploadOwnedBundle({
      ...input.uploadRequest,
      signal,
    });
  } catch {
    return safeUploadFailure();
  }

  if (!upload.ok) {
    return Object.freeze({
      ok: false as const,
      stage: "upload" as const,
      failure: Object.freeze({ ...upload }),
    });
  }

  if (signal?.aborted) {
    return uploadAborted();
  }

  const frozenUpload = freezeUploadSuccess(upload);

  if (frozenUpload.createdJob != null) {
    return Object.freeze({
      ok: true as const,
      upload: frozenUpload,
      job: frozenUpload.createdJob,
    });
  }

  if (input.createBody == null) {
    return safeCreateFailure(frozenUpload);
  }

  let created: Awaited<ReturnType<HeadlessRenderClient["createJob"]>>;
  try {
    created = await input.client.createJob(
      {
        ...input.createBody,
        manifestObjectKey: frozenUpload.manifestObjectKey,
        assetBundleObjectKey: frozenUpload.assetBundleObjectKey,
        manifestFingerprint: frozenUpload.manifestFingerprint,
        assetBundleFingerprint: frozenUpload.assetBundleFingerprint,
      },
      signal,
    );
  } catch {
    return safeCreateFailure(frozenUpload);
  }

  if (!created.ok) {
    return Object.freeze({
      ok: false as const,
      stage: "create" as const,
      upload: frozenUpload,
      failure: created,
    });
  }

  return Object.freeze({
    ok: true as const,
    upload: frozenUpload,
    job: Object.freeze({
      jobId: created.value.jobId,
      view: created.value.view,
    }),
  });
}
