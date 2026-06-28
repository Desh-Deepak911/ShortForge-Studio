# ShortForge Studio Roadmap

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This roadmap outlines where **ShortForge Studio** is today and where it is heading — from research-backed script creation through timeline editing to browser-side export.

Items marked complete ship in the current product. In-progress and planned work may shift as priorities change. Release notes: [CHANGELOG.md](./CHANGELOG.md).

---

## Table of Contents

- [Completed](#completed)
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
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
