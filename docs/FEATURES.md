# Features

Complete reference for every implemented ShortForge Studio feature. Each entry covers **purpose**, **current status**, **known limitations**, and **future improvements**.

For architecture and data flow, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Story Generation

### Purpose

Turn a football topic into a complete documentary short: title, continuous narration, and a timed multi-scene breakdown. Generation uses an **audio-first pipeline** — narration is written first, voiceover is synthesized, then scenes are planned to match the measured audio duration.

### Current status

**Implemented and primary path.**

| Capability | Details |
|------------|---------|
| Input | Topic, tone, duration (15–60s), scene count (3–12), quality mode |
| Tones | Dramatic, funny, tactical, news, emotional |
| Quality modes | Cheap (`gpt-4.1-mini`), Balanced/Best (`gpt-4.1`) |
| Pipeline | Prompt → script → voiceover → scene plan → `FootieScript` |
| Streaming | NDJSON progress (4 steps) when `stream: true` |
| API | `POST /api/generate-script` |
| Services | `audio-first-generation.service.ts`, `script-generation.service.ts`, `scene-planning.service.ts` |
| Prompts | `lib/ai/prompts.ts` |

On success the client receives a normalized `FootieScript` and optionally base64 MP3 for immediate voiceover attachment.

### Known limitations

- Requires `OPENAI_API_KEY` on the server; no offline generation
- API route timeout capped at 120 seconds
- Fallback to legacy single-shot generation if audio-first fails (may produce less accurate timing)
- No regeneration of individual scenes — full story re-generation only via new brief
- Generated content quality varies with model tier and prompt length
- No content moderation layer on topic input

### Future improvements

- Partial scene regeneration (rewrite one scene without full pipeline)
- Topic templates and saved briefs
- Generation retry with degraded scene count
- Visible fallback reason in UI when audio-first fails
- Content safety filters on input/output

---

## Voiceover

### Purpose

Convert the story narration into spoken audio for preview playback and export muxing. Uses OpenAI Text-to-Speech (`tts-1`) to produce MP3 narration.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Auto-generation | Created during audio-first pipeline on initial story create |
| Manual regeneration | `VoiceSettingsCard` → apply via `useStoryVoiceoverApply` |
| Standalone API | `POST /api/generate-voiceover` |
| Storage | `FootieScript.voiceoverUrl` (client blob URL) + `voiceoverDurationMs` |
| Preview | `<audio>` element in `NarrationPanel` and synced preview playback |
| Export | Optional narration track muxed via FFmpeg.wasm |
| Voices | alloy, echo, fable, onyx, nova, shimmer (+ extended set in resolver) |
| Service | `voiceover.service.ts` |

Duration is measured from MP3 bytes when possible; estimated from word count as fallback.

### Known limitations

- Single continuous MP3 for the full narration — not per-scene audio clips
- Max input length 4096 characters per TTS call
- Regenerating voiceover does not automatically re-fit scene durations to new audio length
- Blob URLs are lost on page refresh (no persistence)
- Voice list in UI shows 6 primary options; extended voices accepted but not all listed

### Future improvements

- Per-scene narration clips aligned to scene windows
- "Re-fit scenes to voiceover" after regeneration
- Waveform display and scrubbing in narration panel
- Persist voiceover to IndexedDB or cloud storage
- Multiple narration takes with A/B compare

---

## Voice Speed

### Purpose

Adjust narrator playback speed for the generated voiceover. Faster or slower delivery changes pacing without rewriting the script.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Presets | 0.75×, 0.9×, 1.0×, 1.1×, 1.25×, 1.4× |
| Storage | `FootieScript.voiceSettings.speed` |
| UI | Speed chips in `VoiceSettingsCard` |
| TTS | Speed passed to OpenAI `speech.create` when supported |
| Duration | Adjusted via `voiceover-duration.utils.ts` when speed changes |

Default speed: **1.0×**.

### Known limitations

- Discrete presets only — no free-form slider
- Changing speed requires regenerating voiceover to hear the result
- Scene durations are not automatically recalculated when speed changes (unless user re-runs full generation)
- Speed applied at TTS time; very extreme speeds may affect quality

### Future improvements

- Live speed preview without full regeneration (client-side playback rate)
- Auto re-fit scene durations after speed change
- Fine-grained slider (e.g. 0.8×–1.5×)
- Per-story speed memory across sessions

---

## Scene Editing

### Purpose

Refine the AI-generated production timeline: reorder scenes, change types, edit copy, manage images and transitions, and control per-scene settings.

### Current status

**Implemented.**

| Operation | Location |
|-----------|----------|
| Add scene | `StudioTimeline` — empty scene with 3s default |
| Delete scene | Removes scene + associated transitions |
| Duplicate scene | Clones scene including image settings |
| Move up / down | Reorders list; `recalculateSceneTimings()` |
| Add buffer scene | Quick-insert Intro, Context, Transition, Ending |
| Add transition | Inserts `TransitionTimelineItem` after selected scene |
| Scene type | Intro, Context, Match, Transition, Ending |
| Title & narration | `StoryReview` — story-level copy edit |

UI: `StudioTimeline.tsx`, `StudioSceneInspector.tsx`. State: `src/lib/utils/voiceover.ts` (`applyStoryUpdate`, `applySceneUpdate`).

### Known limitations

- No drag-and-drop reorder — move up/down buttons only
- No scene split or merge
- No undo/redo stack
- Draft JSON persists via Save Draft; blob URLs (images, voiceover) may break after reload
- Transition cards are editor-only metadata — never rendered as on-screen text

### Future improvements

- Drag-and-drop timeline reorder
- Scene split at playhead / merge adjacent scenes
- Undo/redo and version history
- Project save/load
- Bulk operations (apply caption mode to all scenes)

---

## Manual Scene Duration

### Purpose

Let creators control how long each scene appears on screen, independent of the initial AI/voiceover-fit allocation.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Range | 1–20 seconds per scene (`StudioSceneInspector` number input) |
| Fields set | `duration`, `durationMs`, `durationSource: "manual"` |
| Recalculation | `recalculateSceneTimings()` updates cumulative `startMs` / `endMs` |
| Total | Story `totalDuration` = sum of scene durations |

Audio-first stories start with durations fitted to voiceover; manual edits override per scene.

### Known limitations

- Manual duration changes do not re-stretch or re-cut the voiceover MP3
- Visual timeline and audio can drift if total scene duration ≠ voiceover length
- Minimum 1s per scene may feel rushed for subtitle-heavy scenes
- No timeline ruler drag handles — numeric input only

### Future improvements

- "Re-fit all scenes to voiceover" action
- Visual duration handles on timeline
- Warn when total duration diverges significantly from voiceover
- Sub-second precision (ms input)

---

## Subtitle Modes

### Purpose

Control how on-screen text is sourced and timed for each scene: static AI captions vs narration-derived timed subtitles.

### Current status

**Implemented.**

Two modes per scene (`CaptionMode`):

| Mode | Value | Behavior |
|------|-------|----------|
| **Generated** | `generated` | Static AI `subtitle` for full scene duration (default) |
| **Subtitles** | `subtitles` | Timed chunks from `subtitleText` / narration excerpt |

Toggle: `CaptionModeControl` on each `StudioSceneInspector`.  
Normalization: `caption.utils.ts` → `normalizeCaptionMode()`.

### Known limitations

- Mode is per-scene — no story-level default toggle
- Switching modes does not auto-populate `subtitleText` from generated caption
- Subtitles mode requires sufficient text to chunk; very short scenes may show one chunk only
- Generated mode ignores subtitle effects timing (caption is static)

### Future improvements

- Story-level default caption mode
- Auto-migrate generated caption → subtitleText on mode switch
- Hybrid mode (static hook + timed body)
- Per-scene preview of mode before applying

---

## Subtitle Effects

### Purpose

Animate how subtitle text appears on screen during each timed chunk (or static caption in generated mode with effect styling).

### Current status

**Implemented.**

Three effects (`SubtitleEffect`):

| Effect | Preview | Export |
|--------|---------|--------|
| **fade-up** | CSS keyframe opacity + translateY | Canvas opacity + Y offset at chunk start |
| **typewriter** | Progressive character reveal | Substring by chunk progress |
| **highlight** | Yellow bar + growing highlight pill | Per-line canvas highlight animation |

Default: **fade-up**.  
UI: `SubtitleEffectControl`.  
Logic: `subtitle-effect.utils.ts`, `subtitleEffectPreview.tsx`, `export-caption-canvas.utils.ts`.

Preview and export share chunk selection and progress math (verified by `test:export-subtitle-qa`).

### Known limitations

- Effects apply to subtitle display — highlight on generated static captions uses same renderer but without chunk timing variation
- No custom easing or duration control per effect
- Typewriter speed tied to chunk duration — not independently adjustable
- Highlight effect uses per-line pills in export; outer content-sized box skipped for highlight mode

### Future improvements

- Effect duration and easing controls
- Additional effects (blur-in, slide, karaoke word highlight)
- Independent typewriter speed setting
- Effect preview in scene card without full preview playback

---

## Editable Narration Subtitles

### Purpose

Let creators edit the on-screen subtitle copy in subtitles mode, separate from the full story narration and separate from AI-generated scene captions.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Field | `FootieScene.subtitleText` |
| Default source | Scene `narration` excerpt when `subtitleText` empty |
| Editor | Textarea on `StudioSceneInspector` when caption mode is `subtitles` |
| Chunking | `splitSubtitleChunks()` — max ~5 words / 34 chars per chunk |
| Timing | Chunks divide scene duration evenly |
| Wrap | Max 3 visible lines, 90% frame width |

Chunk rules: `subtitle.utils.ts` (`SUBTITLE_MAX_WORDS_PER_CHUNK`, `SUBTITLE_MAX_CHARS_PER_CHUNK`).

### Known limitations

- No manual chunk boundary editor — algorithm splits automatically
- Chunk timing is equal division — not aligned to spoken words in audio
- Long words may occupy an entire chunk alone
- Editing subtitle text does not update full story `narration` or voiceover
- Overflow beyond 3 wrapped lines is clipped, not scrollable

### Future improvements

- Manual chunk boundary editor with drag handles
- Word-level timing from audio forced alignment (Whisper timestamps)
- Live chunk preview count while typing
- Sync subtitle text from narration excerpt button
- Per-chunk duration weighting

---

## Generated Captions

### Purpose

Display the AI-written scene subtitle as a static on-screen caption for the full scene duration — the default caption mode for newly generated stories.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Source | `FootieScene.subtitle` from scene planning AI |
| Mode | `captionMode: "generated"` (default) |
| Display | Full caption visible entire scene |
| Editor | Editable text field on `StudioSceneInspector` |
| Preview | `CaptionOverlay` |
| Export | `drawExportGeneratedCaption()` — wrapped text in content-sized pill |

Scene planning prompt asks AI for short punchy subtitles per scene (`scene-planning.service.ts`).

### Known limitations

- Static text — no word-by-word sync to voiceover within the scene
- One caption block per scene — no mid-scene caption changes in generated mode
- Caption does not auto-update when story narration is edited (unless user re-generates)
- Same subtitle effect controls visible but timing effects are less meaningful without chunks

### Future improvements

- Auto-sync captions when narration is edited (AI rewrite per scene)
- Option to derive generated captions from narration excerpts automatically
- Character count / readability warnings
- Localized caption generation

---

## Scene Image Upload

### Purpose

Attach a custom image to each scene so the vertical short uses creator-provided visuals instead of type-labelled placeholders.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Input | File picker — PNG, JPG, WEBP |
| Storage | `SceneImage.url` as client `blob:` URL |
| UI | `MediaPicker` / upload zone on `StudioSceneInspector` |
| Remove | Clears image; placeholder gradient shown |
| Legacy | `uploadedImage` string URLs migrate to `SceneImage` on sync |
| Export checklist | `ExportPanel` warns when images missing |

9:16 aspect ratio recommended in UI copy.

### Known limitations

- Images stored as blob URLs — lost on refresh
- No cloud upload or CDN — export must load same-origin or blob URLs
- Remote URLs may fail CORS in canvas export
- No image compression or size limits enforced in UI
- One image per scene only

### Future improvements

- IndexedDB or cloud persistence for uploads
- Image proxy for CORS-safe export
- Stock image suggestions per scene
- Batch upload across multiple scenes
- Video clip support per scene

---

## Image Position

### Purpose

Pan the uploaded image within the 9:16 frame so the important subject is centred or framed correctly.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Fields | `SceneImage.x`, `SceneImage.y` (normalized offsets) |
| Editor | Drag on `SceneFrameImage` — mouse and touch |
| Draw | `drawSceneImageInFrame()` in `scene.utils.ts` |
| Parity | Same transform in preview CSS and export canvas |

Reset restores default position via `applyResetSceneImageSettings()`.

### Known limitations

- 2D pan only — no rotation control in UI (rotation field exists on type but unused)
- No snap-to-centre or rule-of-thirds guides
- Drag sensitivity not configurable
- Small preview frame in editor may not match export pixel precision exactly

### Future improvements

- Rotation control in UI
- Composition guides (thirds, safe zones)
- Snap to centre / faces (AI-assisted)
- Keyboard nudge arrows for fine adjustment

---

## Image Zoom

### Purpose

Scale the uploaded image within the frame to focus on detail or show more context.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Field | `SceneImage.scale` |
| Range | 0.5× – 3× (`MIN_SCENE_IMAGE_SCALE`, `MAX_SCENE_IMAGE_SCALE`) |
| UI | Context ribbon + inspector; canvas drag on `EditorCanvasEditLayer` |
| Draw | Applied in `drawSceneImageInFrame()` and preview transform |

Zoom combines multiplicatively with Ken Burns motion scale at playback time.

### Known limitations

- Slider range fixed — no beyond-3× digital zoom
- Zoom centre follows pan position, not independent focal point
- No pinch-to-zoom in editor preview on all devices

### Future improvements

- Independent focal point for zoom
- Pinch-to-zoom in scene card preview
- Zoom presets (wide, medium, tight)
- Double-click to fit subject

---

## Fit / Fill

### Purpose

Control how the image maps to the 9:16 frame: show the entire image (letterbox) or cover the frame (crop).

### Current status

**Implemented.**

| Mode | Value | Behavior |
|------|-------|----------|
| **Fit** | `fit` | Full image visible; letterboxing as needed |
| **Fill** | `fill` | Image covers frame; edges may crop |

Field: `SceneImage.fitMode`.  
UI: toggle in context ribbon / scene inspector.  
Draw: `getSceneImageDrawDimensions()` in `scene.utils.ts`.

Default: **fill** when not specified.

### Known limitations

- Binary choice only — no custom crop rectangle
- Fit mode may leave empty bars (filled with background colour)
- Changing fit mode may require re-adjusting pan/zoom manually

### Future improvements

- Custom crop box with handles
- Background colour/blur choice for fit letterbox bars
- Smart crop suggestions

---

## Ken Burns

### Purpose

Apply slow zoom motion during scene playback (documentary-style drift) on top of manual pan/zoom settings.

### Current status

**Implemented.**

| Setting | Options |
|---------|---------|
| Type | `none`, `zoom-in`, `zoom-out` |
| Intensity | `subtle` (→1.05×), `medium` (→1.10×), `strong` (→1.16×) |

Field: `SceneImage.imageMotion`.  
UI: `SceneImageMotionControl`.  
Math: `scene-image-motion.utils.ts` — linear progress 0→1 over scene duration.  
Applied in: `PreviewFrame` (CSS scale) and `video-render.service.ts` (canvas scale).

Default: **none** / **subtle** when omitted.

### Known limitations

- Linear easing only — no ease-in/out curves
- Zoom-in and zoom-out only — no pan motion path
- Motion is scene-local — does not continue across scene boundaries
- Combined with manual zoom can exceed comfortable crop at strong intensity

### Future improvements

- Pan + zoom combined motion paths
- Easing curve selection
- Motion preview scrubber in editor
- Random seed for subtle variation between exports

---

## Scene Transitions

### Purpose

Add visual effects between scenes during the outgoing scene's final moments — fades, slides, zooms, and blur overlays.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Effects | cut, fade, slide-left, slide-right, zoom-in, zoom-out, blur |
| Duration | Preset ms values; capped at 40% of outgoing scene duration |
| Model | Tail overlay on outgoing scene only — no timeline extension |
| Editor | `TransitionCard` between scenes in timeline |
| Captions | Hidden during active transition overlay |
| Preview | Dual CSS layers via `resolveSceneTransitionOverlay()` |
| Export | `drawExportTransitionBackgrounds()` on canvas |

Transition cards show "Transition to next scene" label in editor only — never rendered in video.

### Known limitations

- Cut is instant — no crossfade pixels between two scene images simultaneously
- Blur may fall back to fade on canvas draw failure
- Cannot transition from placeholder to image with different effect per layer
- One transition per scene pair — no stacked effects
- Duration capped — very short scenes get shorter overlays

### Future improvements

- True crossfade showing both scene images
- GPU blur shader for export
- Transition preview thumbnail in editor
- Easing and direction controls
- Sound crossfade (when background music exists)

---

## Export

### Purpose

Render the finished vertical short as a downloadable video file entirely in the browser — no server upload.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Entry | `exportFootieShort()` via `ExportPanel` |
| Video | WebM (VP9/VP8) via `MediaRecorder` |
| Resolutions | 720p, 1080p (default), 1440p, 4K vertical |
| Frame rate | 30 fps |
| Audio | Silent or with narration (FFmpeg.wasm mux) |
| Pipeline | `buildFootieExportPayload()` → canvas frame loop → optional mux |
| Progress | preparing → rendering → loading-voiceover → combining → complete |
| Preflight | Scene count, images uploaded, voiceover present, duration |

Files: `video-render.service.ts`, `export-payload.service.ts`, `ffmpeg.utils.ts`.

### Known limitations

- WebM only — no MP4/H.264 export
- 4K export is memory-intensive and slow on low-end devices
- FFmpeg.wasm adds load time and bundle size on first mux
- Remote images may fail silently if CORS blocks canvas
- No export queue — one render at a time
- Video length follows scene timing, not voiceover length, if durations were manually edited

### Future improvements

- MP4 export where browser encoders allow
- Worker-based frame rendering for performance
- Export progress time estimate
- Partial export (selected scenes only)
- Poster frame / thumbnail extraction

---

## Preview

### Purpose

Watch the full vertical short in the browser before exporting — with narration sync, transitions, subtitles, and image motion.

### Current status

**Implemented.**

| Capability | Details |
|------------|---------|
| Frame | 9:16 phone-style device chrome |
| Playback | Play/pause/stop; step prev/next scene |
| Modes | Browser clock or narration-synced (`usePreviewPlayback`) |
| Composition | `PreviewFrame` — image, transition overlay, captions |
| Subtitles | `SubtitleOverlay` with effect animations |
| Selection | Editor scene selection syncs preview context |
| Motion | Live Ken Burns scale during playback |

Component: `VideoPreview.tsx`. Timing: `previewTimeline.ts`, `previewSceneTiming.ts`.

### Known limitations

- Preview subtitle pill uses 0.65 opacity + blur; export uses 0.45 without blur
- No fullscreen mode documented in UI
- Narration sync uses single audio track — drift possible if scene durations ≠ voiceover length
- No frame-accurate scrub bar across full timeline (scene-step focused)
- Preview resolution is screen-sized, not export resolution

### Future improvements

- Unified subtitle style tokens with export
- Full timeline scrubber with thumbnail strip
- Fullscreen and share preview link
- Side-by-side preview vs export pixel comparison
- Real-time warning when audio/visual durations diverge

---

## Feature index

| Feature | Primary UI | Primary code |
|---------|------------|--------------|
| Story Generation | `CreateStoryFlow`, `BriefCanvas` | `audio-first-generation.service.ts` |
| Voiceover | `VoiceSettingsCard`, `NarrationPanel` | `voiceover.service.ts` |
| Voice Speed | `VoiceSettingsCard` | `voiceoverOptions.ts` |
| Scene Editing | `StudioTimeline`, `StudioSceneInspector` | `timeline.utils.ts` |
| Manual Scene Duration | `StudioSceneInspector` duration input | `recalculateSceneTimings()` |
| Subtitle Modes | `CaptionModeControl` | `caption.utils.ts` |
| Subtitle Effects | `SubtitleEffectControl` | `subtitle-effect.utils.ts` |
| Editable Narration Subtitles | `StudioSceneInspector` textarea | `subtitle.utils.ts` |
| Generated Captions | `StudioSceneInspector` subtitle field | `drawExportGeneratedCaption()` |
| Scene Image Upload | `StudioSceneInspector` upload zone | `MediaPicker` |
| Image Position | `EditorCanvasEditLayer` drag | `scene.utils.ts` |
| Image Zoom | Context ribbon / inspector | `scene.utils.ts` |
| Fit / Fill | Context ribbon / inspector | `getSceneImageDrawDimensions()` |
| Ken Burns | `MotionPanel` | `scene-image-motion.utils.ts` |
| Smart Edit handoff | `SmartEditImageAction` | `smart-image-tool.utils.ts` |
| Scene Transitions | `TransitionCard` | `transition-overlay.utils.ts` |
| Export | `ExportPanel` | `video-render.service.ts` |
| Preview | `VideoPreview` | `usePreviewPlayback`, `PreviewFrame` |

---

## Related documentation

| Document | Contents |
|----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Three-layer system design |
| [EDITING.md](./EDITING.md) | Editor workflow details |
| [RENDERING.md](./RENDERING.md) | Canvas and FFmpeg internals |
| [DATA_MODEL.md](./DATA_MODEL.md) | Type definitions |
| [ROADMAP.md](../ROADMAP.md) | Product roadmap |
| [FUTURE.md](./FUTURE.md) | Technical debt and planned work |
