# Studio UX 2.0

**ShortForge Studio — Presentation Layer Architecture**

Phase 0 design document. Defines the next-generation Studio UX before any UI implementation. **Documentation only** — no application code, runtime, or persistence changes.

Release track: **Studio UX 2.0** (parallel to product v2.6.0+ Timeline Intelligence Runtime)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Design Philosophy](#2-design-philosophy)
3. [Information Architecture](#3-information-architecture)
4. [Workflow](#4-workflow)
5. [Navigation Model](#5-navigation-model)
6. [Panel Hierarchy](#6-panel-hierarchy)
7. [Preview Philosophy](#7-preview-philosophy)
8. [Inspector Philosophy](#8-inspector-philosophy)
9. [Timeline Philosophy](#9-timeline-philosophy)
10. [Interaction Model](#10-interaction-model)
11. [Future Extensibility](#11-future-extensibility)

---

## 1. Product Vision

ShortForge Studio should feel like opening **CapCut** or **Figma** — a professional creative environment — not filling out a multi-step admin form.

Creators arrive with an idea, receive a research-backed first draft from AI, then **refine visually**: scrub the preview, tap a scene, adjust caption and motion, export. The product disappears; the short stays center stage.

**Vision statement:** *One studio, one timeline, one preview — every edit visible immediately.*

### What changes in UX 2.0

| Today | UX 2.0 |
|-------|--------|
| Scroll-heavy editor page | Fixed shell: canvas + timeline + inspector |
| Preview in sidebar | Preview as primary canvas |
| Settings embedded in timeline cards | Selection-driven inspector |
| Export section at page bottom | Export drawer from header |
| Form-like Create page | Focused brief canvas |
| Step labels everywhere | Spatial layout implies stage |

### What does not change

All runtimes remain frozen (see [Scope Lock](#scope-lock)). UX 2.0 is a **presentation shell** around existing `FootieScript`, draft hooks, preview, and export pipelines.

---

## 2. Design Philosophy

Inspired by Figma, CapCut, Canva, Linear, and Arc — **not** dashboards or developer tools.

| Principle | Studio expression |
|-----------|-------------------|
| Preview-first editing | 9:16 canvas is the largest element in Editor |
| Context-aware inspector | Right panel reflects selection |
| Progressive disclosure | Research dev tools, export advanced options collapsed |
| Minimal cognitive load | Remove redundant headings and scroll-hunt |
| Editing studio mentality | Post-Create = refinement, not submission |
| Large visual workspace | Collapse footer; compact header |
| One primary action per screen | Single dominant CTA per route |
| AI first draft; creator refines | Fast path from generation to Editor |

Full principle definitions: [Studio-Principles.md](./Studio-Principles.md)

---

## 3. Information Architecture

```
ShortForge Studio
├── Landing (/)
├── Create (/create)
├── Review (/create/review/[draftId])
├── Editor (/editor/[draftId])     ← Studio shell (UX 2.0 focus)
├── Drafts (/drafts)
└── API (unchanged)
```

### Content types by stage

| Stage | Primary object | Secondary objects |
|-------|----------------|-------------------|
| Landing | Marketing narrative | CTA → Create |
| Create | Brief | Research preview, sample topics |
| Review | Script (title + narration) | Brief metadata, voice settings |
| Editor | Draft / FootieScript | Scenes, transitions, audio, export settings |
| Drafts | Draft summaries | Open → Review or Editor |

### Mental model

Creators think in **projects (drafts)**, not routes. Routes are implementation; navigation shows project title and stage-appropriate actions.

---

## 4. Workflow

Canonical creator path (pipeline stages unchanged):

```
Create
  ↓
Review
  ↓
Editor
  ↓
Export
```

| Stage | User goal | UX 2.0 focus |
|-------|-----------|--------------|
| **Create** | Describe the short; optionally preview research | Single-column brief canvas; one Generate CTA |
| **Review** | Edit script; confirm before audio cost | Script canvas + brief inspector; Continue CTA |
| **Editor** | Refine scenes, timing, visuals, audio | Full studio shell — preview, timeline, inspector |
| **Export** | Download WebM/MP4 | Drawer/mode in Editor — not a separate page |

Voiceover and scene generation remain **between Review and Editor** (existing pipeline). UX 2.0 improves loading and progress presentation only — no API changes.

### Draft routing (unchanged logic)

| Draft state | Opens to |
|-------------|----------|
| Script not confirmed | Review |
| Editor-ready | Editor |

---

## 5. Navigation Model

### Global navigation

| Element | Visibility | Behavior |
|---------|------------|----------|
| Brand / Home | Always | → Landing |
| Drafts | Create, Review, Drafts list | → `/drafts` |
| Write Story | Landing, Drafts empty | → `/create` |
| Project title | Review, Editor | Truncated; click → rename in inspector (future) |
| Save status | Editor | Autosave indicator; manual save optional |
| Export | Editor | Opens export drawer |

Primary nav links (`PRIMARY_NAV_LINKS`) collapse on Editor — **focus mode** hides marketing nav.

### In-editor navigation

| Action | Mechanism |
|--------|-----------|
| Select scene | Sidebar list or timeline chip |
| Scrub time | Preview transport → updates scene selection |
| Edit property | Inspector fields → patch `FootieScript` |
| Switch audio | Inspector project section or tab (tablet) |
| Export | Header button → inspector shows `ExportPanel` |

No route change for export. No scroll anchors (`#studio-export` retired in UX 2.0).

### Mobile navigation

Sticky bottom bar: **Timeline · Preview · Export** (evolution of current `StoryWorkspace` mobile bar). Inspector via sheet.

---

## 6. Panel Hierarchy

Priority order (highest = most visual weight):

```
1. Canvas (Preview)
2. Timeline
3. Inspector
4. Sidebar (scene list)
5. Header
6. Footer (hidden in Editor)
```

### Editor panel responsibilities

| Panel | Owns | Does not own |
|-------|------|--------------|
| **Canvas** | `VideoPreview`, transport, device frame | Export logic, scene CRUD |
| **Timeline** | Scene order, selection, duration display, transition markers | Inline caption editors (move to inspector) |
| **Inspector** | Scene props, voice, music, export when invoked | Preview rendering |
| **Sidebar** | Scene thumbnails, quick jump | Duplicate full `SceneCard` forms |
| **Header** | Global actions, project context | Per-scene fields |

Wireframes: [Studio-Layout.md](./Studio-Layout.md)

---

## 7. Preview Philosophy

The preview is **the source of truth for creator perception** — it already uses Master Timeline authority (v2.6.0). UX 2.0 changes **size and placement**, not playback logic.

### Rules

1. **Always mounted** in Editor — never lazy-loaded behind a tab.
2. **Transport on canvas** — play/pause, scrubber, time readout attached to frame.
3. **Selection sync** — selecting a scene seeks preview to scene start (optional preference).
4. **No duplicate preview** — one `VideoPreview` instance per editor session.
5. **Caption overlays stay internal** — `PreviewFrame`, `SubtitleOverlay` unchanged; shell resizes container.

### Preview vs export

Creators trust “what I see is what I export.” Copy should say **Preview matches export** — backed by shared Master Timeline (runtime frozen).

Dev-only `TimelineDeveloperView` moves to a debug menu — not default inspector content.

---

## 8. Inspector Philosophy

Inspector = **properties panel**, not a settings app.

### Selection states

| Selection | Inspector shows |
|-----------|-----------------|
| Nothing / project | Title, narration link, voice, music summary |
| Scene | Caption mode, subtitle text/effect, image, motion, duration |
| Transition | Effect, duration (between scenes) |
| Export mode (header) | `ExportPanel` — format, quality, progress |

### Composition strategy

Wrap existing controls — do **not** rewrite:

- `SceneImageInspector`, `CaptionModeControl`, `SubtitleEffectControl` → inspector sections
- `ProjectAudioStudio` (`ProjectAudioVoiceoverSection`, `ProjectAudioBackgroundMusicSection`) → project inspector
- `VoiceSettingsCard` → review flow only
- `ExportPanel` → export mode content

Remove duplicate headings (`WorkspacePanel` step labels) when inspector provides context.

### Progressive disclosure

| Tier | Content |
|------|---------|
| Default | Scene caption, image thumbnail, duration |
| Expanded | Motion presets, subtitle effect, fit/fill |
| Advanced | Export codec details, research dev (Create only) |

---

## 9. Timeline Philosophy

Timeline = **temporal navigation**, inspired by CapCut / NLE bottom rails.

### Today

`TimelineEditor` renders vertical `SceneCard` + `TransitionCard` stack with inline editors — functional but scroll-heavy.

### UX 2.0

| Aspect | Target |
|--------|--------|
| Orientation | Horizontal bottom rail (desktop/laptop); vertical list in sidebar |
| Scene representation | Compact chip: thumbnail, index, duration bar |
| Transitions | Small icon between chips — click opens inspector |
| Selection | Highlight chip; inspector updates |
| Add scene | `+` at rail end — same `createEmptyScene` path |
| Reorder | Drag on rail (future) or keep move buttons initially |

`SceneCard` **logic stays** — split into `SceneTimelineChip` (visual) + inspector (editing). Prefer composition over rewrite.

---

## 10. Interaction Model

### Input → outcome (presentation only)

```
User action          →  Existing hook/helper        →  UI update
─────────────────────────────────────────────────────────────────
Select scene         →  onSelectedSceneChange       →  Inspector + preview
Edit caption         →  applySceneUpdate            →  Preview refresh
Change image motion  →  applySceneImageSettings     →  Preview refresh
Apply voice          →  applyVoiceoverChanges       →  Timeline durations
Export               →  ExportPanel handlers        →  Progress in drawer
Autosave             →  useEditorStoryDocument      →  Header status
```

No new state machines. `StoryDocumentStore` and draft hooks remain authoritative.

### Feedback patterns

| Event | Pattern |
|-------|---------|
| Saving | Header dot + “Saved” |
| Save failed | Header amber banner (existing `persistWarning`) |
| Generating | Full-screen or canvas overlay loading |
| Exporting | Progress bar in export drawer |
| Voice mismatch | Inline callout in inspector voice section |

### Focus mode

Optional Editor chrome reduction: hide sidebar until hover (Arc-style). Phase 2+ — document only in Phase 0.

---

## 11. Future Extensibility

UX 2.0 shell designed for additive features **without runtime changes**:

| Future feature | Shell hook |
|----------------|------------|
| Script Validator | Review inspector panel |
| Scene Intelligence | Post-generation suggestion rail |
| Media Intelligence | Inspector image recommendations |
| Keyboard shortcuts | `StudioShell` command palette slot |
| Collaborative editing | Header presence avatars |
| Multi-domain stories | Create brief mode picker (existing) |
| Plugin panels | Inspector tab extension point |

### Extension points (Phase 1 targets)

```typescript
// Conceptual — not implemented in Phase 0
StudioShell
  ├── slots.headerActions
  ├── slots.inspectorSections: { id, when, render }
  ├── slots.timelineOverlay
  └── slots.canvasFooter
```

Slots accept React nodes; frozen components passed as children.

---

## Scope Lock

**Do not modify** in UX 2.0 phases unless explicitly scoped elsewhere:

- Story Intelligence Runtime, Timeline Intelligence Runtime
- Knowledge Graph, Graph Context, Prompt Intelligence, Research Runtime
- Draft System, StoryDocumentStore, autosave
- Preview Runtime, Export Runtime, Voice Generation, Scene Generation
- Timeline / Animation / Motion / Transition schedulers, Render Authority
- API routes, pipeline stages, persistence

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Studio-Layout.md](./Studio-Layout.md) | Breakpoints and wireframes |
| [Studio-Principles.md](./Studio-Principles.md) | UX principles |
| [Component-Migration-Plan.md](./Component-Migration-Plan.md) | Migration mapping |
| [../EDITING.md](../EDITING.md) | Current editor behavior |
| [../../architecture/ARCHITECTURE.md](../../architecture/ARCHITECTURE.md) | System architecture |
