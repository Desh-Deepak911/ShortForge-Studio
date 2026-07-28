# Studio Principles

ShortForge Studio UX 2.0 design principles. These govern **presentation only** — layout, navigation, panel behavior, and interaction patterns. They do not change runtime pipelines, draft persistence, or business logic.

Reference products: **Figma**, **CapCut**, **Canva**, **Linear**, **Arc Browser**.

Anti-patterns to avoid: form-heavy pages, dashboard grids, admin panels, developer-tool chrome.

---

## Core Principles

### 1. Preview-first editing

The vertical preview is the **primary workspace**, not a sidebar widget. Creators should see their short at full visual weight while editing. Timeline and inspector support the preview — they do not compete with it.

### 2. Context-aware inspector

The right panel (or bottom sheet on tablet) shows **properties of the current selection** — scene, transition, caption, image, or global audio — not a static list of all settings. Empty selection shows project-level context only.

### 3. Progressive disclosure

Show the minimum needed for the current task. Advanced options (export codecs, research diagnostics, timeline dev tools) live behind explicit expansion — never on the default path.

### 4. Minimal cognitive load

One clear primary action per screen. Reduce step labels, duplicate headings, and scroll-to-find patterns. Prefer spatial consistency over explanatory copy.

### 5. Editing studio mentality

Treat every screen after Create as **refinement**, not data entry. AI produces the first draft; the creator adjusts timing, visuals, and copy in a visual environment.

### 6. Large visual workspace

Maximize canvas and preview area on desktop and laptop. Chrome (header, sidebars) stays compact and stable. Content panels scroll internally; the shell does not.

### 7. One primary CTA per screen

| Stage | Primary CTA |
|-------|-------------|
| Create | Generate story |
| Review | Continue to voiceover |
| Editor | Play / preview (implicit: editing is the action) |
| Export | Download video |

Secondary actions (Save, Drafts, Research preview) are visible but visually subordinate.

### 8. AI generates; creator refines

Copy and UX must reinforce: generation is a starting point. No dead-end “submit and wait” flows after the first draft. Editor opens quickly with editable scenes, captions, and timing.

---

## Interaction Principles

### Selection drives inspector

Clicking a scene, transition, or timeline segment updates the inspector **immediately**. Inspector edits apply to the selected object only. No “settings page” for per-scene properties.

### Preview is primary

Playback controls attach to the preview frame. Scrubbing updates selection and inspector context. Preview reflects Master Timeline authority without a separate “preview mode.”

### Context over settings

Prefer inline controls on the selected object (duration chip, caption mode toggle) over global settings pages. Voice and music are **project-level** exceptions — they affect the whole draft.

### Non-destructive editing

Edits merge into `FootieScript` via existing patch helpers. Destructive actions (delete scene, delete draft) require confirmation. Regeneration (voiceover) is always explicit.

### Keyboard-first editing

Future phases should support: scene prev/next, play/pause, delete selection, undo-friendly focus order. Principles apply even before shortcuts ship.

### Accessible controls

Focus rings, aria labels on icon buttons, live regions for save/export status, sufficient contrast on preview overlays. Studio chrome meets WCAG 2.1 AA targets for interactive controls.

---

## Layout Principles

### Consistent spacing

Use a single spacing scale (4px base) across panels. Align to `studioUi` tokens in Phase 1; introduce `StudioShell` spacing variables without changing runtime code.

### Stable shell

Header height, panel widths, and timeline height remain constant across editor sessions. Only panel **content** changes with selection.

### Responsive degradation

Desktop: full three-column studio. Laptop: narrower inspector. Tablet: preview + bottom timeline; inspector as sheet. Mobile: preview-first stack with sticky transport bar (current pattern, refined).

### Frozen runtime boundaries

Preview (`VideoPreview`), export (`ExportPanel`), timeline schedulers, and draft hooks are **wrapped**, not rewritten. UX changes composition and chrome only.

---

## Content Principles

### Plain language

“Short preview” not “VideoPreview component.” “Download” not “Export payload.” Match creator vocabulary (CapCut/Canva), not engineering vocabulary.

### Status without alarm

Autosave, research confidence, and voiceover mismatch use calm inline status — not modal interruptions unless action is required.

### Trust the draft

Drafts autosave. Manual “Save Draft” becomes confirmation of persistence, not the only save path. Header shows last-saved or sync state subtly.

---

## Explicit Non-Goals (Phase 0–1)

These principles do **not** authorize changes to:

- Story Intelligence Runtime, Timeline Intelligence Runtime, research pipelines
- Draft System, StoryDocumentStore, autosave logic
- Preview Runtime, Export Runtime, render authority
- API routes, pipeline stages, voice/scene generation
- Hook internals, provider trees, business rules

Presentation wrappers and layout composition only.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Studio-UX-2.0.md](./Studio-UX-2.0.md) | Vision, IA, workflow, interaction model |
| [Studio-Layout.md](./Studio-Layout.md) | Breakpoints, wireframes, panel roles |
| [Component-Migration-Plan.md](./Component-Migration-Plan.md) | Current → future component mapping |
