# Export ↔ Preview Parity Matrix

Sprint 6A audit. Status values: `Full` | `Partial` | `Missing` | `Duplicated implementation` | `Unsupported` | `Unverified`.

| Capability | Canonical source | Preview path | Export path | Parity status | Automated test | Manual QA | Known issue | Recommended action |
|---|---|---|---|---|---|---|---|---|
| Scene create/delete/duplicate/reorder | `timeline-editor.commands` | Timeline + PreviewMasterTimeline | Preflight snapshots scenes | Full | timeline-editor verify | Freeze checklist | — | Keep |
| Scene duration (1–20s) | `durationMs`, `durationSource` | MasterTimeline | `prepareStoryForExport` | Full | timeline authority QA | Yes | Manual durations block voiceover refit | Document in preflight |
| Scene split | — | — | — | Unsupported | — | — | No editor split | Do not claim |
| Story end buffer (400ms) | `TIMELINE_END_BUFFER_MS` | Tail hold to `renderDurationMs` | Frame loop through `renderDurationMs` | Full | timeline-playback verify | Yes | — | Keep shared constant |
| Transitions (cut/fade/slide/zoom/blur) | `TransitionTimelineItem` | `resolvePreviewTransitionOverlay` + CSS | `resolveTimelineTransitionOverlay` + canvas | Partial | transition QA | Yes | Peer elapsed uses editor vs refitted `startMs` | Unify peer timing (6C) |
| Image upload/replace | `scene.media` / `scene.image` | `SceneFrameImage` | Media cache + canvas draw | Full | scene-media verify | Yes | Dual authoring | Prefer `media` |
| Image fit/fill | `image.fitMode` / media | CSS object-fit | `resolveExportMediaFitMode` | Full | `test:export-media-fit` | Yes | Dual fields | Single authority (6G) |
| Image pan/zoom | `x,y,scale` | CSS + edit layer | Canvas transform | Full | media-fit / motion | Yes | Rotation field unused in UI | Expose or ignore |
| Image crop tool | — | Implicit cover crop | Implicit | Unsupported | — | — | No crop rect | Do not claim |
| Shared motion | `scene.media.motion` | `previewMotionAdapter` | `exportMotionAdapter` | Full | `test:motion-sprint` | Yes | Opacity channel unused | Keep shared engine |
| Legacy `imageMotion` | read-only fallback | Normalize path | Same normalize | Full | motion verify | — | Write path removed | Keep read compat |
| Video upload/replace | `SceneMedia` type video | `SceneFrameVideo` | Seek + draw | Full | scene-media-renderer | Yes | — | Keep |
| Video trim | `trimStartMs`/`trimEndMs` | `resolvePreviewVideoClipTime` | `resolveSceneMediaClipTime` | Partial | video-sync / media-playback | Yes | **Duplicated helpers** | Unify on Media Playback Engine (6G) |
| Video mute | `media.muted` | Always muted DOM | No source audio muxed | Full (muted) | — | — | No user unmute | Explicit product rule |
| Video playback rate | — | 1× only | 1× only | Unsupported | — | — | — | Do not claim |
| Hold last frame | clip < scene | Preview clip utils | Media Playback Engine | Full | media-playback verify | Yes | — | Keep |
| Long source in short scene | Media Playback Engine | Scene-local clip only | Scene-local clip only | Full | mixed-media audit | Yes | — | Keep |
| Caption mode generated | `captionMode` | `CaptionOverlay` | Canvas caption lines | Full | subtitle QA | Yes | — | Keep |
| Caption mode subtitles | MasterTimeline subtitle track | `SubtitleOverlay` | `resolveExportSubtitleDisplayFromTimeline` | Full | `test:export-subtitle-sync` | Yes | Frame-center vs continuous Δ | Document (6C) |
| Caption layout/style | scene → project defaults | Caption engine CSS | Canvas measurement | Partial | caption QA | Yes | Font loading / wrap deltas | Font preflight (6B) |
| Caption animations | `captionAnimation` | CSS animation state | Canvas progress | Partial | caption-animation QA | Yes | Typewriter/highlight fidelity | Device QA (6G) |
| Word timings | word_weighted / equal strategies | Chunk display | Same timeline events | Full | subtitle-timing verify | — | No manual word editor | Keep |
| Final caption hold | `TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS` | Readable hold | Same in `contentEndMs` | Full | mixed-media final | Yes | Mux `-t` must not truncate | Guard in 6C |
| Voiceover generate | `/api/generate-voiceover` | MP3 playback | Mux MP3 | Full | voiceSpeedQa | Yes | Speed baked in TTS | Model A (see capabilities) |
| Voice speed prefs | `voiceSettings.speed` | Prefs only until regen | Regenerated audio duration | Full | voiceSpeedQa | Yes | Prefs ≠ live rate | Block “live stretch” UX |
| Preview playbackRate | Forced 1.0 | `voiceover-playback-rate` | N/A | Full | voiceSpeedQa | — | Prevents double speed | Keep |
| Background music | `backgroundMusic` / mixer | Preview music utils | FFmpeg/browser mix | Full | audio mixer docs | Yes | Silent fallback can hide music loss | Clearer UX (6E/6H) |
| Ducking / fades | mixer settings | Preview envelopes | Export filter chains | Full | AUDIO_MIXER.md | Yes | — | Keep |
| Source video audio | — | Muted | Not muxed | Full (excluded) | — | — | Intentional | Document |
| Watermark | `CREATOR_BRAND` | Preview chrome label | Canvas `FOOTIEBITZ` | Partial | fingerprint mentions | Yes | Preview ≠ burned-in; casing differs | Align burn-in (6G) |
| Resolution 1080/720 | `ExportSettings.resolution` | N/A (CSS preview) | Canvas size | Full | export settings verify | Yes | — | Keep |
| FPS | Hardcoded 30 | Continuous | 30 CFR | Partial | — | — | UI shows 30; no control | Capability label (6B) |
| Format WebM | `format: webm` | N/A | MediaRecorder + libvpx + Opus | Full | export path verify | Yes | MEMFS normalize risk | Chunk/hybrid (6D) |
| Format MP4 | `format: mp4` | N/A | libx264 + AAC | Full | export path verify | Yes | Extra transcode cost | Keep |
| Format WebP | — | — | — | Unsupported | — | — | Not in UI | Do not claim |
| Filename | `exportSettings.fileName` | — | Download name | Full | — | — | — | Keep |
| Quality tier | standard/high | — | Bitrate only | Full | — | — | Not CRF for WebM normalize (fixed 2M) | Align bitrate story (6F) |
| Platform presets | export-profile registry | — | Patches settings | Partial | — | — | `generic_mp4` recommends webm | Fix label/settings (6B) |
| Export readiness gates | story-sync | Checklist UI | Blocks button | Full | story-sync-domain | — | — | Extend with memory preflight (6B) |
| Silent audio fallback | — | — | Downloads silent on mux fail | Partial | — | Yes | Can surprise users | Explicit warning required (core rule) |
| Cancellation | — | Stop preview | No cancel mid-export | Missing | — | — | — | Add cancel+cleanup (6H) |
| Retry after FFmpeg abort | — | — | Partial `resetFFmpeg` on voice fallback | Partial | forensics | Yes | Normalize OOM can poison worker | Auto-reset (6H) |

## Duplicated semantic logic

| Area | Classification | Action |
|------|----------------|--------|
| `preview-video-clip.utils` vs `media-playback` clip time | Dangerous semantic duplication risk | Consolidate (6G) |
| Preview/export motion adapters | Adapter-only difference | Keep |
| Transition overlay resolver | Identical shared domain | Keep |
| Transition peer `startMs` (editor vs refit) | Dangerous semantic duplication | Fix in 6C |
| Caption style engines | Shared with canvas adapter | Keep; harden fonts |
| Timeline image-motion track | Dead consumer path | Leave or remove later |

## Summary counts

- **Full:** majority of core story/media/caption/motion paths under automated gates  
- **Partial:** transitions peer timing, caption animation fidelity, watermark, FPS UX, music fallback messaging, retry safety  
- **Missing:** cancel, scene split, playback rate, crop tool, WebP  
- **Unsupported (correctly):** WebP/GIF/MOV export, unmute source video  
