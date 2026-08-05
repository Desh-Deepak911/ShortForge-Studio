/**
 * Sprint 13A — provider-free universal narration-quality contract verification.
 * Run: npm run test:narration-quality-acceptance
 */

import assert from "node:assert/strict";

import {
  NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION,
  evaluateNarrationQualityAcceptance,
  resolveNarrationQualityDelivery,
  type NarrationQualityAcceptanceContract,
} from "./goldens/narration-quality-acceptance-contract";
import {
  NARRATION_QUALITY_GOLDEN_CATEGORIES,
  listNarrationQualityGoldenCorpus,
} from "./goldens/build-narration-quality-golden-corpus";

let passed = 0;

function check(label: string, verify: () => void): void {
  verify();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function main(): void {
  console.log("\nnarration-quality-acceptance (Sprint 13A)\n");
  const corpus = listNarrationQualityGoldenCorpus();

  check("corpus uses unique responsibility-named fixtures", () => {
    assert.equal(
      new Set(corpus.map((fixture) => fixture.id)).size,
      corpus.length,
    );
    for (const fixture of corpus) {
      assert.match(fixture.id, /^nq-[a-z0-9]+(?:-[a-z0-9]+)+$/u);
      assert.ok(fixture.title.trim().length >= 12);
      assert.ok(fixture.brief.trim().length >= 24);
    }
  });

  check("corpus covers every required brief family", () => {
    const actual = new Set(corpus.map((fixture) => fixture.category));
    assert.deepEqual(
      [...actual].sort(),
      [...NARRATION_QUALITY_GOLDEN_CATEGORIES].sort(),
    );
  });

  check("contracts model every Sprint 13A acceptance responsibility", () => {
    const factImportance = new Set(
      corpus.flatMap((fixture) =>
        fixture.contract.facts.map((fact) => fact.importance),
      ),
    );
    assert.deepEqual([...factImportance].sort(), ["essential", "optional"]);

    for (const fixture of corpus) {
      const { contract } = fixture;
      assert.equal(
        contract.version,
        NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION,
      );
      assert.ok(contract.centralSubject.description.trim());
      assert.ok(contract.centralSubject.signals.length > 0);
      assert.ok(contract.controllingIdea.description.trim());
      assert.ok(contract.controllingIdea.signals.length > 0);
      assert.ok(contract.facts.some((fact) => fact.importance === "essential"));
      for (const uncertainty of contract.requiredUncertainty) {
        assert.ok(
          contract.facts.some((fact) => fact.id === uncertainty.factId),
          `${fixture.id}: uncertainty must reference a declared fact`,
        );
      }
      assert.ok(contract.conflict.signals.length > 0);
      assert.ok(contract.consequence.signals.length > 0);
      assert.ok(contract.selection.durationSec > 0);
      assert.ok(contract.selection.scriptMode);
      assert.ok(contract.selection.tone);
      assert.ok(contract.selection.hookStyle);
      assert.ok(contract.forbiddenInventions.length > 0);
      assert.deepEqual(
        contract.narrativeFlow.map((stage) => stage.id),
        ["hook", "evidence", "escalation", "payoff"],
      );
      assert.ok(contract.hookBodyPromise.hookSignals.length > 0);
      assert.ok(contract.hookBodyPromise.bodyPayoffSignals.length > 0);
      assert.ok(contract.minimumDurationUtilization >= 0.65);
      assert.ok(contract.minimumDurationUtilization <= 1);
      assert.ok(contract.requiredEntities.length > 0);
    }
  });

  check("accepted narration passes every varied golden contract", () => {
    const failures: string[] = [];
    for (const fixture of corpus) {
      const result = evaluateNarrationQualityAcceptance(
        fixture.contract,
        fixture.acceptedNarration,
      );
      if (!result.ok) {
        failures.push(
          `${fixture.id}: ${result.reasons.join(", ")} (${result.wordCount}/${result.targetWordCount} words)`,
        );
      }
    }
    assert.deepEqual(failures, []);
  });

  check("broken narration is never accepted as success", () => {
    let rejectedCount = 0;
    for (const fixture of corpus) {
      assert.ok(
        fixture.rejectedSamples.length > 0,
        `${fixture.id}: rejected sample`,
      );
      for (const sample of fixture.rejectedSamples) {
        const result = evaluateNarrationQualityAcceptance(
          fixture.contract,
          sample.narration,
        );
        assert.equal(
          result.ok,
          false,
          `${fixture.id}/${sample.label}: accepted`,
        );
        for (const reason of sample.expectedReasons) {
          assert.ok(
            result.reasons.includes(reason),
            `${fixture.id}/${sample.label}: expected ${reason}, got ${result.reasons.join(", ")}`,
          );
        }
        rejectedCount += 1;
      }
    }
    assert.ok(rejectedCount >= corpus.length);
    for (const fixture of corpus) {
      const empty = evaluateNarrationQualityAcceptance(fixture.contract, "");
      assert.equal(empty.ok, false);
      assert.ok(empty.reasons.includes("empty_narration"));
    }
  });

  check("candidate failure delivers a validated basic draft", () => {
    for (const fixture of corpus) {
      for (const sample of fixture.rejectedSamples) {
        const delivery = resolveNarrationQualityDelivery({
          contract: fixture.contract,
          requestedCandidate: sample.narration,
          basicFallback: fixture.acceptedNarration,
        });
        assert.equal(delivery.status, "delivered");
        assert.equal(delivery.qualityProfile, "basic_fallback");
        assert.equal(delivery.assessment.ok, true);
        assert.equal(delivery.narration, fixture.acceptedNarration);
        assert.ok(delivery.advisoryReasons.length > 0);
      }
    }
  });

  check(
    "even an unavailable candidate and fallback deliver emergency prose",
    () => {
      const fixture = corpus[0];
      assert.ok(fixture);
      const delivery = resolveNarrationQualityDelivery({
        contract: fixture.contract,
        requestedCandidate: "",
        basicFallback: "",
      });
      assert.equal(delivery.status, "delivered");
      assert.equal(delivery.qualityProfile, "emergency_fallback");
      assert.ok(delivery.narration.trim().length > 0);
      assert.match(delivery.narration, /Arsenal/iu);
    },
  );

  check(
    "quality evaluation is invariant to topic and entity substitution",
    () => {
      const fixture = corpus.find(
        (candidate) =>
          candidate.id === "nq-creator-manchester-united-sale-before-buy",
      );
      assert.ok(fixture);

      const substitutions = [
        ["Manchester United", "Coastal Rovers"],
        ["manchester united", "coastal rovers"],
        ["United", "Rovers"],
        ["united", "rovers"],
        ["midfielder", "forward"],
        ["midfield", "attack"],
      ] as const;
      const substitute = (value: string): string =>
        substitutions.reduce(
          (current, [from, to]) => current.replaceAll(from, to),
          value,
        );
      const substitutedContract = JSON.parse(
        substitute(JSON.stringify(fixture.contract)),
      ) as NarrationQualityAcceptanceContract;
      const substitutedNarration = substitute(fixture.acceptedNarration);
      const result = evaluateNarrationQualityAcceptance(
        substitutedContract,
        substitutedNarration,
      );
      assert.equal(result.ok, true, result.reasons.join(", "));
    },
  );

  check(
    "regressions include meaningful-hook, checklist, and filler rejection",
    () => {
      const manchester = corpus.find(
        (fixture) =>
          fixture.id === "nq-creator-manchester-united-sale-before-buy",
      );
      assert.ok(manchester);
      assert.ok(
        manchester.rejectedSamples.some((sample) =>
          sample.narration.startsWith("Why Manchester United now?"),
        ),
      );

      const reasons = new Set(
        corpus.flatMap((fixture) =>
          fixture.rejectedSamples.flatMap(
            (sample) =>
              evaluateNarrationQualityAcceptance(
                fixture.contract,
                sample.narration,
              ).reasons,
          ),
        ),
      );
      assert.ok(reasons.has("hook_body_payoff_missing"));
      assert.ok(reasons.has("disconnected_checklist"));
      assert.ok(reasons.has("generic_filler"));
    },
  );

  console.log(`\n${passed} narration-quality acceptance checks passed.\n`);
}

main();
