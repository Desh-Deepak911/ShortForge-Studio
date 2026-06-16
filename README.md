# FootieBitz

**FootieBitz is an AI-powered football shorts creator that turns match topics into scene-based video storyboards and exportable short-form videos.**

Turn any match moment, derby, or talking point into a vertical YouTube Short — script, scenes, preview, and export — in one creator workflow.

---

## Demo flow

1. **Enter a topic** — e.g. *Real Madrid comeback* or *Champions League final drama*
2. **Choose tone & duration** — Dramatic, Funny, Tactical, News, or Emotional · 30 / 45 / 60 seconds
3. **Generate script** — Gemini writes a title, hook, caption, hashtags, and 5–6 scenes
4. **Edit the storyboard** — Tweak subtitles, timing, and upload one image per scene
5. **Preview** — Browse scenes in a 9:16 phone-frame preview
6. **Export** — Download a vertical WebM video rendered entirely in the browser

---

## Features

- **AI script generation** — Football-focused prompts with tone control and structured JSON output
- **Scene-based storyboard** — Each scene includes subtitle, duration, and AI image prompt
- **Scene editor** — Edit text, adjust timing, upload/replace/remove images with upload progress
- **Live 9:16 preview** — Phone-frame mockup with scene navigation and placeholder states
- **Browser video export** — Canvas + MediaRecorder pipeline at 1080×1920 (WebM download)
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
| AI | Google Gemini (`gemini-2.0-flash`) via `@google/generative-ai` |
| Video export | HTML Canvas + `MediaRecorder` (client-side WebM) |
| Icons | Lucide React |

---

## How to run locally

### Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key for Gemini

### Setup

```bash
# Clone the repo and enter the project
cd footiebitz

# Install dependencies
npm install

# Add your Gemini API key (copy from .env.example)
```

Set your key in `.env.local`:

```env
GEMINI_API_KEY=your_key_here
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
| `GEMINI_API_KEY` | Yes | Google Gemini API key for script generation |

The key is only used server-side in `/api/generate-script` and is never exposed to the client.

---

## MVP limitations

This is a deliberate MVP — focused on proving the creator workflow, not production video infrastructure.

- **No auth or accounts** — Single-session, in-browser experience
- **No database** — Script state lives in React state only (lost on refresh)
- **No match data scraping** — Topics are user-provided; AI avoids inventing exact stats
- **No AI image generation** — Scenes include image *prompts*; creators upload their own images
- **WebM export only** — MP4/FFmpeg export is not wired up yet; export uses real-time MediaRecorder
- **Real-time recording** — A 30s short takes ~30s to export (canvas records live)
- **No cloud rendering** — All video export happens client-side in the browser
- **No audio/voiceover** — Visual storyboard and subtitles only

---

## Future roadmap

- **MP4 export** — FFmpeg.wasm or server-side rendering for universal platform upload
- **AI scene images** — Generate backgrounds from `imagePrompt` automatically
- **Voiceover & captions** — TTS narration and burned-in subtitle styling
- **Templates** — Pre-built styles for goals, derbies, transfers, and match recaps
- **Project persistence** — Save/load storyboards (local storage or database)
- **Auth & teams** — Creator accounts and shared workspaces
- **Match data integration** — Optional API hooks for scores, lineups, and stats
- **Direct publishing** — YouTube Shorts / TikTok upload integrations

---

## Portfolio explanation

FootieBitz is a portfolio project that demonstrates **full-stack product thinking** for a niche AI creator tool:

- **Problem framing** — Football creators need fast vertical content, but scripting and storyboarding is slow
- **AI integration** — Structured prompt engineering + JSON parsing with Gemini, not generic chat
- **UX for creators** — Scene editor, preview, copy buttons, and export checklist mirror a real SaaS workflow
- **Client-side media** — Browser canvas recording shows practical frontend engineering beyond typical CRUD apps
- **Scoped MVP** — Auth, DB, and cloud render deliberately deferred to ship a working demo fast

It showcases skills in **Next.js API routes**, **TypeScript domain modeling**, **AI prompt design**, **React state management**, and **browser media APIs** — packaged as a cohesive football content product rather than a generic AI wrapper.

---

## Project structure

```
src/
├── app/
│   ├── api/generate-script/route.ts   # Gemini script generation API
│   ├── page.tsx                       # Main dashboard
│   └── layout.tsx
├── components/
│   ├── SceneEditor.tsx                # Scene editing & image upload
│   ├── VideoPreview.tsx               # 9:16 storyboard preview
│   ├── ExportPanel.tsx                # Export checklist & WebM download
│   └── CopyButton.tsx                 # Clipboard copy with feedback
├── lib/
│   ├── prompts.ts                     # AI prompt builder & parser
│   ├── exportVideo.ts                 # Canvas + MediaRecorder export
│   └── formatScript.ts                # Full script formatting for copy
└── types/
    └── footiebitz.ts                  # Shared TypeScript types
```

---

## License

Private portfolio project. All rights reserved.
