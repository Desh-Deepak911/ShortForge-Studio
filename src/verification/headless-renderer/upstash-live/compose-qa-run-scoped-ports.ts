/**
 * Compose harness producer/streamNames for QA run-scoped delivery (2D.1F.1).
 * REST client performs XADD; TCP consumer owns groups/consume/cleanup.
 */

import type { HeadlessUpstashRestClient } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import type { HeadlessEnvName } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";

import { createQaRunScopedTcpDlqWriter } from "./qa-run-scoped-dlq";
import type { QaRunScopedTcpDlqWriter } from "./qa-run-scoped-dlq";
import {
  createQaRunScopedRestProducerPort,
  ensureQaRunScopedProductionGroups,
} from "./qa-run-scoped-queue";
import {
  deriveQaRunScopedStreamBinding,
  type QaRunScopedStreamBinding,
} from "./qa-run-stream-names";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
  UpstashLiveStreamNames,
} from "./types";

export type QaRunScopedHarnessPorts = {
  readonly binding: QaRunScopedStreamBinding;
  readonly streamNames: UpstashLiveStreamNames;
  readonly restProducer: UpstashLiveProducerPort;
  readonly dlqWriter: QaRunScopedTcpDlqWriter;
  readonly streamAuthority: "qa_run_scoped";
  readonly groupAuthorityEvidence: "production_protocol";
  /** Bounded evidence: enqueue uses REST XADD. */
  readonly enqueueTransport: "rest_xadd";
  /** Bounded evidence: consume uses TCP production-protocol groups. */
  readonly consumeTransport: "tcp_production_protocol";
  /** Bounded evidence: DLQ move uses TCP XADD on run-scoped keys. */
  readonly dlqTransport: "tcp_xadd";
};

export async function composeQaRunScopedHarnessPorts(input: {
  readonly envName: HeadlessEnvName;
  readonly runId: string;
  readonly redis: UpstashLiveConsumerPort;
  /** Required for run-scoped enqueue — FakeRest client in deterministic suites. */
  readonly restClient: HeadlessUpstashRestClient | null;
}): Promise<QaRunScopedHarnessPorts | null> {
  const binding = deriveQaRunScopedStreamBinding({
    envName: input.envName,
    runId: input.runId,
  });
  if (binding == null) return null;
  if (input.restClient == null) return null;
  const ensured = await ensureQaRunScopedProductionGroups({
    redis: input.redis,
    binding,
  });
  if (!ensured) return null;
  const dlqWriter = createQaRunScopedTcpDlqWriter({
    redis: input.redis,
    binding,
  });
  if (dlqWriter == null) return null;
  return {
    binding,
    streamNames: binding.names,
    restProducer: createQaRunScopedRestProducerPort({
      client: input.restClient,
      binding,
    }),
    dlqWriter,
    streamAuthority: "qa_run_scoped",
    groupAuthorityEvidence: "production_protocol",
    enqueueTransport: "rest_xadd",
    consumeTransport: "tcp_production_protocol",
    dlqTransport: "tcp_xadd",
  };
}
