/**
 * Upstash live QA cleanup — active run-owned Redis + Neon rows only.
 * Never DESTROY shared staging production consumer groups.
 * Never XACK/XDEL foreign / observed IDs.
 * Case-finalized entries/groups are verified absent (not re-deleted).
 * QA run-scoped streams: clean only exact run-owned keys; never mutate
 * shared hfq:render:{env} / hfq:verify:{env}.
 */

import {
  deleteQaRunScopedStreamKeys,
  destroyGroupOnQaRunScopedStream,
} from "./qa-run-scoped-queue";
import {
  isExactQaRunScopedStreamKey,
  isValidQaRunScopedStreamBinding,
  streamKeyBelongsToQaRunBinding,
} from "./qa-run-stream-names";
import {
  destroyQaConsumerGroup,
  isProductionWorkerGroup,
  isQaOwnedGroup,
  qaGroupDeliveryKind,
} from "./queue-isolation";
import type { UpstashLiveMatrixContext, UpstashLiveTrackedStreamId } from "./types";

function streamKeyForQaGroup(
  ctx: UpstashLiveMatrixContext,
  group: string,
): string {
  const kind = qaGroupDeliveryKind(group);
  if (kind === "verify") return ctx.streamNames.verifyStream;
  return ctx.streamNames.renderStream;
}

function knownStreamSet(ctx: UpstashLiveMatrixContext): Set<string> {
  return new Set<string>([
    ctx.streamNames.renderStream,
    ctx.streamNames.verifyStream,
    ctx.streamNames.renderDlq,
    ctx.streamNames.verifyDlq,
  ]);
}

function isSharedProductionEnvStream(streamKey: string): boolean {
  return (
    /^hfq:render:(local|staging|production)$/.test(streamKey) ||
    /^hfq:verify:(local|staging|production)$/.test(streamKey) ||
    /^hfq:render-dlq:(local|staging|production)$/.test(streamKey) ||
    /^hfq:verify-dlq:(local|staging|production)$/.test(streamKey)
  );
}

function isRunOwnedAmbiguous(
  ctx: UpstashLiveMatrixContext,
  tracked: UpstashLiveTrackedStreamId,
): boolean {
  const knownStreams = knownStreamSet(ctx);
  if (!knownStreams.has(tracked.stream)) return true;
  if (tracked.id.length === 0) return true;
  if (
    tracked.kind !== "render" &&
    tracked.kind !== "verify" &&
    tracked.kind !== "render-dlq" &&
    tracked.kind !== "verify-dlq"
  ) {
    return true;
  }
  if (ctx.streamAuthority === "qa_run_scoped") {
    if (!isExactQaRunScopedStreamKey(tracked.stream)) return true;
    if (isSharedProductionEnvStream(tracked.stream)) return true;
    const binding = ctx.qaRunStreamBinding;
    if (
      binding == null ||
      !isValidQaRunScopedStreamBinding(binding) ||
      !streamKeyBelongsToQaRunBinding(binding, tracked.stream)
    ) {
      return true;
    }
  }
  return false;
}

function productionGroupForTracked(
  ctx: UpstashLiveMatrixContext,
  tracked: UpstashLiveTrackedStreamId,
): string | null {
  if (tracked.kind === "render") return ctx.streamNames.renderGroup;
  if (tracked.kind === "verify") return ctx.streamNames.verifyGroup;
  return null;
}

export async function defaultUpstashLiveCleanup(
  ctx: UpstashLiveMatrixContext,
  preserve: boolean,
): Promise<"ok" | "failed" | "preserved"> {
  if (preserve) return "preserved";

  try {
    const consumer = ctx.tcpConsumer;
    const active = ctx.runOwnedActiveStreamIds;
    const activeGroups = ctx.activeQaGroups;
    const qaRunScoped = ctx.streamAuthority === "qa_run_scoped";
    const binding = ctx.qaRunStreamBinding ?? null;

    if (qaRunScoped) {
      if (binding == null || !isValidQaRunScopedStreamBinding(binding)) {
        return "failed";
      }
    }

    // Reject ownership-ambiguous deletes rather than guess.
    for (const tracked of active) {
      if (isRunOwnedAmbiguous(ctx, tracked)) {
        return "failed";
      }
    }
    for (const tracked of ctx.caseFinalizedStreamIds) {
      if (isRunOwnedAmbiguous(ctx, tracked)) {
        return "failed";
      }
    }

    // Never touch observed foreign IDs.
    const foreignSet = new Set(
      ctx.observedForeignStreamIds.map((f) => `${f.stream}\0${f.id}`),
    );
    for (const tracked of [...active, ...ctx.caseFinalizedStreamIds]) {
      if (foreignSet.has(`${tracked.stream}\0${tracked.id}`)) {
        return "failed";
      }
    }

    // An ID cannot be active and finalized simultaneously.
    for (const a of active) {
      if (
        ctx.caseFinalizedStreamIds.some(
          (f) => f.stream === a.stream && f.id === a.id,
        )
      ) {
        return "failed";
      }
    }

    // (1) XACK pending active run-owned entries.
    for (const tracked of active) {
      for (const group of activeGroups) {
        if (!isQaOwnedGroup(group) || isProductionWorkerGroup(group)) continue;
        const groupStream = streamKeyForQaGroup(ctx, group);
        if (tracked.stream !== groupStream) continue;
        try {
          await consumer.qaXackInGroup(tracked.stream, group, tracked.id);
        } catch {
          // continue
        }
      }
      const prodGroup = productionGroupForTracked(ctx, tracked);
      if (prodGroup != null) {
        try {
          await consumer.qaXackInGroup(tracked.stream, prodGroup, tracked.id);
        } catch {
          // continue
        }
      }
      // Shared production_env only: also try adapter kind helpers (same streams).
      if (
        !qaRunScoped &&
        (tracked.kind === "render" || tracked.kind === "verify")
      ) {
        try {
          await consumer.qaXack(tracked.kind, tracked.id);
        } catch {
          // continue
        }
      }
    }

    // (2) XDEL active run-owned stream entries only.
    for (const tracked of active) {
      try {
        await consumer.qaXdel(tracked.stream, tracked.id);
      } catch {
        // continue
      }
    }

    // (3) Remove tracked DLQ entries still active.
    for (const dlq of ctx.trackedDlqIds) {
      try {
        await consumer.qaXdel(dlq.stream, dlq.id);
      } catch {
        // continue
      }
    }

    // (4) Exact pending + stream presence for active entries.
    for (const tracked of active) {
      const prodGroup = productionGroupForTracked(ctx, tracked);
      if (prodGroup != null) {
        const pending = await consumer.qaProbePendingInGroup(
          tracked.stream,
          prodGroup,
          tracked.id,
        );
        if (!pending.ok || pending.pending) return "failed";
      }
      for (const group of activeGroups) {
        if (!isQaOwnedGroup(group) || isProductionWorkerGroup(group)) continue;
        const groupStream = streamKeyForQaGroup(ctx, group);
        if (tracked.stream !== groupStream) continue;
        const probe = await consumer.qaProbePendingInGroup(
          tracked.stream,
          group,
          tracked.id,
        );
        if (!probe.ok || probe.pending) return "failed";
      }
      const presence = await consumer.qaProbeStreamEntry(
        tracked.stream,
        tracked.id,
      );
      if (!presence.ok || presence.present) return "failed";
    }

    // (4b) Finalized entries must remain absent (verify only).
    for (const tracked of ctx.caseFinalizedStreamIds) {
      const presence = await consumer.qaProbeStreamEntry(
        tracked.stream,
        tracked.id,
      );
      if (!presence.ok || presence.present) return "failed";
      const prodGroup = productionGroupForTracked(ctx, tracked);
      if (prodGroup != null) {
        const pending = await consumer.qaProbePendingInGroup(
          tracked.stream,
          prodGroup,
          tracked.id,
        );
        if (!pending.ok || pending.pending) return "failed";
      }
    }

    // (5) Remove run-scoped consumers from active QA groups, then production groups.
    for (const name of ctx.trackedConsumerNames) {
      for (const group of activeGroups) {
        if (!isQaOwnedGroup(group) || isProductionWorkerGroup(group)) continue;
        try {
          await consumer.qaDelConsumerInGroup(
            streamKeyForQaGroup(ctx, group),
            group,
            name,
          );
        } catch {
          // continue
        }
      }
      try {
        await consumer.qaDelConsumerInGroup(
          ctx.streamNames.renderStream,
          ctx.streamNames.renderGroup,
          name,
        );
      } catch {
        // continue
      }
      try {
        await consumer.qaDelConsumerInGroup(
          ctx.streamNames.verifyStream,
          ctx.streamNames.verifyGroup,
          name,
        );
      } catch {
        // continue
      }
      if (!qaRunScoped) {
        try {
          await consumer.qaDelConsumer("render", name);
        } catch {
          // continue
        }
        try {
          await consumer.qaDelConsumer("verify", name);
        } catch {
          // continue
        }
      }
    }

    // (6) DESTROY only active QA-owned groups; probe must confirm absence.
    for (const group of activeGroups) {
      if (!isQaOwnedGroup(group) || isProductionWorkerGroup(group)) {
        return "failed";
      }
      const streamKey = streamKeyForQaGroup(ctx, group);
      try {
        await destroyQaConsumerGroup({
          redis: consumer,
          streamKey,
          group,
        });
      } catch {
        // continue to probe — probe failure still fails cleanup
      }
      const list = await consumer.qaXinfoGroups(streamKey);
      if (!list.ok) return "failed";
      if (list.groups.some((g) => g.name === group)) return "failed";
    }

    // (6b) Finalized QA groups must remain absent (probe failure ≠ absence).
    for (const group of ctx.finalizedQaGroups) {
      if (!isQaOwnedGroup(group) || isProductionWorkerGroup(group)) {
        return "failed";
      }
      const streamKey = streamKeyForQaGroup(ctx, group);
      const list = await consumer.qaXinfoGroups(streamKey);
      if (!list.ok) return "failed";
      if (list.groups.some((g) => g.name === group)) return "failed";
    }

    // (6c) Run-scoped: destroy coherent protocol groups, then exact DEL + EXISTS.
    // Never infer key absence from XINFO. Never touch shared staging streams.
    if (qaRunScoped && binding != null) {
      const protocolPairs = [
        {
          streamKey: binding.names.renderStream,
          group: binding.names.renderGroup,
        },
        {
          streamKey: binding.names.verifyStream,
          group: binding.names.verifyGroup,
        },
      ] as const;
      for (const { streamKey, group } of protocolPairs) {
        if (isSharedProductionEnvStream(streamKey)) return "failed";
        await destroyGroupOnQaRunScopedStream({
          redis: consumer,
          binding,
          streamKey,
          group,
        });
        // If the stream key still exists, the expected group must be absent.
        // Key absence is confirmed only via EXISTS after DEL (not XINFO).
        const keyProbe = await consumer.qaProbeKeyExists(streamKey);
        if (!keyProbe.ok) return "failed";
        if (keyProbe.exists) {
          const list = await consumer.qaXinfoGroups(streamKey);
          if (!list.ok) return "failed";
          if (list.groups.some((g) => g.name === group)) return "failed";
        }
      }
      const deleted = await deleteQaRunScopedStreamKeys({
        redis: consumer,
        binding,
      });
      if (!deleted) return "failed";
    }

    // (7) Neon dependents-first delete + zero verify.
    const owners = [ctx.ownerId, ctx.otherOwnerId];
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
      return "failed";
    }

    return "ok";
  } catch {
    return "failed";
  }
}
