# ShortForge Studio Architecture

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white)](https://openai.com/)

ShortForge Studio is a full-stack storytelling platform for research-backed short-form video. The system is organized around two cooperating ideas: a **Story Creation Pipeline** that moves from brief to export in discrete, reviewable steps, and an **Intelligence Runtime** that transforms a user brief into grounded narration before any visuals are produced.

Creators never interact with the runtime directly. They write a brief, optionally run Research Preview, review a script, generate voiceover, run scene generation, edit on a timeline, preview in the browser, and export — while the server handles intent classification, entity resolution, provider orchestration, knowledge assembly, and Prompt Intelligence.

This document describes system design for engineers and technical reviewers. It avoids implementation specifics (file layout, internal APIs, and internal release naming).

---

## Table of Contents

- [High Level Flow](#high-level-flow)
- [Intelligence Runtime](#intelligence-runtime)
- [Story Creation Pipeline](#story-creation-pipeline)
- [Timeline Intelligence Runtime](#timeline-intelligence-runtime)
- [Rendering Pipeline](#rendering-pipeline)
- [Core Design Principles](#core-design-principles)
- [Future Evolution](#future-evolution)
- [Related Documentation](#related-documentation)

---

## High Level Flow

The platform end-to-end path from user input to downloadable video:

```
User Prompt
  ↓
Research
  ↓
Intelligence Runtime
  ↓
Script Generation
  ↓
Voiceover
  ↓
Scene Generation
  ↓
Timeline Editor
  ↓
Renderer
  ↓
Export
```

| Stage | Role |
|-------|------|
| **User Prompt** | Topic, story mode, tone, duration, and optional notes — the human-authored input. |
| **Research** | Optional Smart Research and Research Preview execute provider calls for facts, rankings, and grounding constraints. |
| **Intelligence Runtime** | Classifies intent, resolves entities, orchestrates providers, builds Knowledge Graph and Graph Context, renders Prompt Intelligence. |
| **Script Generation** | OpenAI produces narration from structured research context — not raw provider JSON. |
| **Voiceover** | TTS audio; measured duration is the timing authority for all downstream visuals. |
| **Scene Generation** | Scenes, captions, and transitions planned against the voiceover (audio-first). |
| **Timeline Editor** | Creators refine scenes, images, motion, music, and subtitles on a 9:16 canvas. |
| **Timeline Intelligence** | Master Timeline built from draft state; absolute timestamps unify preview and export clocks. |
| **Renderer** | Browser-side canvas compositing produces frame-accurate video synced to Master Timeline. |
| **Export** | FFmpeg.wasm and MediaRecorder mux narration, background music, and video into WebM or MP4. |

**Audio-first production:** narration exists and is measured before scene generation, so visual timing follows speech.

Creator-facing stages: [Story Creation Pipeline](#story-creation-pipeline) · Product overview: [README.md](./README.md#story-creation-pipeline)

---

## Intelligence Runtime

Research and reasoning are isolated in a dedicated runtime between the user brief and script generation.

```
User Brief
  ↓
Intent Engine
  ↓
Entity Resolver
  ↓
Competition Resolver
  ↓
Query Orchestrator
  ↓
Provider Registry
  ↓
  ├── API Football
  ├── Static Knowledge
  └── Future Providers
  ↓
Canonical Research Bundle
  ↓
Knowledge Graph
  ↓
Graph Context
  ↓
Prompt Intelligence
  ↓
OpenAI
```

| Component | Purpose |
|-----------|---------|
| **User Brief** | Normalized creator input: topic, story mode, tone, duration, optional manual context. |
| **Intent Engine** | Determines story type (match preview, ranking, player focus, opinion, etc.). |
| **Entity Resolver** | Identifies players, teams, and competitions; resolves ambiguous names where possible. |
| **Competition Resolver** | Maps competitions and seasons to stable provider identifiers. |
| **Query Orchestrator** | Plans research calls, execution order, and fallbacks with diagnostics. |
| **Provider Registry** | Abstract routing to backends; handles failures without coupling to one API. |
| **API Football** | Live fixtures, statistics, rankings, player data, and match events. |
| **Static Knowledge** | Curated fallback when live calls fail or return sparse results. |
| **Future Providers** | Extension point for additional backends without changing upstream layers. |
| **Canonical Research Bundle** | Normalized merge of provider results — facts, entities, rankings, warnings, provenance. |
| **Knowledge Graph** | Nodes (entities, facts), edges (relationships), confidence-weighted provenance. |
| **Graph Context** | Mode-aware assembly: ranked facts, verified facts, entities, grounding rules, warnings. |
| **Prompt Intelligence** | Narrative plan, fact selection per beat, length/style rules, production prompt text. Falls back to Graph Context prompt text when needed. |
| **OpenAI** | Final narration script from Prompt Intelligence output. |

The runtime is **layered**: upstream layers do not format LLM prompts; downstream layers do not call providers directly.

Shipped in [2.5.0](./CHANGELOG.md#250): Knowledge Graph, Graph Context, Prompt Intelligence, Provider Registry, Canonical Research Pipeline, Research Preview.

---

## Story Creation Pipeline

The creator-facing product flow. Draft state advances as each step completes.

```
Create
  ↓
Review
  ↓
Voiceover
  ↓
Scene Generation
  ↓
Editor
  ↓
Preview
  ↓
Export
```

| Stage | Description |
|-------|-------------|
| **Create** | Brief entry, story mode, optional Smart Research and Research Preview. Starts Intelligence Runtime when research is enabled. |
| **Review** | Edit title and narration; confirm before audio production. |
| **Voiceover** | TTS from reviewed script; audio and measured duration persist on the draft. |
| **Scene Generation** | Scenes, captions, transitions, and per-scene timing against measured narration. |
| **Editor** | Timeline editing — images (pan, zoom, Ken Burns), captions, transitions, voice settings, background music. |
| **Preview** | Live 9:16 playback with synchronized subtitles and mixed audio. |
| **Export** | Final render and download; no server video encoding. |

Incomplete drafts open on **Review**; editor-ready drafts open on **Editor**. Drafts persist in **browser localStorage** (offline-first; no cloud sync or authentication today).

---

## Timeline Intelligence Runtime

Preview and export no longer maintain separate timing logic. A **Master Timeline** is built from the draft, optimized for safe render spans, and consumed by both playback and export frame loops.

```
FootieScript
  ↓
buildMasterTimeline()
  ↓
optimizeMasterTimeline()
  ↓
MasterTimeline (absolute timestamps)
  ↓
  ├── Scene track
  ├── Subtitle track
  ├── Caption-animation track
  ├── Image-motion track
  ├── Transition track
  └── Audio track
  ↓
Preview clock · Export frame loop · FFmpeg mux duration
```

| Component | Purpose |
|-----------|---------|
| **Master Timeline** | Single canonical clock; every timed event uses `startMs` / `endMs` on one axis. |
| **Absolute timestamp model** | Scene, subtitle, animation, motion, transition, and audio events share one master clock. |
| **Shared preview/export timing** | `resolveTimelineSceneFrame` and related helpers return identical state at the same `timeMs`. |
| **Render duration authority** | `renderDurationMs` is the export and mux span — max of content lanes plus end buffer. |
| **Subtitle completion guard** | Optimizer extends render span so final subtitle lines complete with readable hold. |
| **Caption animation scheduler** | Fade-up, highlight, and typewriter progress derived from caption-animation track events. |
| **Typewriter timing** | Reveal paced by `availableDurationMs / characterCount`; accelerates when windows are tight. |
| **Image motion scheduler** | Pan-left, pan-right, zoom, and legacy Ken Burns map to image-motion track events. |
| **Transition scheduler** | Outgoing-scene tail overlays; duration clamped to a safe fraction of scene length. |
| **Timeline optimizer** | Safe pre-render pass — clamps animation/transition tails, flags dense subtitles and short scenes. |
| **Drift correction** | Export preflight refits scene durations to voiceover; optimizer preserves narration/audio alignment. |
| **WebM/MP4 export sync** | Frame loop and FFmpeg mux use Master Timeline `renderDurationMs`; voiceover stays primary authority. |

**Pipeline integration:**

```
buildMasterTimeline(script, { mode })
  → optimizeMasterTimeline()
  → preview playback | export preflight | canvas frame loop | FFmpeg mux
```

Preview mode respects editor scene timing unless voiceover refit is requested. Export mode refits scenes to measured voiceover when valid. Development builds expose timeline diagnostics (authority, lane spans, optimizer findings, drift warnings).

Shipped in [2.6.0](./CHANGELOG.md#260).

---

## Rendering Pipeline

All video output is produced client-side through the Timeline Intelligence Runtime.

```
FootieScript
  ↓
Master Timeline (build + optimize)
  ↓
Canvas (per-frame resolve)
  ↓
Browser Rendering
  ↓
FFmpeg.wasm
  ↓
WebM / MP4
```

| Stage | Description |
|-------|-------------|
| **Master Timeline** | Built and optimized from draft state; authoritative render duration and event lookup. |
| **Canvas** | HTML5 Canvas 2D per frame: background, scene image (with motion), captions, transitions, FootieBitz watermark. |
| **Browser Rendering** | Frame loop indexed by Master Timeline `timeMs`; MediaRecorder captures canvas for WebM. |
| **FFmpeg.wasm** | Client-side mux — video stream plus mixed voiceover and background music at timeline render duration. |
| **WebM / MP4** | WebM stream-copy fast path; MP4 H.264/AAC encode; both aligned to the same render span. |

**Audio synchronization** uses the Web Audio API in preview and an audio-mix pipeline in export. Subtitles, caption animations, image motion, and transitions resolve from Master Timeline events — preview and export read the same clock.

---

## Core Design Principles

| Principle | Summary |
|-----------|---------|
| **Modular architecture** | Features grouped by creator workflow and intelligence concern; typed contracts between modules. |
| **Single source of truth** | One draft document for title, narration, scenes, voiceover, and export settings; Master Timeline unifies preview and export timing. |
| **Shared render clock** | Absolute timestamps on Master Timeline eliminate preview/export drift for subtitles, motion, and transitions. |
| **Layered intelligence** | Bundle → Knowledge Graph → Graph Context → Prompt Intelligence → OpenAI; no layer skips ahead. |
| **Provider abstraction** | Provider Registry decouples orchestration from API Football, Static Knowledge, and future backends. |
| **Extensible storytelling modes** | Story modes drive intent, research planning, narrative structure, and beat templates. |
| **Offline-first editing** | After generation, editing, preview, and export work without network calls; drafts in localStorage. |
| **Browser-first rendering** | Canvas + FFmpeg.wasm + MediaRecorder; Master Timeline aligns preview playback and export frame loops. |

---

## Future Evolution

Planned layers (see [ROADMAP.md](./ROADMAP.md)):

| Initiative | Role |
|------------|------|
| **Script Validator** | Post-generation fact verification, claim extraction, and confidence scoring before voiceover. |
| **Scene Intelligence** | Beat-aware visual selection, caption density, and transition rationale tied to research. |
| **Media Intelligence** | Asset-aware image, motion, and style recommendations between scene generation and the editor. |
| **Story Intelligence Engine** | Unified cross-stage story planning above today's runtime. |

Football is the first knowledge domain. The Intelligence Runtime is domain-agnostic — future verticals plug in at provider and narrative-strategy layers without replacing the Story Creation Pipeline or Rendering Pipeline.

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Product overview, features, getting started |
| [ROADMAP.md](./ROADMAP.md) | Completed, in-progress, and planned work |
| [CHANGELOG.md](./CHANGELOG.md) | Release history |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Route-level implementation reference |
| [docs/GENERATION.md](./docs/GENERATION.md) | Script, voiceover, and scene generation |
| [docs/EDITING.md](./docs/EDITING.md) | Timeline and editor behavior |
| [docs/RENDERING.md](./docs/RENDERING.md) | Preview and export mechanics |
