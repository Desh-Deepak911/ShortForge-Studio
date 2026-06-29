import { SMART_IMAGE_TOOL_URL } from "@/lib/constants/smart-image-tool.config";

export const SMART_EDIT_SOURCE = "shortforge";

export interface SmartEditImageToolUrlInput {
  returnTo: string;
  draftId?: string;
  sceneId?: string;
}

/** Builds the external Smart Image Tool URL with ShortForge editor context. */
export function buildSmartEditImageToolUrl(input: SmartEditImageToolUrlInput): string {
  const url = new URL(SMART_IMAGE_TOOL_URL);
  url.searchParams.set("source", SMART_EDIT_SOURCE);
  url.searchParams.set("returnTo", input.returnTo);

  if (input.draftId) {
    url.searchParams.set("draftId", input.draftId);
  }

  if (input.sceneId) {
    url.searchParams.set("sceneId", input.sceneId);
  }

  return url.toString();
}

const STUDIO_RETURN_PATH_PREFIXES = ["/editor/", "/create/review/"] as const;

function isAllowedStudioReturnPath(pathname: string): boolean {
  return STUDIO_RETURN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Resolves a safe in-app return path from a returnTo query value.
 * Accepts full URLs on the same origin or relative studio paths.
 */
export function resolveSafeStudioReturnPath(
  returnTo: string | null | undefined,
  origin = "http://localhost",
): string {
  const fallback = "/drafts";
  const trimmed = returnTo?.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, origin)
      : new URL(trimmed);

    const allowedOrigin = new URL(origin).origin;
    if (url.origin !== allowedOrigin) {
      return fallback;
    }

    if (!isAllowedStudioReturnPath(url.pathname)) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Opens the external Smart Image Tool with editor context in a new tab. */
export function openSmartEditImageTool(input: SmartEditImageToolUrlInput): void {
  window.open(buildSmartEditImageToolUrl(input), "_blank", "noopener,noreferrer");
}
