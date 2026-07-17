# Intra-scene Transition Local Evidence Results

Honest tri-state recording for Sprint 9 local sign-off and freeze.
Do **not** invent artifact size, fingerprint, timestamp, or device details that were not recorded.

Harness: `/dev/intra-scene-transition-qa` (development only).
Studio editor: timeline media lane + Inspector (Sprint 9D.2 discoverability).
Production path: `prepareExportRequest()` → frozen ExportManifest → `exportFootieShortFromManifest()`.

## Status (Sprint 9D.3 — frozen)

| Item | Result |
|------|--------|
| Deterministic Golden QA (9D) | **pass** |
| Local evidence harness (9D.1) | **pass** (truth rules accepted) |
| Transition editor UI (9D.2) | **pass** (operator-confirmed usable) |
| Local Chromium Preview (core) | **pass** — operator-confirmed |
| Local 720p WebM artifact (core) | **pass** — operator-confirmed |
| Manual Studio editor review (core) | **pass** — operator-confirmed |
| Sprint 9 freeze | **frozen** |

## Core versus optional

### Core freeze-required (Pass recorded)

| Area | Result | Notes |
|------|--------|-------|
| Preview | **pass** | Image switch · boundary start · effect · no flash/remount · captions |
| WebM automatic + visual | **pass** | Production export path · transition visible · peers · no black/stale · completion on incoming · v3/`9C` |
| Editor | **pass** | Controls visible/usable · multi-boundary independence · Inspector workflow · locks · persistence |

### Optional capability (remain Not tested)

| Area | Result | Policy |
|------|--------|--------|
| Real-video continuity | **not-tested** | Not separately exercised |
| Audible-audio continuity | **not-tested** | Silent harness export; not separately exercised |
| Safari | **not-tested** | Optional matrix |
| Firefox | **not-tested** | Optional matrix |
| 1080p | **not-tested** | Optional matrix |
| Device multi-video | **not-tested** | Optional matrix |

## Evidence-class matrix

| Evidence class | Result | How recorded |
|----------------|--------|--------------|
| automated-semantic | **pass** | `npm run test:intra-scene-transition-golden` (+ 9A/9B/9C) |
| mocked-integration / behavioral harness | **pass** | Local-evidence + editor UI verify suites |
| local Chromium Preview (core) | **pass** | Operator-confirmed |
| local 720p WebM (core) | **pass** | Operator-confirmed |
| manual editor review (core) | **pass** | Operator-confirmed |
| optional video / audio / device | **not-tested** | Not exercised |

## Editor checklist (operator)

| Check | Result |
|-------|--------|
| Transition controls visibly present | **pass** |
| No clipping at two/three/four media items | **pass** |
| Boundary control selects correct pair | **pass** |
| Inspector opens automatically | **pass** |
| Set/change/reset boundary | **pass** |
| Cut removes only selected boundary | **pass** |
| Multiple boundaries independent | **pass** |
| Effect/duration changes commit | **pass** |
| Interaction locks work | **pass** |
| Persistence/reload works | **pass** |
| Duplicated scenes independent graphs | **pass** |
| Narrow layout remains usable | **pass** |

**Derived Core Preview:** pass · **Derived Core Artifact:** pass · **Derived Core Editor:** pass

## Operator log

| Date | Browser | Notes |
|------|---------|-------|
| 2026-07-16 | Chromium (operator) | Core Preview, Core 720p WebM, and Core Editor Pass confirmed. No blocking defect reported. Detailed artifact metrics not recorded. |

## Freeze gate

Core Preview + Core Artifact + Core Editor are **pass**. Optional Not tested remains visible and does not block freeze.

```text
SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN
```
