# Product and creator workflow

ShortForge Studio is a Next.js app for writing, voicing, editing, previewing, and exporting short vertical videos. Exported videos burn in a **FootieBitz** watermark. The product name is **ShortForge Studio**.

This page is the creator-workflow authority. Implementation detail lives in the linked documents.

## Current supported workflow

```
Create → Review → Voiceover → Scene generation → Editor → Preview → Export
```

| Stage | What the creator does | What the system does |
| --- | --- | --- |
| Create | Topic, story mode, tone, duration, optional notes, Hook style, story strategy | Builds a story contract; optional research; Retention narration path |
| Review | Edit title and narration | Confirms the script before audio |
| Voiceover | Choose voice and speed; regenerate | OpenAI TTS; non-1x speeds use pitch-preserved processing |
| Scenes | Accept or regenerate a storyboard | Scenes are timed to measured narration |
| Editor | Framing, media, captions, motion, music, mixer | Shared document + Master Timeline |
| Preview | Play the 9:16 device frame | Same timing authority as export |
| Export | Browser WebM/MP4 and/or Headless when available | Manifest + renderer capability checks |

Drafts persist in browser localStorage.

## Story modes

From `src/types/footiebitz.ts`:

- `story`
- `tactical_review`
- `match_preview`
- `match_recap`
- `player_analysis`
- `top_5`
- `historical_explainer`
- `opinion_debate`

Tones: dramatic, funny, tactical, news, emotional. Duration is clamped to 15–60 seconds.

Quality modes:

| UI / request | Model (when `OPENAI_SCRIPT_MODEL` is unset) |
| --- | --- |
| Fast / `cheap` | `gpt-4.1-mini` |
| Balanced / `balanced` | `gpt-4.1` |
| Studio / `best` | `gpt-4.1` (same model as Balanced) |

If the full audio-first pipeline omits `qualityMode`, it defaults to **Balanced**. The type-level default in `script-models.ts` is `cheap`.

Football research is optional context. Story-generation rules are not football-club-specific.

## Hooks

Creators can choose Auto, Write My Own, or a catalog style (`cold_open`, `curiosity_gap`, `provocative_question`, `stakes_first`, `headline_first`, `countdown_tease`, `contrarian_claim`, `myth_challenge`). Internal-only strategies are not browser-selectable. See [STORY_GENERATION.md](../architecture/STORY_GENERATION.md).

## Editing and preview

- Studio shell: sidebar, canvas, inspector, timeline
- Fit / Fill / pan / zoom, optional Fit with background
- Captions and caption animations on the Master Timeline
- Audio Mixer v1: voice, music, and master buses — [AUDIO_MIXER.md](AUDIO_MIXER.md)
- Source Quality guidance is advisory and does not block export — [SOURCE_MEDIA_QUALITY.md](SOURCE_MEDIA_QUALITY.md)

## Export surfaces

- **Browser:** 720p and 1080p, WebM and MP4 (MP4 is probe-gated)
- **Headless:** additional 4K pixel targets when the Headless path is available
- Quality warnings never block export

Details: [PREVIEW_AND_EXPORT.md](../architecture/PREVIEW_AND_EXPORT.md).

## Gated or opt-in behavior

These exist in the codebase and must not be described as default production behavior:

- Studio Intelligence scene planning — dual gate (`STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED` and a Review request flag)
- Visual-retention phases (`SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES`) — staging-only, fail-closed
- Headless production routes — configuration-blocked until classified ready
- Evidence Surprise / live research Hook paths — capability-gated

## Known limitations

- Story-generation release verdict is **not_ready**
- Video-quality release verdict is **conditionally ready** (manual Studio smoke still open)
- Brand-sting command immutability: historical baseline repaired — [BRAND_STING_EXPORT_BASELINE_FAILURE.md](../evidence/export/current/BRAND_STING_EXPORT_BASELINE_FAILURE.md)
- Source video audio is not muxed into export
- Watermark cannot be turned off
- Binary media rehydration after reload remains a draft limitation for some blob URLs

## Related

- Editing details: [EDITING.md](EDITING.md)
- Feature inventory (index): [FEATURES.md](FEATURES.md)
- Planned work: [../../ROADMAP.md](../../ROADMAP.md) — planned, not implemented
