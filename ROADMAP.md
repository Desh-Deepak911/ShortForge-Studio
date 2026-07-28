# ShortForge Studio Roadmap

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Start here for architecture:** [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) — canonical index, freeze boundaries, Export Reliability ledger (Sprint 6A–6F.1), and Sprint 7+ extension map. This roadmap remains the product milestone checklist.

This roadmap outlines where **ShortForge Studio** is today and where it is heading — from research-backed script creation through timeline editing to browser-side export.

Items marked complete ship in the current product. In-progress and planned work may shift as priorities change. Release notes: [CHANGELOG.md](./CHANGELOG.md).

---

## Table of Contents

- [Completed](#completed)
- [Studio Intelligence v1](#studio-intelligence-v1)
- [Studio Intelligence 3.7 Asset Intelligence](#studio-intelligence-37-asset-intelligence)
- [Studio UX 3.7G Creator Asset Studio](#studio-ux-37g-creator-asset-studio)
- [Studio UX 3.7H Story Evolution](#studio-ux-37h-story-evolution)
- [Asset Search Platform 3.8](#asset-search-platform-38)
- [Creator Experience 3.9.2 — Audio Mixer v1](#creator-experience-392--audio-mixer-v1)
- [In Progress](#in-progress)
- [Sprint 7 — Provocative Hook](#sprint-7--provocative-hook)
- [Sprint 10 — Retention Story Intelligence v1](#sprint-10--retention-story-intelligence-v1)
- [Sprint 11 — Headless Renderer](#sprint-11--headless-renderer)
- [Planned](#planned)
- [Long Term Vision](#long-term-vision)
- [Related Documentation](#related-documentation)

---

## Completed

*Shipped through [2.6.0](./CHANGELOG.md#260) and earlier releases.*

### Story Creation

- [x] Multi-stage workflow — Create → Review → Voiceover → Scene Generation → Editor → Preview → Export
- [x] Script review — Edit title and narration before audio production
- [x] Voiceover — TTS with voice and speed controls
- [x] Scene generation — Audio-first storyboards timed to measured narration

### Editing Studio

- [x] Timeline editing — Scene order, captions, and transitions on a 9:16 canvas
- [x] Image positioning — Pan, zoom, and Ken Burns motion per scene
- [x] Background music — Volume control in preview and export
- [x] **Audio Mixer v1** — Independent voice/music/master volume, preview/export parity, export ducking, peak protection (3.9.2)
- [x] Draft persistence — Save, list, and reload drafts in the browser

### Intelligence Runtime

- [x] Intent Engine — Classify story type from natural-language briefs
- [x] Entity Resolver — Identify players, teams, and related entities
- [x] Competition Resolver — Map leagues, cups, and seasons for research scope
- [x] Query Orchestrator — Plan and execute provider calls with fallbacks
- [x] Provider Registry — Route to live and static research backends
- [x] Canonical Research Bundle — Normalized merge of provider results
- [x] Knowledge Graph — Provenance-aware facts and relationships
- [x] Graph Context — Mode-aware research context for generation
- [x] Prompt Intelligence — Narrative planning, fact selection, production prompts (primary path)
- [x] Research Preview — Preview research before script generation

### Export

- [x] Browser rendering — Client-side canvas compositing
- [x] WebM — In-browser capture via MediaRecorder
- [x] MP4 — FFmpeg.wasm muxing
- [x] Audio synchronization — Voiceover and background music aligned to subtitles

### Timeline Intelligence Runtime

*Shipped in [2.6.0](./CHANGELOG.md#260) — Timeline Intelligence Runtime.*

- [x] **Master Timeline** — Canonical absolute-timestamp clock for preview and export
- [x] **Shared preview/export timing** — Same scene, subtitle, and animation resolution at each `timeMs`
- [x] **Render duration authority** — `renderDurationMs` spans audio, narration, scenes, subtitles, animations, and transitions
- [x] **Subtitle completion guard** — Final subtitle hold through render end
- [x] **Caption animation scheduler** — Fade-up, highlight, and typewriter effects inside subtitle windows
- [x] **Typewriter timing** — Character pacing with safe acceleration on short windows
- [x] **Image motion scheduler** — Pan, zoom, and Ken Burns presets via timeline events
- [x] **Transition scheduler** — Scene-tail overlays with safe duration clamping
- [x] **Timeline optimizer** — Pre-render clamping and diagnostics for dense or short scenes
- [x] **Drift correction** — Export preflight refit with preserved audio alignment
- [x] **WebM/MP4 export sync** — Mux duration follows Master Timeline render span

---

## Studio Intelligence v1

**Status: complete and frozen.** Planning (3.3–3.6), Blueprint Adapter (3.4), and opt-in production wiring (3.5) ship as **Studio Intelligence v1**. Default production behavior remains the AI scene planner unless both dual gates pass. **Next:** [3.8 Asset Search Platform](#asset-search-platform-38).

## Studio Intelligence 3.3

*Planning subsystem — frozen at 3.3I as part of v1.*

- [x] **3.3A Foundation** — Types, constants, utilities, empty result shell
- [x] **3.3B Beat Detection** — Heuristic narrative beat classifier from narration
- [x] **3.3B.5 Arc Builder** — Beat grouping into narrative arcs
- [x] **3.3C Blueprint Contract** — Scene blueprint types and collection stats
- [x] **3.3D Scene Planner** — Arcs → scene blueprints with roles and captions
- [x] **3.3E Visual Planner** — Visual intent, asset queries, motion suggestions
- [x] **3.3F Dynamic Timing** — Duration allocation across blueprints
- [x] **3.3G Runtime** — `runStudioIntelligence()` orchestrates full pipeline
- [x] **3.3H Story Strategy** — Immutable strategy registry and mode resolution
- [x] **3.3I Runtime Strategy Injection** — Strategy propagated through every planner

## Blueprint Adapter 3.4

*Adapter frozen at 3.4D. Production-wired behind 3.5 dual gates (scenes-only v1).*

- [x] **3.4A Adapter Architecture** — Types, contract shell, isolation verification
- [x] **3.4B Blueprint Mapper** — `mapBlueprintsToScenes()`, role/kind/timing/visual/asset/motion/caption mapping
- [x] **3.4C Adapter Enrichment** — Narration slicing, coverage statistics, enhanced diagnostics
- [x] **3.4D Golden Fixture Validation** — Six story-mode fixtures, full pipeline checks

## Production Wiring 3.5

*Complete — opt-in / dev-gated. Default production behavior unchanged.*

- [x] **3.5A** — Production wiring architecture audit
- [x] **3.5B** — FootieScript Materializer (`materializeMappedScenesToFootieScript`)
- [x] **3.5C** — Materializer golden fixtures
- [x] **3.5D** — Dual-gate scenes-only wiring (`STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED` + `useStudioIntelligenceScenes`)
- [x] **3.5E** — Scene Density Adapter (`adaptSceneDensity`)
- [x] **3.5F** — Dev/staging Review toggle + debug badge
- [x] **3.5G** — Production wiring freeze audit + documentation

**Dual gates:** Server env `STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED=true` **and** request `useStudioIntelligenceScenes=true`. Otherwise AI scene planner.

**Fallback:** SI failure, density failure, or materializer mismatch → AI scene planner (same response shape).

## Studio Intelligence 3.6

*Complete — validation, alignment, and planning richness. Frozen as part of v1. No additional production wiring beyond 3.5.*

- [x] **3.6B Intent Engine v2** — `src/features/intent-engine/`; improved mode classification; `test:intent-engine-quality`
- [x] **3.6C Strategy-aware planning** — Story strategy influences beat, arc, scene, visual, and timing planners; `test:studio-intelligence-strategy-planning`
- [x] **3.6D Mode templates** — Explicit mode templates for countdown, debate, biography, history, tactical, match preview, news; `test:studio-intelligence-mode-templates`
- [x] **3.6E Adapter richness** — Semantic slot metadata preserved through adapter + materializer sidecar; `test:studio-intelligence-adapter-richness`
- [x] **3.6F Prompt ↔ Studio Intelligence alignment** — Shared mode-structure bridge; `test:studio-intelligence-prompt-alignment`
- [x] **3.6G Story Coherence Validator** — Post-planning audit on `StudioIntelligenceResult`; `test:studio-intelligence-story-validator`

Detail: [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md)

---

## Studio Intelligence 3.7 Asset Intelligence

*Complete — planning-only. Production generation behavior unchanged.*

- [x] **3.7 Asset Intelligence** — Recommendation engine, provider plan ranking, validation, and planning snapshot generation at storyboard time

Asset Intelligence runs during **story generation** and produces planning metadata consumed by Creator Asset Studio. It does not fetch or attach real assets until 3.8.

---

## Studio UX 3.7G Creator Asset Studio

*Complete — presentation-only inspector panel.*

- [x] **3.7G Creator Asset Studio** — Read-only planning UI in the scene inspector: recommendations, provider rankings, validation, and repair hints from cached planning

Editor reads cached planning only — no intelligence re-execution on the read path.

---

## Studio UX 3.7H Story Evolution

*Complete — planning lifecycle architecture for Creator Asset Studio.*

- [x] **3.7H.1 Story Evolution Audit** — Edit/persistence map and staleness architecture proposal
- [x] **3.7H.2 Story Change Detection** — `detectStoryChanges()` wired on editor edits
- [x] **3.7H.3 Planning Staleness** — `computePlanningStaleness()` and cache staleness metadata
- [x] **3.7H.4 Soft Read + Stale UX** — Soft-read cache, stale badge, reason chips; empty state only when no planning exists
- [x] **3.7H.5 Draft Planning Persistence** — `assetPlanningSnapshot` on drafts; rehydrate on editor load
- [x] **3.7H.6 Planning Refresh Foundation** — `refreshCreatorAssetPlanning()` service (not UI-wired)

**Next:** [3.8 Asset Search Platform](#asset-search-platform-38)

---

## Asset Search Platform 3.8

*Next milestone — real asset retrieval.*

Move from planning recommendations to searchable, attachable assets. Search Orchestrator becomes the central gateway for manual upload, Pexels, Unsplash, Pixabay, Wikimedia, Internal Library, and AI-generated assets.

- [ ] **3.8A Search Orchestrator** — Unified search gateway and query routing
- [ ] **3.8B Provider Connectors** — Pexels, Unsplash, Pixabay, Wikimedia, Internal Library, AI Generated
- [ ] **3.8C Unified Asset Browser** — Editor-facing search and browse UI
- [ ] **3.8D One-click Attach** — Attach retrieved assets to scenes from search results
- [ ] **3.8E Smart Edit Integration** — Search handoff from Smart Edit workflows
- [ ] **3.8F Asset History** — Recently used and draft-scoped asset history
- [ ] **3.8G Freeze** — Verification, documentation, and behavior freeze

No editor behavior changes until **3.8C**.

---

## Creator Experience 3.9.2 — Audio Mixer v1

**Status: complete and frozen.** Independent voice, music, and master volume in the editor with shared preview/export behavior. **Next:** [Creator Templates 3.10](#in-progress).

- [x] **3.9.2A** — Audio mix engine audit (read-only)
- [x] **3.9.2B-1** — `audioMixer` data model and `resolveAudioMixerSettings()`
- [x] **3.9.2B-2** — Apply stem gains in preview and export
- [x] **3.9.2B-3** — Audio Mixer UI in Project Audio Studio
- [x] **3.9.2B-5** — Preview voice boost parity (> 100% via Web Audio)
- [x] **3.9.2B-6** — Export ducking parity (music under voiceover)
- [x] **3.9.2B-7** — Peak protection v1 (auto + Peak Protection toggle)

**Shipped behavior:**

| Area | v1 scope |
|------|----------|
| Volume buses | Voice, music, master (0–200%) |
| Preview/export | Same stem gain math |
| Ducking | Full voiceover window; preview + export |
| Peak protection | Stem gain > 1.0 or manual toggle; preview compressor + FFmpeg `alimiter` |
| Legacy drafts | Defaults until first mixer edit |

**Post-v1 (not in freeze):** normalize voice, limiter UI, preview music boost > 100%, FFmpeg music fade filters, scene/word-level ducking.

Detail: [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md)

---

## In Progress

### Creator Templates 3.10

Story templates and creator-facing presets — next milestone after Audio Mixer v1 freeze.

### Script Validator

Post-generation validation before voiceover and scene generation.

- [ ] **Fact verification** — Cross-check narration against Graph Context and ranked facts
- [ ] **Claim extraction** — Identify script assertions that require grounding support
- [ ] **Confidence scoring** — Surface low-confidence lines for creator review

---

## Sprint 7 — Provocative Hook

**Architectural sprint** (story-generation upstream of voiceover / timeline / preview / export). Parallel to — not replacing — Creator Templates 3.10, Asset Search 3.8, and Export 6G–6I.

| Phase | Status |
|-------|--------|
| **7A** — Hook Architecture Audit and Formal Hook Contract | **Complete — accepted** |
| **7B** — Hook Strategy Library | **Complete — accepted** (incl. 7B.1 hardening) |
| **7C** — Hook Validator | **Complete — accepted** (incl. 7C.1 / 7C.2) |
| **7D** — Hook Integration into all templates | **Complete — accepted** (incl. 7D.1–7D.3) |
| **7E** — QA and freeze | **Complete — Core Hook system frozen** |
| **7E.6 / 7E.6A** — Hook Style selector + Core freeze | **Complete** |

```text
Sprint 7 — Provocative Hook
7A — Hook Architecture Audit and Formal Hook Contract
7B — Hook Strategy Library
7C — Hook Validator
7D — Hook Integration into all templates
7E — QA and freeze
```

**References:** [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) · [docs/architecture/HOOK_ARCHITECTURE_AUDIT.md](./docs/architecture/HOOK_ARCHITECTURE_AUDIT.md) · [docs/architecture/HOOK_CONTRACT.md](./docs/architecture/HOOK_CONTRACT.md) (Status: **Accepted after Sprint 7A**) · Freeze: [docs/qa/hook-engine-sprint-7-freeze.md](./docs/qa/hook-engine-sprint-7-freeze.md) · Module: `src/features/hook-engine/` · Verify: `npm run test:hook-sprint` · `npm run test:hook-style-selector` · `npm run test:hook-core-live-qa` (gated) · gated research live: `npm run test:hook-live-qa`

**7B (accepted):** strategy library + 7B.1 hardening (`evidence_led_surprise` intent gate; tamper-resistant plans; hardened normalization; coherent opening pairs at 2.4 wps).

**7C (accepted):** opening-span extraction, candidate builder, pure validator (grounding/safety + opening maxima hard limits), selection recomputes validation, diagnostics, bounded one-repair + authoritative `compatibility_punchy` fallback plan (`activePlan` on result). 7C.1 / 7C.2 hardening applied.

**7D (accepted):** canonical Hook adapter on script-only + full audio-first; HookDirective; structured GraphContext/AssembledContext evidence; explicit creator-phrase PI preference (`evidence_fact` / `evidence_statistic`) → `NarrativePlan.openingIntent` → evidence_surprise; claim-map prioritization; sole Hook length enforcement with committed `lengthEnforcement`; legacy `generateFootieScript` retired; semantic research fingerprints. Includes 7D.1–7D.3.

**7E (complete — Core frozen):** Deterministic golden/safety/persistence/streaming QA green. Core non-research live sign-off **ELIGIBLE** (`test:hook-core-live-qa`).

```
HOOK ENGINE CORE: FROZEN
SPRINT 7E: COMPLETE — CORE HOOK SYSTEM FROZEN
EVIDENCE_SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED — LIVE SIGN-OFF PENDING
```

**7E.6 / 7E.6A (complete):** Hook Style panel (Auto default; research-aware Auto copy; Write My Own 5-word + 200-char limits; pure compatibility reconciliation; client presentation boundary). Core live: Auto `cold_open`, explicit `provocative_question` / `user_selected`, Write My Own `user_directed` / `user_authored`.

**Rules:** Final spoken hook remains an opening span of `FootieScript.narration`. Hook Engine must not patch MasterTimeline, preview, or ExportManifest. Deterministic Evidence Surprise safety is frozen with Core; only the external live-provider Evidence Surprise path remains capability-gated.

---

## Sprint 8 — Multi-image Scenes

**Architectural sprint** (scene media model / editor / preview / export adapters). Parallel to remaining product debt; does not reopen the frozen Core Hook Engine.

| Phase | Status |
|-------|--------|
| **8A** — Multi-image Scene Foundation | **Complete and accepted** |
| **8B** — Scene Media Timeline UI | **Complete and accepted** |
| **8C** — Per-media Inspector | **Complete and accepted** |
| **8D** — Preview + Export Integration | **Complete and accepted** |
| **8E** — Golden QA and Freeze | **Complete and accepted** |

```text
Sprint 8 — Multi-image Scenes
8A — Multi-image Scene Foundation         ← complete and accepted
8B — Scene Media Timeline UI              ← complete and accepted
8C — Per-media Inspector                  ← complete and accepted
8D — Preview + Export Integration         ← complete and accepted
8E — Golden QA and Freeze                 ← complete and accepted · Sprint 8 frozen
```

**8A (complete and accepted):** Versioned `FootieScene.mediaTimeline` contract; overflow-safe resolution; legacy adapter; atomic write builder; complete signatures; persistence + patch classification.

**8B (complete and accepted):** Scene Media Timeline UI; ownership-required pointer-up; empty-scene first image; full normalized writes; safe blob lifetime; stale selection reconciliation. Experimental env flag retired in 8E.3.

**8C (complete and accepted):** Per-media Inspector edits selected timeline items by stable ID; command-owned first-item compatibility; honest video thumbnail; trim terminal boolean.

**8D (complete and accepted):** Preview + ExportManifest v2 (`rendererContractVersion: "8D"`) consume the Scene Media Timeline with item-local timing and hard-cut switching; active-item-aware Preview fallback, drawable cache, capability counts, QA diagnostics; total fail-closed v2 scene-media validation before cost/preload/render.

**8E (complete and accepted):** Deterministic golden registry + local Preview / 720p WebM / manual editor **Pass** (operator-confirmed). `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` retired; multi-image is the default. See [docs/qa/scene-media-sprint-8-freeze.md](./docs/qa/scene-media-sprint-8-freeze.md).

**Frozen:** `SceneMediaTimeline` v1 · ExportManifest v2 · renderer contract `"8D"` · hard-cut intra-scene switching baseline.

**Deferred from Sprint 8:** Headless Renderer → **Sprint 11** (Retention Story Intelligence is Sprint 10).

**References:** [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) · [docs/operations/ENV_AND_FEATURE_FLAGS.md](./docs/operations/ENV_AND_FEATURE_FLAGS.md) · [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md) · Verify: `test:scene-media-sprint`

```text
SPRINT 8 MULTI-IMAGE SCENES: FROZEN
EXPORTMANIFEST V2 / RENDERER CONTRACT 8D: FROZEN
NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES: RETIRED
```

---

## Sprint 9 — Intra-scene Transitions

**Frozen.** Media-to-media transitions inside one scene. Does not reopen frozen Sprint 8 contracts or scene-to-scene transition scope locks.

| Phase | Status |
|-------|--------|
| **9A** — Domain + Editor Foundation | **Complete and accepted** |
| **9B** — Preview Integration | **Complete and accepted** |
| **9C** — Export Integration | **Complete and accepted** (9C.1 integrity) |
| **9D** — Golden QA and Freeze | **Frozen** (9D.3 operator sign-off) |

```text
Sprint 9 — Intra-scene Transitions
9A — Domain + Editor Foundation           ← complete and accepted
9B — Preview Integration                  ← complete and accepted
9C — Export Integration                   ← complete and accepted (9C.1)
9D — Golden QA and Freeze                 ← frozen (9D.3)
```

**9A–9C:** Domain/editor, Preview composition, ExportManifest **v3 / `"9C"`** — accepted. See [docs/product/INTRA_SCENE_TRANSITIONS.md](./docs/product/INTRA_SCENE_TRANSITIONS.md) · [docs/architecture/EXPORT_CONTRACT.md](./docs/architecture/EXPORT_CONTRACT.md).

**9D–9D.3:** Deterministic goldens, local-evidence truth, editor discoverability, operator Chromium Preview / 720p WebM / editor Pass. Evidence: [docs/qa/intra-scene-transition-sprint-9-freeze.md](./docs/qa/intra-scene-transition-sprint-9-freeze.md).

**Rules:** Sprint 9 is **frozen**. No feature flag. Scene-to-scene `TransitionTimelineItem` authority unchanged. ExportManifest v2 / `"8D"` remains frozen; production is v3 / `"9C"`. Future changes require a new sprint or explicit post-freeze hotfix.

```text
SPRINT 9 INTRA-SCENE TRANSITIONS: FROZEN
EXPORTMANIFEST V3 / RENDERER CONTRACT 9C: FROZEN
```

---

## Sprint 10 — Retention Story Intelligence v1

**Final status — FROZEN (10H.5C, 2026-07-17).** Deterministic Golden/authority QA, the 435-cell Flexible reliability matrix, final Core live-model matrix (**13/13 Pass**), and operator-confirmed local Create/Review/persistence/audio-first checks all passed. Evidence Surprise remains capability-gated. See [the final freeze ledger](./docs/qa/retention-story-sprint-10-freeze.md). **Sprint 11 Headless Renderer is ready to begin.**

```text
SPRINT 10 RETENTION STORY INTELLIGENCE V1: FROZEN
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

**Architectural sprint** — retention-first planning for concise 25–35s Shorts, extensible to future long-form strategies. Does **not** reopen Hook Core, Studio Intelligence v1, Story Sync, Sprint 8/9 freezes, Preview, ExportManifest v3 / `"9C"`, or the browser renderer. **No Headless Renderer work in Sprint 10.**

| Phase | Status |
|-------|--------|
| **10A** — Architecture Audit + Formal Contract | **Accepted** |
| **10A.1** — Contract Authority Hardening | **Accepted** |
| **10A.2** — Contract Final Coherence | **Accepted** |
| **10B** — Story Contract + Format Strategy Foundation | **Complete and accepted** (10B.1 / 10B.1A / 10B.1B) |
| **10C** — Controlling Idea + Emotional Arc | **Complete and accepted** (10C.1 / 10C.1A) |
| **10D** — Retention Beat + Pacing Intelligence | **Complete and accepted** (unwired; 10D.1 / 10D.1A / 10D.1B included) |
| **10E / 10E.1 / 10E.1A** — Narrative Composer + Hook Integration | **Complete and accepted** |
| **10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C / 10F.2 / 10F.2A / 10F.3 / 10F.3A / 10F.3B** — Validator + rewrite + production + hardening | **Accepted** |
| **10G / 10G.1 / 10G.1A** — Explainability / Strategy UI + persistence authority | **Accepted** |
| **10H–10H.5C** — Golden QA + universal reliability + final live/local sign-off | **Complete and accepted — Sprint 10 frozen** |

```text
Sprint 10 — Retention Story Intelligence v1
10A — Architecture Audit + Formal Contract     ← accepted
10A.1 — Contract Authority Hardening           ← accepted
10A.2 — Contract Final Coherence               ← accepted
10B — Story Contract + Format Strategy Foundation  ← complete and accepted
10C — Controlling Idea + Emotional Arc             ← complete and accepted (10C.1 / 10C.1A)
10D — Retention Beat + Pacing Intelligence         ← complete and accepted
10D.1 / 10D.1A / 10D.1B                            ← complete and accepted
10E / 10E.1 / 10E.1A — Narrative Composer + Hook Integration ← complete and accepted
10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C / 10F.2 / 10F.2A / 10F.3 / 10F.3A / 10F.3B — Validator + rewrite + production + hardening ← accepted
10G / 10G.1 / 10G.1A — Explainability / Strategy UI + persistence authority ← accepted
10H–10H.5C — Golden QA + universal reliability + live/local sign-off ← complete and accepted

Sprint 11 — Headless Renderer                 ← ready to begin
```

**Artifacts:** [docs/architecture/RETENTION_STORY_ARCHITECTURE_AUDIT.md](./docs/architecture/RETENTION_STORY_ARCHITECTURE_AUDIT.md) (accepted) · [docs/architecture/RETENTION_STORY_CONTRACT.md](./docs/architecture/RETENTION_STORY_CONTRACT.md) (**Frozen after Sprint 10H.5C**) · Freeze ledger: [docs/qa/retention-story-sprint-10-freeze.md](./docs/qa/retention-story-sprint-10-freeze.md) · Module: `src/features/retention-story/` (`domain/` · `grounding/` · `strategy/` · `planning/` · `composition/` · `budget/` · `integration/` · `validation/` · `rewrite/` · `production/` · `presentation/`) · Verify: `npm run test:retention-story-sprint` · `npm run test:retention-story-live-qa` (gated) · `/dev/retention-story-qa`.

**10D note (accepted):** Planning layer — deterministic beat plan, pacing budgets, compression goals, hook handoff, plan fingerprint + coherence assertion. Fast path is fully deterministic (**zero planner calls**); Balanced/Studio use an **injected planner, at most one call**, with no silent Fast downgrade. Still unwired from generation.

**10D.1 / 10D.1A / 10D.1B note (accepted):** Planner completeness, creator-context handoff, safe subject anchors, box-constrained pacing, Fast deterministic authority; bare + phrase-complete match-result factual-risk classifier.

**10E / 10E.1 / 10E.1A note:** Structured Retention Narrative Composer with asserted-seed sole controlling-idea claim authority, Hook reconciliation bridge, and shared path-global model-call ledger. **Complete and accepted.**

**10F.3 / 10F.3A / 10F.3B note:** Canonical `runRetentionProductionNarration` owns script-only + audio-first narration; one path-global ledger; commit-gate semantic ledger equality; call-kind-aware output-token budgets; failure envelopes never carry plan/validation snapshots; total fail-closed safe Hook diagnostics terminal coherence; private-data-free exception boundary; scenes-only unchanged. **Accepted.**

**10G / 10G.1 / 10G.1A note:** Create **Story strategy** selector (Auto / Retention-first / Standard) with duration compatibility + reset-to-Auto; Review **Story intelligence** read-only explainability from safe snapshots; selection wires through contract fingerprint; scenes-only ignores strategy. **10G.1** adds total fail-closed persistence validators, plan/validation linkage, rewrite evidence bound to validation summary, and draft-load sanitization. **10G.1A** closes the validator exception boundary (hostile getters/Proxies never throw). **Accepted.**

**10H–10H.5C note:** Golden, structural, safety, persistence, streaming, universal reliability, final live, and local product evidence all passed. Retention Story Intelligence v1 is frozen. Evidence Surprise / live research remains capability-gated.

**10C note:** Strategy layer only — one controlling idea, grounded selection, `EmotionalArcBlueprint` (pre-beat phases; **no fake beat IDs**), Fast deterministic seed, planner-proposal normalizer seam. **10C.1 / 10C.1A:** exact-token subject authority, factual claim-support equality, candidate/seed coherence, terminal per-source seed invariants, deeply frozen canonical asserted seeds. **Complete and accepted.** **No model call in 10C.**

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
10G — Explainability + Story Strategy UI
10G.1 — Persistence + explainability authority hardening
10G / 10G.1 / 10G.1A — Explainability + Story Strategy UI + persistence authority accepted
10H–10H.5C — Golden QA, universal reliability, live/local sign-off complete
Retention Story — Frozen
CORE RETENTION LIVE-MODEL PATH: APPROVED (13/13)
LOCAL PRODUCT SIGN-OFF: APPROVED
EVIDENCE SURPRISE LIVE PROVIDER PATH: CAPABILITY-GATED
SPRINT 11 HEADLESS RENDERER: READY TO BEGIN
```

---

## Sprint 11 — Headless Renderer

**Status: Sprint 11E Phase 2C.1 R2 owned-object foundation ready for review.** Work is isolated on `feature/sprint-11-headless-renderer`. Neon adapters remain **implemented / configuration-gated** (2B.2–2B.2B). Phase **2C.1** adds R2 env classification, owned-object durable records + `004_headless_owned_objects.sql`, Design B trusted verify, injectable upload/download/storage adapters + FakeS3 tests. **Not live-tested; no remote R2 contact; remote migrations NOT EXECUTED.** Production headless routes remain **configuration-blocked**; Browser Export remains production default. No `.env.local` edits. Upstash / Fly **not started**. Sign-in UI deferred.

ExportManifest v3 / `"9C"` and v2 / `"8D"` remain **frozen and unchanged** (720p/1080p only — no silent `"4k"` label). 4K elevation is headless-target-only. Evidence: `test:headless-worker-limit-authority` · `test:headless-worker-duration-authority` · `test:headless-worker-output-profiles` · `test:headless-worker-resource-evidence` · `test:headless-worker-mp4` · `test:headless-worker-resolution-ladder`. No paid vendor, product UI, or required `.env.local` changes (optional path overrides only).

**11A.1 / 2.1A / 2.1B product authority:** Headless Export is **user-triggered** (not cron). Export returns a stable **jobId immediately** via a **provisional** store record (no `HeadlessRenderJobV1` until Stage B); upload/trusted verify and atomic same-`jobId` promotion may be async; render enqueue only after canonical promotion. See [docs/architecture/headless/HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md](./docs/architecture/headless/HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md) §1A / §12A and [provider decision](./docs/architecture/headless/HEADLESS_11E_PHASE2_PROVIDER_DECISION.md) §8.6.

| Phase | Status |
|-------|--------|
| **11A** Architecture + authority audit | **Ready for final acceptance** — [docs/architecture/headless/HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md](./docs/architecture/headless/HEADLESS_RENDERER_ARCHITECTURE_AUDIT.md) |
| **11A.1** User-triggered export authority | **Ready for acceptance** — also an **11E** acceptance requirement |
| **11B** Formal job / asset / artifact contracts | Accepted foundation |
| **11B.1 / 11B.1A** Authority hardening + request chain | Accepted |
| **11C / 11C.1 / 11C.1A** Control plane + authority | Accepted |
| **11D Phase 1–2.1** Isolated worker + audio | Accepted foundation |
| **11D Phase 3** MP4 + resolution ladder + real 4K | Foundation landed |
| **11D Phase 3.1** Output authority + resource evidence | Foundation landed |
| **11D Phase 3.1A** Duration semantics + honest RSS | Accepted foundation |
| **11D Phase 3.1B** Worker limit precedence | Accepted — `min(profile, provider)`; insufficient capacity rejected before Chromium |
| **11D Phase 3.2** Duration-scalable streamed 4K | Foundation — image2pipe; 60s operational contract |
| **11D Phase 3.2A** Streaming evidence + output authority | Accepted foundation — identity `…-phase3.2`; truthful backpressure; pre-write artifact cap |
| **11D Phase 3.3** Streamed artifact hash + upload | Foundation — incremental SHA-256 + `writeUploadStream`; whole-artifact Node buffer removed |
| **11D Phase 3.3A** Durable artifact binding + CAS races | Foundation — atomic succeeded binding; post-finalization races |
| **11D Phase 3.3A.1** Total binding validation + durable cleanup | **Accepted foundation** — hostile-safe validators; durable orphan cleanup intents; test barriers testing-only |
| **11E Phase 1 / 1A** Product dispatch + QA orchestration | Accepted foundation — capability-gated UI; fake end-to-end QA lifecycle; routes still blocked |
| **11E Phase 2** Provider + deployment authority audit | Foundation — topology selected; superseded by 2.1 corrections |
| **11E Phase 2.1** Provider authority correction | Accepted foundation — full-object SHA-256 verify; Streams protocol; Fluid/non-Fluid; Clerk≠project ownership |
| **11E Phase 2.1A** Job acceptance + post-ack recovery | Accepted foundation — two-stage acceptance; dual-lease Redis/Neon recovery; DLQ classes |
| **11E Phase 2.1B** Provisional record type authority | Accepted foundation — discriminated provisional/canonical store; docs only |
| **11E Phase 2A** Clerk principal + route auth gates | Accepted foundation — Clerk identity; project auth port unavailable |
| **11E Phase 2A.1** Clerk failure + owner authority hardening | Accepted foundation — env classification; proxy containment; AUTHENTICATION_FAILED; owner-bound test project auth |
| **11E Phase 2B Phase 1** Provider-neutral store + ownership foundation | **Accepted foundation** — provisional/canonical union, validators, lifecycle, promotion contract, job-store port + memory adapter, project ownership contract + memory adapter, SQL + CAS spec in `control-plane/migrations/`; no Neon runtime |
| **11E Phase 2B.2+** Neon adapter + durable providers | Neon/R2 config-gated (accepted evidence); dual-lease queue 2D.1 foundation; Fly/staging/opt-in remain |
| **11E Phase 2D.1 / 2D.1H.1** Upstash dual-lease + live evidence | **Staging-accepted** — official LIVE 22/22 PASS SHA `360e059b…`; progressive/concurrency PASS preserved |
| **11E Phase 2E.1** Fly hosted-worker foundation | **Ready for review (local only)** — env classifier, composition seams, entrypoint, worker bundle, Dockerfile, Fly staging template; Fly deploy NOT STARTED |
| **11E Phase 2E.1A** Hosted-worker corrections | **Ready for review (local only)** — Node 24; process-specific VMs; repo-root Dockerfile path; deterministic BUILD_INFO; `foundation_image`; Fly deploy NOT STARTED |
| **11E Phase 2E.2A … 2E.2A.3** Render storage + delete saga + terminal disposition | **Implemented locally** — streamed R2; durable pre-upload; fail-closed delete saga; terminal `protected`/`rejected` cleanup dispositions; Neon `005`; storage+cleanup seams closed; foundation_image; no remote migration / Fly deploy |
| **11E Phase 2E.2B** Trusted verify → promotion → render enqueue | **Implemented locally** — claimed-verification executor; coverage reconcile; canonical materialize; atomic promote; stable render XADD; `VERIFY_PROMOTION_COMPOSITION_SEAM` closed; packaging still blocks loop; foundation_image / not deployable; no Fly deploy |
| **11E Phase 2E.2B.1** Hosted execution correction | **Implemented locally** — signal-armed shutdown deadline; incremental asset stream verify; claimed-hook fatal catch + adapter close finally; queued dispatch-pending recovery; foundation_image / not deployable; no Fly deploy |
| **11E Phase 2E.2B.2** Durable dispatch outbox | **Implemented locally** — Neon `006` outbox; atomic promote+pending intent; outbox claim→XADD→dispatched; unified busy/shutdown drain; no periodic XADD amplification; foundation_image / not deployable; migration 006 not applied remotely; no Fly deploy |
| **11E Phase 2E.2B.3** Dispatch outbox CAS truthfulness | **Implemented locally** — exhaustive release/reject/dispatched CAS checks; aborted_released/unconfirmed; promotion+outbox rollback proof; foundation_image / not deployable; no packaging / Fly |
| **11E Phase 2E.2C.2** Deployable worker packaging | **Implemented locally** — `deployable_worker`; bundled hosted runtime; embedded schema fingerprint; page-render artifact; no Fly deploy |
| **11E Phase 2E.2D.1** Neon staging migrations 005/006 | **Staging schema PASS** — migrations applied; schema preflight PASS; see phase evidence |
| **11E Phase 2E.2D.3** Fly sandbox Chromium capability | **PASS** — secure Chromium/DOM/FFmpeg/page smoke on temporary no-secret Machine; SHA `083e3d27…` |
| **11E Phase 2E.2D.4 / 2E.2D.5C / 2E.2D.5E / 2E.2D.6E / 2E.2D.6G** Fly staging deployment authority | **Implemented locally** — canonical verify-first orchestrator; dry-run fixtures; staged-secret activation + corrected rollback; **no** Fly provider contact in 2E.2D.6G |
| **11F** Parity Golden QA + staging live freeze | Not started — includes long-form 4K / hosted-worker qualification before freeze |

---

## Planned

| Initiative | Description |
|------------|-------------|
| **Retention Story Intelligence (Sprint 10)** | **Frozen** — deterministic, 13/13 Core live, and local product evidence passed |
| **Headless Renderer (Sprint 11)** | 11E through 2E.2D.6G canonical verify-first orchestrator (local); sandbox Chromium PASS; Neon/R2/Upstash staging-accepted; Fly verify-first remote FAIL preserved (6D/6F); staging app at zero Machines; verify-first rerun NOT RUN; config-blocked create; browser remains production default |
| **Scene Intelligence** | Beat-aware scene planning — caption density, transitions, visuals grounded in research |
| **Media Intelligence** | Asset-aware image, motion, and style recommendations |
| **Multi-provider research** | Additional backends via Provider Registry beyond API Football and Static Knowledge |
| **Automatic visual recommendations** | Suggested imagery and motion from narration segments and story mode |
| **Additional storytelling domains** | Extend Intelligence Runtime beyond football without replacing the editor or export pipeline |
| **Collaborative editing** | Shared drafts and review workflows (requires cloud-backed state) |
| **Cloud rendering** | Optional server-side export for longer or heavier workloads |
| **Story Intelligence Engine** | Unified cross-stage story planning above the current runtime |
| **Asset Search Platform 3.8** | Search Orchestrator, provider connectors, unified browser, one-click attach — see [3.8](#asset-search-platform-38) |

---

## Long Term Vision

ShortForge Studio is designed as a **domain-independent storytelling platform**. Football is the first supported knowledge domain — live API research, Static Knowledge fallbacks, and mode-aware Prompt Intelligence tuned for match stories, rankings, and player analysis.

The Intelligence Runtime (Intent Engine → Provider Registry → Knowledge Graph → Graph Context → Prompt Intelligence) is built so new domains plug in at the research and narrative layers. The **Story Creation Pipeline** and **Rendering Pipeline** stay the same as the product expands.

Architecture detail: [ARCHITECTURE.md](./ARCHITECTURE.md) · Product overview: [README.md](./README.md)

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) | **Start here** — master architecture index |
| [docs/architecture/HOOK_ARCHITECTURE_AUDIT.md](./docs/architecture/HOOK_ARCHITECTURE_AUDIT.md) | Sprint 7A hook evidence audit |
| [docs/architecture/HOOK_CONTRACT.md](./docs/architecture/HOOK_CONTRACT.md) | Formal Hook Contract (**Accepted after Sprint 7A**) |
| [docs/architecture/RETENTION_STORY_ARCHITECTURE_AUDIT.md](./docs/architecture/RETENTION_STORY_ARCHITECTURE_AUDIT.md) | Sprint 10A Retention Story evidence audit |
| [docs/architecture/RETENTION_STORY_CONTRACT.md](./docs/architecture/RETENTION_STORY_CONTRACT.md) | Formal Retention Story Contract (**Accepted after Sprint 10A.2**) |
| [README.md](./README.md) | Features, workflows, getting started |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and pipelines |
| [docs/product/STUDIO_INTELLIGENCE.md](./docs/product/STUDIO_INTELLIGENCE.md) | Studio Intelligence v1 — planners, adapter, 3.6 validation, freeze policy |
| [docs/product/AUDIO_MIXER.md](./docs/product/AUDIO_MIXER.md) | Audio Mixer v1 — buses, ducking, peak protection, freeze policy |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
