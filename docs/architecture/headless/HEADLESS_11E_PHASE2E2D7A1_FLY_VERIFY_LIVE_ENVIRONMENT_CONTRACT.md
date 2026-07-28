# Sprint 11E Phase 2E.2D.7A.1 — Hosted Fly verifier QA environment contract

**Phase type:** Local authority correction — no provider contact  
**Prerequisite:** Phase 2E.2D.7A harness + verify-first PASS evidence preserved  

## Defect corrected

Production `classifyHeadlessR2Environment` requires `R2_ACCOUNT_ID` and `HEADLESS_ALLOWED_ORIGINS`. The Phase 7A harness authority fixture omitted `R2_ACCOUNT_ID`, used `R2_ALLOWED_ORIGINS`, and `assumeConfigured: true` masked the mismatch. Gate-on live execution therefore stopped at **CONFIGURATION_UNAVAILABLE** before provider contact.

Preserved FAIL evidence archive (unchanged):

- Path: `docs/evidence/headless/archive/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.pre-2e2d7a1-configuration-fail-9c0a4e408f387beb59ba8a3af5baf22afc3bb28efbcdb17476d6440dbca7de36.md`
- SHA-256: `9c0a4e408f387beb59ba8a3af5baf22afc3bb28efbcdb17476d6440dbca7de36`

## Canonical eleven-key QA secret contract

0600 bridge for hosted Fly verifier live matrix (`HEADLESS_FLY_VERIFY_QA=1`) must contain **exactly** these secret names (values never logged):

| # | Secret name |
|---|-------------|
| 1 | `DATABASE_URL` |
| 2 | `R2_ACCOUNT_ID` |
| 3 | `R2_ACCESS_KEY_ID` |
| 4 | `R2_SECRET_ACCESS_KEY` |
| 5 | `R2_BUCKET_ASSETS` |
| 6 | `R2_BUCKET_ARTIFACTS` |
| 7 | `R2_ENDPOINT` |
| 8 | `HEADLESS_ALLOWED_ORIGINS` |
| 9 | `UPSTASH_REDIS_REST_URL` |
| 10 | `UPSTASH_REDIS_REST_TOKEN` |
| 11 | `UPSTASH_REDIS_TCP_URL` |

**Removed:** `R2_ALLOWED_ORIGINS` — not a production classifier key and must never substitute for `HEADLESS_ALLOWED_ORIGINS`.

**Separate (not bridge secret lines):** gate `HEADLESS_FLY_VERIFY_QA=1`, optional `HEADLESS_FLY_VERIFY_QA_PRESERVE=1`, public pins `HEADLESS_ENV_NAME=staging`, `HEADLESS_FLY_STAGING_APP_NAME=shortforge-hw-staging-4def8fa0`.

**Forbidden in bridge:** duplicate keys, extra keys, public/gate keys, `CLERK_*`, `NEXT_PUBLIC_*`, `VERCEL_*`, `.env.local` references.

## Gate-on path (no bypass)

1. Eleven-key QA secret membership (`validateFlyVerifyLiveQaEnvContract`)
2. Production classifiers — Neon, R2 (`R2_ACCOUNT_ID` + `HEADLESS_ALLOWED_ORIGINS`), Upstash REST producer, Upstash TCP consumer
3. `HEADLESS_ENV_NAME=staging` and accepted verify-first staging app name
4. Stub boundary check
5. Provider contact only when gate-on **and** not fully injected

**Removed:** `assumeConfigured` on the hosted Fly verifier live harness. Provider-free unit tests must inject **all** adapters (`isFlyVerifyLiveInjectedProvidersOnly`) **and** supply a canonical env that passes real classifiers.

## Safe configuration attribution

Evidence may include aggregate status only (no values, no per-secret failure hints within a provider group):

- `neon_status`
- `r2_status`
- `upstash_rest_status`
- `upstash_tcp_status`
- `env_name_status`
- `app_name_status`

## Authority modules

| Module | Role |
|--------|------|
| `fly-verify-live/qa-secret-contract.ts` | Eleven-key contract, bridge validation, attribution |
| `headlessFlyVerifyLiveEnvironmentContractAuthority.verify.ts` | Contract fixtures |
| `headlessFlyVerifyLiveHarnessAuthority.verify.ts` | Harness gate / injected PASS |
| `headlessFlyVerifyLiveMatrixAuthority.verify.ts` | Frozen 20-case registry |

## Verification commands (local)

```bash
npm run test:headless-fly-verify-live-environment-contract-authority
npm run test:headless-fly-verify-live-harness-authority
npm run test:headless-fly-verify-live-matrix-authority
npm run test:headless-neon-environment
npm run test:headless-r2-environment
npm run test:headless-upstash-environment
npm run test:headless-trusted-verify-promotion
npm run test:headless-hosted-worker-loop
npm run test:headless-hosted-worker-composition
```

Live matrix (`npm run test:headless-fly-verify-live`) remains gate-off / NOT_TESTED unless separately authorized with a valid eleven-key bridge.

## Phase 2E.2D.7A cross-reference

Verify-first PASS evidence remains a **separate preserved document** (`docs/evidence/headless/current/HEADLESS_11E_PHASE2E2D7A_FLY_STAGING_VERIFY_FIRST_PASS_EVIDENCE.md`). The live matrix harness never writes that path. Fly staging deploy bridge remains **exact-nine** (no REST on workers); hosted verifier live QA bridge is **exact-eleven** (includes REST for enqueue + TCP for pending probes).
