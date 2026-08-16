# Local development

This is the setup authority for running ShortForge Studio on a developer machine. Product behavior is described in [CREATOR_WORKFLOW.md](../product/CREATOR_WORKFLOW.md). Verification commands are in [VERIFICATION.md](../verification/VERIFICATION.md).

## Prerequisites

- **Node.js 20 LTS** recommended for the Next.js app (`16.2.9`, React `19.2.4`). There is no `engines` field or `.nvmrc`.
- Hosted Headless worker images are documented as **Node 24**. That is not required for `npm run dev` or Browser export.
- **npm** (the lockfile is `package-lock.json`)
- An **OpenAI API key** for script generation and voiceover
- Optional: API-Football key for football research
- Optional Headless local worker: system Chrome plus native `ffmpeg` / `ffprobe` (see [HEADLESS_OPERATIONS.md](../operations/HEADLESS_OPERATIONS.md))

Neon, Clerk, R2, Upstash, and Fly are **not** required for Create → Review → Editor → Preview → Browser export.

## Install

```bash
git clone https://github.com/Desh-Deepak911/ShortForge-Studio.git
cd ShortForge-Studio
npm install
```

Run npm commands from the repository root (this directory).

## Environment

Copy [`.env.example`](../../.env.example) to `.env.local`. Never commit `.env.local`.

Required for generation and TTS:

```env
OPENAI_API_KEY=
```

Optional:

```env
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
# OPENAI_SCRIPT_MODEL=   # unset in normal use; Fast/Balanced/Studio models stay gpt-4.1-mini / gpt-4.1
```

Do not set `SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES` on main or production. That flag is staging-only and fail-closed. See [ENV_AND_FEATURE_FLAGS.md](../operations/ENV_AND_FEATURE_FLAGS.md).

Do not put secrets in `NEXT_PUBLIC_*` variables.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run build
npm run start        # after build
```

Headless worker bundle (only when changing the Headless renderer):

```bash
npm run build:headless-worker
```

## Database

Ordinary local Studio use stores drafts in **browser localStorage**. No app database migrate is required.

Headless control-plane storage uses Neon when an operator explicitly configures `DATABASE_URL` and related gates. That path is configuration-blocked in production routes until classified as ready. Do not treat Headless Neon migrate as part of first-run Studio setup. See [HEADLESS_OPERATIONS.md](../operations/HEADLESS_OPERATIONS.md).

## What local Studio can do without Headless

- Create and review a script (needs OpenAI)
- Generate and regenerate voiceover (needs OpenAI)
- Edit scenes, framing, captions, and mixer settings
- Preview in the browser
- Browser export (WebM; MP4 when the local FFmpeg.wasm probe succeeds)

## What local Studio cannot claim

- A production Headless Fly render, unless current Headless evidence for this tree says otherwise
- Story-generation release readiness (current verdict is **not_ready**)
- Unconditional video-quality readiness (current verdict is **conditionally ready**; manual Studio smoke is still open)
