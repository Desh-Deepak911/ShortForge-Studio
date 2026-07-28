# Component Migration Plan

Maps **current** presentation components to **Studio UX 2.0** targets. Strategy: **wrappers and composition** — not rewrites. Frozen runtimes stay untouched; shell components rearrange layout.

Legend:

| Tag | Meaning |
|-----|---------|
| **Reusable** | Use as-is inside new shell |
| **Needs redesign** | Visual/structure refresh; same props and hooks |
| **Needs relocation** | Move to different panel; minimal markup change |
| **Frozen** | Do not modify — wrap only |

---

## Shell & Layout

| Current | Future Studio | Tag | Notes |
|---------|---------------|-----|-------|
| `AppShell` | `StudioShell` | Needs redesign | Fixed viewport; focus mode; slot-based regions |
| `SiteNav` / `PRIMARY_NAV_LINKS` | `StudioHeader` nav slot | Needs relocation | Hidden in Editor focus mode |
| `StudioPage` | `StudioPage` (wrapper) | Reusable | Page-level metadata unchanged |
| `studioUi.ts` tokens | `studioUi.ts` + layout tokens | Needs redesign | Add shell dimensions; keep existing class names working |
| `studioWorkspaceGrid` | `StudioEditorLayout` | Needs redesign | Three-column + bottom timeline grid |
| `studioMobileActionBar` | `StudioMobileTransport` | Needs redesign | Tab bar + sheet triggers |

**Phase 1:** Introduce `StudioShell` alongside `AppShell`; Editor route switches first.

---

## Landing (`/`)

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `LandingPage` | `LandingPage` | Reusable | Marketing layout OK |
| `BreakLongVideoSection` | Same | Reusable | Optional visual polish only |
| `AppShell` (minimal) | `MarketingShell` | Needs redesign | Lighter header — no project context |

---

## Create (`/create`)

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `CreateStoryFlow` | `CreateStoryFlow` | Needs relocation | Orchestration unchanged; sits in brief canvas |
| `StoryComposer` | `BriefCanvas` ← wraps `StoryComposer` | Needs redesign | Single column, larger topic input, sticky Generate |
| `ResearchPreviewPanel` | Same | Needs relocation | Collapsed accordion below brief |
| `ContentTypeSuggestion` | Same | Reusable | Inline in brief |
| `StudioEmptyState` | `StudioEmptyState` | Reusable | |
| `StudioLoadingState` | `GenerationOverlay` ← wraps | Needs redesign | Full canvas overlay during stream |
| `ResearchPreviewDeveloperView` | Same | Frozen | Dev-only; hidden by default |
| `Card` (ui) | `StudioPanel` | Needs redesign | Softer borders; less “form card” |

**Hooks frozen:** `consumeGenerateScriptStream`, `createDraft`, `seedDraftSession`, research fetch utils.

---

## Review (`/create/review/[draftId]`)

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `ScriptReviewFlow` | `ScriptReviewFlow` | Needs relocation | Split layout: script canvas + brief inspector |
| `StoryReview` | `ScriptCanvas` ← wraps | Needs redesign | Large narration editor; title prominent |
| `VoiceSettingsCard` | `ReviewVoiceSection` | Needs relocation | Right inspector before voiceover generated |
| `DraftLoadingState` | Same | Reusable | |
| `StudioLoadingState` | `GenerationOverlay` | Needs redesign | Voiceover/scene generation |
| Step sections (2–5) | `ReviewStepper` (visual only) | Needs redesign | Linear-style minimal progress — not numbered form steps |
| `AppShell` | `StudioShell` (review mode) | Needs redesign | Primary CTA: Continue |

**Hooks frozen:** `useReviewStoryDocument`, `applyStoryUpdate`, voiceover generation API calls.

---

## Editor (`/editor/[draftId]`)

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `DraftEditorFlow` | `DraftEditorFlow` | Reusable | Route orchestration unchanged |
| `StoryWorkspace` | `StudioEditorWorkspace` | Needs redesign | Composes shell slots — does not own preview logic |
| `StoryReview` (storyboard variant) | `ProjectInspector` narration section | Needs relocation | Move title/narration to inspector project tab |
| `TimelineEditor` | `StudioTimeline` + `SceneTimelineRail` | Needs redesign | Extract rail UI; keep scene CRUD handlers |
| `SceneCard` | `SceneInspector` + `SceneTimelineChip` | Needs redesign | Split display vs edit; **same** `applySceneUpdate` calls |
| `TransitionCard` | `TransitionInspector` + timeline gap | Needs relocation | Inspector when transition selected |
| `SceneImageInspector` | Inspector section | Needs relocation | Already modular |
| `SceneImageMotionControl` | Inspector section | Needs relocation | |
| `SceneImageZoomControl` | Inspector section | Needs relocation | |
| `CaptionModeControl` | Inspector section | Needs relocation | |
| `SubtitleEffectControl` | Inspector section | Needs relocation | |
| `subtitleEffectPreview` | Inspector inline preview | Reusable | |
| `MediaPicker` | Inspector image picker | Needs relocation | |
| `SceneFrameImage` | `SceneTimelineChip` thumbnail | Reusable | |
| `SceneCaptionOverlay` | Frozen (preview) | Frozen | Used by preview path |
| `VideoPreview` | `StudioCanvas` ← wraps | Needs relocation | Center canvas; same props |
| `PreviewFrame` | Same | Frozen | |
| `SubtitleOverlay` | Same | Frozen | |
| `CaptionOverlay` | Same | Frozen | |
| `NarrationPanel` | *(removed)* | Replaced by `ProjectAudioStudio` — canvas Play for preview |
| `VoiceSettingsCard` | Review voice section | Editor uses `ProjectAudioVoiceoverSection` |
| `BackgroundMusicCard` | Inspector music section | Needs relocation | |
| `ExportPanel` | `ExportDrawer` content | Needs relocation | Trigger from header |
| `TimelineDeveloperView` | Debug menu only | Needs relocation | Remove from default aside |
| `WorkspacePanel` | Retire | Needs redesign | Replaced by shell regions |

**Hooks frozen:** `useEditorStoryDocument`, `useDraftPersistFeedback`, all `apply*` in `@/lib/voiceover`.

---

## Drafts (`/drafts`)

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `DraftsDashboard` | `ProjectsLibrary` ← wraps | Needs redesign | Grid/list; less dashboard copy |
| Draft list items | `ProjectCard` | Needs redesign | Thumbnail placeholder, status chip |
| `AppShell` | `MarketingShell` | Needs redesign | Write Story CTA |

**Hooks frozen:** `listDrafts`, `deleteDraft`, `getDraft`, `resolveDraftHref`.

---

## Shared Components

| Current | Future | Tag | Notes |
|---------|--------|-----|-------|
| `VoiceSettingsCard` | `VoiceInspectorSection` | Review only | Editor uses `ProjectAudioVoiceoverSection` |
| `BackgroundMusicCard` | `MusicInspectorSection` | **Done** | Re-exported via `ProjectAudioBackgroundMusicSection` |
| `ExportPanel` | `ExportInspectorSection` | Needs relocation | |
| `ProjectAudioStudio` | Project inspector audio | **Done** | Voiceover, music, export mix |
| `CopyButton` | Same | Reusable | |
| `Card` | `StudioPanel` | Needs redesign | |

---

## Runtime & Data (Frozen — Wrap Only)

| Component / Module | Tag | Rule |
|--------------------|-----|------|
| `VideoPreview` | Frozen | Wrap in `StudioCanvas`; no prop changes |
| `ExportPanel` (logic) | Frozen | Same handlers; new container |
| `TimelineEditor` (handlers) | Frozen | Extract UI; keep mutations |
| `useEditorStoryDocument` | Frozen | |
| `useReviewStoryDocument` | Frozen | |
| `StoryDocumentStore` | Frozen | |
| `TimelineDeveloperView` | Frozen | Dev-only relocation |
| All `/api/*` routes | Frozen | |
| Preview/export services | Frozen | |

---

## Page Summary Matrix

| Page | Wrapper to create | Reusable count | Redesign | Relocation | Frozen |
|------|-------------------|----------------|----------|------------|--------|
| Landing | `MarketingShell` | 2 | 1 | 0 | 0 |
| Create | `BriefCanvas`, `GenerationOverlay` | 4 | 3 | 2 | 1 |
| Review | `ScriptCanvas`, `ReviewStepper` | 2 | 4 | 3 | 0 |
| Editor | `StudioShell`, `StudioEditorWorkspace`, `StudioTimeline`, `StudioCanvas` | 6 | 8 | 12 | 8 |
| Drafts | `ProjectsLibrary` | 0 | 3 | 0 | 0 |

---

## Migration Rules

1. **No hook refactors** — presentation components receive same callbacks from existing flows.
2. **No provider refactors** — `providers.tsx` unchanged in Phase 1.
3. **One route at a time** — Editor last (highest complexity); Create/Review first wins.
4. **Feature flag optional** — `StudioShell` behind env or route query for safe rollout.
5. **Parity checklist** — Before cutover: preview, export, autosave, scene edit, voice apply all pass existing QA.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Studio-UX-2.0.md](./Studio-UX-2.0.md) | Architecture and interaction model |
| [Studio-Layout.md](./Studio-Layout.md) | Panel placement |
| [Studio-Principles.md](./Studio-Principles.md) | Design principles |
