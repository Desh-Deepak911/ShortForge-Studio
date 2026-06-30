# Studio Intelligence 3.3 – 3.5

Studio Intelligence is a **planning subsystem** in ShortForge Studio. It transforms story input (topic, narration, mode, duration) into structured planning metadata — beats, arcs, scene blueprints, visual/asset/motion hints, and timing — and, when explicitly enabled, into production-shaped **`FootieScene[]`** via the Blueprint Adapter and FootieScript Materializer.

**Status:** Planning frozen at **3.3I (runtime) + 3.4D (adapter)** · **3.5 Production Wiring complete (opt-in / dev-gated, scenes-only v1)**

Deep dive companion: [ARCHITECTURE.md — Studio Intelligence layer](./ARCHITECTURE.md#studio-intelligence-layer)

---

## Overview

Studio Intelligence sits **above** FootieScript materialization and **below** creator-facing generation APIs. It answers: *given a narration and story mode, how should this short be structured before FootieScript scenes exist?*

The planning module lives under `src/features/studio-intelligence/`. Production wiring (3.5) is limited to the Review **scenes-only** path in `scene-planning.service.ts` → `studio-intelligence-scene-plan.utils.ts`. **Default production behavior remains the existing AI scene planner.**

---

## 3.5 Production Wiring (opt-in / dev-gated)

Studio Intelligence scene planning runs on `POST /api/generate-script` **`mode: "scenes-only"`** only when **both** gates are open:

| Gate | Requirement |
|------|-------------|
| **Server kill switch** | `STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED=true` |
| **Request flag** | `useStudioIntelligenceScenes=true` |

If either gate is closed, `generateScenesFromScriptAndAudio()` uses the **AI scene planner** (OpenAI Responses API) — unchanged default behavior.

### Wired pipeline (when dual gates pass)

```
Review script + voiceover (scenes-only)
      ↓
runStudioIntelligence()
      ↓
adaptSceneDensity(requestedSceneCount)   ← 3.5E
      ↓
mapBlueprintsToScenes()
      ↓
materializeMappedScenesToFootieScript()
      ↓
FootieScene[]
```

**Wiring files:** `studio-intelligence-scene-plan.utils.ts`, `scene-planning.service.ts`, `audio-first-generation.service.ts` (`generateScenesForReviewedScript`), `app/api/generate-script/route.ts`

### Fallback behavior

| Condition | Result |
|-----------|----------|
| Env off (`STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED` ≠ `true`) | AI scene planner |
| Request flag false / omitted | AI scene planner |
| SI runtime, adapter, or materializer failure | AI fallback (same `FootieScene[]` response shape) |
| Scene density adaptation failure | AI fallback |
| Materialized scene count ≠ requested count | AI fallback |

Fallback is silent to end users in production; dev/staging may show an **AI fallback used** badge.

### Dev/staging toggle

- **Label:** “Use Studio Intelligence scene planning” (Review → Storyboard inspector)
- **Visibility:** Hidden when `NODE_ENV === "production"` unless `NEXT_PUBLIC_STUDIO_INTELLIGENCE_SCENE_PLAN_TOGGLE=true`
- **Default:** Toggle off; `useStudioIntelligenceScenes` is **omitted** from the request body
- **Debug badge (dev only):** May show *Studio Intelligence used*, *AI fallback used*, *Scene density adapted*
- **No raw diagnostics** (`StudioIntelligenceScenePlanDiagnostics`) in API responses or production UI — only optional `scenePlanDevDebug` with source + density flag, stripped outside dev/staging

### Not wired in 3.5

- **Audio-first `full` mode** — script → voiceover → scenes does not pass SI flags
- **Create one-shot flow** — unchanged AI scene planning
- **Editor, Preview, Export, Audio, Timeline Intelligence, Drafts** — no SI imports or behavior changes

---

## Goals

| Goal | Description |
|------|-------------|
| **Structured planning** | Derive narrative beats, arcs, and scene blueprints from narration heuristics |
| **Mode-aware strategy** | Resolve immutable `StoryStrategy` configs instead of scattering `ScriptMode` checks |
| **Blueprint contract** | Emit a stable `SceneBlueprintCollection` planners can evolve without breaking consumers |
| **Opt-in production handoff** | Materialize to `FootieScene[]` behind dual gates without changing default generation |
| **Verification-first** | Every planner, adapter, materializer, density adapter, and wiring path has dedicated verification |

---

## Architecture

```
Story Input (StudioIntelligenceInput)
      ↓
Studio Intelligence Runtime (runStudioIntelligence)
      ↓
resolveStoryStrategy(input.mode)
      ↓
Narrative Beat Detection → Arc Builder → Scene Planner → Visual Planner → Dynamic Timing
      ↓
StudioIntelligenceResult
      ↓
Scene Density Adapter (adaptSceneDensity)     ← 3.5E, production-wired
      ↓
Blueprint Adapter (mapBlueprintsToScenes)
      ↓
FootieScript Materializer                   ← 3.5B, production-wired
      ↓
FootieScene[]
```

**Planning entry point:** `runStudioIntelligence()` in `studio-intelligence-runtime.ts`  
**Production entry point:** `tryGenerateScenesFromStudioIntelligence()` in `studio-intelligence-scene-plan.utils.ts`  
**Public barrel:** `src/features/studio-intelligence/index.ts`

---

## Planner order

| Step | Planner | Module |
|------|---------|--------|
| 1 | Normalize input | `studio-intelligence-runtime.ts` |
| 2 | Resolve story strategy | `story-strategy/story-strategy.utils.ts` |
| 3 | Narrative Beat Detection | `narrative-beat-detector.ts` |
| 4 | Narrative Arc Builder | `narrative-arc-builder.ts` |
| 5 | Scene Planner | `scene-planner.ts` |
| 6 | Visual Planner | `visual-planner.ts` |
| 7 | Dynamic Timing Planner | `dynamic-timing-planner.ts` |

Each planner accepts an optional `StoryStrategy`. When omitted, the runtime resolves strategy from `input.mode` or falls back to the default strategy.

---

## Story Strategy Engine

The Story Strategy Engine (`story-strategy/`) provides **immutable, frozen** planning configuration keyed by `StoryStrategyId`:

| Strategy | Typical script mode |
|----------|---------------------|
| `default` | `story` |
| `history` | `historical_explainer` |
| `debate` | `opinion_debate` |
| `comparison` | comparison-style stories |
| `countdown` | `top_5` |
| `biography` | `player_analysis` |
| `match_preview` | `match_preview` |
| `tactical_analysis` | `tactical_review` |
| `news` | `match_recap` |

**Key APIs:**

- `resolveStoryStrategy(mode)` — resolve strategy from mode or alias
- `resolvePlannerStrategy(input, strategy?)` — explicit strategy wins, else input mode, else default
- `strategyIntroVisualOverride()`, `strategyFallbackQuery()` — mode bias without direct `ScriptMode` inspection in planners

Runtime strategy injection (3.3I) passes one resolved strategy instance through every planner and records `strategyHandoffTrace` in diagnostics.

---

## Scene Blueprint contract

Scene blueprints (`scene-blueprint.types.ts`) are the handoff artifact between scene planning and materialization:

| Sub-blueprint | Purpose |
|---------------|---------|
| **Role / kind** | Planned scene slot (intro, evidence, conflict, payoff, …) |
| **VisualBlueprint** | Visual intent type, composition, subject, emotion |
| **AssetBlueprint** | Asset requirement, search query, fallback query, orientation |
| **MotionBlueprint** | Intensity and motion suggestion (Ken Burns, push-in, …) |
| **TimingBlueprint** | Suggested duration, pacing, weight |
| **CaptionBlueprint** | Caption style and emphasis hints |

`SceneBlueprintCollection` aggregates blueprints with `totalSuggestedDurationMs`, `averageImportance`, and `confidence`.

---

## Blueprint Adapter (3.4 — complete / frozen)

The Blueprint Adapter lives under `src/features/studio-intelligence/blueprint-adapter/` and maps planning blueprints into intermediate scene plans.

```
SceneBlueprintCollection
      ↓
BlueprintAdapterInput (collection + narration + strategy context)
      ↓
mapBlueprintsToScenes()
      ↓
BlueprintAdapterResult
      ├── mappedScenes: BlueprintMappedScene[]
      ├── warnings
      ├── diagnostics
      └── statistics
```

Each `BlueprintMappedScene` preserves full lineage:

| Field | Source |
|-------|--------|
| `sourceBlueprintId` | `SceneBlueprint.id` |
| `sourceArcId` | `SceneBlueprint.arcId` |
| `sourceBeatIds` | `SceneBlueprint.beatIds` |
| `timingMetadata` | Blueprint timing sub-contract |
| `visualHints` / `mediaHints` / `motionHints` / `captionHints` | Blueprint sub-contracts |
| `narrationMetadata` | Narration slicing (summary, proportional sentences, or fallback) |
| `confidence` | Combined mapping confidence |

**Golden fixtures:** Six story-mode fixtures validate `runStudioIntelligence()` → `mapBlueprintsToScenes()`. Run: `npm run test:studio-intelligence-golden-fixtures`.

---

## FootieScript Materializer (3.5B) + Scene Density Adapter (3.5E)

| Component | Entry point | Role |
|-----------|-------------|------|
| **Scene Density Adapter** | `adaptSceneDensity()` | Merge/split blueprints to match requested scene count before adapter |
| **FootieScript Materializer** | `materializeMappedScenesToFootieScript()` | Map `BlueprintMappedScene[]` → production `FootieScene[]` |

Materializer golden fixtures: `npm run test:studio-intelligence-materializer-golden-fixtures`  
Density verification: `npm run test:studio-intelligence-scene-density`  
End-to-end wiring: `npm run test:studio-intelligence-scene-plan-wiring`

---

## Subsystem reference

### Narrative Beat Detector

| | |
|---|---|
| **Purpose** | Split narration into sentence-sized chunks and classify narrative beat types |
| **Output** | `NarrativeBeat[]` with timing, importance, emotion, and purpose hints |

### Narrative Arc Builder

| | |
|---|---|
| **Purpose** | Group beats into high-level arcs |
| **Output** | `NarrativeArc[]` with duration estimates and suggested scene counts |

### Scene Planner

| | |
|---|---|
| **Purpose** | Convert arcs into `SceneBlueprint` slots |
| **Output** | `SceneBlueprintCollection` |

### Visual Planner

| | |
|---|---|
| **Purpose** | Enrich blueprints with visual intent, asset queries, and motion suggestions |
| **Output** | Enriched `SceneBlueprintCollection` |

### Dynamic Timing Planner

| | |
|---|---|
| **Purpose** | Allocate scene durations across blueprints toward target duration |
| **Output** | Timed `SceneBlueprintCollection` |

### Runtime

| | |
|---|---|
| **Purpose** | Orchestrate the full planning pipeline |
| **Output** | `StudioIntelligenceResult` |

### Blueprint Adapter

| | |
|---|---|
| **Purpose** | Map `SceneBlueprintCollection` → `BlueprintMappedScene[]` |
| **Entry point** | `mapBlueprintsToScenes(input)` |

---

## Isolation guarantees

### Planning module (`studio-intelligence/`) does NOT import

| Area | Status |
|------|--------|
| Editor | ✗ Not imported |
| Timeline / Timeline Intelligence | ✗ Not imported |
| Preview | ✗ Not imported |
| Export | ✗ Not imported |
| Audio | ✗ Not imported |
| Draft persistence | ✗ Not imported |

**Allowed external type:** `@/types/footiebitz` (`ScriptMode`) — shared type label only.

### Production surfaces unchanged by 3.5

Editor, Preview, Export, Audio, Timeline Intelligence, and Drafts do **not** import Studio Intelligence. Only the **scenes-only** generation branch optionally invokes the SI pipeline before returning the same `FootieScript` shape downstream systems already consume.

### Thin production bridge (3.5 only)

| File | Imports SI? | Scope |
|------|-------------|-------|
| `scene-planning.service.ts` | Via scene-plan utils | Dual-gate branch before AI planner |
| `studio-intelligence-scene-plan.utils.ts` | Yes | Runtime → density → adapter → materializer |
| `audio-first-generation.service.ts` | No (passes flag only) | `generateScenesForReviewedScript` scenes-only |
| `app/api/generate-script/route.ts` | No (passes flag only) | Forwards `useStudioIntelligenceScenes` |

---

## Freeze guarantees

### 3.3 / 3.4 (planning module)

- Planners and adapter verified in isolation with golden fixtures
- Immutable strategy registry; no input mutation
- Lineage preserved on every `BlueprintMappedScene`

### 3.5 (production wiring)

- **Default behavior unchanged** — AI scene planner unless both dual gates pass
- **Scenes-only v1** — Review storyboard path only; audio-first `full` not wired
- **Fail-open to AI** — SI errors never break the generation response shape
- **No raw diagnostics in production UI** — dev badge shows source summary only
- **Downstream unchanged** — Editor, Preview, Export, Audio, Timeline, Drafts untouched

---

## Completed phases

### Studio Intelligence 3.3 (frozen at 3.3I)

Foundation, beat detection, arc builder, blueprint contract, scene/visual/timing planners, runtime orchestration, story strategy registry, and runtime strategy injection.

### Blueprint Adapter 3.4 (frozen at 3.4D)

Adapter architecture, blueprint mapper, enrichment, golden fixture validation.

### Production Wiring 3.5 (complete — opt-in)

| Phase | Deliverable |
|-------|-------------|
| **3.5A** | Production wiring architecture audit |
| **3.5B** | FootieScript Materializer |
| **3.5C** | Materializer golden fixtures |
| **3.5D** | Dual-gate scenes-only wiring (`scene-planning.service.ts`, API route) |
| **3.5E** | Scene Density Adapter (`adaptSceneDensity`) |
| **3.5F** | Dev/staging toggle + debug badge |
| **3.5G** | Production wiring freeze audit + documentation |

---

## Verification

```bash
npm run test:studio-intelligence-foundation
npm run test:studio-intelligence-beats
npm run test:studio-intelligence-arcs
npm run test:studio-intelligence-blueprints
npm run test:studio-intelligence-scene-planner
npm run test:studio-intelligence-visual-planner
npm run test:studio-intelligence-dynamic-timing
npm run test:studio-intelligence-runtime
npm run test:studio-intelligence-story-strategy
npm run test:studio-intelligence-runtime-strategy
npm run test:studio-intelligence-blueprint-adapter
npm run test:studio-intelligence-blueprint-mapper
npm run test:studio-intelligence-blueprint-adapter-enrichment
npm run test:studio-intelligence-golden-fixtures
npm run test:studio-intelligence-footie-script-materializer
npm run test:studio-intelligence-materializer-golden-fixtures
npm run test:studio-intelligence-scene-density
npm run test:studio-intelligence-scene-plan-wiring
```

---

## Future roadmap

### 3.6 — Broader validation / production rollout criteria

Expand SI scene planning beyond scenes-only v1: audio-first wiring, rollout metrics, and criteria for enabling dual gates in production without the dev toggle.

### 3.7 — Asset Intelligence

Use blueprint asset queries to fetch or recommend imagery and clips.

### 3.8 — Smart Editing Intelligence

Use planning metadata to suggest timeline edits, caption emphasis, and motion presets inside the editor.

---

## Related documentation

| Document | Contents |
|----------|----------|
| [README.md — Studio Intelligence](../README.md#studio-intelligence-33--35) | Product-level summary |
| [ARCHITECTURE.md — Studio Intelligence layer](./ARCHITECTURE.md#studio-intelligence-layer) | Default vs opt-in production paths |
| [GENERATION.md — Stage 4](./GENERATION.md#stage-4--scene-planning) | AI vs SI scene planning |
| [ROADMAP.md — Studio Intelligence](../ROADMAP.md#studio-intelligence-33) | Phase checklist |
