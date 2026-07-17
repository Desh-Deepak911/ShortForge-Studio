/**
 * Sprint 7E.4A — Research preflight gate fixtures (network-free).
 * Run: npm run test:hook-research-preflight-qa
 */
import assert from "node:assert/strict";

import { evaluateHookResearchPreflight } from "./hookResearchPreflight.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("hookResearchPreflightQa");

test("auth alone never authorizes live Hook QA", () => {
  const evidence = evaluateHookResearchPreflight({
    credentialsPresent: true,
    httpSuccess: true,
    executionStatus: "failed",
    warnings: ["Provider research returned no structured payload for this query."],
    entityCount: 0,
    fixtureCount: 0,
    statisticCount: 0,
    verifiedFactCount: 0,
    eligibleVerifiedStatisticCount: 0,
  });
  assert.equal(evidence.credentialsPresent, true);
  assert.equal(evidence.authenticationValid, true);
  assert.equal(evidence.entityResolved, false);
  assert.equal(evidence.fixtureResolved, false);
  assert.equal(evidence.structuredProviderPayloadReturned, false);
  assert.equal(evidence.eligibleVerifiedStatisticAvailable, false);
  assert.equal(evidence.liveQaAuthorized, false);
  assert.equal(evidence.safeErrorCategory, "research_unavailable");
});

test("invalid auth is server_configuration and blocks live QA", () => {
  const evidence = evaluateHookResearchPreflight({
    credentialsPresent: true,
    httpSuccess: true,
    warnings: ["Error/Missing application key."],
    entityCount: 2,
    fixtureCount: 1,
    statisticCount: 4,
    eligibleVerifiedStatisticCount: 2,
  });
  assert.equal(evidence.authenticationValid, false);
  assert.equal(evidence.liveQaAuthorized, false);
  assert.equal(evidence.safeErrorCategory, "server_configuration");
});

test("full structured eligible statistic path authorizes live QA", () => {
  const evidence = evaluateHookResearchPreflight({
    credentialsPresent: true,
    httpSuccess: true,
    executionStatus: "success",
    entityCount: 1,
    fixtureCount: 1,
    statisticCount: 3,
    verifiedFactCount: 5,
    eventCount: 2,
    eligibleVerifiedStatisticCount: 2,
  });
  assert.equal(evidence.entityResolved, true);
  assert.equal(evidence.fixtureResolved, true);
  assert.equal(evidence.structuredProviderPayloadReturned, true);
  assert.equal(evidence.eligibleVerifiedStatisticAvailable, true);
  assert.equal(evidence.liveQaAuthorized, true);
  assert.equal(evidence.safeErrorCategory, null);
});

test("structured stats without eligible verified statistic still blocks live QA", () => {
  const evidence = evaluateHookResearchPreflight({
    credentialsPresent: true,
    httpSuccess: true,
    executionStatus: "success",
    entityCount: 1,
    fixtureCount: 1,
    statisticCount: 4,
    verifiedFactCount: 2,
    eligibleVerifiedStatisticCount: 0,
  });
  assert.equal(evidence.structuredProviderPayloadReturned, true);
  assert.equal(evidence.eligibleVerifiedStatisticAvailable, false);
  assert.equal(evidence.liveQaAuthorized, false);
  assert.equal(evidence.safeErrorCategory, "research_unavailable");
});

test("entity without fixture still blocks live QA", () => {
  const evidence = evaluateHookResearchPreflight({
    credentialsPresent: true,
    httpSuccess: true,
    entityCount: 1,
    fixtureCount: 0,
    statisticCount: 0,
    verifiedFactCount: 1,
    eligibleVerifiedStatisticCount: 0,
  });
  assert.equal(evidence.entityResolved, true);
  assert.equal(evidence.fixtureResolved, false);
  assert.equal(evidence.liveQaAuthorized, false);
});

console.log("\nAll Hook research preflight QA checks passed.");
