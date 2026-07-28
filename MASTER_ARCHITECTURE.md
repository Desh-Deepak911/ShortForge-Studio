# ShortForge Studio — Master Architecture Index

> **Start here.** This is the canonical navigation document for the ShortForge Studio codebase.
> Detailed subsystem contracts live in linked docs and production modules — this index does not duplicate them.
> When documents disagree, production types and runtime code win. See [§4 Source-of-Truth Hierarchy](#4-source-of-truth-hierarchy).

**Product name:** ShortForge Studio · **Export watermark brand:** FootieBitz
**Repository root for this index:** `footiebitz/`
**Last audited:** 2026-07-21 (Sprint 7–10 frozen as prior; Sprint 11E Phase 2E.1 hosted-worker foundation local — Upstash staging-accepted; Neon/R2 accepted; Fly deploy NOT STARTED; routes config-blocked; browser remains authority)

---

## Table of Contents

1. [Purpose and How to Use This Index](#1-purpose-and-how-to-use-this-index)
2. [Current Platform Status](#2-current-platform-status)
3. [End-to-End Architecture Map](#3-end-to-end-architecture-map)
4. [Source-of-Truth Hierarchy](#4-source-of-truth-hierarchy)
5. [Engine and Subsystem Index](#5-engine-and-subsystem-index)
6. [Core Contracts](#6-core-contracts)
7. [Preview and Export Parity Model](#7-preview-and-export-parity-model)
8. [Completed Sprint and Milestone Ledger](#8-completed-sprint-and-milestone-ledger)
9. [Frozen Systems and Regression Boundaries](#9-frozen-systems-and-regression-boundaries)
10. [QA and Production Approval Matrix](#10-qa-and-production-approval-matrix)
11. [Documentation Authority Map](#11-documentation-authority-map)
12. [Future Extension Points](#12-future-extension-points)
13. [Contributor Onboarding Path](#13-contributor-onboarding-path)
14. [Maintenance Rules](#14-maintenance-rules)

---

## 1. Purpose and How to Use This Index

This document is the **single architectural entry point** for ShortForge Studio.

Use it to:

- Orient new contributors without rereading chat history.
- Locate the **canonical owner** of every major capability.
- Distinguish **current contracts** from historical or stale docs.
- Extend existing engines without inventing duplicate logic.
- Recover sprint context for future AI / engineering sessions.

**Rules of use:**

| Rule | Meaning |
|------|---------|
| Index, don’t duplicate | Link to subsystem contracts; do not paste full interfaces here |
| Code wins | Production types and runtime behavior override prose |
| Contracts next | Accepted subsystem contracts (`EXPORT_CONTRACT`, motion, framing, mixer, SI) outrank overview docs |
| Every major sprint updates this index | Ledger, ownership table, QA matrix, extension points, drift table |

**Evidence order when sources disagree:**

```text
1. Production types and runtime code
2. Verification suites and frozen QA contracts
3. Accepted subsystem contracts
4. Current architecture documentation
5. README / ROADMAP / CHANGELOG
6. Historical or future-planning documents
```

---

## 2. Current Platform Status

Claims below are **repository-evidence only**. Do not treat marketing version lines as release tags unless CHANGELOG / package evidence agrees.

| Signal | Evidence | Notes |
|--------|----------|-------|
| npm package version | `package.json` → `"0.1.0"` | Not a marketing release number |
| Documented product releases | [CHANGELOG.md](./CHANGELOG.md) `[2.5.0]`, `[2.6.0]`, `[3.0.0]` | README “Latest: v2.6.0” is **partially stale** vs CHANGELOG / later milestones |
| Intelligence Runtime | CHANGELOG / root [ARCHITECTURE.md](./ARCHITECTURE.md) | Shipped as **2.5.0** |
| Timeline Intelligence Runtime | CHANGELOG / README | Shipped as **2.6.0** — `MasterTimeline` shared preview/export clock |
| Studio Intelligence v1 | [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md), [ROADMAP.md](./ROADMAP.md) | **Complete and frozen** (3.3–3.6) |
| Audio Mixer v1 | [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md), ROADMAP 3.9.2 | **Complete and frozen** |
| Shared Media Motion | [docs/product/SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) | Production path after 4.2C → Sprint 5; **manual freeze sign-off blank** |
| Persistent Media Framing | [docs/product/MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) | Canonical framing via `resolveSceneMediaFraming()` |
| Export Reliability | [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md), [docs/EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md) | **Sprint 6A–6F.1 Implemented** (contract Accepted after 6A) |
| Export freeze | [docs/qa/export-reliability-freeze.md](./docs/qa/export-reliability-freeze.md) | **`EXPORT RELIABILITY FREEZE: APPROVED`** for **720p / Chromium-first / WebM primary** (2026-07-11, automated evidence) |

### Latest completed architectural milestone

**Export Reliability Sprint 6F.1** — options-only `ExportSession`, fresh manifest every attempt, capability-gated 1080p approval. Primary docs: [EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md), [EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md), [qa/export-1080p-results.md](./docs/qa/export-1080p-results.md).

### Current frozen systems (summary)

See [§9](#9-frozen-systems-and-regression-boundaries) for the full list. Headline freezes:

- Studio Intelligence v1
- Audio Mixer v1 (3.9.2)
- Transition visual-only scope lock ([docs/product/TRANSITIONS-SCOPE.md](./docs/product/TRANSITIONS-SCOPE.md), [`.cursor/rules/transitions-visual-only.mdc`](./.cursor/rules/transitions-visual-only.mdc))
- Export Reliability 720p Chromium-first freeze (automated semantic evidence)
- ExportManifest lifecycle + capability preflight + chunked renderer contracts

### Current roadmap entry point — Sprint 11 Headless Renderer

**Sprints 7–10 are frozen.** Sprint 10 Retention Story Intelligence v1 passed deterministic Golden/authority QA, the 435-cell Flexible matrix, the final 13/13 Core live-model matrix, and operator-confirmed local Create/Review/persistence/audio-first sign-off. Production narration paths share `runRetentionProductionNarration`; Evidence Surprise remains capability-gated. See [the Sprint 10 freeze ledger](./docs/qa/retention-story-sprint-10-freeze.md) and [the Retention contract](./docs/RETENTION_STORY_CONTRACT.md). **Current entry point: Sprint 11E Phase 2E.1 — Fly hosted-worker foundation implemented locally; Upstash staging-accepted; Neon/R2 accepted; Fly deploy NOT STARTED; production routes configuration-blocked; browser remains production default.**

| Phase | Status |
|-------|--------|
| **8A** Multi-image Scene Foundation | **Complete and accepted** — `src/features/scene-media-timeline/` · `npm run test:scene-media-timeline-domain` |
| **8B** Scene Media Timeline UI | **Complete and accepted** — owner lock + `timeline-editor/scene-media/` · `npm run test:scene-media-timeline-ui` |
| **8C** Per-media Inspector | **Complete and accepted** — `SceneMediaItemInspector` · `npm run test:scene-media-item-inspector` |
| **8D** Preview + Export Integration | **Complete and accepted** — ExportManifest v2 / contract `"8D"` · fail-closed total scene-media validation · active-item Preview/Export/QA · `npm run test:scene-media-preview` · `npm run test:scene-media-export` |
| **8E** Golden QA and Freeze | **Complete and accepted** — local Preview / 720p WebM / manual editor Pass (operator) · flag retired · [docs/qa/scene-media-sprint-8-freeze.md](./docs/qa/scene-media-sprint-8-freeze.md) |

**Sprint 7 (prior):** Core Hook Engine **frozen**. Evidence Surprise live provider path remains **capability-gated**. See [`docs/qa/hook-engine-sprint-7-freeze.md`](./docs/qa/hook-engine-sprint-7-freeze.md).

```
HOOK ENGINE CORE: FROZEN
EVIDENCE_SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED
SPRINT 8 MULTI-IMAGE SCENES: FROZEN
EXPORTMANIFEST V2 / RENDERER CONTRACT 8D: FROZEN
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN
NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES: RETIRED
SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN
SPRINT 10 RETENTION STORY INTELLIGENCE V1: FROZEN
CORE RETENTION LIVE-MODEL PATH: APPROVED (13/13)
LOCAL PRODUCT SIGN-OFF: APPROVED
EVIDENCE SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED
SPRINT 11A HEADLESS RENDERER ARCHITECTURE/AUTHORITY AUDIT: READY FOR FINAL ACCEPTANCE
SPRINT 11A.1 USER-TRIGGERED EXPORT AUTHORITY: READY FOR ACCEPTANCE
SPRINT 11D PHASE 3 OUTPUT PROFILES: READY FOR REVIEW
4K HEADLESS EXPORT: REAL LOCAL PASS
HEADLESS RENDERER: NOT PRODUCTION-ACTIVE
PRODUCTION ROUTES: CONFIGURATION-BLOCKED
SPRINT 11E PHASE 2B PHASE 1 STORE + OWNERSHIP FOUNDATION: ACCEPTED FOUNDATION
SPRINT 11E PHASE 2A.1 CLERK AUTHORITY HARDENING: ACCEPTED FOUNDATION
DEV HEADLESS PRODUCT LIFECYCLE: BEHAVIORALLY VERIFIED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: CURRENT PRODUCTION DEFAULT
NEON RUNTIME ADAPTER: NOT STARTED (PHASE 2B.2)
R2 FOUNDATION (2C.1): IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
SPRINT 11E PHASE 2D.1A UPSTASH LIVE-EVIDENCE TRUTH: READY FOR REVIEW
UPSTASH LIVE HARNESS: REAL RUNNERS / CONFIGURATION-GATED / LIVE NOT RUN
UPSTASH DUAL-LEASE PROTOCOL: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
AUTHORIZED LIVE PASS: REFUSED BEFORE PROVIDER CONTACT (STUB ERA) — EVIDENCE REMAINS NOT_TESTED
FLY WORKER: NOT STARTED
PROJECT OWNERSHIP: CONTRACT + SCHEMA IMPLEMENTED / PRODUCTION UNAVAILABLE UNTIL 2B.2
REAL MANIFEST/OWNED-ASSET/PROVIDER WIRING: NOT STARTED
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: UNCHANGED
HEADLESS EXPORT TRIGGER: USER ACTION — NOT CRON
REQUEST MODEL: SYNCHRONOUS JOB CREATION + ASYNCHRONOUS EXECUTION
```

> The detailed Sprint 10 phase ledger remains in §12 (“Sprint 10 — Retention Story Intelligence v1”). Freeze-time lines that still say `SPRINT 11 HEADLESS RENDERER: READY TO BEGIN` (that Sprint 10 ledger block; [retention freeze ledger](./docs/qa/retention-story-sprint-10-freeze.md)) are preserved as historical evidence and superseded by 11A above.
>
> Parallel product debt remains valid: [ROADMAP.md](./ROADMAP.md) Creator Templates 3.10, Asset Search 3.8, Export 6G–6I. Hook Engine stays **upstream of voiceover, timeline, preview, and export**. Final spoken hook text remains part of `FootieScript.narration`.

**Core Hook Engine is frozen after 7E.6A.** Evidence Surprise live provider path remains capability-gated.

---

## 3. End-to-End Architecture Map

Verified production flow (terminology matches code where proven):

```text
Creator Brief
    ↓
Intent Engine + Research + Prompt Intelligence
    ↓
Story Generation (narration / FootieScript shell)
    ↓
Voiceover (measured duration = audio-first timing authority)
    ↓
Scene Planning
    ├── Default: AI scene planner
    └── Opt-in: Studio Intelligence → Blueprint Adapter → FootieScript materializer
    ↓
Editable story state: FootieScript
    (held by drafts StoryDocument store — not a separate domain type)
    ↓
Story Sync + Editing Intent
    ↓
MasterTimeline  (buildMasterTimeline / optimizeMasterTimeline)
    ↓
Preview adapters  ←→  ExportManifest (immutable freeze)
    ↓
Fingerprint + Capability Preflight  (prepareExportRequest)
    ↓
Renderer Selection  (browser | server | blocked)
    ↓
Manifest-only Renderer  (renderExport + ExportRenderContext)
    ↓
Bounded Chunk Encoding  (chunked-browser-v1)
    ↓
Canonical Audio Preparation
    ↓
WebM / MP4 Format Adapter
    ↓
Final Artifact Validation  (validateFinalExportArtifact)
```

**Production export entry (contract):**

`exportFootieShort` → `prepareExportRequest` → `createExportRenderContext` → `renderExport(manifest, context)` → format adapter → `validateFinalExportArtifact` → `disposeExportRenderContext`

Sources: [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md), [docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md](./docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md), `src/features/export/`.

**Terminology notes:**

| Name in older docs | Production reality |
|--------------------|--------------------|
| `StoryDocument` | Drafts store (`src/features/drafts/store/story-document.store.tsx`) holding editable `FootieScript` |
| MediaRecorder as “the” export path | **Legacy / tests**; production encode is **chunked-browser-v1** (canvas → JPEG → libvpx chunks → concat) |
| “Export reads live story during render” | **Superseded** — renderer consumes frozen `ExportManifest` only (Sprint 6C+) |

---

## 4. Source-of-Truth Hierarchy

| Capability | Canonical owner | Primary type / contract | Preview adapter | Export adapter | Documentation | Verification | Status |
|------------|-----------------|-------------------------|-----------------|----------------|---------------|--------------|--------|
| Editable story state | `src/features/story/` (+ drafts store) | `FootieScript`, `FootieScene` in `story/types/story.types.ts` | N/A (state) | Snapshot into `ExportManifest` | [docs/architecture/DATA_MODEL.md](./docs/architecture/DATA_MODEL.md) | story / drafts verifies | Authoritative |
| Scene media timeline (multi-image) | `src/features/scene-media-timeline/` + `timeline-editor/scene-media/` + Preview/Export adapters | `SceneMediaTimeline` on `FootieScene.mediaTimeline?` (v1 frozen); multi-image default | Active-item Preview (complete projected timeline) | ExportManifest v2 `mediaTimeline` (contract `"8D"` frozen); fail-closed total v2 validation before cost/preload/render | [docs/operations/ENV_AND_FEATURE_FLAGS.md](./docs/operations/ENV_AND_FEATURE_FLAGS.md) · [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) · [docs/qa/scene-media-sprint-8-freeze.md](./docs/qa/scene-media-sprint-8-freeze.md) | `test:scene-media-preview` · `test:scene-media-export` · domain/ui/inspector | **Sprint 8 frozen**; flag retired 8E.3 |
| Story synchronization | `src/features/story-sync/` | `StorySynchronizationState`, readiness types | Sync UI / preview gates | Export readiness domain | Module + verifies | `test:story-sync*` | Authoritative |
| Project timing | `src/features/timeline-intelligence/` | `MasterTimeline.renderDurationMs`, `contentEndMs` | Master timeline preview utils | Manifest `project.renderDurationMs` | EXPORT_TIMING_MODEL (clock hierarchy; encode path partially stale) | `test:timeline-*`, export timing suites | Authoritative |
| Scene timing | Timeline Intelligence + story scenes | Scene events on `MasterTimeline` | Preview scene timing | Export scene manifests | DATA_MODEL / EDITING | timeline verifies | Authoritative |
| Video trim / playback | `src/features/media-playback/` | `MediaPlaybackState`, trim window types | `preview/utils/preview-video-clip.utils.ts` | `export/utils/export-scene-media-renderer.ts` | Module headers | `media-playback.verify.ts` | Authoritative |
| Media framing | `src/features/media-framing/` | `SceneMediaFraming` | Preview frames + `resolveSceneMediaFraming` | Export media renderer + manifest build | [docs/product/MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) | `test:media-framing-*`, export framing | Authoritative |
| Media motion | `src/features/media-motion/` | `SceneMediaMotion` → `MediaMotionState` | `editor/preview/motion/previewMotionAdapter.ts` | `editor/export/motion/exportMotionAdapter.ts` | [docs/product/SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) | `test:media-motion`, motion sprint | Authoritative |
| Transitions | Story transition fields + timeline events | `transition.effect`, `transition.durationMs` | Preview overlay layer | Export transition frame resolution | [docs/product/TRANSITIONS-SCOPE.md](./docs/product/TRANSITIONS-SCOPE.md) | `test:transitions-scope` | Scope-locked (visual-only) |
| Caption content | Story + subtitle timing | Scene captions / subtitle chunks | Overlay components | Export caption manifests | DATA_MODEL | subtitle / export caption suites | Authoritative |
| Caption layout | `src/features/caption-layout/` | `CaptionLayout`, `CaptionResolvedLayout` | Caption/Subtitle overlays | `export/domain/resolve-export-caption-layout.ts` | Module | `caption-layout.verify.ts` | Authoritative |
| Caption style | `src/features/caption-style/` + caption-engine | `CaptionStyle`, presets | `caption-style.adapters.ts` / preview style resolvers | Export draw + `resolve-export-caption-style` | Module | caption-style / subtitle QA | Authoritative |
| Caption animation | `src/features/caption-animation/` | `CaptionAnimation`, `CaptionAnimationState` | `resolvePreviewCaptionAnimation` | `resolveExportCaptionAnimation*` | Module | caption-animation / timeline caption QA | Authoritative |
| Voiceover | `src/features/audio/` + story voice settings | Voiceover tracks / duration | Preview voice gain utils | Export audio prep / mux | GENERATION / AUDIO_MIXER | audio verifies | Authoritative |
| Audio mixing | `src/features/audio-mixer/` | `ProjectAudioMixerSettings`, `ResolvedAudioMixSettings` | Preview stem gains | Export mix + FFmpeg peak | [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) | `test:audio-mixer*` | **Frozen v1** |
| Preview | `src/features/preview/` | Preview playback scope types | Interactive browser render | N/A | EDITING / RENDERING (partially stale on export path) | preview / timeline verifies | Authoritative |
| Export semantics | `src/features/export/domain/` | `ExportManifest` | N/A | Manifest freeze | [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) | `test:export-manifest*` | **Authoritative** |
| Export runtime state | `src/features/export/runtime/` | `ExportRenderContext` | N/A | `renderExport` | [docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md](./docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md) | `test:export-render-context`, manifest-renderer | Authoritative |
| Export session UX | `src/features/export/session/` | `ExportSession` (options only) | N/A | Fresh manifest per attempt | EXPORT_CONTRACT 6F.1 | `test:export-session`, reconfiguration | Authoritative |
| Export capability | `src/features/export/domain/` + `capabilities/` | `ExportCapabilityResult` | Preflight UI | `prepareExportRequest` gate | [docs/product/EXPORT_CAPABILITIES.md](./docs/product/EXPORT_CAPABILITIES.md) | `test:export-capability-*` | Authoritative |
| Export output validation | `src/features/export/validation/` | `ExportArtifactValidation` | N/A | `validateFinalExportArtifact` | EXPORT_CONTRACT / AUDIO_AND_FORMATS | `test:export-final-artifact` | Authoritative |
| QA fixtures | `src/features/export/qa/` + `src/verification/` | Golden A–G | `/dev/export-qa` | Semantic goldens | [docs/qa/](./docs/qa/) | `test:export-golden-*`, export-reliability | Authoritative for recorded evidence |
| Final spoken hook | Opening span of `FootieScript.narration` (story generation commits) | `FootieScript.narration` — **not** a second narration field | N/A (story text) | Snapshotted with narration into export | [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) (**Accepted**) | Sprint 7E (future) | Contract accepted; generation integration in 7D |
| Hook planning / strategy library | `src/features/hook-engine/` (`domain/`, `strategies/`) | `NormalizedHookRequest`, `HookPlan`, `HookPlanSnapshot`, `resolveHookStrategy` | N/A | Must not patch export runtime | [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md), [HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md) | `test:hook-strategy-library` | **7B accepted** |
| Hook validation / repair | `src/features/hook-engine/` (`validation/`, `repair/`) | `HookCandidate`, `HookValidationResult`, `HookSelection`, `HookDiagnostics`, `runBoundedHookRepair`, `activePlan` | N/A | Must not patch export runtime | [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) | `test:hook-validator` | **7C accepted** |
| Hook generation integration | `src/features/hook-engine/integration/` + story services + `/api/generate-script` | `HookGenerationContext`, `HookDirective`, `approvedNarration`, response `hookPlan` | Optional `StoryCreationBrief.hookPlan` snapshot | Upstream of VO/scenes | [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) | `test:hook-sprint` · `test:hook-core-live-qa` | **7E complete — Core frozen**; Evidence Surprise live capability-gated |
| Visual / scene hook (SI) | `src/features/studio-intelligence/` | `NarrativeBeatType = "hook"`, `hook_opener`, SI-only `StoryStrategyHookStrategy` | Scene/visual planning | Derived excerpts only | [STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) | SI verifies | Downstream of narration — not spoken authority |
| Publishing/social metadata hook | Publishing metadata utils (`buildStyleHook`) | Derived packaging copy | N/A | N/A | HOOK_CONTRACT §13 | Publishing verifies (existing) | Outside Hook Engine |

**Existing hook collision note:** Today “hook” also appears as generic prompt guidance (`src/lib/ai/prompts.ts`), Prompt Intelligence `NarrativeBeat.openingHook`, creator-template `openingStyle`, SI beat/kind/validator rules, and publishing/social metadata helpers. These are **not** one narration-level Hook Contract — see the audit collision matrix. Publishing “hook” must be qualified as packaging metadata.

---

## 5. Engine and Subsystem Index

### Story Engine

- **Role:** Canonical editable story model and generation services.
- **Module:** [`src/features/story/`](./src/features/story/)
- **Key types:** `FootieScript`, `FootieScene`, `SceneMedia`, `SceneMediaMotion` — [`story/types/story.types.ts`](./src/features/story/types/story.types.ts)
- **Docs:** [docs/architecture/DATA_MODEL.md](./docs/architecture/DATA_MODEL.md), [docs/product/GENERATION.md](./docs/product/GENERATION.md)
- **Related store:** drafts `StoryDocument` store holds `FootieScript`

### Intelligence Runtime

- **Role:** Intent → entities → research → Knowledge Graph → Graph Context → Prompt Intelligence.
- **Modules:** [`src/features/intelligence/`](./src/features/intelligence/), [`src/features/intent-engine/`](./src/features/intent-engine/), [`src/features/research/`](./src/features/research/)
- **Docs:** Root [ARCHITECTURE.md](./ARCHITECTURE.md), [docs/product/GENERATION.md](./docs/product/GENERATION.md)
- **Milestone:** CHANGELOG **2.5.0**
- **Verification:** `src/verification/{graph,research,entity,football,canonical,intent-engine}/`

### Prompt Intelligence

- **Role:** Narrative planning / fact selection / production prompts (primary generation path).
- **Owner:** Intelligence runtime (prompt modules under `src/features/intelligence/`)
- **Docs:** README / ARCHITECTURE Intelligence sections
- **Status:** Shipped with Intelligence Runtime 2.5.0

### Studio Intelligence

- **Role:** Planning subsystem — beats, arcs, blueprints → optional FootieScript materialization.
- **Module:** [`src/features/studio-intelligence/`](./src/features/studio-intelligence/)
- **Docs:** [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) (**Authoritative**, v1 frozen)
- **Gates:** Dual opt-in (`STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED` + request flag); default remains AI scene planner
- **Verification:** `src/verification/studio-intelligence/`

### Creator Templates

- **Role:** Built-in template registry, brief/prompt defaults, picker utilities.
- **Module:** [`src/features/creator-templates/`](./src/features/creator-templates/)
- **Docs:** ROADMAP marks **3.10 In Progress**; CHANGELOG `[3.0.0]` lists template work — treat ROADMAP as product status, code as implementation evidence
- **Verification:** `test:creator-templates` (co-located `*.verify.ts`)

### Story Sync

- **Role:** Explicit sync state among story, narration, voiceover, preview, and export readiness.
- **Module:** [`src/features/story-sync/`](./src/features/story-sync/)
- **Verification:** `test:story-sync*`

### Timeline Intelligence

- **Role:** Canonical absolute-timestamp clock (`MasterTimeline`) for preview and export.
- **Module:** [`src/features/timeline-intelligence/`](./src/features/timeline-intelligence/)
- **Key API:** `buildMasterTimeline()` — [`build-master-timeline.ts`](./src/features/timeline-intelligence/build-master-timeline.ts)
- **Types:** [`timeline.types.ts`](./src/features/timeline-intelligence/timeline.types.ts)
- **Milestone:** **2.6.0**
- **Note:** Timeline image-motion track is foundation/QA; production motion uses Shared Media Motion ([SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md))

### Timeline Editor

- **Role:** Studio timeline UI — layout, reorder, resize, trim, playhead.
- **Module:** [`src/features/timeline-editor/`](./src/features/timeline-editor/)
- **Docs:** [docs/product/EDITING.md](./docs/product/EDITING.md)

### Media Playback Engine

- **Role:** Shared scene media clip/trim playback resolution.
- **Module:** [`src/features/media-playback/`](./src/features/media-playback/)

### Media Intelligence and asset pipeline

| Piece | Module |
|-------|--------|
| Asset Intelligence | [`src/features/asset-intelligence/`](./src/features/asset-intelligence/) |
| Asset Search | [`src/features/asset-search/`](./src/features/asset-search/) |
| Asset Attach | [`src/features/asset-attach/`](./src/features/asset-attach/) |
| Asset Materialization | [`src/features/asset-materialization/`](./src/features/asset-materialization/) |

- **Docs:** ROADMAP 3.7 / 3.8 sections
- **Verification:** `src/verification/asset-intelligence/`, asset-search / attach / materialization verifies

### Shared Media Motion Engine

- **Module:** [`src/features/media-motion/`](./src/features/media-motion/)
- **Resolver:** `resolveMediaMotionState()` — [`media-motion.engine.ts`](./src/features/media-motion/media-motion.engine.ts)
- **Adapters:** Preview / Export under `src/features/editor/{preview,export}/motion/`
- **Docs:** [docs/product/SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) (**Authoritative**)
- **QA:** [docs/qa/shared-media-motion-sprint-5.md](./docs/qa/shared-media-motion-sprint-5.md) (freeze candidate; sign-off blank)

### Media Framing

- **Module:** [`src/features/media-framing/`](./src/features/media-framing/)
- **Resolver:** `resolveSceneMediaFraming()` — [`resolve-scene-media-framing.ts`](./src/features/media-framing/resolve-scene-media-framing.ts)
- **Docs:** [docs/product/MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) (**Authoritative** for framing)

### Caption Engine

| Concern | Module |
|---------|--------|
| Presets / UI bridges | [`src/features/caption-engine/`](./src/features/caption-engine/) |
| Layout | [`src/features/caption-layout/`](./src/features/caption-layout/) |
| Style | [`src/features/caption-style/`](./src/features/caption-style/) |
| Animation | [`src/features/caption-animation/`](./src/features/caption-animation/) |
| Subtitle timing maps | [`src/features/subtitle-timing/`](./src/features/subtitle-timing/) |

### Audio Engine and Audio Mixer

- **Audio engine:** [`src/features/audio/`](./src/features/audio/)
- **Mixer:** [`src/features/audio-mixer/`](./src/features/audio-mixer/) — `resolveAudioMixerSettings()`
- **Voice library / preview:** [`src/features/voice-library/`](./src/features/voice-library/), [`src/features/voice-preview/`](./src/features/voice-preview/)
- **Docs:** [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) (**Authoritative**, frozen v1)

### Preview Engine

- **Module:** [`src/features/preview/`](./src/features/preview/)
- **Key UI:** `VideoPreview`, `PreviewFrame`, caption/subtitle overlays
- **Consumes:** MasterTimeline + framing/motion/caption/audio adapters

### Export Engine

- **Module:** [`src/features/export/`](./src/features/export/)
- **Subdomains:** `domain/`, `runtime/`, `session/`, `validation/`, `formats/`, `audio/`, `timing/`, `chunking/`, `capabilities/`, `qa/`
- **Docs (authoritative set):**
  - [EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md)
  - [EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md)
  - [EXPORT_RENDERER_ARCHITECTURE.md](./docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md)
  - [EXPORT_AUDIO_AND_FORMATS.md](./docs/product/EXPORT_AUDIO_AND_FORMATS.md)
  - [EXPORT_CAPABILITIES.md](./docs/product/EXPORT_CAPABILITIES.md)
- **Formats:** [`webm-export-format-adapter.ts`](./src/features/export/formats/webm-export-format-adapter.ts), [`mp4-export-format-adapter.ts`](./src/features/export/formats/mp4-export-format-adapter.ts)

### Golden QA and verification system

- **Module:** [`src/verification/`](./src/verification/) (non-production)
- **Export goldens / device harness:** `src/features/export/qa/`, `/dev/export-qa`
- **QA docs:** [`docs/qa/`](./docs/qa/)
- **Runners:** `npm run test:verification`, `test:verification:export`, `test:export-reliability`, `test:export-capability-audit`

### Hook Engine (Sprint 7)

- **Status:** Contract **Accepted after Sprint 7A**. Sprint **7B–7D Complete — accepted**. Sprint **7E Complete — Core Hook frozen** (Evidence Surprise live provider path capability-gated).
- **Module:** [`src/features/hook-engine/`](./src/features/hook-engine/) — `domain/`, `strategies/`, `validation/` (extract, candidate, validate, selection, diagnostics), `repair/` (`runBoundedHookRepair`)
- **Public API:** [`src/features/hook-engine/index.ts`](./src/features/hook-engine/index.ts)
- **Docs:** [HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md), [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md)
- **Verification:** `npm run test:hook-strategy-library` · `npm run test:hook-validator`
- **Rules:** Final spoken hook = opening span of `FootieScript.narration` (story generation commits). Runtime `HookPlan` ephemeral; accepted snapshot may persist on brief as `hookPlan`. No SI imports. Production narration paths use canonical adapter. `evidence_surprise` requires explicit PI `evidenceLedSurprise` beat policy + eligible claim refs (not inferred from ordinary evidence-bearing openings). Max one automated repair per narration attempt. Legacy `generateFootieScript` unreachable from production route.

---

## 6. Core Contracts

Do not duplicate full interfaces here. Link production types.

### FootieScript / StoryDocument

| | |
|--|--|
| **Purpose** | Editable story state — narration, scenes, media, captions, audio, export settings |
| **Lifecycle** | Generated → reviewed → voiceover → scenes → edited in studio → snapshotted for export |
| **Types** | [`FootieScript`](./src/features/story/types/story.types.ts) |
| **Store** | Drafts StoryDocument store holds `FootieScript` (`src/features/drafts/store/story-document.store.tsx`) |
| **Principle** | **The story document is editable.** Export must never mutate it during render. |

### MasterTimeline

| | |
|--|--|
| **Purpose** | Canonical timed playback clock for preview and export semantics |
| **API** | `buildMasterTimeline()`, `optimizeMasterTimeline()` |
| **Types** | [`MasterTimeline`](./src/features/timeline-intelligence/timeline.types.ts) |
| **Principle** | **`MasterTimeline` owns canonical timed playback** (`renderDurationMs` authority). |

### Scene media contracts

| | |
|--|--|
| **Purpose** | Per-scene image/video/placeholder media, trim, fit, transform |
| **Types** | `SceneMedia`, `SceneMediaTransform`, related fields on `FootieScene` — [`story.types.ts`](./src/features/story/types/story.types.ts) |
| **Playback** | [`src/features/media-playback/`](./src/features/media-playback/) |

### SceneMediaFraming

| | |
|--|--|
| **Purpose** | Persistent pan/zoom/rotation/fit inside 9:16 |
| **Types** | [`SceneMediaFraming`](./src/features/media-framing/media-framing.types.ts) |
| **Resolver** | `resolveSceneMediaFraming()` |
| **Docs** | [MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) |

### Scene media motion

| | |
|--|--|
| **Purpose** | Shared motion semantics (presets, easing, transform composition) |
| **Persistence** | `scene.media.motion` (`SceneMediaMotion` in story types) |
| **Engine state** | [`MediaMotionState`](./src/features/media-motion/media-motion.types.ts) via `resolveMediaMotionState()` |
| **Docs** | [SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) |

### Caption contracts

| Concern | Types | Module |
|---------|-------|--------|
| Layout | `CaptionLayout`, `CaptionResolvedLayout` | `caption-layout/` |
| Style | `CaptionStyle`, `CaptionResolvedStyle` | `caption-style/` |
| Animation | `CaptionAnimation`, `CaptionAnimationState` | `caption-animation/` |
| Presets | `CaptionPresetId`, preset configs | `caption-engine/` |
| Timing maps | `SubtitleTimingMap` | `subtitle-timing/` |

### Audio mixer settings

| | |
|--|--|
| **Types** | [`ProjectAudioMixerSettings`](./src/features/audio-mixer/audio-mixer.types.ts), `ResolvedAudioMixSettings` |
| **Resolver** | `resolveAudioMixerSettings(script)` |
| **Docs** | [AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) — **frozen v1** |

### ExportManifest

| | |
|--|--|
| **Purpose** | Immutable frozen snapshot of everything the renderer may use |
| **Types** | [`ExportManifest`](./src/features/export/domain/export-manifest.types.ts) |
| **Build** | `buildExportManifest()` + `buildExportManifestFingerprint()` |
| **Integrity** | Total fail-closed `validateExportManifestV2SceneMedia(unknown)` — never throws; preflight returns `INVALID_MANIFEST` + blocked renderer before cost/preload/render; no repair |
| **Principle** | **`ExportManifest` is an immutable frozen snapshot.** Every export attempt builds a **fresh** manifest and fingerprint. |

### ExportRenderContext

| | |
|--|--|
| **Purpose** | Mutable runtime (canvas, media handles, FFmpeg, chunk state) separate from semantics |
| **Types** | [`ExportRenderContext`](./src/features/export/runtime/export-render-context.types.ts) |
| **Render** | `renderExport(manifest, context)` — [`render-export.ts`](./src/features/export/runtime/render-export.ts) |

### ExportSession

| | |
|--|--|
| **Purpose** | UX options only (format, resolution, quality) — never stores manifests |
| **Types** | [`ExportSession`](./src/features/export/session/export-session.types.ts) |
| **Sprint** | 6F.1 |

### ExportCapabilityResult

| | |
|--|--|
| **Purpose** | Preflight Approved / Warning / Blocked before any renderer side effects |
| **Types** | [`ExportCapabilityResult`](./src/features/export/domain/export-capability.types.ts) |
| **Gate** | `prepareExportRequest()` — [`prepare-export-request.ts`](./src/features/export/domain/prepare-export-request.ts) |
| **Principle** | **Preflight runs before renderer side effects.** |

### ExportArtifactValidation

| | |
|--|--|
| **Purpose** | Final binary/output validation before success |
| **Types** | [`ExportArtifactValidation`](./src/features/export/validation/export-artifact-validation.types.ts) |
| **Principle** | **Export success requires artifact validation.** Chunking is **internal** to the renderer. |

### Verified principles (do not regress)

1. The story document (`FootieScript`) is editable.
2. `MasterTimeline` owns canonical timed playback.
3. `ExportManifest` is an immutable frozen snapshot.
4. Every export attempt builds a fresh manifest and fingerprint.
5. Preflight runs before renderer side effects; v2 scene-media integrity fails closed before cost estimation.
6. Preview and Export share domain semantics through adapters.
7. Chunking is internal to the renderer.
8. Export success requires artifact validation.

### Hook principles (accepted contract)

1. Final spoken hook text remains part of `FootieScript.narration` (opening span); story generation commits (7D).
2. Hook planning metadata is not a second story document; runtime plan is ephemeral; brief may hold `HookPlanSnapshot` only.
3. Hook Engine is upstream of voiceover, timeline, preview, and export.
4. Grounding and safety outrank provocation; hard gates cannot be overridden by aggregate scores.
5. Compression must re-extract and revalidate; max **one** automated repair (7C).
6. `scenes-only` never generates, replaces, or repairs narration hooks.
7. Hook Engine must not import Studio Intelligence; 7B strategy IDs are independent of SI.
8. Publishing/social metadata hooks remain outside Hook Engine authority.

---

## 7. Preview and Export Parity Model

```text
Canonical domain logic
        ↓
Preview adapter
        ↓
Interactive browser rendering
```

```text
Canonical domain logic
        ↓
Export adapter
        ↓
Manifest-only offline rendering
```

**Product rule** ([EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md)):

> Anything supported in Preview must export with equivalent semantics or be blocked with an explicit capability message before export begins.

### Parity-sensitive systems

| System | Shared authority | Preview | Export |
|--------|------------------|---------|--------|
| Timeline | `MasterTimeline` | Preview clock utils | Manifest project timing |
| Media playback | Media Playback Engine | Preview clip utils | Export scene media renderer |
| Motion | `resolveMediaMotionState` | CSS adapter | Canvas adapter |
| Framing | `resolveSceneMediaFraming` | Preview frames | Export draw / manifest |
| Transitions | Visual-only overlays | Preview overlay | Export transition resolution (scope-locked) |
| Captions | Layout / style / animation engines | Overlays + adapters | Manifest captions + canvas |
| Audio | Mixer + audio engine | Preview gains / Web Audio | Export mix + FFmpeg |
| Project-end semantics | `renderDurationMs` / end buffer | Preview end | Manifest + final-frame / artifact validation |

Parity evidence: [docs/qa/export-preview-parity-matrix.md](./docs/qa/export-preview-parity-matrix.md) (6A audit; some recommended actions superseded by 6B–6F.1 implementation claims).

---

## 8. Completed Sprint and Milestone Ledger

Statuses use repository evidence only.

### Intelligence Runtime (2.5.0)

| Field | Evidence |
|-------|----------|
| **Status** | Shipped (CHANGELOG `[2.5.0]`) |
| **Purpose** | Intent, entities, providers, KG, Graph Context, Prompt Intelligence |
| **Architectural outcome** | Research/reasoning isolated before script generation |
| **Canonical documentation** | Root ARCHITECTURE, CHANGELOG, README Intelligence sections |
| **Primary implementation** | `src/features/intelligence/`, `intent-engine/`, `research/` |
| **Verification** | `src/verification/{graph,research,entity,football,canonical,intent-engine}/` |
| **Known remaining debt** | Multi-provider expansion; Script Validator (ROADMAP) |

### Timeline Intelligence (2.6.0)

| Field | Evidence |
|-------|----------|
| **Status** | Shipped (CHANGELOG `[2.6.0]`) |
| **Purpose** | Shared absolute clock for preview/export |
| **Architectural outcome** | `MasterTimeline` + schedulers + optimizer |
| **Canonical documentation** | README Timeline Intelligence; root ARCHITECTURE |
| **Primary implementation** | `src/features/timeline-intelligence/` |
| **Verification** | `src/verification/timeline/`, export timing suites |
| **Known remaining debt** | Image-motion track not production render path (see Shared Media Motion) |

### Studio Intelligence 3.3–3.6

| Field | Evidence |
|-------|----------|
| **Status** | **Complete and frozen** (STUDIO_INTELLIGENCE.md, ROADMAP) |
| **Purpose** | Narrative planning → blueprints → optional materialization |
| **Architectural outcome** | Dual-gated opt-in SI path; default AI planner unchanged |
| **Canonical documentation** | [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) |
| **Primary implementation** | `src/features/studio-intelligence/` |
| **Verification** | `src/verification/studio-intelligence/` |
| **Known remaining debt** | Next SI product milestone historically pointed at Asset Search 3.8 |

### Asset Intelligence and search milestones

| Field | Evidence |
|-------|----------|
| **Status** | 3.7 / 3.7G / 3.7H marked complete on ROADMAP; **3.8 Asset Search Platform** still planned/unchecked on ROADMAP (code modules exist) |
| **Purpose** | Plan/recommend/search/attach/materialize assets |
| **Architectural outcome** | Asset pipeline modules under `src/features/asset-*` |
| **Canonical documentation** | ROADMAP 3.7 / 3.8 |
| **Primary implementation** | `asset-intelligence/`, `asset-search/`, `asset-attach/`, `asset-materialization/` |
| **Verification** | matching `src/verification/` and co-located verifies |
| **Known remaining debt** | ROADMAP 3.8A–G checklist incomplete |

### Creator Templates

| Field | Evidence |
|-------|----------|
| **Status** | **Code present** + verifies; ROADMAP **In Progress 3.10**; CHANGELOG 3.0.0 lists templates — **documentation drift** |
| **Purpose** | Creator-facing presets / brief defaults |
| **Architectural outcome** | Template registry module |
| **Canonical documentation** | ROADMAP In Progress; module code |
| **Primary implementation** | `src/features/creator-templates/` |
| **Verification** | `test:creator-templates` |
| **Known remaining debt** | Product milestone completion vs CHANGELOG claim |

### Caption Engine

| Field | Evidence |
|-------|----------|
| **Status** | Implemented modules (layout/style/animation/presets/timing) |
| **Purpose** | Caption content presentation with preview/export adapters |
| **Architectural outcome** | Split engines + adapters |
| **Canonical documentation** | Module headers; FEATURES (supporting); EXPORT parity matrix |
| **Primary implementation** | `caption-engine/`, `caption-layout/`, `caption-style/`, `caption-animation/`, `subtitle-timing/` |
| **Verification** | caption `*.verify.ts`, export subtitle QA |
| **Known remaining debt** | Animation fidelity device QA (Export 6G backlog) |

### Audio Mixer (3.9.2)

| Field | Evidence |
|-------|----------|
| **Status** | **Complete and frozen** |
| **Purpose** | Independent voice/music/master buses with preview/export parity |
| **Architectural outcome** | Shared `resolveAudioMixerSettings` + ducking + peak protection |
| **Canonical documentation** | [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) |
| **Primary implementation** | `src/features/audio-mixer/` |
| **Verification** | `test:audio-mixer*` |
| **Known remaining debt** | Normalize voice, limiter UI, preview music boost >100% (post-v1) |

### Shared Media Motion / 4.2C → Sprint 5

| Field | Evidence |
|-------|----------|
| **Status** | Production architecture documented; QA checklist = **freeze candidate** (sign-off blank) |
| **Purpose** | One motion engine; preview/export adapters only differ in units |
| **Architectural outcome** | `scene.media.motion` → shared resolver → adapters |
| **Canonical documentation** | [SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) |
| **Primary implementation** | `src/features/media-motion/` + editor motion adapters |
| **Verification** | `test:media-motion`, `test:motion-sprint`, [qa/shared-media-motion-sprint-5.md](./docs/qa/shared-media-motion-sprint-5.md) |
| **Known remaining debt** | Opacity motion channel; retire legacy `imageMotion` writes ([FUTURE.md](./docs/product/FUTURE.md)) |

### Persistent Media Framing

| Field | Evidence |
|-------|----------|
| **Status** | Implemented; contract short and current |
| **Purpose** | Persistent framing for image + video |
| **Architectural outcome** | Shared `resolveSceneMediaFraming` for preview/export |
| **Canonical documentation** | [MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) |
| **Primary implementation** | `src/features/media-framing/` |
| **Verification** | `test:media-framing-*`, export framing suites |
| **Known remaining debt** | Fit/fill single-field migration (Export 6G note) |

### Export Reliability

#### Sprint 6A

| Field | Evidence |
|-------|----------|
| **Status** | Completed as audit / contract acceptance |
| **Purpose** | Inventory export architecture, capabilities, timing, parity |
| **Architectural outcome** | Accepted [EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) |
| **Canonical documentation** | EXPORT_ARCHITECTURE_AUDIT, CAPABILITIES, TIMING_MODEL, parity matrix, CONTRACT |
| **Primary implementation** | Documentation phase (see 6A.1 non-goals) |
| **Verification / QA** | Audit docs + parity matrix |
| **Known remaining debt** | Audit docs describe pre-chunked paths — treat as historical |

#### Sprint 6A.1

| Field | Evidence |
|-------|----------|
| **Status** | Documentation non-goals phase recorded in EXPORT_CONTRACT |
| **Purpose** | Accept contract without implementing manifest/preflight/chunking |
| **Architectural outcome** | Explicit non-goals list; 6B+ implements gates |
| **Canonical documentation** | [EXPORT_CONTRACT.md § Non-Goals (Sprint 6A.1)](./docs/architecture/EXPORT_CONTRACT.md) |
| **Primary implementation** | Docs only |
| **Verification / QA** | N/A (docs) |
| **Known remaining debt** | None for 6A.1 itself |

#### Sprint 6B

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** |
| **Purpose** | Manifest, fingerprint, capability preflight, renderer selection |
| **Architectural outcome** | `prepareExportRequest` blocks unsafe paths before side effects |
| **Canonical documentation** | EXPORT_CONTRACT, EXPORT_RELIABILITY_SPRINT |
| **Primary implementation** | `src/features/export/domain/` |
| **Verification** | `test:export-manifest`, `test:export-capability-*`, `test:export-preflight` |
| **Known remaining debt** | Server renderer remains Future |

#### Sprint 6C

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** |
| **Purpose** | Manifest-only renderer + `ExportRenderContext` + canonical timing |
| **Architectural outcome** | No live story reads during render |
| **Canonical documentation** | EXPORT_RENDERER_ARCHITECTURE, sprint plan |
| **Primary implementation** | `export/runtime/`, timing domain |
| **Verification** | `test:export-render-context`, `test:export-manifest-renderer`, `test:export-canonical-timing` |
| **Known remaining debt** | Visual parity detail (6G) |

#### Sprint 6D

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** |
| **Purpose** | Bounded chunked browser encode + FFmpeg poison recovery |
| **Architectural outcome** | Production `chunked-browser-v1` |
| **Canonical documentation** | EXPORT_RENDERER_ARCHITECTURE |
| **Primary implementation** | `export/chunking/`, runtime render |
| **Verification** | `test:export-chunk-*`, export-reliability runner |
| **Known remaining debt** | Device binary matrix incomplete |

#### Sprint 6E

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** |
| **Purpose** | Format adapters, audio end policy, artifact validation |
| **Architectural outcome** | WebM/MP4 adapters; no silent capability loss |
| **Canonical documentation** | [EXPORT_AUDIO_AND_FORMATS.md](./docs/product/EXPORT_AUDIO_AND_FORMATS.md) |
| **Primary implementation** | `export/formats/`, `export/audio/`, `export/validation/` |
| **Verification** | `test:export-webm-format`, `test:export-mp4-format`, `test:export-final-artifact`, audio suites |
| **Known remaining debt** | Full cancellation UI (Future on contract) |

#### Sprint 6F

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** — freeze decision recorded |
| **Purpose** | Goldens, device harness, 720p freeze |
| **Architectural outcome** | `EXPORT RELIABILITY FREEZE: APPROVED` (720p Chromium-first) |
| **Canonical documentation** | [qa/export-reliability-freeze.md](./docs/qa/export-reliability-freeze.md), [qa/export-device-results.md](./docs/qa/export-device-results.md) |
| **Primary implementation** | `export/qa/`, `/dev/export-qa` |
| **Verification** | Golden semantic suites; device rows largely **Not tested** |
| **Known remaining debt** | Safari/Firefox device matrix; real artifact CI; checklist boxes still unchecked in freeze doc |

#### Sprint 6F.1

| Field | Evidence |
|-------|----------|
| **Status** | **Implemented** |
| **Purpose** | ExportSession UX + capability-gated 1080p |
| **Architectural outcome** | Options-only session; 1080p Approved/Warning/Blocked (not blanket block) |
| **Canonical documentation** | EXPORT_RELIABILITY_SPRINT 6F.1, [qa/export-1080p-results.md](./docs/qa/export-1080p-results.md) |
| **Primary implementation** | `export/session/`, `export/capabilities/` |
| **Verification** | `test:export-session`, `test:export-1080p-capability`, `test:export-resolution-policy` |
| **Known remaining debt** | 1080p device binary rows **Not tested**; freeze doc “1080p remains blocked” wording **partially stale** vs 6F.1 policy |

### Export backlog (not complete)

| Phase | Status |
|-------|--------|
| 6G Visual parity detail | Planned in EXPORT_RELIABILITY_SPRINT |
| 6H Error recovery / cancellation UI | Planned |
| 6I Full device QA matrix | Planned |
| Server / headless renderer | Future (contract) |

### Sprint 7 — Provocative Hook

| Phase | Status | Purpose | Architectural outcome | Canonical documentation | Primary implementation area | Verification / QA | Known remaining debt |
|-------|--------|---------|----------------------|-------------------------|-----------------------------|-------------------|----------------------|
| **7A** | **Complete — contract accepted** | Audit + formal Hook Contract | Ownership, fingerprints, SI/publishing boundaries accepted | [HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md), [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) | Docs | Link/symbol checks | — |
| **7B** | **Complete — accepted** | Immutable Hook Strategy Library | Deterministic resolution + `hr:`/`hp:` fingerprints + tamper-resistant `HookPlan` + evidence intent gate | HOOK_CONTRACT | `src/features/hook-engine/` | `test:hook-strategy-library` | Accepted with 7B.1; no generation integration |
| **7C** | **Complete — accepted** | Hook Validator + one repair | Opening-span extract; claim-trace; opening maxima; ≤1 repair; authoritative fallback plan | HOOK_CONTRACT | `hook-engine/validation/`, `repair/` | `test:hook-validator` | 7C.1/7C.2 hardened |
| **7D** | **Complete — accepted** | Canonical adapter on all narration paths | One hook adapter; no silent partial support; legacy route fallback retired | HOOK_CONTRACT | `hook-engine/integration/` + story + route | `test:hook-integration` | Accepted with 7D.1–7D.3 |
| **7E** | **In progress** | QA + freeze | Fixtures, safety/persistence/streaming QA, freeze decision | HOOK_CONTRACT | `test:hook-sprint` | Not frozen until verdict |

---

## 9. Frozen Systems and Regression Boundaries

Future work must **not casually reinterpret** these systems:

| System | Freeze / lock source |
|--------|----------------------|
| Audio-first timing | GENERATION / Timeline Intelligence — voiceover measured before visuals |
| Voiceover duration | TRANSITIONS-SCOPE frozen list; voice-speed QA |
| MasterTimeline timing | 2.6.0 contract; export timing suites |
| Story Sync intent | `story-sync` domain + verifies |
| Shared motion semantics | SHARED_MEDIA_MOTION.md |
| Persistent media framing | MEDIA_FRAMING.md |
| Caption timing/layout/style contracts | caption-* modules + export caption suites |
| Transition visual-only scope | [docs/product/TRANSITIONS-SCOPE.md](./docs/product/TRANSITIONS-SCOPE.md) + [`.cursor/rules/transitions-visual-only.mdc`](./.cursor/rules/transitions-visual-only.mdc) |
| ExportManifest lifecycle | EXPORT_CONTRACT.md |
| Export capability preflight | EXPORT_CONTRACT / CAPABILITIES |
| Chunked renderer | EXPORT_RENDERER_ARCHITECTURE.md |
| Format adapters | EXPORT_AUDIO_AND_FORMATS.md |
| Export audio end policy | EXPORT_AUDIO_AND_FORMATS.md / 6E |
| Golden QA and freeze boundaries | docs/qa/export-reliability-freeze.md + device results honesty rules |
| Studio Intelligence v1 | STUDIO_INTELLIGENCE.md freeze policy |
| Audio Mixer v1 | AUDIO_MIXER.md freeze policy |

**Transition scope lock (summary):** transitions are visual overlays only; never add transition duration to project length; never disturb voiceover/subtitle timing; see rule file before changing preview/export/timeline transition behavior.

---

## 10. QA and Production Approval Matrix

Legend:

| Label | Meaning |
|-------|---------|
| **Implemented** | Code exists for the capability |
| **Automated verification passed** | Node/verification suites recorded as Pass |
| **Manually verified** | Human device/local artifact checklist filled |
| **Capability-gated** | Allowed only when preflight Approves/Warns |
| **Not tested** | No recorded run |
| **Not approved** | Explicitly out of freeze / blocked policy |
| **Future** | Documented as not in scope yet |

| Area | Status | Evidence |
|------|--------|----------|
| Browser export | Implemented + automated semantic | EXPORT_CONTRACT; freeze APPROVED (720p scope) |
| 720p | Implemented; freeze **Approved** (policy); device wall-clock **Not tested** | export-reliability-freeze, export-device-results |
| 1080p | Implemented; **Capability-gated**; device matrix **Not tested**; freeze doc still says “not approved / blocked” (drift vs 6F.1) | export-1080p-results, EXPORT_CONTRACT 6F.1 |
| WebM | Implemented; primary format | EXPORT_CAPABILITIES; freeze scope |
| MP4 | Implemented; **Capability-gated** by runtime codec probe; real CI encode probe **Not tested** | export-device-results MP4 probe section |
| Chromium | Supported (720p candidate); automated-semantic; manual incomplete | export-device-results |
| Safari | Supported with warnings; **Not tested** | export-device-results |
| Firefox | Supported with warnings; **Not tested** | export-device-results |
| Golden projects A–G | Automated semantic **Pass (suite)**; local artifact / manual device **Not tested** | export-device-results |
| Device testing | Harness implemented (`/dev/export-qa`); matrix mostly empty | export-device-results |
| Semantic parity | Automated coverage strong; 6A matrix still useful | export-preview-parity-matrix; golden suites |
| Visual / perceptual parity | Partial; device visual **Not tested**; 6G backlog | EXPORT_RELIABILITY_SPRINT 6G |
| Retry / cancellation | Poison recovery implemented; **full cancellation UI Future** | EXPORT_CONTRACT |
| Artifact validation | Implemented + automated | 6E / `test:export-final-artifact` |
| Shared Media Motion freeze | Candidate; **sign-off blank** | shared-media-motion-sprint-5.md |
| Mixed-media export freeze checklist | Checklist present; boxes unchecked; no APPROVED verdict | mixed-media-export-freeze.md |

**Never upgrade “Implemented” or “Automated verification passed” into “device approved” without filled device evidence.**

---

## 11. Documentation Authority Map

| Document | Purpose | Authority level | Current status | Superseded by | When to update |
|----------|---------|-----------------|----------------|---------------|----------------|
| [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) | Canonical navigation index | **Authoritative (index)** | Current | — | Every major sprint |
| [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) | Export guarantees | **Authoritative** | Current (6B–6F.1) | — | Any export contract change |
| [docs/EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md) | Export sprint plan / backlog | **Authoritative** | Current | — | Phase status changes |
| [docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md](./docs/architecture/EXPORT_RENDERER_ARCHITECTURE.md) | Production renderer | **Authoritative** | Current (chunked-browser-v1) | — | Renderer changes |
| [docs/product/EXPORT_AUDIO_AND_FORMATS.md](./docs/product/EXPORT_AUDIO_AND_FORMATS.md) | Audio/format adapters | **Authoritative** | Current (6E) | — | Format/audio policy changes |
| [docs/product/EXPORT_CAPABILITIES.md](./docs/product/EXPORT_CAPABILITIES.md) | Capability inventory | Current supporting | Updated for 6F/6F.1 | — | Capability matrix changes |
| [docs/product/SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) | Motion semantics | **Authoritative** | Current | — | Motion engine changes |
| [docs/product/MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) | Framing contract | **Authoritative** | Current | — | Framing model changes |
| [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) | Mixer v1 | **Authoritative** | Frozen | — | Versioned mixer milestones |
| [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) | SI v1 | **Authoritative** | Frozen | — | Explicit SI milestones |
| [docs/product/TRANSITIONS-SCOPE.md](./docs/product/TRANSITIONS-SCOPE.md) | Transition scope lock | Authoritative for scope; partially stale on `renderTransitions` enablement notes | Locked | Production transition status in export parity / capabilities | Before any transition work |
| [ROADMAP.md](./ROADMAP.md) | Product milestones | Authoritative for 3.x product backlog + Sprint 7 naming | Names Sprint 7; **7A–7E Core frozen**; Evidence Surprise live capability-gated | This index + HOOK_CONTRACT for Hook architecture detail | Product planning / acceptance status changes |
| [ARCHITECTURE.md](./ARCHITECTURE.md) (root) | High-level system design | Current supporting | Current for Intelligence/Timeline story | docs/* for implementation | Major pipeline changes |
| [README.md](./README.md) | Product overview | Partially stale | “Latest v2.6.0”; underplays Sprint 6 | This index + EXPORT_* for export | Release / capability updates |
| [CHANGELOG.md](./CHANGELOG.md) | Release history | Partially stale / conflicting | `[3.0.0]` Feature frozen vs ROADMAP in-progress items | Prefer ROADMAP + contracts for “what’s frozen now” | Real releases only |
| [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) | Route-level implementation | **Partially stale** | Still describes MediaRecorder-centric export / “6B must migrate” | EXPORT_CONTRACT + RENDERER_ARCHITECTURE | After reconciling export section |
| [docs/product/RENDERING.md](./docs/product/RENDERING.md) | Preview/export mechanics | **Partially stale** | MediaRecorder + WebM-centric export table | EXPORT_* authoritative set | Export path rewrite |
| [docs/product/FEATURES.md](./docs/product/FEATURES.md) | Feature catalog | Partially stale | Some limitations contradict EDITING/Timeline | EDITING + contracts | Feature truth changes |
| [docs/architecture/DATA_MODEL.md](./docs/architecture/DATA_MODEL.md) | Story data model | Current supporting | May lag motion/mixer/manifest richness | story.types.ts | Model changes |
| [docs/product/GENERATION.md](./docs/product/GENERATION.md) | Generation pipeline | Current supporting | Current for audio-first | SI doc for dual-gate detail | Generation changes |
| [docs/product/EDITING.md](./docs/product/EDITING.md) | Editor behavior | Current supporting | Stronger than FEATURES on VO refit | — | Editor contract changes |
| [docs/product/FUTURE.md](./docs/product/FUTURE.md) | Vision / debt | Future planning | Not shipped status | — | Vision updates |
| [docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md](./docs/architecture/EXPORT_ARCHITECTURE_AUDIT.md) | 6A audit evidence | **Historical** | Pre-chunked production narrative | EXPORT_RENDERER_ARCHITECTURE | Freeze as historical |
| [docs/product/EXPORT_TIMING_MODEL.md](./docs/product/EXPORT_TIMING_MODEL.md) | Clock hierarchy | Partially stale | Encode path MediaRecorder-era | Clock sections still useful; renderer arch for encode | Timing policy changes |
| [docs/product/EXPORT_DETERMINISTIC_CAPTURE.md](./docs/product/EXPORT_DETERMINISTIC_CAPTURE.md) | 4.2C-8 capture rules | Historical / supporting | Semantic frame rules useful | Chunked renderer arch for production encode | Capture rule changes |
| [docs/operations/EXPORT_FAILURE_FORENSICS.md](./docs/operations/EXPORT_FAILURE_FORENSICS.md) | Failure staging | Current supporting | Debug model useful | — | Forensics taxonomy changes |
| [docs/qa/export-reliability-freeze.md](./docs/qa/export-reliability-freeze.md) | 6F freeze decision | **Authoritative** for freeze | APPROVED 720p; 1080p wording drifts vs 6F.1 | export-1080p-results for 1080p policy | New freeze decisions |
| [docs/qa/export-device-results.md](./docs/qa/export-device-results.md) | Device evidence log | **Authoritative** for honesty | Automated pass; device Not tested | — | Each manual run |
| [docs/qa/export-1080p-results.md](./docs/qa/export-1080p-results.md) | 1080p policy + device log | **Authoritative** for 1080p | Capability-gated; device Not tested | — | Device fills / policy |
| [docs/qa/export-preview-parity-matrix.md](./docs/qa/export-preview-parity-matrix.md) | 6A parity audit | Historical + still useful | Actions recommend 6B/6C partly done | EXPORT_CONTRACT status table | Parity re-audit |
| [docs/qa/mixed-media-export-freeze.md](./docs/qa/mixed-media-export-freeze.md) | Manual mixed-media checklist | Current supporting | Unchecked; no verdict | — | Manual freeze attempt |
| [docs/qa/shared-media-motion-sprint-5.md](./docs/qa/shared-media-motion-sprint-5.md) | Motion freeze checklist | Current supporting | Candidate; unsigned | — | Motion freeze decision |
| [docs/HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md) | Sprint 7A evidence audit | **Authoritative for audit evidence** | Current (7A) | — | After any generation-path change affecting hooks |
| [docs/HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) | Formal Hook Contract | **Accepted after Sprint 7A** | 7A–7E Core frozen; Evidence Surprise live capability-gated | — | Every Hook Engine change |
| [docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md](./docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md) | Sprint 10A evidence audit | **Accepted** | Accepted (10A) | RETENTION_STORY_CONTRACT | After generation-path changes affecting story planning |
| [docs/RETENTION_STORY_CONTRACT.md](./docs/RETENTION_STORY_CONTRACT.md) | Formal Retention Story Contract | **Accepted after Sprint 10A.2** | 10B module implemented; not production-ready/frozen; generation unwired | `src/features/retention-story/` | Every Retention Story Intelligence change |
| [docs/operations/ENV_AND_FEATURE_FLAGS.md](./docs/operations/ENV_AND_FEATURE_FLAGS.md) | Env / feature-flag ledger | Supporting tracker | Multi-image flag retired 8E.3; multi-image default | scene-media-sprint-8-freeze | Any env or client-gate change |
| [docs/qa/hook-engine-sprint-7-freeze.md](./docs/qa/hook-engine-sprint-7-freeze.md) | Sprint 7 freeze evidence | **Authoritative for freeze verdict** | AWAITING LIVE-MODEL SIGN-OFF | hook-live-model-results | After live smoke or defect |
| [docs/qa/hook-live-model-results.md](./docs/qa/hook-live-model-results.md) | Live-model smoke log | **Authoritative for live honesty** | All rows Not tested until HOOK_LIVE_QA=1 | — | Each live run |
| [CLAUDE.md](./CLAUDE.md) | Points at AGENTS.md | Non-architecture | Stub | AGENTS.md / Next.js docs | — |
| [AGENTS.md](./AGENTS.md) | Next.js agent rules | Authoritative for Next.js caution | Current | `node_modules/next/dist/docs/` before app code | Framework upgrades |

### Documented drift (do not silently rewrite history)

1. **Version lines:** README “Latest v2.6.0” vs CHANGELOG `[3.0.0]` vs `package.json` `0.1.0`.
2. **Export production path:** chunked-browser-v1 (authoritative) vs MediaRecorder narratives in `docs/architecture/ARCHITECTURE.md`, `docs/product/RENDERING.md`, audit/timing/deterministic-capture docs.
3. **“6B must migrate”** language in `docs/architecture/ARCHITECTURE.md` vs Implemented 6B–6F.1 in EXPORT_CONTRACT.
4. **1080p:** freeze doc “not approved / blocked” vs 6F.1 capability-gated policy.
5. **Creator Templates / CHANGELOG 3.0.0 Feature frozen** vs ROADMAP In Progress 3.10.
6. **Transitions:** TRANSITIONS-SCOPE `renderTransitions: false` guidance vs later export parity “transitions Yes/Partial”.
7. **MasterTimeline image-motion track** vs Shared Media Motion as production motion path.
8. **Voiceover re-fit:** FEATURES limitation text vs EDITING / Timeline Intelligence / export preflight refit.
9. **Template hint comments** claim `templatePromptHints` are unused; script-only consumes them via `resolveCreatorTemplatePromptBlock` (see Hook audit).
10. **Multiple “hook” vocabularies** collide until Hook Contract acceptance (prompt / PI / template / SI / publishing-social metadata).
11. **Historical:** Before Sprint 7A docs landed, ROADMAP did not name Sprint 7 Hook — that is **historical drift**. Current: 7A–7E Core frozen; Evidence Surprise live provider path capability-gated.

---

## 12. Future Extension Points

### Sprint 7 — Provocative Hook

```text
Sprint 7 — Provocative Hook
7A — Hook Architecture Audit and Formal Hook Contract   ← Complete — contract accepted
7B — Hook Strategy Library                              ← Complete — accepted
7C — Hook Validator                                     ← Complete — accepted
7D — Hook Integration into all templates                ← Complete — accepted (7D.1–7D.3)
7E — QA and freeze                                      ← Complete — Core frozen; Evidence Surprise live capability-gated
```

**Docs:** [HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md) · [HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) (**Accepted after Sprint 7A**)
**Module:** [`src/features/hook-engine/`](./src/features/hook-engine/)
**Verify:** `npm run test:hook-strategy-library` · `npm run test:hook-validator` · `npm run test:hook-integration`

**Constraints:**

- Final spoken hook text remains part of `FootieScript.narration` (opening span); story generation commits.
- Runtime `HookPlan` ephemeral; accepted snapshot may persist on `StoryCreationBrief.hookPlan`.
- Hook Engine is **upstream of voiceover, timeline, preview, and export**.
- Must not redefine MasterTimeline, ExportManifest, or renderer contracts.
- Must not import Studio Intelligence; SI `StoryStrategyHookStrategy` remains SI-only.
- `scenes-only` never rewrites narration hooks.
- Publishing `buildStyleHook` is a publishing/social metadata hook outside Hook Engine.
- Every narration-generating path must use the Hook adapter before claiming Hook Engine guarantees.

| Seam | Why |
|------|-----|
| `src/features/hook-engine/` | 7B library + 7C validation/repair + 7D integration |
| `src/features/story/` + script generation | Narration commit + compression revalidation |
| `src/features/intelligence/` | Grounded structure / forbidden claims input |
| `src/features/studio-intelligence/` | Downstream visual/scene hook consumer (no upstream import) |
| `src/features/creator-templates/` | Advisory `openingStyle` → one canonical adapter |
| `src/app/api/generate-script/route.ts` | Mode matrix; legacy/`full` explicit failure (no silent bypass) |
| `src/verification/story/hook/` | 7B–7E fixtures + golden/safety/persistence/streaming QA |

Parallel product debt (not Sprint 7 itself): ROADMAP Creator Templates 3.10, Asset Search 3.8, Export 6G–6I.

### Sprint 8 — Multi-image Scenes *(frozen)*

| Phase | Status |
|-------|--------|
| **8A** — Multi-image Scene Foundation | **Complete and accepted** |
| **8B** — Scene Media Timeline UI | **Complete and accepted** |
| **8C** — Per-media Inspector | **Complete and accepted** |
| **8D** — Preview + Export Integration | **Complete and accepted** |
| **8E** — Golden QA and Freeze | **Complete and accepted** |

**Frozen contracts:** `SceneMediaTimeline` v1 · ExportManifest v2 · renderer contract `"8D"` · hard-cut intra-scene switching baseline · first-item compatibility mirrors · fail-closed manifest validation.

**8E.3:** Operator-confirmed local Preview / 720p WebM / manual editor **Pass**. `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` **retired**; multi-image is the default production capability. Evidence: [docs/qa/scene-media-local-results.md](./docs/qa/scene-media-local-results.md) · [docs/qa/scene-media-sprint-8-freeze.md](./docs/qa/scene-media-sprint-8-freeze.md).

**Deferred from Sprint 8 (delivered in Sprint 9):** Intra-scene transition effects. Headless Renderer → **Sprint 11** (deferred; not Sprint 10).

### Sprint 9 — Intra-scene Transitions *(frozen — 9D.3)*

| Phase | Status |
|-------|--------|
| **9A** — Domain + Editor Foundation | **Complete and accepted** — `src/features/scene-media-transitions/` |
| **9B** — Preview Integration | **Complete and accepted** — `preview/plan-preview-media-layers.ts` |
| **9C** — Export Integration | **Complete and accepted** — ExportManifest v3 / `"9C"` (9C.1 integrity) |
| **9D** — Golden QA and Freeze | **Frozen** (9D.3 operator sign-off) |

**Frozen contracts:** transition domain/persistence · canonical vocabulary · boundary selection/Inspector · head-of-incoming timing · 40% clamp · Preview stable-primary composition · scene-to-scene precedence · ExportManifest v3 / `"9C"` · fingerprint coherence · v2/`"8D"` hard-cut compatibility · caption/audio/timing invariants · golden fixtures · local-evidence truth rules.

**9D.3:** Operator-confirmed local Chromium Preview / 720p WebM / Studio editor **Pass**. Optional video/audio/Safari/Firefox/1080p/device multi-video remain **Not tested**. Evidence: [docs/qa/intra-scene-transition-local-results.md](./docs/qa/intra-scene-transition-local-results.md) · [docs/qa/intra-scene-transition-sprint-9-freeze.md](./docs/qa/intra-scene-transition-sprint-9-freeze.md).

```text
SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN
```

### Sprint 10 — Retention Story Intelligence v1 *(frozen — 10H.5C)*

| Phase | Status |
|-------|--------|
| **10A** — Architecture Audit + Formal Contract | **Accepted** — [RETENTION_STORY_ARCHITECTURE_AUDIT.md](./docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md) |
| **10A.1** — Contract Authority Hardening | **Accepted** |
| **10A.2** — Contract Final Coherence | **Accepted** — [RETENTION_STORY_CONTRACT.md](./docs/RETENTION_STORY_CONTRACT.md) |
| **10B** — Story Contract + Format Strategy Foundation | **Complete and accepted** — `npm run test:retention-story-contract` |
| **10C** — Controlling Idea + Emotional Arc | **Complete and accepted** (10C.1 / 10C.1A) — `strategy/` · `npm run test:retention-story-strategy` |
| **10D** — Retention Beat + Pacing Intelligence | **Complete and accepted** (unwired) — `planning/` · `npm run test:retention-story-planning` |
| **10D.1 / 10D.1A / 10D.1B** | **Complete and accepted** |
| **10E / 10E.1 / 10E.1A** — Narrative Composer + Hook Integration | **Complete and accepted** (unwired) — `composition/` · `budget/` · `integration/` |
| **10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C / 10F.2 / 10F.2A / 10F.3 / 10F.3A / 10F.3B** — Validator + rewrite + production + hardening | **Accepted** — `validation/` · `rewrite/` · `production/` · `npm run test:retention-story-validator` · `npm run test:retention-story-rewrite` · `npm run test:retention-terminal-validation` · `npm run test:retention-production-integration` |
| **10G / 10G.1 / 10G.1A** — Explainability / Strategy UI + persistence authority | **Accepted** — `presentation/` · total persistence validators · `npm run test:retention-story-ui` |
| **10H–10H.5C** — Golden QA + universal reliability + final sign-off | **Complete and accepted — Sprint 10 frozen** · `npm run test:retention-story-sprint` · 13/13 live · local product Pass · [freeze ledger](./docs/qa/retention-story-sprint-10-freeze.md) |

**Module map:** `domain/` · `grounding/` · `strategy/` · `planning/` · `composition/` · `budget/` · `integration/` · `validation/` · `rewrite/` · `production/` · `presentation/` · public `index.ts`. **10D** produces the complete `RetentionStoryPlan`. **10E** composes asserted candidates and reconciles Hook-approved narration. **10F** validates + optional Studio rewrite. **10F.3 / 10F.3A / 10F.3B** activate and harden `runRetentionProductionNarration` for script-only + audio-first (scenes-only unchanged). **10G / 10G.1 / 10G.1A** expose Story Strategy on Create and read-only Story intelligence on Review with linked, exception-safe persistence authority. Upstream beat type remains `RetentionBeat` (not SI `NarrativeBeat`). Ledger is **production-enforced** on narration paths. Sprint 10 is frozen after 10H.5C.

```text
10A–10A.2 — Complete and accepted
10B / 10B.1 / 10B.1A / 10B.1B — Complete and accepted
10C / 10C.1 / 10C.1A — Complete and accepted
10D — Complete and accepted
10E / 10E.1 / 10E.1A — Complete and accepted
10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C — Validator + ledger + ready phase-order authority accepted
10F.2 — Studio body rewrite + terminal validation implemented
10F.2A — Terminal Hook authority + length enforcement hardening accepted
10F.3 — Production activation + commit gate + safe persistence
10F.3A — Production authority + evidence hardening
10F.3B — Safe Hook diagnostics terminal coherence accepted
10G / 10G.1 / 10G.1A — Explainability + Story Strategy UI + persistence authority accepted
10H–10H.5C — Golden QA, universal reliability, live/local sign-off complete
Retention Story — Frozen
CORE RETENTION LIVE-MODEL PATH: APPROVED (13/13)
LOCAL PRODUCT SIGN-OFF: APPROVED
EVIDENCE SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

### Sprint 11 — Headless Renderer *(11E Phase 2E.1 hosted-worker foundation local; Upstash staging-accepted; Fly deploy NOT STARTED; configuration-blocked; not production-active)*

Intended seam:

```text
Creator clicks Export (user action — not cron)
    ↓
Export → Stage A provisional store (jobId, no HeadlessRenderJobV1) → upload/verify → Stage B atomic same-jobId canonical promote → queue → worker
    ↓
Capability / job acceptance on control plane
    ↓
Renderer selection
    ├── Browser renderer (chunked-browser-v1)  ← current production authority
    └── Headless worker renders asynchronously (not started)
    ↓
Validate/upload artifact → status / download (survives refresh/tab close)
```

The headless renderer **must consume the same frozen `ExportManifest` contract** (validated v2 / `"8D"` hard-cut and v3 / `"9C"`). Sprint 11A found that execution needs a separate immutable job + materialized-asset binding contract because current manifest sources may be browser-local `blob:` / `data:` URLs and current capability fingerprints describe browser preparation state.

**11A decision:** Vercel/Next.js is the authenticated control plane, not assumed render compute. The provider-neutral target is deterministic Chromium frame composition plus native FFmpeg in an isolated worker. Browser export remains production authority until parity/staging evidence passes. See [HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md](./docs/HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md).

**11A.1 product authority:** `HEADLESS EXPORT TRIGGER: USER ACTION — NOT CRON` · `REQUEST MODEL: SYNCHRONOUS JOB CREATION + ASYNCHRONOUS EXECUTION`. Editing after Export does not mutate the active job; “Export updated video” creates a fresh manifest and new job. Also an **11E** product acceptance requirement.

**11B–11D:** Domain + control plane + local worker under `src/features/headless-renderer/`. Worker uses system Chrome (`puppeteer-core`) + native ffmpeg/ffprobe; recursively immutable output-profile registry (720p/1080p/4K × WebM/MP4 @ 30fps) with `HeadlessRenderTarget` as pixel/codec authority; **Phase 3.2 PNG image2pipe** streaming (duration-independent / bounded — not one PNG file per frame); initial operational contract **60s / 60.4s / 1812 frames** at all resolutions via profile ∩ provider capacity; **`min(profile, provider)` worker-limit intersection**; private frame API; real SHA-256 artifacts; advisory Node-coordinator RSS metrics (non-identity; not process-tree memory). Test seeding under `control-plane/testing` and `worker/testing`. Production Route Handlers under `/api/headless-render/jobs*` return **503 CONFIGURATION_UNAVAILABLE**. Verify: `test:headless-worker-streaming` · `test:headless-worker-streaming-evidence` · `test:headless-worker-duration-authority` · `test:headless-worker-resource-evidence` · `test:headless-worker-local`. ExportManifest v2/`"8D"` + v3/`"9C"` remain frozen 720p/1080p (no `"4k"` label). See [HEADLESS_11D_PHASE3_2_STREAMING_4K.md](./docs/HEADLESS_11D_PHASE3_2_STREAMING_4K.md).

**11E Phase 2B.2B:** Neon adapters are implemented and configuration-gated; migrate runner (`DATABASE_URL_UNPOOLED` + `HEADLESS_NEON_MIGRATE=1`) and gated live harness (`HEADLESS_NEON_QA=1`) are implemented with ledger/checksum/schema preflight/evidence authority. **Remote migrate NOT EXECUTED; live Neon NOT RUN.** Production routes remain configuration-blocked; Browser Export remains default; no `.env.local` edits. See [HEADLESS_11E_PHASE2_PROVIDER_DECISION.md](./docs/HEADLESS_11E_PHASE2_PROVIDER_DECISION.md) and [HEADLESS_11E_NEON_LIVE_EVIDENCE.md](./docs/HEADLESS_11E_NEON_LIVE_EVIDENCE.md).

**11E Phase 2C.1:** R2 owned-object + upload-capability foundation implemented and configuration-gated. **Staging-accepted** via prior official live matrix. See [HEADLESS_11E_R2_OWNED_OBJECT_FOUNDATION.md](./docs/HEADLESS_11E_R2_OWNED_OBJECT_FOUNDATION.md).

**11E Phase 2D.1H.1:** Upstash dual-lease **staging-accepted** (official LIVE 22/22 PASS). See [HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md](./docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md).

**11E Phase 2E.1:** Hosted worker env classifier, mode composition (honest seams), Node entrypoint, worker-only bundle, Dockerfile, Fly staging template. **Fly deploy NOT STARTED.** See [HEADLESS_11E_PHASE2E1_HOSTED_WORKER_FOUNDATION.md](./docs/HEADLESS_11E_PHASE2E1_HOSTED_WORKER_FOUNDATION.md).

**11E Phase 2E.1A:** Node **24** LTS; process-specific verify/render VM capacity; repo-root Dockerfile path; deterministic `BUILD_INFO`; image class **`foundation_image`**. See [HEADLESS_11E_PHASE2E1A_CORRECTION.md](./docs/HEADLESS_11E_PHASE2E1A_CORRECTION.md).

| Phase | Status |
|-------|--------|
| **11A** Architecture + authority audit | **Ready for final acceptance** — documentation |
| **11A.1** User-triggered export authority | **Ready for acceptance** — docs; also required by **11E** |
| **11B / 11B.1 / 11B.1A** Domain contracts + authority chain | Accepted |
| **11C / 11C.1 / 11C.1A** Control plane + authority | Accepted |
| **11D Phase 3 / 3.1 / 3.1A / 3.1B** Output + duration/RSS + limit precedence | Accepted foundation |
| **11D Phase 3.2** Duration-scalable streamed 4K | Foundation — image2pipe; 60s operational contract |
| **11D Phase 3.2A** Streaming evidence + output authority | Foundation — identity `…-phase3.2`; truthful backpressure; pre-write artifact cap |
| **11D Phase 3.3** Streamed artifact hash + upload | Foundation — incremental SHA-256 + `writeUploadStream`; whole-artifact Node buffer removed |
| **11D Phase 3.3A** Durable artifact binding + CAS races | Foundation — atomic private object binding |
| **11D Phase 3.3A.1** Total binding validation + durable cleanup | Accepted foundation — hostile-safe validators; durable orphan cleanup |
| **11E Phase 1 / 1A** Product dispatch + QA orchestration | Accepted foundation — see [HEADLESS_11E_PRODUCT_DISPATCH.md](./docs/HEADLESS_11E_PRODUCT_DISPATCH.md) |
| **11E Phase 2 / 2.1 / 2.1A / 2.1B** Provider decision + store type authority | Accepted foundation — [HEADLESS_11E_PHASE2_PROVIDER_DECISION.md](./docs/HEADLESS_11E_PHASE2_PROVIDER_DECISION.md) |
| **11E Phase 2A / 2A.1** Clerk principal + authority hardening | Accepted foundation — env classification; proxy containment; AUTHENTICATION_FAILED; create blocked |
| **11E Phase 2B.2B** Neon migration + live-QA authority | **Ready for review** — configuration-gated Neon adapters; migrate runner + ledger/checksum/lock; gated live harness + evidence; remote migrate/live NOT executed; routes still configuration-blocked |
| **11E Phase 2B.2+ / 11F** Neon adapter, durable providers, staging, parity/freeze | Not started — Neon interactive Pool/Client transactions; R2 + queue + worker; staging evidence |

Implementation concerns (not story semantics): owned asset transport, idempotent user-triggered jobs, authenticated control plane, 720p-first parity, 1080p qualification before freeze, native FFmpeg streaming encode, worker storage/execution, cancellation, artifact validation, and safe cleanup. Hosted-provider memory measurement and production route activation remain later seams.

---

## 13. Contributor Onboarding Path

Recommended reading order:

```text
1. MASTER_ARCHITECTURE.md          ← you are here
2. README.md                       ← product overview (watch version drift)
3. ARCHITECTURE.md                 ← high-level pipelines
4. docs/architecture/DATA_MODEL.md              ← FootieScript model
5. Relevant subsystem contract     ← e.g. EXPORT_CONTRACT, SHARED_MEDIA_MOTION, AUDIO_MIXER, STUDIO_INTELLIGENCE
6. Relevant production module      ← src/features/<engine>/
7. Relevant verification suites    ← src/verification/ + npm test:* scripts
```

For export work specifically: MASTER → EXPORT_CONTRACT → EXPORT_RENDERER_ARCHITECTURE → EXPORT_AUDIO_AND_FORMATS → `src/features/export/` → `test:export-capability-audit` / `test:export-reliability`.

For Next.js application code: read [AGENTS.md](./AGENTS.md) and `node_modules/next/dist/docs/` before assuming App Router APIs.

---

## 14. Maintenance Rules

Every future major milestone **must** update:

1. **Master subsystem table** ([§4](#4-source-of-truth-hierarchy) / [§5](#5-engine-and-subsystem-index))
2. **Sprint ledger** ([§8](#8-completed-sprint-and-milestone-ledger))
3. **Contract index** ([§6](#6-core-contracts))
4. **QA approval matrix** ([§10](#10-qa-and-production-approval-matrix))
5. **Extension-point status** ([§12](#12-future-extension-points))
6. **Documentation drift table** ([§11](#11-documentation-authority-map))

Also:

- Prefer linking to production types over copying interfaces.
- Never claim device approval without filled QA rows.
- Never present Sprint 7+ work as implemented until code + verification + docs agree.
- Keep historical docs; mark authority level instead of deleting.

---

## Quick links

| Need | Go to |
|------|-------|
| Export contract | [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) |
| Export sprint plan | [docs/EXPORT_RELIABILITY_SPRINT.md](./docs/EXPORT_RELIABILITY_SPRINT.md) |
| Hook audit (7A) | [docs/HOOK_ARCHITECTURE_AUDIT.md](./docs/HOOK_ARCHITECTURE_AUDIT.md) |
| Hook contract (Accepted) | [docs/HOOK_CONTRACT.md](./docs/HOOK_CONTRACT.md) |
| Retention Story audit (10A) | [docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md](./docs/RETENTION_STORY_ARCHITECTURE_AUDIT.md) |
| Retention Story contract (10A) | [docs/RETENTION_STORY_CONTRACT.md](./docs/RETENTION_STORY_CONTRACT.md) |
| Retention Story module (10B) | [src/features/retention-story/](./src/features/retention-story/) |
| Hook Engine module | [src/features/hook-engine/](./src/features/hook-engine/) |
| Motion | [docs/product/SHARED_MEDIA_MOTION.md](./docs/product/SHARED_MEDIA_MOTION.md) |
| Framing | [docs/product/MEDIA_FRAMING.md](./docs/product/MEDIA_FRAMING.md) |
| Mixer | [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) |
| Studio Intelligence | [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) |
| Transitions lock | [docs/product/TRANSITIONS-SCOPE.md](./docs/product/TRANSITIONS-SCOPE.md) |
| Product roadmap | [ROADMAP.md](./ROADMAP.md) |
| Verification README | [src/verification/README.md](./src/verification/README.md) |
