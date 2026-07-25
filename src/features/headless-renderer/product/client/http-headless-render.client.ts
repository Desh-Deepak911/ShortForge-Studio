import { validateHeadlessAvailabilityResponse } from "../availability/validate-availability-response";
import {
  PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
  rejectProductionPlaceholderCreateJobBody,
} from "../authority/placeholder-production-guard";
import type { HeadlessRenderClient, HeadlessCreateJobClientBody } from "./headless-render-client.port";
import { creatorMessageForClientError } from "./creator-messages";
import type {
  HeadlessClientErrorCode,
  HeadlessClientResult,
  HeadlessPublicJobView,
} from "./public-job.types";
import {
  validateHeadlessDownloadCapability,
  validateHeadlessPublicJobView,
} from "./validate-public-job-view";

const AVAILABILITY_PATH = "/api/headless-render/availability";
const JOBS_PATH = "/api/headless-render/jobs";

function fail(code: HeadlessClientErrorCode): HeadlessClientResult<never> {
  return { ok: false, code, message: creatorMessageForClientError(code) };
}

function mapHttpStatus(status: number): HeadlessClientErrorCode {
  if (status === 401 || status === 403) return "AUTHENTICATION_REQUIRED";
  if (status === 404) return "JOB_NOT_FOUND";
  if (status === 503) return "CONFIGURATION_UNAVAILABLE";
  if (status === 429 || status >= 500) return "TEMPORARILY_UNAVAILABLE";
  if (status >= 400) return "CREATE_REJECTED";
  return "UNKNOWN";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractErrorCode(body: unknown, status: number): HeadlessClientErrorCode {
  if (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof (body as { code: unknown }).code === "string"
  ) {
    const code = (body as { code: string }).code;
    if (code === "CONFIGURATION_UNAVAILABLE") return "CONFIGURATION_UNAVAILABLE";
    if (code === "AUTHENTICATION_REQUIRED" || code === "UNAUTHENTICATED") {
      return "AUTHENTICATION_REQUIRED";
    }
    // Provider/integration failure — not "sign in".
    if (code === "AUTHENTICATION_FAILED") return "TEMPORARILY_UNAVAILABLE";
    if (code === "JOB_NOT_FOUND") return "JOB_NOT_FOUND";
  }
  return mapHttpStatus(status);
}

export class HttpHeadlessRenderClient implements HeadlessRenderClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  async getAvailability(
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<import("../availability/availability.types").HeadlessAvailabilityV1>> {
    try {
      const res = await this.fetchImpl(AVAILABILITY_PATH, {
        method: "GET",
        credentials: "same-origin",
        signal,
        headers: { Accept: "application/json" },
      });
      const body = await readJson(res);
      if (!res.ok) {
        return fail(extractErrorCode(body, res.status));
      }
      const validated = validateHeadlessAvailabilityResponse(body);
      if (!validated) return fail("INVALID_RESPONSE");
      return { ok: true, value: validated };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return fail("NETWORK_ERROR");
      }
      return fail("NETWORK_ERROR");
    }
  }

  async createJob(
    body: HeadlessCreateJobClientBody,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>> {
    // Fail closed: foundation placeholders must never reach production HTTP.
    const placeholderReject = rejectProductionPlaceholderCreateJobBody(body);
    if (placeholderReject != null) {
      return {
        ok: false,
        code: "CREATE_REJECTED",
        message: PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
      };
    }

    try {
      const res = await this.fetchImpl(JOBS_PATH, {
        method: "POST",
        credentials: "same-origin",
        signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      if (!res.ok) {
        return fail(extractErrorCode(json, res.status));
      }
      if (
        typeof json !== "object" ||
        json === null ||
        typeof (json as { jobId?: unknown }).jobId !== "string"
      ) {
        return fail("INVALID_RESPONSE");
      }
      const viewRaw =
        "view" in (json as object)
          ? (json as { view: unknown }).view
          : json;
      const view = validateHeadlessPublicJobView(viewRaw);
      if (!view) return fail("INVALID_RESPONSE");
      const jobId = (json as { jobId: string }).jobId;
      if (view.jobId !== jobId) return fail("INVALID_RESPONSE");
      return { ok: true, value: { jobId, view } };
    } catch {
      return fail("NETWORK_ERROR");
    }
  }

  async getJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<HeadlessPublicJobView>> {
    try {
      const res = await this.fetchImpl(`${JOBS_PATH}/${encodeURIComponent(jobId)}`, {
        method: "GET",
        credentials: "same-origin",
        signal,
        headers: { Accept: "application/json" },
      });
      const json = await readJson(res);
      if (!res.ok) {
        return fail(extractErrorCode(json, res.status));
      }
      const view = validateHeadlessPublicJobView(json);
      if (!view) return fail("INVALID_RESPONSE");
      if (view.jobId !== jobId) return fail("INVALID_RESPONSE");
      return { ok: true, value: view };
    } catch {
      return fail("NETWORK_ERROR");
    }
  }

  async cancelJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<HeadlessPublicJobView>> {
    try {
      const res = await this.fetchImpl(
        `${JOBS_PATH}/${encodeURIComponent(jobId)}/cancel`,
        {
          method: "POST",
          credentials: "same-origin",
          signal,
          headers: { Accept: "application/json" },
        },
      );
      const json = await readJson(res);
      if (!res.ok) {
        const code = extractErrorCode(json, res.status);
        return fail(code === "CREATE_REJECTED" ? "CANCEL_REJECTED" : code);
      }
      const view = validateHeadlessPublicJobView(
        typeof json === "object" && json !== null && "view" in json
          ? (json as { view: unknown }).view
          : json,
      );
      if (!view) return fail("INVALID_RESPONSE");
      return { ok: true, value: view };
    } catch {
      return fail("NETWORK_ERROR");
    }
  }

  async retryJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>> {
    try {
      const res = await this.fetchImpl(
        `${JOBS_PATH}/${encodeURIComponent(jobId)}/retry`,
        {
          method: "POST",
          credentials: "same-origin",
          signal,
          headers: { Accept: "application/json" },
        },
      );
      const json = await readJson(res);
      if (!res.ok) {
        const code = extractErrorCode(json, res.status);
        return fail(code === "CREATE_REJECTED" ? "NOT_RETRYABLE" : code);
      }
      if (
        typeof json !== "object" ||
        json === null ||
        typeof (json as { jobId?: unknown }).jobId !== "string"
      ) {
        return fail("INVALID_RESPONSE");
      }
      const view = validateHeadlessPublicJobView(
        "view" in (json as object)
          ? (json as { view: unknown }).view
          : json,
      );
      if (!view) return fail("INVALID_RESPONSE");
      return {
        ok: true,
        value: { jobId: (json as { jobId: string }).jobId, view },
      };
    } catch {
      return fail("NETWORK_ERROR");
    }
  }

  async createDownloadCapability(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<
    HeadlessClientResult<import("./public-job.types").HeadlessDownloadCapabilityV1>
  > {
    try {
      const res = await this.fetchImpl(
        `${JOBS_PATH}/${encodeURIComponent(jobId)}/download`,
        {
          method: "POST",
          credentials: "same-origin",
          signal,
          headers: { Accept: "application/json" },
        },
      );
      const json = await readJson(res);
      if (!res.ok) {
        const code = extractErrorCode(json, res.status);
        return fail(code === "CREATE_REJECTED" ? "NOT_DOWNLOADABLE" : code);
      }
      const cap = validateHeadlessDownloadCapability(json);
      if (!cap) return fail("INVALID_RESPONSE");
      if (cap.jobId !== jobId) return fail("INVALID_RESPONSE");
      return { ok: true, value: cap };
    } catch {
      return fail("NETWORK_ERROR");
    }
  }
}

export function createHttpHeadlessRenderClient(): HeadlessRenderClient {
  return new HttpHeadlessRenderClient();
}
