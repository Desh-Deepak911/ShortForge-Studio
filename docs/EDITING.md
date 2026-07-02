# Editing

The Editing layer is where creators refine AI output after generation. Every change is a **local, immediate mutation** of `FootieScript` in React state — no server round-trip, no automatic re-generation.

**Entry point:** `StoryWorkspace` → `StudioShell`  
**Timeline:** `StudioTimeline` (`src/features/timeline-editor/`)  
**Inspector:** `StudioSceneInspector` via `InspectorResolver`  
**State layer:** `src/lib/utils/voiceover.ts`  
**Selection:** `src/features/editor/selection/`

---

## Studio layout (Studio UX 2.1+)

`StoryWorkspace` wraps the editor in `EditorSelectionProvider` and `StudioShell`:

| Region | Component | Editable content |
|--------|-----------|------------------|
| Header | `EditorStudioHeader` | Save Draft, Export |
| Sidebar | `EditorProjectSidebar` | Scene list, quick jump |
| Canvas | `VideoPreview` + `StudioContextRibbon` | Preview; fit/fill/reset/replace when image selected |
| Inspector | `InspectorResolver` → `StudioSceneInspector` | Scene duration, type, captions, image, motion, transitions |
| Project panel | `EditorProjectInspector` | Project Audio Studio, title, narration (`StoryReview`) |
| Timeline | `StudioTimeline` | Scene rail, reorder, playhead, context menu |
| Export | `ExportDrawer` → `ExportPanel` | Quality, audio mode, download |

The legacy vertical `TimelineEditor` / `SceneCard` stack has been removed. All production scene editing flows through the shell layout above.

---

## Selection Engine

`EditorSelectionProvider` coordinates focus across sidebar, timeline, preview, ribbon, and inspector:

- **Scene selection** — sidebar row or timeline block updates `selectedSceneIndex`
- **Image edit mode** — canvas drag on `EditorCanvasEditLayer` when idle (not during playback/export)
- **Ribbon context** — `ImageRibbonContext` when selected scene has an image
- **Playback lock** — preview/export blocks canvas edits

Inspectors resolve from selection via `InspectorRegistry` (`InspectorResolver`).

---

## Editor philosophy

ShortForge Studio treats the generated story as a **first draft**. The editor's job is to make everything refinable without surprise overwrites.

### Everything editable

After generation, creators can change:

- Story title and full narration text
- Scene order, count, type, and duration
- Per-scene captions, subtitle copy, caption mode, and effects
- Uploaded images — position, zoom, fit/fill, Ken Burns motion
- Transitions between scenes
- Voice and speed settings

No field is locked behind re-generation except what inherently requires new audio (see below).

### No regeneration unless explicitly requested

Editing never calls OpenAI. The only paths that hit the server after initial generation are:

| Action | Trigger | API |
|--------|---------|-----|
| Regenerate voiceover | User clicks **Generate / Regenerate voiceover** in `ProjectAudioVoiceoverSection` | `POST /api/generate-voiceover` |
| Create new story | User submits a new brief in `CreateStoryFlow` | `POST /api/generate-script` |

Scene edits, image uploads, caption changes, duration tweaks, and transition updates are **pure client-side** state updates.

### User changes should never overwrite existing edits

State helpers are designed to merge patches, not replace whole stories:

- **`applySceneUpdate()`** — patches one scene; recalculates timings; does not touch narration or voiceover
- **`applySceneImageSettings()`** — patches transform fields only; URL unchanged
- **`applyTransitionUpdate()`** — patches transition metadata only
- **`applyStoryVoiceSettings()`** — updates voice/speed prefs **without** regenerating audio
- **`syncFootieScript(next, previous)`** — normalization pass that uses `previous` to preserve user subtitle text, skip unnecessary narration excerpt re-sync, and keep transition-only edits intact

When narration text changes, `applyStoryUpdate()` clears the stale voiceover blob (audio no longer matches copy) but **does not** auto-regenerate — the user must click **Regenerate voiceover** in Project Audio Studio.

When voiceover is explicitly regenerated, `applyVoiceoverChanges()` refits scene **timings** proportionally but preserves scene content, captions, images, and transitions.

```mermaid
flowchart LR
  Edit[User edit] --> Patch[apply*Update helpers]
  Patch --> Sync[syncFootieScript with previous]
  Sync --> State[FootieScript in React]
  State --> Preview[VideoPreview]
  State --> Export[ExportPanel]

  Regen[Generate / Regenerate voiceover] --> API[/api/generate-voiceover]
  API --> Refit[refitScenesToVoiceoverDuration]
  Refit --> Sync
```

---

## Scene editing

### Purpose

Adjust the production timeline structure: which scenes exist, in what order, and what type they are.

### Operations

Implemented in `timeline.utils.ts` and `timeline-editor.commands.ts`, wired through `StudioTimeline`:

| Action | Behavior |
|--------|----------|
| **Select scene** | Sidebar or timeline block → selection sync |
| **Reorder** | Drag scene blocks on timeline rail |
| **Add scene** | Context menu — blank scene (3s default) |
| **Duplicate** | Context menu — clones scene including image settings |
| **Delete** | Context menu — removes scene; syncs timeline items |
| **Add transition** | Via scene inspector `TransitionCard` |
| **Scene type** | Select in `StudioSceneInspector` |

### State helper

`applyScenesUpdate()` replaces the full scene list and rebuilds timeline items. Individual patches use `applySceneUpdate()`.

---

## Image editing

### Purpose

Replace AI placeholders with creator-provided visuals and control how each image appears in the 9:16 frame.

### Upload

| Detail | Value |
|--------|-------|
| Component | `MediaPicker` in `StudioSceneInspector`; ribbon **Replace** |
| Formats | PNG, JPG, WEBP |
| Storage | `SceneImage.url` as client `blob:` URL |
| Remove | Clears image; placeholder returns |

Legacy `uploadedImage` string URLs migrate to `SceneImage` on `syncFootieScript()`.

### Image position

Drag to pan inside the frame. Stored as normalized `SceneImage.x` and `SceneImage.y`.

- Editor: `EditorCanvasEditLayer` on `VideoPreview` — mouse and touch drag
- Selecting a scene activates that scene in preview
- Draw: `drawSceneImageInFrame()` — shared by preview and export

### Image zoom

Manual scale multiplier on `SceneImage.scale`.

- Range: **0.5× – 3×** (`MIN_SCENE_IMAGE_SCALE`, `MAX_SCENE_IMAGE_SCALE`)
- UI: context ribbon and inspector image controls
- **Reset** restores default transform via `applyResetSceneImageSettings()`

### Fit / Fill

`SceneImage.fitMode` controls letterbox vs cover:

| Mode | Behavior |
|------|----------|
| `fit` | Full image visible; may letterbox |
| `fill` | Image covers frame; may crop edges |

Toggle in **Context Ribbon** (`ImageRibbonContext`) or scene inspector. Default when omitted: **fill**.

### Smart Edit (external handoff)

For advanced image work, `SmartEditImageAction` opens the external Smart Edit tool with scene context. The creator returns via the normal upload/replace flow — there is no in-app pixel editor.

### State helpers

- `applySceneImageSettings()` — pan, zoom, fit, motion patches
- `applyResetSceneImageSettings()` — one-click reset

Image edits never trigger AI or affect narration.

---

## Subtitle editing

### Purpose

Control what text appears on screen and how it is timed within each scene.

Two distinct editing surfaces depending on caption mode (see [Caption modes](#caption-modes)).

### Subtitles mode (`captionMode: "subtitles"`)

| Field | Editor | Notes |
|-------|--------|-------|
| `subtitleText` | Textarea in `StudioSceneInspector` | Editable on-screen copy |
| `subtitleEffect` | `SubtitleEffectControl` | fade-up, typewriter, highlight |

**Chunking:** `splitSubtitleChunks()` breaks text into timed phrases (~5 words / 34 chars max). Chunks divide scene duration evenly. One chunk visible at a time.

**Default seed:** Switching to subtitles mode seeds `subtitleText` from the scene narration excerpt if empty (`mergeSubtitleTextOnSubtitlesModeSwitch`). Existing user text is never overwritten.

### Generated mode (`captionMode: "generated"`)

| Field | Editor | Notes |
|-------|--------|-------|
| `subtitle` | Textarea in `StudioSceneInspector` | Static caption for full scene |

No chunk timing — caption displays for the entire scene duration.

### Subtitle effects

Apply in subtitles mode (and stylistically in generated mode):

| Effect | Behavior |
|--------|----------|
| **fade-up** | Opacity + upward motion at chunk start (default) |
| **typewriter** | Progressive character reveal |
| **highlight** | Animated highlight bar + pill per line |

Preview: `subtitleEffectPreview.tsx`, `SubtitleOverlay.tsx`  
Export: `export-caption-canvas.utils.ts`

Max **3 visible lines**, **90% frame width** when wrapped.

### What subtitle editing does not do

- No manual chunk boundary editor — algorithm splits automatically
- No word-level sync to audio waveform
- Editing `subtitleText` does not change story `narration` or voiceover MP3

---

## Voice settings

### Purpose

Choose narrator voice and speed. Changes to preferences are stored immediately; audio regeneration is a separate explicit step.

### Editor controls

`ProjectAudioStudio` → **`ProjectAudioVoiceoverSection`** in `EditorProjectInspector` — story-level, not per-scene:

| Setting | Options | Storage |
|---------|---------|---------|
| Voice | alloy, echo, fable, onyx, nova, shimmer | `FootieScript.voiceSettings.voice` |
| Speed | 0.75×, 0.9×, 1.0×, 1.1×, 1.25×, 1.4× | `FootieScript.voiceSettings.speed` |

Changing voice or speed updates prefs via `applyStoryVoiceSettings()` — **no API call**.

### Regenerate voiceover (explicit)

The **Generate / Regenerate voiceover** button calls `useStoryVoiceoverApply` → `POST /api/generate-voiceover`.

On success, `applyVoiceoverChanges()`:

1. Replaces `voiceoverUrl` and `voiceoverDurationMs`
2. Calls `refitScenesToVoiceoverDuration()` — proportional timing redistribution
3. Preserves scene content, captions, images, and transitions

On failure, state rolls back to the pre-request baseline (`restoreVoiceoverBaseline`).

Preview playback uses the canvas **Play** button — no native browser audio controls in the inspector.

### Audio Mixer v1

**Project Audio Studio** includes an **Audio Mixer** panel (between Background Music and Export Mix):

| Control | Range | Storage |
|---------|-------|---------|
| Voice Volume | 0–200% | `audioMixer.voice.volume` |
| Music Volume | 0–200% | `audioMixer.music.volume` (falls back to `backgroundMusic.volume`) |
| Master Volume | 0–200% | `audioMixer.master.volume` |
| Enable Ducking | on/off | `audioMixer.music.duckingEnabled` |
| Ducking Strength | 0–100% | `audioMixer.music.duckingStrength` |
| Peak Protection | on/off | `audioMixer.master.peakProtection` |

`audioMixer` is written to the story **only after the first adjustment**. Legacy drafts without the field resolve defaults and play unchanged.

Mixer changes update preview immediately and persist on save. They do **not** regenerate voiceover, restart export, or alter captions.

Deep dive: [AUDIO_MIXER.md](./AUDIO_MIXER.md)

### Review flow

`VoiceSettingsCard` in `ReviewInspector` still owns **Create / Update Narration** (Apply Changes) before the user enters the editor.

### Narration text changes

Editing narration in `StoryReview` clears the stale voiceover blob (`applyStoryUpdate` → `narrationNeedsRefresh`) but does **not** auto-regenerate. Regenerate from Project Audio Studio when ready.

---

## Scene timing

### Purpose

Control how long each scene's visuals and captions appear on screen.

### Manual duration editing

| Detail | Value |
|--------|-------|
| UI | Number input in `StudioSceneInspector` |
| Range | 1–20 seconds |
| Fields set | `duration`, `durationMs`, `durationSource: "manual"` |
| Recalculation | `recalculateSceneTimings()` — cumulative `startMs` / `endMs` |
| Total | Story `totalDuration` = sum of scene durations |

### Initial timing (from generation)

Audio-first stories arrive with durations fitted to measured voiceover length via `attachEvenVoiceoverTiming()` — even split across scenes, `durationSource: "voiceover"`.

### Visual vs audio timing

Manual duration edits change **visual pacing only**. The voiceover MP3 is not re-stretched. During preview, narration plays at natural length while scene boundaries are visual. Export video length follows scene timing; FFmpeg muxes the narration track separately.

---

## Caption modes

### Purpose

Per-scene switch between static AI captions and narration-derived timed subtitles.

### Modes

| Mode | Value | On-screen source | Timing |
|------|-------|------------------|--------|
| **Generated** | `generated` | AI `subtitle` field | Static — full scene |
| **Subtitles** | `subtitles` | `subtitleText` | Timed chunks across scene |

Toggle: `CaptionModeControl` in `StudioSceneInspector`.  
Default for new/legacy stories: **generated**.

---

## Transitions

### Purpose

Add visual effects between scenes during the outgoing scene's final moments.

### Editor model

Transition metadata edited via `TransitionCard` in the scene inspector; markers shown on `StudioTimeline`.

| Property | Options / behaviour |
|----------|---------------------|
| `effect` | cut, fade, slide-left, slide-right, zoom-in, zoom-out, blur |
| `durationMs` | 300, 500, 800, 1000 ms presets |
| Cap | ≤ 40% of outgoing scene duration |
| Default | fade, 500 ms |

### Render model

Transitions are **tail overlays** on the outgoing scene only:

- Do not extend total timeline duration
- Captions hidden during active overlay
- Shared resolver: `resolveSceneTransitionOverlay()`

### State helper

`applyTransitionUpdate()` — patches effect/duration only; never modifies scenes or voiceover.

---

## Ken Burns (image motion)

### Purpose

Add slow zoom motion during scene playback on top of manual pan/zoom — documentary-style drift.

### Settings

Stored on `SceneImage.imageMotion`:

| Field | Options |
|-------|---------|
| `type` | `none`, `zoom-in`, `zoom-out` |
| `intensity` | `subtle` (→1.05×), `medium` (→1.10×), `strong` (→1.16×) |

UI: `MotionPanel` / `SceneImageMotionControl` in scene inspector (visible when scene has an image).

### Behaviour

- Progress: linear 0→1 over scene duration (Master Timeline image-motion track)
- Scale: multiplied on top of manual zoom
- Applied in preview (`PreviewFrame`) and export (`video-render.service.ts`)
- Default when omitted: **none** / **subtle**

---

## Current UX decisions

### Shell-first layout

Sidebar for navigation, canvas for preview, inspector for properties, timeline rail for structure — replaces the long vertical scene-card scroll.

### Scene activation syncs preview

Selecting a scene in the sidebar or timeline updates preview context. Canvas edit applies to the active scene image.

### Visual layer separated from narration

Scenes control **when** images and captions appear. They do not edit the narration script.

### Voice prefs vs voice audio

Voice and speed selectors apply immediately to **preferences**. Audio file replacement requires an explicit **Generate / Regenerate voiceover** click in Project Audio Studio.

### Draft persistence

Drafts save to browser localStorage via **Save Draft** in the editor header. Blob URLs may still break after reload until durable media storage ships.

---

## State management reference

| Helper | What it changes | What it preserves |
|--------|-----------------|-------------------|
| `applyStoryUpdate()` | Full story merge + sync | Voiceover if narration unchanged; clears audio if narration changed |
| `applySceneUpdate()` | One scene patch + timing recalc | Narration, voiceover, other scenes |
| `applyScenesUpdate()` | Full scene list | Narration, voiceover (unless explicitly changed) |
| `applySceneImageSettings()` | Image transform | URL, captions, timing content |
| `applyTransitionUpdate()` | Transition effect/duration | All scenes, narration, voiceover |
| `applyStoryVoiceSettings()` | Voice prefs only | Audio file, scenes, captions |
| `applyVoiceoverChanges()` | Audio + proportional timing refit | Scene content, captions, images, transitions |
| `syncFootieScript(next, prev)` | Normalization + timeline sync | User subtitle text, transition-only edits |

All paths flow through draft editor handlers → `applyStoryUpdate`.

---

## File reference

```
src/
├── components/
│   ├── StoryWorkspace.tsx           # Editor orchestration
│   └── studio-shell/                # StudioShell, ContextRibbon, ExportDrawer
├── features/
│   ├── editor/
│   │   ├── selection/               # EditorSelectionProvider
│   │   ├── inspector/               # InspectorRegistry, InspectorResolver
│   │   └── components/
│   │       ├── StudioSceneInspector.tsx
│   │       ├── EditorProjectSidebar.tsx
│   │       ├── EditorCanvasEditLayer.tsx
│   │       ├── MotionPanel.tsx
│   │       └── TransitionCard.tsx
│   └── timeline-editor/
│       └── StudioTimeline.tsx       # Timeline Editor v1
├── lib/utils/
│   └── voiceover.ts                 # All apply* state helpers
└── verification/editor/             # scene-image-qa, smart-edit QA scripts
```

---

## Related documentation

| Document | Contents |
|----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Editing layer in system context |
| [GENERATION.md](./GENERATION.md) | What happens before editing |
| [DATA_MODEL.md](./DATA_MODEL.md) | `FootieScene`, `FootieScript` fields |
| [RENDERING.md](./RENDERING.md) | How edits appear in preview/export |
| [FEATURES.md](./FEATURES.md) | Feature-level status and limitations |
