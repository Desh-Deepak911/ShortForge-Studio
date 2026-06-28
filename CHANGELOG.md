# Changelog

All notable changes to **ShortForge Studio** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Product:** ShortForge Studio · **Export watermark:** FootieBitz

---

## Table of Contents

- [2.6.0](#260)
- [2.5.0](#250)
- [2.7.0](#270)
- [2.8.0](#280)
- [Related Documentation](#related-documentation)

---

## [2.6.0]

**ShortForge Studio v2.6.0 — Timeline Intelligence Runtime**

Unified preview and export timing under a single Master Timeline with absolute timestamps, dedicated schedulers for captions, motion, and transitions, and a pre-render optimizer that prevents subtitle truncation and long-video drift.

### Added

- **Master Timeline** — Canonical `buildMasterTimeline()` clock with scene, subtitle, caption-animation, image-motion, transition, and audio tracks
- **Absolute timestamp model** — Every timed event uses `startMs` / `endMs` on one master axis
- **Shared preview/export timing** — Preview and export resolve the same scene, subtitle, and animation at each `timeMs`
- **Render duration authority** — `renderDurationMs` spans all content lanes plus end buffer for mux and frame loops
- **Subtitle completion guard** — Final subtitle hold through render end so narration does not cut off early
- **Caption animation scheduler** — Timeline-driven fade-up, highlight, and typewriter effects inside subtitle windows
- **Typewriter timing** — Character reveal paced by available duration with safe acceleration on short windows
- **Image motion scheduler** — Pan-left, pan-right, zoom, and legacy Ken Burns driven by image-motion track events
- **Transition scheduler** — Scene-tail overlays (fade, slide, zoom, blur) with safe outgoing duration clamping
- **Timeline optimizer** — `optimizeMasterTimeline()` pre-render pass with diagnostics for dense subtitles and short scenes
- **Drift correction** — Export preflight voiceover refit with preserved audio/subtitle alignment
- **Timeline diagnostics** — Development-only authority, lane span, and optimizer findings in the editor
- **QA verify suite** — Foundation, authority, caption-animation, image-motion, transition, and optimizer QA scripts

### Changed

- **Preview wired to Master Timeline** — Device-frame playback uses optimized timeline authority
- **Export wired to Master Timeline** — Canvas frame loop and subtitle/motion/transition resolvers share timeline playback helpers
- **Export preflight integration** — `prepareStoryForExport()` builds optimized Master Timeline for render duration
- **WebM/MP4 export sync improvements** — Mux duration follows Master Timeline render span; voiceover remains primary authority
- **Audio mix path** — Export uses `buildAudioMixFromStory()` for voiceover and background music alignment

### Fixed

- Preview/export drift for subtitles, caption animations, image motion, and transitions on long videos (60s+)
- Final subtitle truncation when audio ended before the last caption completed
- Typewriter and animated caption truncation on tight subtitle windows
- Transition overlay duration exceeding safe outgoing scene tail
- Export duration mismatch after voiceover refit and scene duration edits
- Legacy draft Ken Burns presets mapping safely to timeline image-motion events

See also: [ROADMAP.md — Timeline Intelligence Runtime](./ROADMAP.md#timeline-intelligence-runtime) · [ARCHITECTURE.md — Timeline Intelligence Runtime](./ARCHITECTURE.md#timeline-intelligence-runtime)

---

## [2.5.0]

Intelligence Runtime release — Knowledge Graph, Graph Context, and Prompt Intelligence production path.

### Added

- **Knowledge Graph** — Merged research facts with provenance and relationships
- **Graph Context** — Mode-aware research context for script generation
- **Prompt Intelligence** — Narrative planning, fact selection, and structured LLM prompts
- **Provider Registry** — Abstract routing to research backends
- **Canonical Research Pipeline** — Normalized provider merge via Canonical Research Bundle
- **Research Preview** — Preview research before writing
- **Prompt planning** — Beat-level narrative plans and length budgets
- **Improved grounding** — Forbidden claims and warnings propagated into prompts

### Changed

- **Prompt Intelligence promoted to production** — Primary prompt path for script generation
- **Graph Context as fallback** — Production context source when Prompt Intelligence cannot run
- **Simplified Intelligence Runtime** — Consolidated research orchestration through Query Orchestrator
- **Improved story quality** — Mode-aware narrative structures and fact discipline
- **Better entity resolution** — Improved player, team, and competition matching

### Fixed

- Consolidated duplicate intelligence paths
- Improved provider orchestration and fallback behavior
- Better prompt consistency across storytelling modes
- Improved research reliability under sparse or failed provider responses

See also: [ROADMAP.md — Completed](./ROADMAP.md#completed) · [ARCHITECTURE.md — Intelligence Runtime](./ARCHITECTURE.md#intelligence-runtime)

---

## [2.7.0]

*Reserved — see [ROADMAP.md](./ROADMAP.md#planned).*

---

## [2.8.0]

*Reserved.*

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Product overview and getting started |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design |
| [ROADMAP.md](./ROADMAP.md) | Planned and in-progress work |
