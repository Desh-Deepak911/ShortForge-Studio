# Sprint 11E Phase 2E.2D.8C.2A — Versioned Fly staging accepted-image authority

**Status:** Implemented locally (QA/deployment authority only)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Runtime worker behavior:** unchanged

## Problem corrected

Live verify/render harnesses bound `acceptedImageDigestSha256` to the **pre-007** verify-first PASS digest (`ae06963a…`) while staging Machines run the **post-007** seven-migration image (`28d60fb5…`). Current staging readiness must fail closed on digest/schema/lifecycle mismatch without rewriting historical evidence.

## Authority module

`src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority.ts`

| Field | Pre-007 historical | Post-007 current |
|-------|-------------------|------------------|
| `recordId` | `pre_007_historical` | `post_007_current` |
| `lifecycle` | `historical` | `current` |
| Digest | `ae06963a…` | `28d60fb5…` |
| Migrations | 000–006 (six) | 000–006 + **007** (seven) |
| 007 checksum | — | `699a3565d7e1…` |
| Worker artifact | null (unversioned) | `f88f5834…` |
| Verify live harness | **not eligible** | **eligible** |
| Render live harness | **not eligible** | **eligible** |
| Current staging readiness | **not eligible** | **eligible** |

## Selection rules (fail closed)

1. **Current** live harnesses/readiness bind only `post_007_current`.
2. **Historical** PASS evidence validates only with `pre_007_historical` + six-migration fingerprint.
3. Pre-007 digest + seven-migration schema → rejected (`historical_lifecycle_not_current_ready`).
4. Post-007 digest + six-migration schema → rejected (`post_007_digest_with_six_migrations`).
5. Unknown digest → rejected.
6. Verify/render cross-bound mismatch → rejected.
7. Operator env digest override keys → rejected.

## Preserved evidence (byte-identical)

| Artifact | SHA-256 |
|----------|---------|
| Historical pre-007 verifier PASS | `93c402510d234340cd7d21904d9c49295e88c06fb4a3709a73fc794b92769e88` |
| Official verifier FAIL (pre-fix) | `eb71c0c57fe9a9ceb27bb33b6659e5e13d53ed2ce1b7c7e5ad2f7aa3e4c28806` |

Verify-first PASS evidence (`ae06963a…`) remains historical-only via `fly-staging-verify-first-pass-evidence.ts`.

## Verification

```bash
npm run test:headless-fly-staging-versioned-image-authority
npm run test:headless-fly-verify-live-harness-authority
npm run test:headless-fly-verify-live-readiness-authority
npm run test:headless-fly-render-live-readiness-authority
npm run test:headless-owned-object-slot-key-capacity-007-authority
```
