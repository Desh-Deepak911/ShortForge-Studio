# ShortForge Studio

ShortForge Studio is a Next.js application for creating short vertical videos: write a brief, generate grounded narration, review the script, synthesize voiceover, time scenes to that audio, edit on a timeline, preview in the browser, and export.

The product name is **ShortForge Studio**. Exported videos burn in a **FootieBitz** watermark.

This README is the onboarding document. Deeper authorities live under [docs/README.md](./docs/README.md). Production code wins when documents disagree.

## Current major capabilities

- **Story generation** — Retention narration path with Hook styles, quality modes (Fast / Balanced / Studio), canonical acceptance, bounded rewrite, and coherent deterministic rescue. Release verdict: **not_ready**. [Story generation](./docs/architecture/STORY_GENERATION.md)
- **Voiceover** — `tts-1-hd` (or `gpt-4o-mini-tts` when required), speeds 0.75x–1.4x, pitch-preserved non-1x processing, optional generated-speech mastering. [Voice](./docs/product/VOICE_GENERATION.md)
- **Studio editor** — Timeline, Fit/Fill/zoom, Fit with background, captions, motion, music, Audio Mixer v1
- **Source Quality** — Advisory framing guidance; never blocks export. [Source media](./docs/product/SOURCE_MEDIA_QUALITY.md)
- **Preview** — 9:16 playback on the shared Master Timeline
- **Browser export** — WebM and probe-gated MP4 at 720p and 1080p
- **Headless export** — Separate Chromium/ffmpeg path with 4K pixel targets when configured. Not implied by `npm run dev`. [Preview and export](./docs/architecture/PREVIEW_AND_EXPORT.md)

Optional football research (API-Football) can ground a brief. Story rules are not club-specific.

## High-level architecture

```
Brief → (optional research) → Retention plan + narration → Hook opening
      → Voiceover (measured duration) → Scenes / timeline
      → Preview ─┬─ Browser export (canvas + FFmpeg.wasm)
                 └─ Headless export (Chromium + native ffmpeg), when available
```

| Layer | Location |
| --- | --- |
| App routes and APIs | `src/app/` |
| Story / Retention / Hook | `src/features/retention-story/`, `src/features/hook-engine/`, `src/features/story/` |
| Editor, preview, mixer | `src/features/editor/`, `src/features/preview/`, `src/features/audio-mixer/` |
| Export manifest and Browser render | `src/features/export/` |
| Headless control plane and worker | `src/features/headless-renderer/` |
| Source quality and framing | `src/features/source-quality/`, media-framing modules |
| Verification (not in the production build) | `src/verification/` |

## Technology stack

| Area | Current versions in `package.json` |
| --- | --- |
| App | Next.js `16.2.9`, React `19.2.4`, TypeScript 5.x, Tailwind CSS 4 |
| Script models | `gpt-4.1-mini` (Fast), `gpt-4.1` (Balanced/Studio) |
| Speech | OpenAI TTS (`tts-1-hd` / `gpt-4o-mini-tts`) |
| Browser media | FFmpeg.wasm, Web Audio, Canvas |
| Headless (optional) | Puppeteer-core, native ffmpeg, Neon / R2 / Upstash / Clerk when classified |

Package version is `0.1.0`. Do not treat CHANGELOG marketing numbers as npm release tags.

## Repository structure

```
src/app/                 Routes and API handlers
src/components/          Studio shell and shared UI
src/features/            Product domains (story, export, headless, …)
src/lib/                 Shared AI, audio, and utility helpers
src/types/               Shared request/domain types
src/verification/        Provider-free and gated QA scripts
docs/                    Living docs, evidence, and archives
scripts/                 Verification runners and operator tools
```

## Local prerequisites

- Node.js 20 LTS recommended
- npm
- OpenAI API key for generation and TTS

Neon, Clerk, R2, Upstash, and Fly are not required for local Create → Preview → Browser export.

Full steps: [docs/development/LOCAL_DEVELOPMENT.md](./docs/development/LOCAL_DEVELOPMENT.md).

## Installation

```bash
git clone https://github.com/Desh-Deepak911/ShortForge-Studio.git
cd ShortForge-Studio
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. Do not commit that file. Optional `API_FOOTBALL_KEY` enables football research. Leave `OPENAI_SCRIPT_MODEL` unset unless you are deliberately overriding models.

## Development commands

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

## Database

Studio drafts use browser localStorage. No database migrate is part of ordinary local setup. Headless Neon migrate is an operator-gated path described in [Headless operations](./docs/operations/HEADLESS_OPERATIONS.md).

## Core verification

```bash
npm run test:verification
npm run test:retention-story-quality-release-gate
npm run test:video-quality-release-readiness
```

See [docs/verification/VERIFICATION.md](./docs/verification/VERIFICATION.md). Passing tests do not override evidence verdicts.

## Browser and Headless export

- Browser: 720p/1080p, WebM, MP4 when the local probe allows it
- Headless: configuration-gated; 4K is a Headless pixel target
- Manifest production pair is v4 / `"9D"`; v5 / `"9E"` when listed capabilities are required

## Story generation

Retention accepts `model_direct` or `model_after_rewrite` narration, or returns labeled `deterministic_rescue`. Soft Hook and small duration misses are warnings. Current release evidence is **not_ready**.

## Voice generation

Default 1.0x on `tts-1-hd`. Other speeds use one pitch-preserving tempo conversion. Generated-speech mastering applies only to generated narration.

## Source media and framing

Fit, Fill, and optional Fit with background. Source Quality is advisory. Legibility uses local layers, not a permanent whole-frame dark overlay.

## Evidence and documentation

| Start | Document |
| --- | --- |
| Docs map | [docs/README.md](./docs/README.md) |
| Evidence policy | [docs/evidence/RELEASE_READINESS_POLICY.md](./docs/evidence/RELEASE_READINESS_POLICY.md) |
| Story readiness | [docs/evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md](./docs/evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md) |
| Video readiness | [docs/evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md](./docs/evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md) |

## Known limitations

- Story generation is **not_ready** for release (correct live ranking acceptance still missing)
- Video quality is **conditionally ready** (manual Studio smoke open)
- Brand-sting export has a recorded baseline failure
- Headless production routes may be configuration-blocked
- Visual-retention phases are staging-only and fail-closed
- Source video audio is not exported
- Watermark cannot be disabled
- Some draft blob URLs do not rehydrate after reload

## Safe contribution workflow

1. Keep changes scoped. Do not mix unrelated refactors with a behavior fix.
2. Run the focused `test:*` script plus `typecheck` / `lint` for the area you touched.
3. Do not add secrets, `.env` files, media fixtures, or `.tmp/` cert dumps.
4. Do not treat ROADMAP items as shipped.
5. Do not rerun gated live harnesses unless you intend to update that evidence file.
6. Leave documentation claims no stronger than current evidence.

Planned work: [ROADMAP.md](./ROADMAP.md). Version history: [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
