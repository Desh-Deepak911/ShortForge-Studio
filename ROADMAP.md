# ShortForge Studio Roadmap

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

Detail: [docs/STUDIO_INTELLIGENCE.md](./docs/STUDIO_INTELLIGENCE.md)

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

Detail: [docs/AUDIO_MIXER.md](./docs/AUDIO_MIXER.md)

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

## Planned

| Initiative | Description |
|------------|-------------|
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
| [README.md](./README.md) | Features, workflows, getting started |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and pipelines |
| [docs/STUDIO_INTELLIGENCE.md](./docs/STUDIO_INTELLIGENCE.md) | Studio Intelligence v1 — planners, adapter, 3.6 validation, freeze policy |
| [docs/AUDIO_MIXER.md](./docs/AUDIO_MIXER.md) | Audio Mixer v1 — buses, ducking, peak protection, freeze policy |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
