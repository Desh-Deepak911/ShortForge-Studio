# FootieBitz

**FootieBitz is an AI-powered football shorts creator that turns match topics into scene-based video storyboards and exportable short-form videos.**

Turn any match moment, derby, or talking point into a vertical YouTube Short — script, scenes, preview, and export — in one creator workflow.

---

## Demo flow

1. **Enter a topic** — e.g. *Real Madrid comeback* or *Champions League final drama*
2. **Choose tone & duration** — Dramatic, Funny, Tactical, News, or Emotional · 30 / 45 / 60 seconds
3. **Generate script** — OpenAI writes a title, hook, caption, hashtags, and 5 scenes
4. **Edit the storyboard** — Tweak subtitles, timing, and upload one image per scene
5. **Preview** — Browse scenes in a 9:16 phone-frame preview
6. **Export** — Choose a quality preset and download a vertical WebM rendered in the browser

---

## Features

- **AI script generation** — Football-focused prompts with tone control and structured JSON output
- **Scene-based storyboard** — Each scene includes subtitle, duration, and AI image prompt
- **Scene editor** — Edit text, adjust timing, upload/replace/remove images with upload progress
- **Live 9:16 preview** — Phone-frame mockup with scene navigation and placeholder states
- **Browser video export** — Canvas + MediaRecorder pipeline with multiple quality presets (WebM download)
- **Script quality modes** — Cheap Draft (`gpt-5-nano`), Balanced (`gpt-5-mini`), or Best (`gpt-5`)
- **Image source links** — Quick search links to Unsplash, Pexels, and Wikimedia Commons per scene
- **Copy to clipboard** — Full script, YouTube caption, hashtags, and individual scene subtitles
- **Sample topics** — One-click topic chips to speed up demos
- **Dark SaaS UI** — Football-themed dashboard built with Tailwind CSS

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | [OpenAI](https://platform.openai.com) — script quality modes (`gpt-5-nano` / `gpt-5-mini` / `gpt-5`) via official `openai` SDK |
| Video export | HTML Canvas + `MediaRecorder` (client-side WebM) |
| Icons | Lucide React |

---

## How to run locally

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

```bash
# Clone the repo and enter the project
cd footiebitz

# Install dependencies
npm install

# Add your OpenAI API key (copy from .env.example)
cp .env.example .env.local
```

Set your key in `.env.local`:

```env
OPENAI_API_KEY=your_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other commands

```bash
npm run build   # Production build
npm run start   # Start production server
npm run lint    # ESLint
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for script generation |
| `OPENAI_SCRIPT_MODEL` | No | Optional override for all script quality modes |

The key is only used server-side in `/api/generate-script` and is never exposed to the client.

---

## Token optimization

FootieBitz is designed to keep OpenAI usage minimal:

- **OpenAI tokens are used only for script generation** — the `/api/generate-script` route is the sole token-consuming step.
- **Image upload, editing, preview, and export run in the browser** — no server or AI calls for storyboard work or video rendering.
- **Image source links do not use tokens** — Unsplash, Pexels, and Wikimedia Commons open as external search links; creators find and upload images manually.
- **Auto image fetching is planned** — a future free-API integration will fetch scene images without routing uploads through OpenAI.

Choose **Cheap Draft** in the form for the lowest token cost; **Balanced** and **Best** use larger models when you want higher script quality.

---

## Export quality

Export is fully client-side. In **Export Panel**, pick a vertical 9:16 preset before downloading WebM:

| Preset | Resolution | Default |
|--------|------------|---------|
| 720p | 720 × 1280 | |
| 1080p | 1080 × 1920 | ✓ |
| 1440p | 1440 × 2560 | |
| 4K | 2160 × 3840 | |

Files download as `footiebitz-{preset}.webm` (e.g. `footiebitz-1080p.webm`). Layout scales proportionally across presets; higher resolutions take longer to record because export runs in real time.

---

## MVP limitations

This is a deliberate MVP — focused on proving the creator workflow, not production video infrastructure.

- **No auth or accounts** — Single-session, in-browser experience
- **No database** — Script state lives in React state only (lost on refresh)
- **No match data scraping** — Topics are user-provided; AI avoids inventing exact stats
- **No AI image generation** — Scenes include image *prompts*; creators upload their own images
- **WebM export only** — MP4 export is not wired up yet; export uses real-time MediaRecorder
- **Real-time recording** — A 30s short takes ~30s to export (canvas records live)
- **No cloud rendering** — All video export happens client-side in the browser
- **No audio/voiceover** — Visual storyboard and subtitles only

---

## Roadmap

- **Auto fetch images from free APIs** — Pull scene backgrounds from Unsplash/Pexels-style sources using `imageSearchQuery`
- **Video-to-shorts clip breaker** — Upload long match footage, detect highlights, and generate multiple vertical shorts
- **Voiceover generation** — TTS narration synced to scene timing
- **MP4 export using FFmpeg** — Universal upload format via FFmpeg.wasm or server-side rendering

Also planned: storyboard templates, project persistence, auth & teams, match data hooks, and direct Shorts/TikTok publishing.

---

## Portfolio explanation

FootieBitz is a portfolio project that demonstrates **full-stack product thinking** for a niche AI creator tool:

- **Problem framing** — Football creators need fast vertical content, but scripting and storyboarding is slow
- **AI integration** — Structured prompt engineering + JSON schema outputs with OpenAI, not generic chat
- **UX for creators** — Scene editor, preview, copy buttons, and export checklist mirror a real SaaS workflow
- **Client-side media** — Browser canvas recording shows practical frontend engineering beyond typical CRUD apps
- **Scoped MVP** — Auth, DB, and cloud render deliberately deferred to ship a working demo fast

It showcases skills in **Next.js API routes**, **TypeScript domain modeling**, **AI prompt design**, **React state management**, and **browser media APIs** — packaged as a cohesive football content product rather than a generic AI wrapper.

---

## Project structure

```
src/
├── app/
│   ├── api/generate-script/route.ts   # OpenAI script generation API
│   ├── page.tsx                       # Main dashboard
│   └── layout.tsx
├── components/
│   ├── SceneEditor.tsx                # Scene editing & image upload
│   ├── VideoPreview.tsx               # 9:16 storyboard preview
│   ├── ExportPanel.tsx                # Export checklist, quality presets & WebM download
│   ├── ImageSourceHelper.tsx          # Free image search links per scene
│   ├── BreakLongVideoSection.tsx      # Video-to-shorts UI stub
│   └── CopyButton.tsx                 # Clipboard copy with feedback
├── lib/
│   ├── openai.ts                      # OpenAI client singleton
│   ├── generateFootieScript.ts        # Responses API script generation
│   ├── parseScript.ts                 # Safe JSON parsing & validation
│   ├── scriptSchema.ts                # Structured output JSON schema
│   ├── prompts.ts                     # AI prompt builder
│   ├── exportVideo.ts                 # Canvas + MediaRecorder export
│   └── formatScript.ts                # Full script formatting for copy
└── types/
    └── footiebitz.ts                  # Shared TypeScript types
```

---

## License

Private portfolio project. All rights reserved.
