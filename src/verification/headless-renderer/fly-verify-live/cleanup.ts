/**
 * Fly verify live cleanup — run-owned Neon, R2, and Redis only.
 * Never destroys shared staging consumer groups or foreign stream entries.
 */

import type { FlyVerifyLiveMatrixContext } from "./types";

const SHARED_VERIFY_STREAM_RE = /^hfq:verify:(local|staging|production)$/;

function isAuthorizedRunOwnedStream(
  ctx: FlyVerifyLiveMatrixContext,
  stream: string,
): boolean {
  if (!SHARED_VERIFY_STREAM_RE.test(stream)) return false;
  return stream === ctx.streamNames.verifyStream;
}

export async function defaultFlyVerifyLiveCleanup(
  ctx: FlyVerifyLiveMatrixContext,
  preserve: boolean,
): Promise<"ok" | "failed" | "preserved"> {
  if (preserve) return "preserved";

  try {
    const consumer = ctx.tcpConsumer;
    const owners = [ctx.ownerId, ctx.otherOwnerId];

    for (const tracked of ctx.runOwnedActiveStreamIds) {
      if (
        tracked.kind !== "verify" ||
        tracked.id.length === 0 ||
        !isAuthorizedRunOwnedStream(ctx, tracked.stream)
      ) {
        return "failed";
      }
    }

    if (consumer != null) {
      for (const tracked of ctx.runOwnedActiveStreamIds) {
        try {
          await consumer.qaXackInGroup(
            tracked.stream,
            ctx.streamNames.verifyGroup,
            tracked.id,
          );
        } catch {
          // continue — best effort before XDEL
        }
        try {
          await consumer.qaXdel(tracked.stream, tracked.id);
        } catch {
          // continue
        }
        const pending = await consumer.qaProbePendingInGroup(
          tracked.stream,
          ctx.streamNames.verifyGroup,
          tracked.id,
        );
        if (pending.ok && pending.pending) {
          return "failed";
        }
      }
    }

    for (const locator of ctx.createdR2Locators) {
      try {
        await ctx.io.deleteObject(locator, ctx.ownerId);
      } catch {
        // continue
      }
    }

    await ctx.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      if (ctx.createdObjectIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_owned_objects
WHERE object_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdObjectIds, owners],
        );
      }
      if (ctx.createdJobIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdJobIds, owners],
        );
      }
      if (ctx.createdProjectIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdProjectIds, owners],
        );
      }
    });

    ctx.runOwnedActiveStreamIds.length = 0;

    return (await verifyFlyVerifyLiveCleanupComplete(ctx)) ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export async function verifyFlyVerifyLiveCleanupComplete(
  ctx: FlyVerifyLiveMatrixContext,
): Promise<boolean> {
  try {
    const owners = [ctx.ownerId, ctx.otherOwnerId];
    const remaining = await ctx.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const objects =
        ctx.createdObjectIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_owned_objects
WHERE object_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdObjectIds, owners],
            );
      const jobs =
        ctx.createdJobIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdJobIds, owners],
            );
      const ownership =
        ctx.createdProjectIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdProjectIds, owners],
            );
      return {
        objects: Number(objects.rows[0]?.n ?? "1"),
        jobs: Number(jobs.rows[0]?.n ?? "1"),
        ownership: Number(ownership.rows[0]?.n ?? "1"),
      };
    });

    if (
      remaining.objects !== 0 ||
      remaining.jobs !== 0 ||
      remaining.ownership !== 0
    ) {
      return false;
    }

    const consumer = ctx.tcpConsumer;
    if (consumer != null) {
      for (const tracked of ctx.trackedStreamIds) {
        if (!isAuthorizedRunOwnedStream(ctx, tracked.stream)) {
          continue;
        }
        const pending = await consumer.qaProbePendingInGroup(
          tracked.stream,
          ctx.streamNames.verifyGroup,
          tracked.id,
        );
        if (pending.ok && pending.pending) {
          return false;
        }
        const presence = await consumer.qaProbeStreamEntry(
          tracked.stream,
          tracked.id,
        );
        if (presence.ok && presence.present) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}
