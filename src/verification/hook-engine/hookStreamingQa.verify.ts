/**
 * Sprint 7E.1 — JSON/NDJSON streaming parity + load QA (evidence-hardened).
 * Run: npm run test:hook-streaming-qa
 */
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import { consumeGenerateScriptStream } from "@/lib/utils/generateScriptStream";
import { createGenerateScriptStreamTerminalController } from "@/lib/utils/generateScriptStreamTerminal";
import type { GenerateScriptResponse, GenerateScriptStreamEvent } from "@/types/footiebitz";
import type { HookDiagnostics, HookPlanSnapshot } from "@/features/hook-engine";

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    return (result as Promise<void>).then(() => {
      console.log(`  ✓ ${name}`);
    });
  }
  console.log(`  ✓ ${name}`);
  return Promise.resolve();
}

async function runTests(
  label: string,
  tests: Array<[string, () => void | Promise<void>]>,
) {
  console.log(label);
  for (const [name, fn] of tests) {
    await test(name, fn);
  }
}

const SAMPLE_SNAPSHOT: HookPlanSnapshot = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  requestFingerprint: "hr:stream1",
  planFingerprint: "hp:stream1",
  resolvedConstraints: {
    maxOpeningWords: 5,
    maxOpeningSpokenSecondsHint: 3,
    mustPreserveSubject: true,
    allowQuestionForm: true,
    allowStatisticClaim: false,
    forbidUnverifiedSuperlatives: true,
    minProvocativeness: 0.5,
    minClarity: 0.5,
  },
};

const SAMPLE_DIAGNOSTICS: HookDiagnostics = {
  contractVersion: "hook-contract/1",
  strategyId: "cold_open",
  strategyVersion: "1.0.0",
  strategySource: "strategy_library",
  generationPath: "script_only",
  requestFingerprint: "hr:stream1",
  planFingerprint: "hp:stream1",
  groundingStatus: "user_context_only",
  validationOutcome: "pass",
  repairAttempts: 0,
  lengthEnforcement: "none",
  templateInfluenced: false,
  promptIntelligenceInfluenced: false,
  adapterRan: true,
};

function eventsToNdjson(events: GenerateScriptStreamEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function responseFromBytes(chunks: Uint8Array[]): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i]!);
      i += 1;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function splitUtf8(text: string, sizes: number[]): Uint8Array[] {
  const encoded = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= encoded.length) break;
    chunks.push(encoded.slice(offset, offset + size));
    offset += size;
  }
  if (offset < encoded.length) {
    chunks.push(encoded.slice(offset));
  }
  return chunks;
}

function jsonSuccessEnvelope(fp = "hr:stream1", plan = "hp:stream1"): GenerateScriptResponse {
  return {
    success: true,
    data: {
      title: "Stream Title",
      narration: "City derby night erupts. Body continues.",
      totalDuration: 30,
      scenes: [],
    },
    hookPlan: {
      ...SAMPLE_SNAPSHOT,
      requestFingerprint: fp,
      planFingerprint: plan,
    },
    hookDiagnostics: {
      ...SAMPLE_DIAGNOSTICS,
      requestFingerprint: fp,
      planFingerprint: plan,
    },
  };
}

function errorEnvelope(fp: string, plan: string): GenerateScriptStreamEvent {
  return {
    type: "error",
    error: "Hook Engine could not approve a safe narration opening.",
    hookPlan: {
      ...SAMPLE_SNAPSHOT,
      requestFingerprint: fp,
      planFingerprint: plan,
      strategyId: "compatibility_punchy",
    },
    hookDiagnostics: {
      ...SAMPLE_DIAGNOSTICS,
      requestFingerprint: fp,
      planFingerprint: plan,
      strategyId: "compatibility_punchy",
      validationOutcome: "generation_failed",
    },
  };
}

async function main() {
  await runTests("streaming parity", [
    [
      "success envelope matches JSON shape",
      async () => {
        const json = jsonSuccessEnvelope();
        const events: GenerateScriptStreamEvent[] = [
          { type: "progress", step: 1, label: "Writing your story..." },
          {
            type: "complete",
            success: true,
            data: json.data,
            hookPlan: json.hookPlan,
            hookDiagnostics: json.hookDiagnostics,
          },
        ];
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes(splitUtf8(eventsToNdjson(events), [40, 80, 200, 500])),
          () => {},
        );
        assert.equal(streamed.success, true);
        assert.equal(streamed.data?.narration, json.data?.narration);
        assert.deepEqual(streamed.hookPlan, json.hookPlan);
        assert.deepEqual(streamed.hookDiagnostics, json.hookDiagnostics);
      },
    ],
    [
      "Hook failure envelope parity",
      async () => {
        const events: GenerateScriptStreamEvent[] = [errorEnvelope("hr:stream1", "hp:stream1")];
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes([new TextEncoder().encode(eventsToNdjson(events))]),
          () => {},
        );
        assert.equal(streamed.success, false);
        assert.ok(streamed.error);
        assert.equal(streamed.hookPlan?.planFingerprint, "hp:stream1");
        assert.equal(streamed.hookDiagnostics?.adapterRan, true);
      },
    ],
    [
      "progress → complete",
      async () => {
        const steps: number[] = [];
        const events: GenerateScriptStreamEvent[] = [
          { type: "progress", step: 1, label: "Writing your story..." },
          { type: "progress", step: 2, label: "Creating narration..." },
          {
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
        ];
        await consumeGenerateScriptStream(
          responseFromBytes([new TextEncoder().encode(eventsToNdjson(events))]),
          (step) => steps.push(step),
        );
        assert.deepEqual(steps, [1, 2]);
      },
    ],
    [
      "progress → error",
      async () => {
        const steps: number[] = [];
        const events: GenerateScriptStreamEvent[] = [
          { type: "progress", step: 1, label: "Writing your story..." },
          { type: "error", error: "boom", hookDiagnostics: SAMPLE_DIAGNOSTICS },
        ];
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes([new TextEncoder().encode(eventsToNdjson(events))]),
          (step) => steps.push(step),
        );
        assert.deepEqual(steps, [1]);
        assert.equal(streamed.success, false);
      },
    ],
    [
      "chunks split inside JSON tokens",
      async () => {
        const ndjson = eventsToNdjson([
          {
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
        ]);
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes(splitUtf8(ndjson, [1, 1, 2, 3, 5, 8, 13, 21, 34])),
          () => {},
        );
        assert.equal(streamed.success, true);
        assert.equal(streamed.hookPlan?.requestFingerprint, "hr:stream1");
      },
    ],
    [
      "chunks split inside multibyte UTF-8 text",
      async () => {
        const narration = "Café derby night erupts. Body — 日本語.";
        const events: GenerateScriptStreamEvent[] = [
          {
            type: "complete",
            success: true,
            data: {
              title: "UTF",
              narration,
              totalDuration: 30,
              scenes: [],
            },
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
        ];
        const ndjson = eventsToNdjson(events);
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes(splitUtf8(ndjson, [3, 5, 7, 11, 17])),
          () => {},
        );
        assert.equal(streamed.data?.narration, narration);
      },
    ],
    [
      "multiple events in one chunk",
      async () => {
        const steps: number[] = [];
        const blob = eventsToNdjson([
          { type: "progress", step: 1, label: "Writing your story..." },
          { type: "progress", step: 2, label: "Creating narration..." },
          {
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
        ]);
        await consumeGenerateScriptStream(
          responseFromBytes([new TextEncoder().encode(blob)]),
          (step) => steps.push(step),
        );
        assert.deepEqual(steps, [1, 2]);
      },
    ],
    [
      "terminal event split across many chunks",
      async () => {
        const ndjson = eventsToNdjson([
          {
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
        ]);
        const streamed = await consumeGenerateScriptStream(
          responseFromBytes(splitUtf8(ndjson, Array.from({ length: 80 }, () => 2))),
          () => {},
        );
        assert.equal(streamed.success, true);
      },
    ],
    [
      "unexpected EOF throws",
      async () => {
        const partial = '{"type":"progress","step":1,"label":"Writing';
        await assert.rejects(
          () =>
            consumeGenerateScriptStream(
              responseFromBytes([new TextEncoder().encode(partial)]),
              () => {},
            ),
          /ended unexpectedly/i,
        );
      },
    ],
    [
      "malformed event throws",
      async () => {
        await assert.rejects(
          () =>
            consumeGenerateScriptStream(
              responseFromBytes([new TextEncoder().encode("{not-json}\n")]),
              () => {},
            ),
          SyntaxError,
        );
      },
    ],
  ]);

  await runTests("concurrent streams (success + failure mix)", [
    [
      "40 concurrent streams mix success/error — unique fingerprints, no cross-leak",
      async () => {
        const N = 40;
        const results = await Promise.all(
          Array.from({ length: N }, async (_, i) => {
            const fp = `hr:conc-${i}`;
            const plan = `hp:conc-${i}`;
            const fail = i % 2 === 1;
            const events: GenerateScriptStreamEvent[] = fail
              ? [errorEnvelope(fp, plan)]
              : [
                  {
                    type: "complete",
                    success: true,
                    data: {
                      title: `T${i}`,
                      narration: `City derby night erupts. Stream ${i}.`,
                      totalDuration: 30,
                      scenes: [],
                    },
                    hookPlan: {
                      ...SAMPLE_SNAPSHOT,
                      requestFingerprint: fp,
                      planFingerprint: plan,
                    },
                    hookDiagnostics: {
                      ...SAMPLE_DIAGNOSTICS,
                      requestFingerprint: fp,
                      planFingerprint: plan,
                    },
                  },
                ];
            return {
              i,
              fail,
              fp,
              plan,
              result: await consumeGenerateScriptStream(
                responseFromBytes(splitUtf8(eventsToNdjson(events), [15, 25, 40])),
                () => {},
              ),
            };
          }),
        );

        assert.equal(results.length, N);
        const fps = new Set(
          results.map((r) => r.result.hookPlan?.requestFingerprint ?? ""),
        );
        assert.equal(fps.size, N);
        for (const row of results) {
          assert.equal(row.result.hookPlan?.requestFingerprint, row.fp);
          assert.equal(row.result.hookDiagnostics?.requestFingerprint, row.fp);
          assert.equal(row.result.hookPlan?.planFingerprint, row.plan);
          assert.equal(row.result.hookDiagnostics?.planFingerprint, row.plan);
          if (row.fail) {
            assert.equal(row.result.success, false);
            assert.equal(
              row.result.hookDiagnostics?.validationOutcome,
              "generation_failed",
            );
          } else {
            assert.equal(row.result.success, true);
          }
        }
      },
    ],
    [
      "consumer returns on first terminal event encountered in the stream",
      async () => {
        // Documents client consumer behavior only: first complete/error ends consumption.
        // Route-side uniqueness is covered by the terminal-controller suite below.
        const events: GenerateScriptStreamEvent[] = [
          { type: "progress", step: 1, label: "Writing your story..." },
          {
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
            hookPlan: SAMPLE_SNAPSHOT,
            hookDiagnostics: SAMPLE_DIAGNOSTICS,
          },
          {
            type: "error",
            error: "should-not-be-consumed",
            hookDiagnostics: {
              ...SAMPLE_DIAGNOSTICS,
              requestFingerprint: "hr:leaked",
            },
          },
        ];
        const result = await consumeGenerateScriptStream(
          responseFromBytes([new TextEncoder().encode(eventsToNdjson(events))]),
          () => {},
        );
        assert.equal(result.success, true);
        assert.equal(result.hookPlan?.requestFingerprint, "hr:stream1");
        assert.notEqual(result.hookDiagnostics?.requestFingerprint, "hr:leaked");
      },
    ],
  ]);

  await runTests("route-side stream terminal controller", [
    [
      "progress before terminal is allowed; complete produces one terminal",
      () => {
        const enqueued: GenerateScriptStreamEvent[] = [];
        const gate = createGenerateScriptStreamTerminalController((e) =>
          enqueued.push(e),
        );
        assert.equal(
          gate.emit({ type: "progress", step: 1, label: "Writing your story..." })
            .accepted,
          true,
        );
        assert.equal(
          gate.emit({
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
          }).accepted,
          true,
        );
        assert.equal(gate.phase, "complete");
        assert.equal(enqueued.length, 2);
        assert.equal(enqueued[1]?.type, "complete");
      },
    ],
    [
      "error produces one terminal",
      () => {
        const enqueued: GenerateScriptStreamEvent[] = [];
        const gate = createGenerateScriptStreamTerminalController((e) =>
          enqueued.push(e),
        );
        assert.equal(gate.emit({ type: "error", error: "boom" }).accepted, true);
        assert.equal(gate.phase, "error");
        assert.equal(enqueued.length, 1);
      },
    ],
    [
      "duplicate terminal emission is rejected",
      () => {
        const enqueued: GenerateScriptStreamEvent[] = [];
        const gate = createGenerateScriptStreamTerminalController((e) =>
          enqueued.push(e),
        );
        assert.equal(
          gate.emit({
            type: "complete",
            success: true,
            data: jsonSuccessEnvelope().data,
          }).accepted,
          true,
        );
        const dup = gate.emit({ type: "error", error: "second" });
        assert.equal(dup.accepted, false);
        if (!dup.accepted) assert.equal(dup.reason, "duplicate_terminal");
        assert.equal(enqueued.length, 1);
        assert.equal(gate.phase, "complete");
      },
    ],
    [
      "progress after terminal is rejected",
      () => {
        const enqueued: GenerateScriptStreamEvent[] = [];
        const gate = createGenerateScriptStreamTerminalController((e) =>
          enqueued.push(e),
        );
        gate.emit({ type: "error", error: "done" });
        const after = gate.emit({
          type: "progress",
          step: 2,
          label: "Creating narration...",
        });
        assert.equal(after.accepted, false);
        if (!after.accepted) assert.equal(after.reason, "progress_after_terminal");
        assert.equal(enqueued.length, 1);
      },
    ],
    [
      "terminal state is per-controller with no global mutable leakage",
      () => {
        const aEvents: GenerateScriptStreamEvent[] = [];
        const bEvents: GenerateScriptStreamEvent[] = [];
        const a = createGenerateScriptStreamTerminalController((e) => aEvents.push(e));
        const b = createGenerateScriptStreamTerminalController((e) => bEvents.push(e));
        a.emit({ type: "complete", success: true, data: jsonSuccessEnvelope().data });
        assert.equal(a.phase, "complete");
        assert.equal(b.phase, "open");
        assert.equal(
          b.emit({ type: "progress", step: 1, label: "Writing your story..." }).accepted,
          true,
        );
        assert.equal(aEvents.length, 1);
        assert.equal(bEvents.length, 1);
        assert.equal(bEvents[0]?.type, "progress");
      },
    ],
  ]);

  console.log("\nAll Hook streaming QA checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
