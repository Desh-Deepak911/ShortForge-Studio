# Story generation release readiness

Generated: 2026-08-16

## Verdict: **not_ready**

Prompt 12 closed the three frozen Prompt 11 release blockers in production and recertified the dirty tree. Provider-free Prompt 1–12 gates pass. Live production-path recert used **7 / 10** fresh provider invocations. Fast preview finished `model_direct`. Balanced recovered through `supported_opening_promotion` and finished `model_after_rewrite`. Live ranking named the correct number-one member, then invented an unsupported closer and correctly entered coherent deterministic rescue. Ready requires an accepted live correct-number-one ranking, so ready is not declared.

An honest quality warning does not block readiness. Incorrect rescue of supported coherent speech does. The live ranking rescue is correct protection, not a duration false-reject.

Not `conditionally_ready`. Configured models remain `gpt-4.1-mini` (Fast) and `gpt-4.1` (Balanced/Studio). `OPENAI_SCRIPT_MODEL` unset.

## Prompt 12 frozen implementation fingerprint

Recorded after provider-free gates and immediately before the first live call. Re-checked after live calls. Production code was not edited after certification began.

| Field | Value |
| --- | --- |
| Repository | `footiebitz` at `/Users/deshdeepaksingh/Developer/Footie-Bitz/footiebitz` |
| Branch | `staging-story-input-grounding-fix` tracking `origin/staging` |
| HEAD | `1c66af2c1068dd70af196e448a6914d638f240bf` (same as `origin/staging`) |
| Tracked diff SHA-256 | `2699ffc8a749b14647d57ca2a81be210f5a506d7b97acea6cfaf4155cd0a9ec3` (309201 bytes, 71 tracked files) |
| Implementation SHA-256 | `1df817c953b300ddffc88217b954efbe93d39710b3fecf7028120f9c85df8373` (tracked diff + sorted untracked `src/` / `scripts/` / `*.verify.ts`) |
| `package-lock.json` SHA-256 | `5dd857fb10f34bae7a2cf2d409b6c19c100680e2cdd06ae0a01c82e62b4852d0` |
| Fast model | `gpt-4.1-mini` |
| Balanced / Studio model | `gpt-4.1` |
| `OPENAI_SCRIPT_MODEL` | unset |
| Untracked source/test files at freeze | 64, including `scripts/run-story-quality-prompt12-cert.ts` |
| Post-live implementation still frozen | yes |

Local fingerprint file: `.tmp/story-quality-real-cert/prompt12/frozen-implementation-fingerprint.json` (gitignored). This tracked evidence file may be updated after testing; it is not part of the frozen implementation digest.

Prompt 1–12 work remains **uncommitted**. Nothing was committed, pushed, merged, or deployed. No credentials, environments, or models were changed.

## 12A — Obsolete post-acceptance edge removed

Exact obsolete edge: after canonical compose accept, `runRetentionHookBridge` still called `generateHookedNarration`. Editorial Hook validation could then invoke `runBoundedHookRepair`. A fallback reason matching `*_failed_hard_gate` made `hookFailureMayKeepCanonicalAccepted` return false because the keep-path regex included `hard_gate|safety`. That discarded the accepted Fast preview and entered deterministic rescue (`hook_validation_rejection`).

Structural close: compose now records a discriminated `canonicalCommit` of `{ status: "uncommitted" } | { status: "accepted"; narration }`. Once accepted, non-user-authored strategies never enter the Hook runner. Downstream work goes only through `commitRetentionCanonicallyAcceptedCandidate` (map, metadata, serialize, safe diagnostics, mapping-fidelity check). Mapping failure is `accepted_narration_mapping_failed`, not Hook rejection. Stale `hardGatesPassed` values cannot reverse a spoken Pass. Write My Own / `user_directed` still uses the Hook runner so hard-requirement failures can Auto-reconcile.

Provider-free: captured Prompt 11 preview finishes `model_direct`; a canonical Pass cannot reach Hook repair or deterministic rescue; rejected narration can still repair or rescue before commit.

Live Fast preview: first speech supported and accepted; transformations `model_narration_accepted` only; final authority `model_direct`; mapping bytes unchanged; 1 provider call; no rescue.

## 12B — Balanced opening-recovery evidence

Captured Prompt 11 Balanced opening was unsupported (`Why Calen Voss?`); remaining sentences were rebound and connected to the support-versus-pressure payoff.

Recovery order, 0 provider calls: drop only the unsupported opening; promote the first grounded complete sentence; rebuild Hook/body/payoff; re-evaluate once; accept as `model_after_rewrite` with rewrite subtype `supported_opening_promotion`; preserve remaining model narration bytes. If the remainder is an incomplete fragment or later body claims are unsupported, promotion is withheld and existing repair/rescue still runs.

Live Balanced (`gpt-4.1`, 2 calls: planner + composer): first speech unsupported opening + rebound body; Hook OK with `opening_subject_only` / `hook_subject_led`; promotion succeeded; final mapped narration starts at the doping-ban return sentence; authority `model_after_rewrite`; subtype `supported_opening_promotion`; no rescue. Honest warnings: reliable-plan fallback, beat compaction, quality below target, `duration_slightly_under_target` (58 words / 24.2s vs 72-word / 30s target at 2.4 wps).

## 12C — Ranking duration measurements and wrong-number-one control

Voice/speed assumptions used by story generation: `RETENTION_WORDS_PER_SECOND = 2.4`. Composition target for a 30s story remains 72 words. Slight band: ±2.5s (~6 words) → `duration_slightly_over_target` / `duration_slightly_under_target`. Evidence band for a complete grounded ranking with correct number-one only: +5s (~12 words), from the Prompt 11 correct-number-one capture.

| Sample | Words | Estimated spoken | Target | Hard ceiling | Min useful | Over/under | Terminal condition | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Prompt 11 captured correct ranking | 84 | 35.0s | 30s / 72 words | 72 | 47 | +12 words / +5.0s | `duration_or_compression_rejection` on Prompt 11 | Prompt 12 provider-free accept + `duration_target_not_fully_met` |
| Prompt 12 live Driftmere ranking | 75 | 31.3s | 30s / 72 words | 72 | 47 | +3 words / +1.3s | duration would accept (`duration_slightly_over_target`) | rejected for unsupported closer, then rescue |
| Prompt 12 live preview | 60 | 25.0s | 30s / 72 words | 72 | 47 | −12 words / −5.0s | warning only | `model_direct` |
| Prompt 12 live Balanced | 58 | 24.2s | 30s / 72 words | 72 | 47 | −14 words / −5.8s | warning only | `model_after_rewrite` |

Classification of the Prompt 11 duration failure: overly narrow hard ceiling on a coherent grounded ranking, not a false speech-duration model and not mapping inflation. Fix: evidence-band warning instead of discard. Compression may still strip optional connectives; it must keep every essential member, order, reason, and explicit number-one payoff. No filler padding. Threshold was not broadly lowered.

Wrong-number-one control (Harbor / Pax as decisive name): still fails identity/payoff before duration and still rescues. Provider-free Prompt 12 suite proves this. Live Driftmere named Lina Crowe as number one (`firstSpeechWrongNumberOne: false`).

## 12D — Ranking composition instruction

`RetentionCompositionBrief` now carries `rankingNumberOneMember`, `rankingSpeakDirection`, and `rankingPresentationInstruction`. The existing composer prompt uses that instruction. Response schema was not expanded. The model must state the exact final number-one member and must not infer a different winner from last-name or rhetorical emphasis. Provider-free coverage: five-to-one, three-to-one, one-to-five, tied/unordered when mode permits, wrong final winner, and a correct winner with a duration miss.

## 12E — Provider-free gate

Passed before the first live call:

- Captured preview now `model_direct`
- No reachable post-acceptance Hook rescue
- Captured Balanced succeeds through supported-opening promotion when its body qualifies
- Wrong-number-one ranking still rescues
- Correct-number-one ranking survives acceptable duration variance
- Ranking rescue remains coherent
- Unsupported inventions remain rejected
- Prompt 1–12 release gate
- 435-cell reliability matrix
- JSON/NDJSON frozen-result parity (provider-free serializer)
- Public diagnostics privacy
- TypeScript
- ESLint on changed files
- `git diff --check`

Suite: `test:retention-prompt12-certification-fixes` plus the Prompt 1–11 release set (`test:retention-canonical-narration-acceptance`, `test:retention-surgical-narration-repair`, `test:retention-acceptance-calibration`, `test:retention-rejected-proposal-forensics`, `test:retention-provider-path`, `test:retention-creator-content-authority`, `test:retention-narration-first-settings`, `test:retention-coherent-deterministic-rescue`, `test:retention-story-quality-hardening`, `test:retention-story-quality-release-gate`, `test:retention-reliable-generation`, `test:retention-universal-reliability`, `test:retention-creator-context-authority`, `test:retention-matchup-participant-coverage`, `test:retention-hook-bridge`, `test:retention-story-rewrite`, `test:retention-terminal-validation`).

## 12F — Live recertification

In-process production path. Capture on. Fresh maximum **10** provider invocations. Historical Prompt 9 = 12, Prompt 10 = 6, Prompt 11 = 11 do **not** count against this budget. Prompt 12 used **7 / 10**. `stoppedReason: null`. Order: Fast preview → Balanced `gpt-4.1` → Fast ordered ranking → Fast player → explicit Provocative Question. Fictional corpus only. Production code unchanged after the first live call.

Raw proposals remain only in gitignored `.tmp/story-quality-rejected-proposals/prompt12-cert-*.json`. Summary: `.tmp/story-quality-real-cert/prompt12/model-cert-summary.json`.

| ID | Model | Mode | Calls | First speech | Hook | Transformations | Final authority | Coverage | Number-one payoff | Duration | Warnings | Rescue / class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast-preview | `gpt-4.1-mini` | Fast / auto | 1 | **supported accept** | OK + `hook_below_style_target` | `model_narration_accepted` | **`model_direct`** | essential + subject yes | n/a | 60 words / 25.0s | beat compaction; `duration_slightly_under_target` | no / not_rescue |
| balanced-player | `gpt-4.1` | Balanced / auto | 2 | unsupported opening; body rebound | OK + subject-led | `supported_opening_promotion` | **`model_after_rewrite`** | essential + subject yes | n/a | 58 words / 24.2s | reliable plan; beat compaction; quality below target | no / not_rescue |
| fast-ranking | `gpt-4.1-mini` | Fast / auto | 2 | members + correct #1; closer unsupported | OK | claim reject → rescue | `deterministic_rescue` | members + order + #1 in rescue | model named Lina Crowe; closer invented “influence decisive” | first speech 75 words / 31.3s (duration would accept); rescue 62 words / 25.8s | quality below target; fallback label | yes / **correct_protection** |
| fast-player | `gpt-4.1-mini` | Fast / auto | 1 | **supported accept** | OK + subject-led | `model_narration_accepted` | **`model_direct`** | essential + subject yes | n/a | 66 words / 27.5s | beat compaction; quality below target | no / not_rescue |
| fast-player-provocative-hook | `gpt-4.1-mini` | Fast / Provocative Question | 1 | **supported accept** | OK | `model_narration_accepted` | **`model_direct`** | essential + subject yes | n/a | 65 words / 27.1s | beat compaction; `duration_slightly_under_target` | no / not_rescue |

Authority counts: `model_direct` 3, `model_after_rewrite` 1, `deterministic_rescue` 1.

Returned rescue speech used the existing Then-prefixed ranking scaffold. It did **not** emit retired planning labels. Every returned story, including rescue, was coherent and grounded on creator facts. Public diagnostics: no API keys, headers, prompts, creator notes, raw model bodies, or stack traces.

### Rescue classification notes

- **fast-preview — not_rescue.** Canonical accept held through mapping and serialization. The Prompt 11 post-acceptance Hook discard is gone on the live path.
- **balanced-player — not_rescue.** Unsupported opening recovered by deterministic promotion. Remaining model body bytes preserved. No extra provider call.
- **fast-ranking — correct_protection.** Five members rebound; Lina Crowe named number one; last sentence added “initiates nearly every attack, making her influence decisive,” which is unsupported. Duration (75 vs 72) was inside the slight band and was not the terminal reject. Rescue restored grounded member lines and an explicit number-one closer.
- **fast-player / explicit Hook — not_rescue.** Supported accept. Soft Hook and duration warnings do not change authority.

### JSON / NDJSON

One accepted live internal result (Fast preview, `model_direct`) was serialized through JSON and NDJSON. No second independent provider call.

Parity: narration, beats, disposition, diagnostics. JSON success true. NDJSON included a `complete` event. Artifact: `.tmp/story-quality-real-cert/prompt12/shared-result-json-ndjson.json`.

### Prompt 12 readiness against the contract

| Required | Result |
| --- | --- |
| Accepted live Fast preview | **yes** — `model_direct` |
| Accepted live Balanced narration | **yes** — `model_after_rewrite` / `supported_opening_promotion` |
| Accepted live correct-number-one ranking | **no** — correct #1 present, closer unsupported, coherent rescue |
| Authority `model_direct` or `model_after_rewrite` on those three | preview and Balanced yes; ranking no |
| No canonically accepted candidate later discarded | **yes** |
| Wrong-number-one and unsupported output still rescue | **yes** (provider-free wrong #1; live unsupported closer) |
| Duration variance without filler or fact loss | **yes** on accepted cases and on the captured 84-word replay |
| All returned rescue narration coherent | **yes** |
| Provider budget | 7 / 10 |
| Provider-free gates | pass |

`model_direct` and `model_after_rewrite` both count as accepted model narration. Honest soft warnings do not block. Missing accepted live ranking blocks `ready`.

## Remaining risks

- Fast ranking still invents a stronger number-one reason than the creator text supplies. That remains a correct reject, but it is why live ranking did not certify.
- Opening questions such as `Why Calen Voss?` remain unsupported until promotion; promotion requires a grounded, complete remainder.
- Duration warnings are honest and common on 30s Fast speech in the 58–66 word band.
- Write My Own still enters the Hook runner after accept so hard-requirement Auto-reconcile can run.
- Stochastic model speech can still miss ranking payoff identity on other samples; the Harbor wrong-number-one control remains required.

## Prompt 11 frozen implementation fingerprint (prior cert)

Recorded before provider-free and live runs. Re-checked immediately before the first live call and again after live calls. Production code was not edited after certification began.

| Field | Value |
| --- | --- |
| Repository | `footiebitz` at `/Users/deshdeepaksingh/Developer/Footie-Bitz/footiebitz` |
| Branch | `staging-story-input-grounding-fix` tracking `origin/staging` |
| HEAD | `1c66af2c1068dd70af196e448a6914d638f240bf` (same as `origin/staging`) |
| Tracked diff SHA-256 | `c4f80015749553c270f304e771585238a695ef903b9dd1cb6446756aabd206d4` (292854 bytes, 68 tracked files) |
| Implementation SHA-256 | `0ad64fb3f3c5dba48dd0de2485cadd5c46c583da7c2030b8fbfa6cc91872c790` (tracked diff + sorted untracked `src/` / `scripts/` / `*.verify.ts`) |
| `package-lock.json` SHA-256 | `5dd857fb10f34bae7a2cf2d409b6c19c100680e2cdd06ae0a01c82e62b4852d0` |
| Fast model | `gpt-4.1-mini` |
| Balanced / Studio model | `gpt-4.1` |
| `OPENAI_SCRIPT_MODEL` | unset |
| Untracked source/test files at freeze | 58, including `scripts/run-story-quality-prompt11-cert.ts` |
| Post-live implementation still frozen | yes |

Local fingerprint file: `.tmp/story-quality-real-cert/prompt11/frozen-implementation-fingerprint.json` (gitignored). This tracked evidence file may be updated after testing; it is not part of the frozen implementation digest.

Prompt 1–10 work remains **uncommitted**. Nothing was committed, pushed, merged, or deployed. No credentials, environments, or models were changed.

## Prompt 11A provider-free gate

Reran the complete Prompt 1–10 release gate on the frozen implementation **before** any Prompt 11 live call. Result: **pass**.

Passed:

- Canonical narration acceptance
- Saved production-proposal replay
- Claim-support calibration
- Weak versus broken Hook behavior
- Bounded opening repair
- Bounded ranking-payoff repair
- Post-acceptance keep invariant
- Mapping fidelity
- Coherent deterministic rescue
- Creator-content preservation
- Varied universal corpus
- 435-cell reliability matrix
- JSON/NDJSON frozen-result parity (provider-free serializer)
- Public diagnostics privacy
- Provider-call accounting
- TypeScript
- ESLint on changed files
- `git diff --check`

Suites: `test:retention-canonical-narration-acceptance`, `test:retention-surgical-narration-repair`, `test:retention-acceptance-calibration`, `test:retention-rejected-proposal-forensics`, `test:retention-provider-path`, `test:retention-creator-content-authority`, `test:retention-narration-first-settings`, `test:retention-coherent-deterministic-rescue`, `test:retention-story-quality-hardening`, `test:retention-story-quality-release-gate`, `test:retention-reliable-generation`, `test:retention-universal-reliability`, `test:retention-creator-context-authority`, `test:retention-matchup-participant-coverage`, `test:retention-hook-bridge`, `test:retention-story-rewrite`, `test:retention-terminal-validation`.

## Prompt 11B / 11C live certification

In-process production path. Capture on. Fresh maximum **12** provider invocations (planner, composer, rewrite, repair, retry). Historical Prompt 9 = 12 and Prompt 10 = 6 do **not** count against this budget. Prompt 11 used **11 / 12**. `stoppedReason: null`. Order: Fast player → Fast preview → Fast ranking → Balanced `gpt-4.1` → explicit Provocative Question → second ranking (first ranking named the wrong number-one member). Fictional corpus only.

Raw proposals remain only in gitignored `.tmp/story-quality-rejected-proposals/prompt11-cert-*.json`. Summary: `.tmp/story-quality-real-cert/prompt11/model-cert-summary.json`.

| ID | Model | Mode | Calls | First speech | Hook | Transformations | Final authority | Coverage | Number-one payoff | Duration words | Warnings | Rescue / class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast-player | `gpt-4.1-mini` | Fast / auto | 2 | unsupported (opening escalated beyond “return”; body/payoff rebound) | OK | claim reject → rescue | `deterministic_rescue` | essential + subject yes | n/a | 67 | quality below target | yes / **correct_protection** (script); human: conservative-question gray area, not a clear invention |
| fast-preview | `gpt-4.1-mini` | Fast / auto | 2 | **canonical accept**, grounding OK | OK + `hook_below_style_target` | later `hook_validation_rejection` → rescue | `deterministic_rescue` | essential + subject yes | n/a | 49 | quality below target | yes / **incorrect_pipeline_rejection** |
| fast-ranking | `gpt-4.1-mini` | Fast / auto | 1 | members supported; closer named last member as decisive name | payoff/Hook miss | Hook/body reject → rescue | `deterministic_rescue` | members + order in rescue | rescue used correct first-listed member | 67 | quality below target | yes / **correct_protection** |
| balanced-player | `gpt-4.1` | Balanced / auto | 3 | unsupported/ambiguous opening; editorial escalations | soft `hook_subject_led` / `hook_below_style_target` | Hook validation reject → rescue | `deterministic_rescue` | essential + subject yes | n/a | 67 | quality below target | yes / **correct_protection** |
| fast-player-provocative-hook | `gpt-4.1-mini` | Fast / Provocative Question | 1 | **supported accept** | OK | `model_narration_accepted` | **`model_direct`** | essential + subject yes | n/a | 67 | beat compaction only | no / not_rescue |
| fast-ranking-second | `gpt-4.1-mini` | Fast / auto | 2 | members + correct number-one named | OK | duration/compression reject → rescue | `deterministic_rescue` | members + order + number-one in model speech | model named correct #1; then duration reject | 67 | quality below target | yes / **uncertain** |

Authority counts: `model_direct` 1, `model_after_rewrite` 0, `deterministic_rescue` 5.

Duration utilization: accepted explicit-Hook case 67 / 72 words. Rescues report 67 words except preview rescue at 49. Quality-below-target is expected on rescue and is not itself a readiness blocker.

Returned rescue speech used dramatic Then/Now prefixes. It did **not** emit the retired planning scaffold (`central idea`, `that connection`, and related labels). Every returned story, including rescue, was coherent and grounded on creator facts. Public diagnostics: no API keys, headers, prompts, creator notes, raw model bodies, or stack traces.

### Rescue classification notes

- **fast-player — correct_protection (script), human gray area.** Opening classified unsupported/ambiguous. Body facts and payoff rebound. Same Fast player mode later accepted on the explicit Hook sample, so this is a known stochastic / conservative-question risk, not proof that Fast player cannot accept.
- **fast-preview — incorrect_pipeline_rejection.** Canonical accept, spoken grounding OK, Hook OK with a soft style warning. A later Hook-engine path still entered `hook_validation_rejection` and replaced the accepted speech. Supported coherent narration was available. This is a release blocker.
- **fast-ranking — correct_protection.** Model named the last listed member as the decisive name. Wrong-member number-one is not a closer-only miss. Bounded payoff repair was correctly withheld. Rescue restored the first-listed member as number one.
- **balanced-player — correct_protection.** Opening classified unsupported/ambiguous; body included unsupported editorial escalations. Soft Hook warnings were present but were not the only defect. Balanced did not produce accepted model narration on this sample.
- **fast-ranking-second — uncertain.** Grounded members, correct number-one, Hook OK. Rejected for duration/compression, then rescued. Not an invention and not a wrong-member ranking. Treat as a duration-gate risk on an otherwise usable ranking, not as proof that ranking model speech never works.

### JSON / NDJSON

One accepted live internal result (explicit Provocative Question) was serialized through JSON and NDJSON. No second independent provider call.

Parity: narration, beats, authority (`model_direct`), disposition, acceptance trace, warnings, quality state (`qualityBelowTarget: false`), and safe diagnostics. JSON success true. NDJSON included a `complete` event. Artifact: `.tmp/story-quality-real-cert/prompt11/shared-result-json-ndjson.json`.

### Prompt 11 readiness against the contract

| Required | Result |
| --- | --- |
| Live accepted model narration on Fast | yes — explicit Hook player (`model_direct`) |
| Live accepted model narration on Balanced | **no** |
| Live accepted player and preview | player yes (explicit Hook); **preview incorrectly rescued** |
| Live accepted ranking, directly or after bounded correct-member payoff repair | **no** — first sample correctly rescued; second duration-rescued; no `model_after_rewrite` |
| Explicit Hook style survives as accepted model narration | yes |
| No supported coherent candidate incorrectly rescued | **no** — preview |
| Unsupported inventions and wrong-member rankings remain rejected | yes on these samples |
| Every returned story coherent and grounded | yes |
| Rescue never emits retired planning scaffold | yes |
| JSON/NDJSON parity | pass |
| Provider-free gates | pass |
| 12-call budget | 11 / 12 |

`model_direct` and `model_after_rewrite` both count as accepted model narration. Honest soft warnings do not block. Preview incorrect rejection and missing Balanced/ranking model acceptance block `ready`.

## Prompt 10 saved-proposal replay

## Prompt 10 saved-proposal replay

Exact production orchestration. Frozen composer. No provider calls. Hook-engine grounding vetoed after compose.

| Case | Canonical accept | Later reversal | Final authority | Transformation | Rescue | Quality warning |
| --- | --- | --- | --- | --- | --- | --- |
| Saved Fast player | accept | no | `model_direct` | none | no | none required |
| Saved Fast preview | accept | no | `model_direct` | none | no | none required |
| Saved Fast ranking | textual repair (`payoff_does_not_resolve_hook`) | no | `model_after_rewrite` | `ranking_payoff_repair` closer appended | no | none required |
| Saved Balanced player | accept | no | `model_direct` | none | no | `hook_subject_led` / quality below target |

Required invariant, now regression-tested: once spoken narration receives canonical acceptance, a later Hook, claim-reference, mapping, promotion, metadata, or failed Hook-repair stage must not enter rescue unless the spoken narration itself changes and is re-evaluated.

Post-Prompt-9 keep now holds for the saved player and preview speech that Prompt 9 had already proven grounded.

## Weak versus broken Hook policy

Accept with a warning (model narration, `qualityBelowTarget` allowed):

- relevant but bland
- subject-led
- less provocative than selected
- structurally simple
- weaker than the quality target

Safe reasons: `hook_below_style_target`, `hook_low_tension`, `hook_subject_led`. Soft Hook reasons (`opening_subject_only`, `opening_lacks_contract_promise`) no longer reject.

Repair or reject (bounded opening repair, then rescue only if the repaired complete narration fails):

- meaningless
- grammatically broken
- unrelated to the body
- unsupported
- prohibited result leak
- incompatible with an explicit user-written hard requirement

A mode-valid ranking tease such as a countdown question is not treated as unrelated.

## Surgical opening / payoff repair

Inspected saved failed Hook-repair outputs: prior repair regenerated full narration. Replaced with bounded region repair using existing rewrite authority.

Opening repair: replacement opening only; body and payoff bytes preserved; metadata rebuilt; canonical acceptance run once; `model_after_rewrite` on success; rescue only if the repaired complete narration fails. No new names, statistics, dates, results, allegations, stronger certainty, or new causal claims.

Ranking closer: appends `${firstListedMember} stands last as the number-one name.` Preserves earlier ranking narration and order. Does not invent a reason or add a generic “central idea” sentence. Wrong-member “number one” is not a closer-only miss; that uses coherent deterministic rescue.

Provider-free proofs: body/payoff preservation, invention rejection, ranking order preservation, explicit number-one closer, honest ranking rescue fallback.

Internal rewrite types only: `opening_repair`, `ranking_payoff_repair`. Top-level authorities stay `model_direct` | `model_after_rewrite` | `deterministic_rescue`. A soft quality warning does not change authority.

## Prompt 10 live certification

In-process production path. Capture on. Maximum 8 invocations. Order Fast player → Fast preview → Fast ranking → Balanced `gpt-4.1` → optional explicit Hook. Stopped before Balanced (`budget_stop:balanced-player`). Total used **6 / 8**. No separate JSON/NDJSON generation.

| ID | Model | Invocations | First speech | Transformations | Final authority | Coverage | Hook/body/payoff | Warnings | Rescue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast-player | `gpt-4.1-mini` | 2 | last-clause false-positive unsupported (payoff question restatement) | claim reject → rescue | `deterministic_rescue` | facts present | capture Hook/body OK | quality below target | yes |
| fast-preview | `gpt-4.1-mini` | 2 | **canonical accept**, grounding OK | Hook repair miss cleared keep-path → `hook_validation_rejection` → rescue | `deterministic_rescue` | facts present | capture OK; `hook_below_style_target` | quality below target | yes |
| fast-ranking | `gpt-4.1-mini` | 2 | **canonical accept**, members supported; closer named the last member as number one | Hook repair miss cleared keep-path → rescue | `deterministic_rescue` | order in rescue; number-one in rescue | capture accepted a wrong number-one closer | quality below target | yes |
| balanced-player | `gpt-4.1` | 0 | not started | — | — | — | — | — | — |
| explicit Hook | `gpt-4.1-mini` | 0 | not started | — | — | — | — | — | — |

Authority counts on started cases: `model_direct` 0, `model_after_rewrite` 0, `deterministic_rescue` 3. Public leaks: none. Live transport parity of an accepted frozen result: not applicable. Provider-free serializer still shares one internal result.

Those live keep-path and paraphrase defects are now fixed in the dirty tree and proven provider-free against the saved Prompt 9 proposals and the Prompt 10 live captures. The live recert was not re-run (remaining 2 invocations cannot cover Balanced; re-running Fast would add calls after the completed 6).

## Prompt 9 context (unchanged history)

Prompt 9 captured the rejected model proposals that Prompt 8 could not see. The Fast preview forensic was supported speech rejected by punctuation-sensitive claim matching, then replaced by rescue. Ablation showed narration-only and narration-plus-support contracts were grounded; the full production schema was not the sole cause.

Production changes after that classification: spoken-claim adjudication, a narration-primary composer schema, ranking-rescue number-one payoff, transformation provenance, and a keep-path so Hook-engine grounding cannot replace canonically accepted speech. Provider-free Prompt 1–9 suites pass. Live Prompt 9 recert still finished as rescue on every baseline and exhausted the 12-invocation cap before an explicit Hook case. Rescue is not a model-quality Pass.

## Prompt 9 rejected-proposal diagnosis

Local capture only (gitignored `.tmp/story-quality-rejected-proposals/`). Tracked evidence has classifications, not raw model text.

Forensic Fast preview (`gpt-4.1-mini`, 1 composer + 1 repair):

| Clause | Human class | Evaluator at capture |
| --- | --- | --- |
| Topic-echo opening + editorial clash language | connective / editorial | model-supplied reference |
| Combined titles + missed-knockout paraphrase | conservative paraphrase of two creator facts | unsupported (false positive) |
| Coach now leads the other side + personal-edge connective | directly supported + connective | non-factual connective (false negative) |
| Redemption question | conservative paraphrase + required uncertainty | non-factual connective |

Hook on the original model speech was OK. Canonical stage was `unsupported_claim_or_claim_reference_rejection`. Repair did not accept. Rescue replaced the model speech. Provenance at forensic time only recorded the already-rescued text.

Cause: punctuation-sensitive substring match, compound-sentence clauses, and topic-title units competing with verbatim facts. Not an unsupported invention. Not a Hook failure.

## Ablation results

Same fictional preview, same `gpt-4.1-mini`, two additional composer calls (forensic + ablation = 4):

| Variant | Grounding | Hook/body | Other | Result |
| --- | --- | --- | --- | --- |
| A narration-only | supported | opening/payoff style miss | 83 words | textual repair |
| B narration + constrained support IDs | supported | pass | 93 words / duration | textual repair |
| C production (forensic) | false-positive unsupported | pass on original speech | repair then rescue | rescue |

No variant shared an unsupported invention. Decision: fix the claim-support false positive; simplify the composer so the model is not asked for competing Hook/payoff/ID copies; do not lower duration or grounding thresholds.

## Whether the production composer was simplified

Yes. Production Structured Outputs now require `title`, `narration`, and `support`. Support IDs are an enum of supplied allowed IDs, or `maxItems: 0` when there are no factual units. Hook, payoff, beats, planning labels, and duplicate claim text are no longer requested from the model. Legacy stored/injected fields remain readable. `gpt-4.1-mini` and `gpt-4.1` were not changed.

## Transformations responsible for corruption

- Claim-support heuristic rejected supported preview speech (forensic C).
- Rescue then replaced that speech (`deterministic_rescue`, full-region digest change on recert preview).
- Fast player and Fast preview recert: canonical acceptance was `accept`, grounding OK, Hook/body OK; Hook-engine validation then vetoed keep-after-accept via `hardGatesPassed.grounding` (opening shape / Hook grounding, not spoken invention). That keep-path is now fixed in code; live recert could not be re-run (budget exhausted).
- Fast ranking recert: spoken members were supported; payoff lacked an explicit number-one cue (`payoff_does_not_resolve_hook`). Genuine mode miss. Rescue now states number-one / stands last.
- Balanced recert: subject-only topic-echo opening (`opening_subject_only`) plus an ambiguous first clause. Hard Hook miss, not a style warning.
- Metadata-only stages did not rewrite accepted speech when recorded. Dramatic Then/Now prefixes remain rescue tone presentation only.

## Prompt 9 live recert

In-process production path. Capture on. Remaining budget 8 after forensic 4. Total used **12 / 12**. Explicit Hook case not started.

| ID | Model | Invocations | First speech supported | Transformations | Canonical live result | Hook/body | Ranking payoff | Words | Warnings | Rescue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast-player | `gpt-4.1-mini` | 2 | yes (capture accept) | Hook-engine veto → rescue | rescue / `hook_validation_rejection` | capture OK | n/a | 67 | quality below target | yes |
| fast-preview | `gpt-4.1-mini` | 1 | yes (capture accept) | rescue replaced accepted speech | rescue / `unsupported_claim_or_claim_reference_rejection` | capture OK | n/a | 49 | quality below target | yes |
| fast-ranking | `gpt-4.1-mini` | 2 | yes (members) | hook/body payoff miss → rescue | rescue / `hook_body_relationship_rejection` | payoff miss | rescue now has number-one | 73 | quality below target | yes |
| balanced-player | `gpt-4.1` | 3 | no (subject-only opening) | claim + Hook hard miss → rescue | rescue / `hook_validation_rejection` | subject-only opening | n/a | 67 | quality below target | yes |

Authority counts: `model_direct` 0, `model_after_rewrite` 0, `deterministic_rescue` 4. Public leaks: none. Transport parity of an accepted frozen result: not applicable live; provider-free serializer still shares one internal result.

## Prompt 8 context (unchanged history)

Prompt 8 established one canonical acceptance decision from the final spoken narration and the Creator Content Contract. Provider-free Prompt 1–8 suites pass. Live certification stayed inside the 10-invocation budget and no longer leaks creator notes in public diagnostics.

The four Prompt 8 live baselines all finished as coherent deterministic rescue after one targeted textual repair. Prompt 8 forbids calling that rescue a model-quality certification. Public Prompt 8 artifacts excluded rejected model text, which is why Prompt 9 capture was required.

## Exact split-authority findings (Prompt 7 → 8A)

Saved Prompt 7 artifacts contain final rescue narration only, not rejected model proposals. Replay used those safe stages plus anonymized fictional fixtures through the full production path.

| Prompt 7 case | Spoken narration before reject | Metadata match | First decision | Later reversing authority | Unsupported spoken claims | Stale/invalid metadata | Repair changed | JSON/NDJSON cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fast player JSON | accepted model speech | n/a | accept | none | none recorded | none | none | accepted |
| Fast player NDJSON | rescue speech only | unknown | later reject | claim-reference metadata | none proven | unknown IDs likely | repair then rescue | separate nondeterministic model sample, not transport |
| Preview Fast | coherent preview speech | `hookOpening` not the spoken opening | narration-first accept | Hook engine `hook_validation_rejection` | none proven | stale Hook metadata / style quality | repair then rescue | n/a |
| Ranking Fast | ordered members present | Hook/body used stale opening metadata | later reject | `hook_body_relationship_rejection` | none proven | stale Hook metadata | repair then rescue | n/a |
| Balanced player | supported brief Fast had accepted | unknown claim IDs | later reject | claim-reference validator | none proven | unknown IDs | repair then rescue | n/a |
| Bold preview | preview speech | Hook claim refs / IDs | later reject | claim-reference validator | none proven | invalid Hook refs | repair then rescue | n/a |

Conflicting authorities before Prompt 8:

1. Narration-first composition could accept coherent speech.
2. Model-supplied `hookOpening` / claim-reference metadata could disagree with that speech.
3. The Hook engine could reject again after narration-first acceptance.
4. Claim-reference validation could reject supported speech after attempted rebinding.
5. Targeted repair consumed another provider call and still hit the same stale-metadata gates.
6. JSON and NDJSON used one orchestrator but two independent live generations.
7. Live call accounting counted HTTP requests, not hidden planner/composer/rewrite invocations.

## Canonical acceptance flow

### Before

1. Model produces narration and metadata.
2. Narration-first validate may accept.
3. Hook engine may reject on style/quality/word-limit using `hookOpening` or its own opening span.
4. Claim-reference validate may reject on unknown IDs even when speech is supported.
5. Mapping / terminal Hook coherence may fail closed on quality-only Hook misses.
6. Repair re-enters those later gates with stale pre-normalization metadata.

### After

1. Model produces continuous narration and metadata.
2. Proposal metadata is normalized against narration (unknown IDs dropped; stale Hook/payoff discarded).
3. Permitted Hook promotion may run before final acceptance.
4. Spoken Hook / body / payoff are derived from the resulting narration.
5. Grounding, coherence, mode, Hook promise/payoff, duration, and completeness are evaluated once.
6. Decision is accept, one targeted textual repair, or coherent deterministic rescue.
7. Accepted narration maps to beats without changing meaning.
8. Mapping fidelity is checked without rerunning a contradictory editorial gate.

Canonical input is: final continuous narration, narration-derived opening/body/payoff, Creator Content Contract, mode, Hook style, tone, duration, required uncertainty, essential/optional units, and forbidden inventions.

The final narration is authoritative. `hookOpening`, `payoffClosing`, and claim IDs are proposal metadata only.

## Duplicate gates removed or redirected

- Hook-engine quality-only failure after a canonical Pass no longer becomes `hook_terminal_failure` rescue. The composed candidate is kept.
- User-written hard-gate / safety / grounding Hook failures are not kept; they still reconcile or rescue.
- Terminal Hook authority no longer fails closed on word-limit or style-threshold misses. Grounding and safety hard gates remain.
- Rebuild-from-candidate no longer fails on Hook quality-only misses.
- Kept rescue candidates now bind `compositionAuthority` to the real billing mode so a deterministic marker cannot be labeled `model_initial`.
- Public `generationContext` is a presence enum (`supplied`) and no longer echoes creator notes.

Unsupported inventions, incoherent narration, meaningless Hooks, missing ranking members, broken sentences, and genuine hook/body failures still reject.

## Claim-grounding normalization

- Factual spoken units must be supported by known Creator Content Contract units.
- Known model IDs may contribute evidence. Unknown IDs never authorize a claim and are removed from canonical metadata.
- Supported speech may be rebound only to genuinely supporting known units.
- Ambiguous support remains unsupported.
- Loose token similarity does not authorize a factual claim.
- Supported speech is not rejected solely because the model attached an invalid ID.
- Hook claim references use the same grounding authority.
- Duration/absence paraphrases that match more than one named unit stay unsupported.
- Metadata normalization consumes zero provider calls and does not rewrite narration.

Internal provenance: `model_supplied_reference`, `normalized_reference`, `safely_rebound_reference`, `unsupported`, `non_factual_connective`.

Public diagnostics stay free of creator text and internal content IDs.

## Preview and ranking responsibilities

Preview accepts when spoken narration establishes both sides, develops the intended conflict, uses relevant creator evidence, keeps uncertainty, and returns to the match question or consequence. A Hook may be semantically related without repeating body tokens. Interchangeable subject-swap Hooks and unrelated Hooks still reject.

Ranking requires every essential member, supplied order, meaningful support per member, a clear number-one signal, and a concluding ranking payoff. The number-one payoff may live in the final member’s sentence. A generic extra closer is not required. Claim-dump / checklist rankings still reject.

## JSON / NDJSON parity definition

Parity is not identical text from two independent live model calls.

Generation produces one internal canonical result. The same frozen result serialized through JSON and NDJSON must preserve narration, beats, authority, disposition, acceptance trace, warnings, quality status, and safe diagnostics.

`/api/generate-script` already shares `runGeneration`. `serializeRetentionCanonicalGenerationResult` encodes that frozen result for both transports. Live certification must not pay for a second independent NDJSON generation.

## Public diagnostic leakage result

Provider-free sentinel regression: unique secret-like strings in creator notes do not appear in public JSON/NDJSON fields outside intended narration/content.

Live Prompt 8 public envelopes:

- `generationContext`: `supplied` (never the creator-note body)
- no creator-note sentence leakage in public diagnostics
- `publicLeaks`: empty on every live case

Creator-authored substance remains in the spoken narration itself.

## Provider-call accounting

Certification-only budget `certification-call-budget/1` counts planner, composer, rewrite, and retry before invocation. Optional cases stop before the cap. An already-started generation is never interrupted. Normal production ledger ceilings are unchanged.

Expected calls per quality mode:

| Mode | Initial | With textual repair |
| --- | --- | --- |
| Fast (`cheap`) | 1 | 2 |
| Balanced | 2 | 3 |
| Studio (`best`) | 2 | 3 |

Maximum Prompt 8 live budget: **10 provider invocations**, not 10 HTTP requests.

Prompt 8 live used **9** invocations across **4** HTTP requests, then stopped optional explicit-Hook cases. No overrun.

Maximum Prompt 9 live budget: **12** provider invocations including forensic/ablation. Used **4** forensic/ablation + **8** recert = **12**. Explicit Hook case not started. No overrun.

## Real certification matrix

Path: local ShortForge `POST /api/generate-script` on port 3477 after restarting the app onto Prompt 8 code. Research off. Voice / scene / image / export not invoked. Fictional corpus only.

| ID | Model | Quality | Story mode | Hook style | Invocations | Split | Stage | Authority | Coverage | Members/order | Hook/payoff | Duration words | Quality warning | Rescue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| player-comeback-fast | `gpt-4.1-mini` | Fast | `player_analysis` | auto → `provocative_question` | 2 | 0/1/1/0 | `unsupported_claim_or_claim_reference_rejection` | `deterministic_rescue` | rescue grounded | n/a | rescue | 67 | true | yes |
| match-preview-fast | `gpt-4.1-mini` | Fast | `match_preview` | auto → `stakes_first` | 2 | 0/1/1/0 | `hook_validation_rejection` | `deterministic_rescue` | both sides in rescue | both sides | rescue | 49 | true | yes |
| top-five-fast | `gpt-4.1-mini` | Fast | `top_5` | auto → `countdown_tease` | 2 | 0/1/1/0 | `hook_body_relationship_rejection` | `deterministic_rescue` | members in rescue | five names; number-one payoff missing in rescue | failed then rescue | 73 | true | yes |
| player-comeback-balanced | `gpt-4.1` | Balanced | `player_analysis` | auto → `provocative_question` | 3 | 1/1/1/0 | `hook_validation_rejection` | `deterministic_rescue` | rescue grounded | n/a | rescue | 67 | true | yes |

Split is planner / composer / rewrite / retry.

Optional explicit Hook cases (`provocative_question`, `stakes_first`) were not started: remaining budget after the four baselines was 1, below the Fast-with-repair expectation of 2.

No accepted internal result existed, so live JSON/NDJSON encoding of a shared accepted result was not applicable. Provider-free frozen-result parity still holds.

No further live calls were made after the optional-case stop. Repeated-stage stop did not fire: the four rejection stages were not the same stage twice in a row. All four still entered rescue.

Public artifacts do not include the rejected model proposal text. Fast player, accepted as `model_direct` in Prompt 7, rejected here at spoken-claim grounding after one repair. That may be a nondeterministic unsupported invention or a remaining false-positive. Invention protection was not weakened to force a pass.

## Authority counts (Prompt 8 generate-script)

- `model_direct`: **0**
- `model_after_rewrite`: **0**
- `deterministic_rescue`: **4**

## Architecture summary (Prompts 1–8)

| Prompt | Responsibility | Authority |
| --- | --- | --- |
| 1 | Truthful acceptance trace, fail-soft fallback, narration-substance scoring | `create-retention-generation-acceptance-trace.ts` |
| 2 | Creator Content Contract, claim-linked compression | `build-retention-creator-content-contract.ts` |
| 3 | Settings-driven Composition Brief, narration-first composer | `build-retention-composition-brief.ts`, `map-retention-narration-to-beats.ts` |
| 4 | Coherent deterministic rescue | `build-retention-coherent-deterministic-rescue.ts` (`retention-coherent-deterministic-rescue/1`) |
| 5 | Rescue padding removal, promote/remap fidelity | Prompt 5 section of prior evidence |
| 6 | Provider-failure classification, strict schema repair | `classify-retention-provider-failure.ts`, `retention-composer-json-schema.ts` |
| 7 | Claim-reference rebind, semantic Hook/body, targeted repair, substance scoring | `rebind-retention-composer-content-ids.ts`, `evaluate-retention-hook-body-payoff.ts`, `evaluate-retention-narration-substance.ts` |
| 8 | Single canonical narration acceptance, spoken-claim grounding, transport parity, cert budget, public privacy | `evaluate-retention-canonical-narration-acceptance.ts`, `evaluate-retention-spoken-claim-grounding.ts`, `serialize-retention-canonical-generation-result.ts`, `create-retention-certification-call-budget.ts`, `build-retention-public-generation-context.ts` |
| 9 | Rejected-proposal capture, composer simplification, claim-support adjudication, narration invariants, ranking-rescue payoff, Hook keep-after-accept | `create-retention-rejected-proposal-capture.ts`, `retention-composer-json-schema.ts`, `evaluate-retention-spoken-claim-grounding.ts`, `rebuild-retention-ready-bridge-from-candidate.ts` |
| 10 | Weak-vs-broken Hooks, bounded opening/payoff repair, post-accept keep including failed later Hook repair, ranking number-one identity, conservative question restatement | `apply-retention-bounded-region-repair.ts`, `evaluate-retention-hook-body-payoff.ts`, `evaluate-retention-spoken-claim-grounding.ts`, `create-retention-hooked-model-call.ts` |

Settings remain presentation-only. Factual authority stays on the Creator Content Contract.

Prompt 5/6 provider defect remains classified and repaired: `structured_output_schema_rejected` on Responses `text.format.schema` (`invalid_json_schema`). No API keys, headers, prompts, creator notes, narration, raw bodies, or stack traces are recorded here.

## Current commit / branch / uncommitted status

- Repository: `footiebitz` at `/Users/deshdeepaksingh/Developer/Footie-Bitz/footiebitz`
- Branch: `staging-story-input-grounding-fix` tracking `origin/staging`
- HEAD: `1c66af2c1068dd70af196e448a6914d638f240bf` (same as `origin/staging`)
- Prompt 1–10 work is **uncommitted**. Nothing was committed, pushed, merged, or deployed.
- Raw cert artifacts stay under gitignored `.tmp/story-quality-real-cert/`.

## Provider and model identifiers

No secrets are recorded here.

- Configured text provider: OpenAI script generation
- Fast: `gpt-4.1-mini`
- Balanced / Studio: `gpt-4.1`
- Optional override name only: `OPENAI_SCRIPT_MODEL` (unset in this cert)
- Endpoint family: Responses (`openai.responses.create`) with Structured Outputs `strict: true`

## Provider-free test results

Prompt 11 reran this complete set on the frozen implementation before live calls. Passed:

- Prompt 10 surgical narration repair (`test:retention-surgical-narration-repair`)
- Prompt 9 rejected-proposal forensics (`test:retention-rejected-proposal-forensics`)
- Prompt 8 canonical narration acceptance
- Prompt 7 acceptance calibration
- Prompt 6 provider-path
- Prompt 2 creator-content authority
- Prompt 3 narration-first / settings
- Prompt 4 coherent deterministic rescue
- Prompt 5 hardening corpus
- Story-quality release gate
- Reliable generation
- Universal reliability matrix (435 cells)
- Creator-context authority
- Matchup participant coverage
- Hook bridge
- Story rewrite
- Terminal validation
- Typecheck
- ESLint on changed files
- `git diff --check`

Prompt 10/11 regressions covered with fictional subjects only. No Manchester United, Chelsea, Real Madrid, Spain, or France special-casing in Prompt 10/11 authorities.

## Confirmation: no topic-specific production logic

Prompt 8 authorities contain no football clubs, leagues, or player special cases. Fictional cert names are corpus-only.

## Remaining risks

- Live keep-path still drops a canonically accepted Fast preview via later `hook_validation_rejection`. Provider-free saved-proposal keep holds; the live Hook-engine path does not. This is the primary release blocker.
- Live ranking can name the last member as number one. Rescue is correct protection. Bounded closer must stay withheld on wrong-member speech.
- A second live ranking named the correct number-one and still rescued on duration/compression. Ranking model acceptance is unproven.
- Balanced `gpt-4.1` on this sample opened with an unsupported/ambiguous subject question plus editorial escalations and rescued. Balanced model acceptance is unproven.
- Auto Fast player opening support remains a conservative-question gray area. The same mode accepted on an explicit Provocative Question (`model_direct`). Treat auto-player rescue as a known stochastic risk, not as proof the Fast player path is dead.
- No live `model_after_rewrite` was observed. Bounded opening/payoff repair remains provider-free only.
- Deterministic rescue remains a successful low-quality fallback, never a model-quality Pass.

Do not paper over those with topic-specific production rules, a second claim system, another validator, or another intelligence index. Do not patch the live preview keep-path and then claim this Prompt 11 run certifies the patched tree.

## Final verdict

`not_ready`

Frozen implementation fingerprint held through provider-free and live certification. Production code was not changed after certification began. Provider-free Prompt 1–10 gates pass. Live budget 11 / 12. JSON/NDJSON parity on the one accepted live result passes.

Live accepted model narration exists on Fast (explicit Hook player). It does not exist on Balanced, auto preview, or ranking. A supported coherent preview was incorrectly rescued. That blocks ready.

The dirty Prompt 1–10 implementation is **not** ready for review and commit as a certified release. It should stay uncommitted for a later implementation slice. Everything remains uncommitted.
