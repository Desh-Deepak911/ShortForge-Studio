# Studio Layout

Physical layout specification for ShortForge Studio UX 2.0. Defines panel roles, breakpoints, and ASCII wireframes for **presentation layer only**. No changes to preview/export runtimes or draft persistence.

---

## Layout Vocabulary

| Region | Role |
|--------|------|
| **Header** | Brand, project context, global actions (save status, export, navigation) |
| **Sidebar** | Scene list / project navigation — optional on Create and Review |
| **Canvas** | Primary visual workspace — preview frame (9:16) on Editor; brief/review content elsewhere |
| **Inspector** | Contextual properties for current selection |
| **Timeline** | Horizontal or vertical scene strip — temporal navigation |
| **Footer** | Minimal product meta; hidden or collapsed in Editor focus mode |

---

## Desktop (≥ 1280px)

Full three-column editing studio. Preview dominates center; inspector is persistent.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER  Brand · Project title · Drafts · Save status · Export               │
├──────────┬─────────────────────────────────────────────┬─────────────────────┤
│          │                                             │                     │
│ SIDEBAR  │              CANVAS (Preview)               │    INSPECTOR        │
│          │         ┌─────────────────────┐             │                     │
│ Scene    │         │                     │             │  Selection: Scene 2 │
│ list     │         │    9:16 Preview     │             │  ─────────────────  │
│ (compact │         │    + transport      │             │  Caption mode       │
│  thumbs) │         │                     │             │  Subtitle effect    │
│          │         └─────────────────────┘             │  Image · Motion     │
│          │                                             │  Duration           │
│          │                                             │                     │
├──────────┴─────────────────────────────────────────────┴─────────────────────┤
│ TIMELINE  ◀ Scene 1 │ Scene 2 ■ │ Scene 3 │ + │  transitions as gaps       │
├──────────────────────────────────────────────────────────────────────────────┤
│ FOOTER (minimal — optional collapse in Editor)                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why each panel exists

| Panel | Purpose |
|-------|---------|
| **Header** | Persistent orientation — which project, can I export, is it saved. Never scrolls away. |
| **Sidebar** | Fast scene jumping without losing preview context. Replaces long vertical scroll of `SceneCard` stack. |
| **Canvas** | Preview-first — creators judge timing and visuals here. Transport (play, scrub) lives on canvas. |
| **Inspector** | All per-scene edits in one place driven by selection. Replaces inline expansion in timeline cards. |
| **Timeline** | Temporal structure — order, duration bars, transition markers. CapCut-style bottom rail. |
| **Footer** | Legal/product line on marketing pages; collapsed in Editor to reclaim vertical space. |

### Current → target delta

Today `StoryWorkspace` uses a **two-column scroll page**: main column (story + timeline cards) and aside (preview + export). UX 2.0 **inverts priority**: canvas center, timeline bottom, inspector right, scene list left.

---

## Laptop (1024px – 1279px)

Same topology as desktop; narrower inspector and sidebar.

```
┌────────────────────────────────────────────────────────────────────────┐
│ HEADER  Brand · Title · Export                                         │
├────────┬───────────────────────────────────────────┬───────────────────┤
│ SIDEBAR│           CANVAS (Preview)                │ INSPECTOR (240px) │
│ (200px)│              9:16                         │ collapsed groups  │
├────────┴───────────────────────────────────────────┴───────────────────┤
│ TIMELINE (full width, compact scene chips)                             │
└────────────────────────────────────────────────────────────────────────┘
```

| Adjustment | Reason |
|------------|--------|
| Sidebar 200px | Thumbnails + titles only; inspector details on hover/tooltip |
| Inspector 240–280px | Single column; collapsible sections (Audio, Export) |
| No footer in Editor | Vertical pixels go to canvas + timeline |

---

## Tablet (768px – 1023px)

Preview-first; timeline docked bottom; inspector as overlay sheet.

```
┌──────────────────────────────────────────────┐
│ HEADER  ← Back · Title · Export              │
├──────────────────────────────────────────────┤
│                                              │
│              CANVAS (Preview)                │
│                 9:16 max                     │
│                                              │
├──────────────────────────────────────────────┤
│ TIMELINE  horizontal scroll · scene chips    │
├──────────────────────────────────────────────┤
│ [ Inspector ] [ Audio ] [ Export ]  ← tabs   │
└──────────────────────────────────────────────┘
         │
         ▼  (tap Inspector)
┌──────────────────────────────────────────────┐
│ ▲ Sheet: Scene properties                    │
│   Caption · Image · Motion · Duration        │
└──────────────────────────────────────────────┘
```

### Why each panel exists

| Panel | Purpose |
|-------|---------|
| **Header** | Back to drafts, export — thumb-reachable actions |
| **Canvas** | Only always-visible editing surface |
| **Timeline** | Horizontal strip — familiar from mobile video apps |
| **Tab bar** | Inspector, audio, export share one row — progressive disclosure |
| **Sheet** | Full inspector without shrinking preview |

Maps to refined version of current mobile sticky bar (`Timeline | Preview | Download`).

---

## Create & Review Layouts (all breakpoints)

Create and Review are **wizard-adjacent but not form-wizards** — single focused column, no editor chrome.

### Create (Desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER  Brand · Drafts                                       │
├──────────────────────────────────────────────────────────────┤
│                    CANVAS (Brief)                            │
│         Topic · Mode · Tone · Duration · Research            │
│              [ Generate story ]  ← primary CTA               │
│         Optional: Research preview (collapsed)               │
├──────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
└──────────────────────────────────────────────────────────────┘
```

### Review (Desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER  Brand · Draft title · Continue                       │
├──────────────────────────────────────────────────────────────┤
│  CANVAS (Script)          │  INSPECTOR (Brief summary)      │
│  Title + Narration edit   │  Tone · Duration · Research     │
│                           │  Voice (preview settings)       │
│  [ Continue to voiceover ]│                                 │
└──────────────────────────────────────────────────────────────┘
```

Review keeps **two columns** but canvas = script editing (large textarea), not video preview.

---

## Export Moment

Export is not a separate route — it is a **mode** within Editor:

```
Header: Export button → opens Export drawer (inspector slot or modal)
Canvas: unchanged (still preview)
Timeline: unchanged
Inspector: ExportPanel content (format, quality, progress, download)
```

Avoid scroll-to-export (`#studio-export`) in UX 2.0.

---

## Z-Index & Layer Model

| Layer | Content |
|-------|---------|
| 0 | Canvas background |
| 1 | Preview frame + caption overlays |
| 2 | Timeline |
| 3 | Inspector / sheets |
| 4 | Header |
| 5 | Modals (delete confirm, export progress) |
| 6 | Toasts / save status |

Preview runtime components (`PreviewFrame`, `SubtitleOverlay`) stay at layer 1 — wrappers only adjust container size.

---

## Spacing & Sizing Tokens (target)

| Token | Desktop | Laptop | Tablet |
|-------|---------|--------|--------|
| Header height | 52px | 52px | 48px |
| Sidebar width | 240px | 200px | — |
| Inspector width | 320px | 260px | 100% sheet |
| Timeline height | 120px | 100px | 72px |
| Canvas max width | min(420px, 40vh×9/16) | same | 100% − padding |
| Min touch target | 44px | 44px | 48px |

Implement via new `StudioShell` layout components in Phase 1 — do not alter `VideoPreview` internals.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Studio-UX-2.0.md](./Studio-UX-2.0.md) | Navigation and panel hierarchy |
| [Studio-Principles.md](./Studio-Principles.md) | Design principles |
| [Component-Migration-Plan.md](./Component-Migration-Plan.md) | Component placement |
