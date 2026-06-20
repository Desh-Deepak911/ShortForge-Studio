# FootieBitz

**Turn football ideas into narrated short-form videos in minutes.**

FootieBitz is a modern web application that transforms a football topic into a documentary-style narrated short. Go from a rough idea to a fully timed vertical video — with subtitles, uploaded scene images you can reposition and zoom, and optional narration audio — entirely in the browser.

---

## Features

### 🎙 Story Creation

- Generate 30s, 45s, or 60s football stories from a single prompt
- Documentary-style continuous narration — one story, not disconnected captions
- Structured JSON output with title, narration, and a timed scene breakdown

### 🎬 Production Timeline

- Automatically split into scenes with calculated start/end timings
- Edit subtitles and adjust scene durations (1–20 seconds each)
- Add buffer scenes: **Intro**, **Context**, **Transition**, **Ending**
- Move, duplicate, and delete scenes
- Upload a custom image per scene and adjust how it appears in frame
- Total timeline duration updates live

### 🖼 Image Framing

For manually uploaded scene images:

- **Drag** to reposition the image inside the 9:16 video frame
- **Zoom** to focus on the detail that matters
- **Fit** shows the full image without cropping; **Fill** covers the frame
- **Reset** restores the default framing
- Exported video uses the same positioning you see in preview

Works on desktop and touch devices. Legacy projects with older image URLs continue to work with sensible defaults.

### 🔊 Narration

- Generate natural narration audio via OpenAI Text-to-Speech
- Preview narration directly in the browser before exporting
- Narration plays independently of visual scene changes during preview

### 📱 Preview

- Vertical short preview (9:16) with a phone-style frame
- Subtitle overlays per scene
- Scene-by-scene playback with timeline progress
- Uploaded images reflect your pan, zoom, and fit settings
- Buffer scenes show type-labelled placeholders when no image is uploaded

### 📤 Export

- Client-side video rendering via HTML5 Canvas + FFmpeg.wasm
- No server upload required — everything runs in the browser
- Quality presets: **720p**, **1080p**, **1440p**, **4K**
- Optional narration audio track muxed into the final video
- Scene images export with the same framing as the preview
- Exported as a `.webm` file ready to upload anywhere

---

## Workflow

| Step | Section | What Happens |
|------|---------|--------------|
| 1 | **Story Brief** | Enter a football topic and pick a target duration |
| 2 | **Story Draft** | Review the generated title and narration |
| 3 | **Production Timeline** | Edit scenes, adjust durations, add buffer scenes |
| 4 | **Upload & Frame Images** | Attach images to scenes; drag, zoom, and choose Fit or Fill |
| 5 | **Narration** | Generate and preview the voiceover |
| 6 | **Preview** | Watch the full short in the browser |
| 7 | **Export** | Render and download the final video |

---

## Tech Stack

### Frontend

| Technology | Role |
|-----------|------|
| [Next.js 16](https://nextjs.org) | React framework, App Router, API routes |
| React 19 | UI components and state |
| TypeScript | Type safety throughout |
| Tailwind CSS v4 | Styling |
| Lucide React | Icons |

### AI

| Service | Role |
|---------|------|
| OpenAI Responses API | Story and scene generation |
| OpenAI Text-to-Speech | Narration audio (`tts-1`) |

### Rendering

| Technology | Role |
|-----------|------|
| HTML5 Canvas | Frame-by-frame scene rendering |
| [FFmpeg.wasm](https://ffmpegwasm.netlify.app) | Client-side audio/video muxing |

### Deployment

| Platform | Notes |
|----------|-------|
| [Vercel](https://vercel.com) | Serverless Edge-compatible deployment |

---

## Project Structure

```
footiebitz/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate-script/   # POST /api/generate-script
│   │   │   └── generate-voiceover/ # POST /api/generate-voiceover
│   │   ├── globals.css            # Global theme variables
│   │   ├── layout.tsx             # Root layout and metadata
│   │   └── page.tsx               # Main studio page
│   │
│   ├── components/
│   │   ├── StoryReview.tsx        # Step 2 — Edit title and narration
│   │   ├── SceneEditor.tsx        # Step 3 — Production timeline editor
│   │   ├── NarrationPanel.tsx     # Step 5 — Generate and preview voiceover
│   │   ├── VideoPreview.tsx       # Step 6 — Full short preview
│   │   ├── ExportPanel.tsx        # Step 7 — Export settings and download
│   │   ├── BreakLongVideoSection.tsx
│   │   └── CopyButton.tsx
│   │
│   ├── lib/
│   │   ├── exportVideo.ts         # Canvas rendering and frame export
│   │   ├── exportVideo.shared.ts  # Shared export utilities
│   │   ├── ffmpegClient.ts        # FFmpeg.wasm loader
│   │   ├── generateFootieScript.ts # Script generation logic
│   │   ├── generateVoiceover.ts   # Voiceover generation logic
│   │   ├── openai.ts              # OpenAI client
│   │   ├── parseScript.ts         # JSON parsing and scene normalization
│   │   ├── prompts.ts             # Prompt templates
│   │   ├── sceneTiming.ts         # Scene start/end calculation
│   │   ├── scriptModels.ts        # Model selection helpers
│   │   ├── scriptSchema.ts        # Structured output schema
│   │   ├── studioUi.ts            # Shared Tailwind class constants
│   │   ├── timeline.ts            # Scene insertion, duplication, ordering
│   │   ├── voiceover.ts           # Story state sync and narration validation
│   │   ├── voiceoverOptions.ts    # TTS voice and model options
│   │   └── blobUrl.ts             # Blob URL lifecycle helpers
│   │
│   └── types/
│       └── footiebitz.ts          # Core data types (FootieScript, FootieScene)
│
├── public/                        # Static assets
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Clone

```bash
git clone https://github.com/your-username/footiebitz.git
cd footiebitz
```

### Install

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=sk-...
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run test:scene-image` | Verify image positioning logic |

---

## Screenshots

> _Screenshots coming soon._

| Screen | Description |
|--------|-------------|
| Home | Story brief input and topic selector |
| Story Draft | Title and narration review |
| Production Timeline | Scene editor with image framing and buffer controls |
| Preview | Vertical short in a phone frame |
| Export | Quality presets and download |

---

## Future Roadmap

- [ ] Timeline drag and drop
- [ ] Scene splitting and merging
- [ ] Multiple narration voices
- [ ] Background music support
- [ ] Auto subtitle timing from audio
- [ ] Better transition animations
- [ ] Team collaboration (shared projects)
- [ ] Project save and load
- [ ] Template library

---

## Design Philosophy

FootieBitz is built around one idea: **story first.**

Most short-form video tools start with clips and ask you to add text. FootieBitz flips the workflow — start with a topic, generate a complete narrative, build the timeline around that narrative, and then add visuals. The story drives everything else.

The goal is to help creators produce documentary-quality short-form football content without needing a production team.

---

## License

[MIT](./LICENSE)
