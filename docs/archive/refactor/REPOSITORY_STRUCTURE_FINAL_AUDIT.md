# Repository Structure Final Audit (Batch 4)

Closing structural pass on `staging`. No application, renderer, export, UI, provider, or evidence-byte changes.

## Baseline

| Item | SHA / value |
| --- | --- |
| `origin/staging` (base) | `addde6eaccd763fb987a57f35b170c767dcfac70` |
| Branch | `refactor/staging-repository-structure-final` |
| Structural branch merge check | `origin/refactor/staging-headless-evidence-structure` is ancestor of staging ✓ |
| All prior structural branches | ancestors of staging ✓ |

## Inventory (before → after)

| Measure | Before (staging) | After (this branch) |
| --- | ---: | ---: |
| Tracked files | 2602 | 2604 |
| `docs/` Markdown | 214 | 214 |
| `docs/` root Markdown | 6 | 1 (`docs/README.md`) |
| `docs/HEADLESS_*` at root | 0 | 0 |
| `src/verification/**/*.ts` | 702 | 703 |
| `src/features/**/*.verify.ts` | 0 | 0 |
| Flat `src/verification/headless-renderer/*.verify.ts` | 0 | 0 |
| Headless evidence `current/` | 26 | 26 |
| Headless evidence `archive/` | 74 | 74 |
| Exact duplicate Markdown groups | 1 (intentional QA retention pair) | 1 |
| `test:*` scripts | 480 | 480 |
| Missing script targets | 0 | 0 |
| Tracked `.tsbuild-verify` / `.tmp` / `.next` | 0 | 0 |

## Deferred living-document moves (Part C)

| From | To | Status |
| --- | --- | --- |
| `docs/HOOK_ARCHITECTURE_AUDIT.md` | `docs/architecture/HOOK_ARCHITECTURE_AUDIT.md` | moved |
| `docs/HOOK_CONTRACT.md` | `docs/architecture/HOOK_CONTRACT.md` | moved |
| `docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md` | `docs/architecture/RETENTION_STORY_ARCHITECTURE_AUDIT.md` | moved |
| `docs/RETENTION_STORY_CONTRACT.md` | `docs/architecture/RETENTION_STORY_CONTRACT.md` | moved |
| `docs/EXPORT_RELIABILITY_SPRINT.md` | `docs/archive/sprints/EXPORT_RELIABILITY_SPRINT.md` | moved |

Relative links in moved architecture docs corrected (`../../MASTER_ARCHITECTURE.md`, `../product/STUDIO_INTELLIGENCE.md`, etc.).

## Migration report relocation (Part D)

| From | To |
| --- | --- |
| `scripts/headless-evidence-migration-report.json` | `docs/evidence/headless/EVIDENCE_MIGRATION_REPORT.json` |

No executable script loaded the old path. References updated in `docs/evidence/headless/README.md` and `EVIDENCE_REGISTRY.md`.

## Verification hash helper consolidation (Part E)

Created `src/verification/support/evidence-hash.ts`:

| Export | Behavior | Adopted by |
| --- | --- | --- |
| `sha256Bytes` | Lowercase hex SHA-256 of `Buffer \| string` | 7 authority tests (claimed-render diagnostic, deployable packaging, hosted worker 2E1A) |
| `sha256FileSync` | Sync SHA-256 of repo-relative file (`rootDir` default `cwd`) | 6 authority tests (page bootstrap coherence, 4K sampler suite, fly staging versioned image) |

**Intentionally not consolidated** (behavior differs): absolute-path + `existsSync` helpers, `sha256:${hex}` prefixed digests, null-on-missing file helpers, provider-specific evidence modules, production hashing.

Hash outputs verified identical to prior inline `createHash("sha256")` for consolidated call sites.

## Structural residue removed

- Empty `docs/` root clutter (five deferred living docs filed).
- Migration audit JSON removed from `scripts/` (non-executable static output).
- Stale active references updated in indexes, architecture docs, verification path literals, and two domain-type comment pointers.
- No compatibility copies, symlinks, or barrels added.

## Final directory trees (concise)

**Top-level tracked:** `.cursor`, `deploy`, `docs`, `public`, `scripts`, `src`, config roots (`package.json`, `tsconfig*.json`, etc.).

**`docs/`:** `README.md`, `architecture/` (product + headless + hook/retention contracts), `archive/` (`refactor/`, `sprints/`), `evidence/headless/` (`current/`, `archive/`, registry), `operations/`, `product/`, `qa/`.

**`src/verification/`:** domain folders (`export/`, `headless-renderer/`, `story/`, `features/`, …), `support/evidence-hash.ts`, centralized `.verify.ts` ownership (702 suites + 1 support module).

## Package-script integrity

- Total `test:*` entrypoints: **480** (unchanged; no renames).
- Duplicate keys: **0**.
- Missing targets: **0**.
- Path corrections: **0** (prior batches already aligned targets).

## Deterministic worker artifacts

Two consecutive `npm run build:headless-worker` runs:

| Artifact | SHA-256 |
| --- | --- |
| `hosted-worker.js` | `aedf20f675a75b3b071081d111d0ac0131d83cb7a179eb94080ca8b72d62aced` |
| `page-render.iife.js` | `7a5c3e20c9ae6ce4aa3064a371eb445f52e9871f6303ecd481a43417b4fc2372` |
| `BUILD_INFO.json` | `6b2285c3245e29b26c9b212bd35032df2333d89b329a710803c243d2a0411a` |

Deterministic two-build digests: **PASS**.

## Validation results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npx tsc -p tsconfig.verify.json` | PASS (0 diagnostics) |
| `npm run lint` | PASS (0 errors; pre-existing warnings) |
| `npm run build` | PASS |
| `npm run build:headless-worker` (×2) | PASS |
| `npm run test:headless-render-contract` | PASS (32) |
| `npm run test:headless-worker-contract` | PASS (24) |
| `npm run test:headless-page-render-contract` | PASS (4) |
| Export manifest / fingerprint / UI stabilization suites | PASS |
| Headless R2 privacy, owning-boundary, execution probe, live harness/matrix, 4K capacity authority | PASS |
| Deployable worker packaging, hosted container/import, fly staging versioned image | PASS |
| `git diff --check` | PASS |

## Baseline-only failures (identical on clean `origin/staging`)

These fail on staging before this branch; not introduced by structural changes:

| Suite | Failure |
| --- | --- |
| `test:headless-fly-render-4k-capacity-harness-authority` | `BUILD_INFO.json` SHA `69219707…` vs expected `7a97f472…` |
| `test:headless-claimed-render-diagnostic-evidence-file-authority` | Execution probe evidence SHA drift (`c7f944…` vs `e8aac3…`) |
| `test:headless-claimed-render-diagnostic-bootstrap-authority` | Same evidence SHA drift class |
| `test:headless-fly-render-4k-process-tree-sampler-authority` | 4K capacity evidence SHA (`24d3ad…` vs frozen `cf84dd…`) |
| `test:headless-fly-render-4k-process-tree-sampler-cadence-authority` | Same |
| `test:headless-fly-render-4k-process-tree-sampler-lifecycle-authority` | Same |
| `test:headless-hosted-worker-2e1a-correction` | Dockerfile expectation mismatch (NOT_TESTED regex) |

## Preservation confirmations

- **No evidence mutation:** headless evidence bytes unchanged; only paths/aliases documented in registry.
- **No assertion changes:** verification expected values untouched except import path to shared hash helper.
- **No fixture-semantic changes:** none.
- **No production functionality changes:** production diff limited to two comment path updates in domain type files; no runtime logic, API, queue, provider, or manifest changes.

## Remaining optional improvements

- Refresh authority suites for evolved headless evidence SHAs (baseline debt above).
- Pre-existing broken relative links in historical headless architecture docs (node_modules Next doc paths, intra-scene transition doc name).
- Consider `sha256Text` export if future suites need explicit UTF-8 string semantics separate from bytes.

## Provider contact

**Zero** provider-backed suites or live gates executed in this phase.
