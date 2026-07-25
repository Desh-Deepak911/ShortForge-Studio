# Sprint 11E Phase 2C.1B — R2 Fixture Authority

**Status:** IMPLEMENTED / DETERMINISTIC VERIFY SUITES  
**Date basis:** 2026-07-20

## Fixture correction (same-snapshot)

Prior official live FAIL (`docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md`, archived as `docs/HEADLESS_11E_R2_LIVE_EVIDENCE.pre-2c1b-*.md`) included `coverage.reconcile` failure from mismatched provisional/upload digest ordering.

**Correct construction (frozen):**

1. Generate payload bytes
2. Digest once (`sha256:…`)
3. Create provisional with `manifestPayloadDigestClaim` = that digest (required; no silent fallback)
4. Create staging with the same digest / length / mime claims
5. Put those exact bytes
6. Verify + finalize
7. Reconcile → `blocked_incomplete` (manifest once; bundle still required)

**Broken construction (must fail):** provisional bound to a wrong/fallback digest while staging/upload use different bytes → reconcile fail-closed on snapshot bind.

## Surfaces

| Surface | Script | Notes |
|---------|--------|-------|
| Same-snapshot fixture | `npm run test:headless-r2-same-snapshot-fixture` | Memory + FakeS3; no remote |
| Evidence privacy | `npm run test:headless-r2-evidence-privacy` | Accepts `uploadCapabilityIssued`; rejects URLs/secrets |
| Targeted harness authority | `npm run test:headless-r2-targeted-harness-authority` | Gate-off / membership / no official LIVE overwrite |
| Targeted harness (gated) | `npm run test:headless-r2-targeted` | `HEADLESS_R2_QA_TARGETED=1`; separate evidence path |

## Evidence paths

- Targeted: `docs/HEADLESS_11E_R2_TARGETED_EVIDENCE.md`
- Official live (archive FAIL; do not overwrite): `docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md`

## QA staging key length

Full `deriveHeadlessR2ObjectKey` paths are ~133 chars and exceed the provisional staging-ref locator cap (`HEADLESS_MAX_ID_LENGTH` = 128). Live/targeted fixtures therefore emit short opaque `qa/stg/…` keys (identities still validated via the production deriver) so coverage reconcile can bind without changing production validators.

## Constraints preserved

No changes to production snapshot validator, coverage completion rules, R2 verify, Neon CAS, migration `004`, or production routes.
