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

**Status: complete and frozen.** Planning (3.3–3.6), Blueprint Adapter (3.4), and opt-in production wiring (3.5) ship as **Studio Intelligence v1**. Default production behavior remains the AI scene planner unless both dual gates pass. **Next:** [3.7 Asset Intelligence](#studio-intelligence-37-asset-intelligence).

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

**Next (post-v1):**

- [ ] **3.7 Asset Intelligence** — Asset-aware recommendations from blueprint queries

Detail: [docs/STUDIO_INTELLIGENCE.md](./docs/STUDIO_INTELLIGENCE.md)

---

## Studio Intelligence 3.7 Asset Intelligence

*Next Studio Intelligence milestone — not started.*

Use blueprint asset queries and planning metadata to fetch or recommend imagery and clips. Does not change v1 planner contracts until explicitly scoped.

---

## In Progress

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
| **Studio Intelligence 3.8 Smart Editing Intelligence** | Planning metadata handoff to editor suggestions |

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
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
