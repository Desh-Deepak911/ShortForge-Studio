# Sprint 11E Phase 2G.25D Part F.2 Part K — Candidate Recovery Promotion Evidence (sanitized)

## Result

`gate=cleanup_runtime_candidate_recovery result=PASS authority=promoted`

Following the Part F.1 candidate-probe authority correction (defect
`rollout_candidate_lifecycle_missing`, incident `7bd84c3`, candidate authority
`36dba1c`), one authorized one-time candidate recovery deployed correction
digest `41df9b44…`, one candidate-validation probe reached a PASS
disposition, and the digest was promoted to `current` on the TypeScript
authority. **No Fly deploy performed by this authority-promotion step. No
recovery script rerun. No PR merge.**

## Branch and digests

| Item | Value |
|---|---|
| Branch | `release/staging-cleanup-runtime-finalization-rollout` |
| Incident commit | `7bd84c3` |
| Candidate authority commit | `36dba1c` |
| NEW CURRENT (promoted) | `41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde` |
| BRIDGE ROLLBACK (demoted to historical, rollback-eligible) | `7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206` |
| Remain permanently rejected | `9570e9d9…`, `e0224b93…` |

## Operational recovery ledger (pre-existing evidence; not modified)

| Field | Value |
|---|---|
| Recovery decision | `READY_FOR_ONE_TIME_CANDIDATE_RECOVERY` |
| Recovery authorization consumed | true |
| Candidate probe authorization consumed | true |
| Recovery deploy count | 1 |
| Candidate probe count | 1 (accepted attempt; sequence 1 was consumed pre-job) |
| Promoted (ledger flag) | true |
| Cycle lifecycle | `promoted_current` |

## Candidate probe topology and disposition

| Field | Value |
|---|---|
| Topology | 1 verify / 1 render / 0 other, region `iad` |
| Digest on both Machines | `41df9b44…` |
| Verify loop accepted | PASS |
| Render loop accepted | PASS |
| Maintenance | disabled |
| Probe disposition | PASS |
| Gate-off provider contact | zero connections |

## Promotion transition (authority-only; this change)

| Digest | Before | After |
|---|---|---|
| `41df9b44…` | `rejected` / `historical` (permanently rejected for deploy) | `current`; runtime-ready, probe-eligible, deploy-eligible, verify/render-harness-eligible; not rollback-selectable |
| `7de23dbd…` | `current` (temporary current, rollback-eligible) | `historical`; rollback-eligible retained; all other eligibility flags false; maintenance disabled |
| `9570e9d9…` | `rejected` | unchanged, sealed |
| `e0224b93…` | `rejected` | unchanged, sealed |

Sealed rejection records for `41df9b44…` (`…_REJECTED_IMAGE_RECORD` on both
the cleanup-runtime authority and the versioned-image authority) are
preserved byte-for-byte as historical rejection evidence from Part F; the
promoted `current` record is a new, separate authority entry.

## Authority files promoted

- `fly-staging-cleanup-runtime-authority.ts` — `AUTHORITY_VERSION` 4 → 5
- `fly-staging-versioned-image-authority.ts` — `VERSION` 39 → 40
- `fly-staging-image-environment-deployment-pair-authority.ts` — `AUTHORITY_VERSION` 5 → 6
- `fly-staging-rollback-bridge-authority.ts` — `AUTHORITY_VERSION` 2 → 3

## Verification

All updated verify suites pass (`npx tsx <file>`):

- `headlessFlyStagingCleanupRuntimeAuthority.verify.ts`
- `headlessFlyStagingVersionedImageAuthority.verify.ts`
- `headlessFlyStagingImageEnvironmentDeploymentPairAuthority.verify.ts`
- `headlessFlyStagingDeployedValidationCandidateAuthority.verify.ts`
- `headlessRollbackBridgeSchemaCompatibilityAuthority.verify.ts`
- `headlessFlyStagingCleanupRuntimeRolloutAttemptBudget.verify.ts`
- `headlessFlyRenderExecutionProbeAuthority.verify.ts`
- `headlessFlyRender4kCapacityHarnessAuthority.verify.ts`

Post-promotion, candidate-lifecycle probe validation for `41df9b44…` now
fails closed (`candidate_lifecycle_not_active`) because the digest's
versioned-authority lifecycle is `current`, not
`deployed_validation_candidate`; ordinary current-image execution-probe
authority accepts it instead.

## Not in scope for this change

- No `fly deploy` performed.
- No rerun of the candidate-recovery script.
- No PR merge.
- Sealed incident ledger entries in
  `fly-staging-cleanup-runtime-rollout-attempt-state.json` untouched.
- Operational ledger/cycle JSON evidence
  (`fly-staging-candidate-recovery-ledger.json`,
  `fly-staging-candidate-validation-cycle-state.json`) untouched — retained
  as evidence.

## Schema-008 proof

Migrations `001`–`008` exact on the promoted current record; schema
fingerprint unchanged from the sealed rejected record it supersedes on
digest resolution.

## Evidence SHAs

| Artifact | SHA-256 |
|---|---|
| Official execution probe (PASS) | `1342cc902cd0051effb4a4f3b466d9d6b717401a4776a073678f16a1072eac7b` |
| Prior FAIL archive (Part F, pre-recovery) | `cab603789d182bfdb89abe1d0c593dbf0049278093403e4843dc48369b760609` |
| Candidate recovery ledger | `9982193944fd80d4b096424fc4a591bdee2d8e8ff332f25a2e33d884216f4085` |
