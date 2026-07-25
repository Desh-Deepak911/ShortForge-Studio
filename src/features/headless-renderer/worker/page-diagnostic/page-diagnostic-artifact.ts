/**
 * Resolve shipped page artifact beside the diagnostic bundle (production path).
 */

import {
  readShippedPageArtifactAuthority,
  resolveHostedWorkerBundleDir,
  resolveShippedPageArtifactPath,
  type ShippedPageArtifactAuthority,
} from "../chromium/shipped-page-artifact";

export type PageArtifactMaterializationVerdict =
  | {
      readonly ok: true;
      readonly byteLength: number;
      readonly digestSha256: string;
    }
  | {
      readonly ok: false;
      readonly reasonId: "page_artifact_absent" | "page_artifact_unreadable";
    };

export function resolvePageDiagnosticBundleDir(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string {
  return resolveHostedWorkerBundleDir(env);
}

export { resolveShippedPageArtifactPath };

export function materializePageArtifactAuthority(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): PageArtifactMaterializationVerdict {
  const authority: ShippedPageArtifactAuthority = readShippedPageArtifactAuthority(env);
  if (!authority.ok) {
    return {
      ok: false,
      reasonId:
        authority.presentClass === "absent"
          ? "page_artifact_absent"
          : "page_artifact_unreadable",
    };
  }
  return {
    ok: true,
    byteLength: authority.byteLength,
    digestSha256: authority.digestSha256,
  };
}
