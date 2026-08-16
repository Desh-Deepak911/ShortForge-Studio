# Preview, Browser, and Headless rendering

Preview and export share one **Master Timeline** (`startMs` / `endMs` on a single clock). Voiceover duration is the primary timing authority. This page is the rendering-path overview. Manifest versions: [EXPORT_MANIFEST_AND_CAPABILITIES.md](EXPORT_MANIFEST_AND_CAPABILITIES.md). Framing: [SOURCE_MEDIA_QUALITY.md](../product/SOURCE_MEDIA_QUALITY.md).

## Preview

- 9:16 device-frame playback in the Studio
- Resolves the same scene, subtitle, motion, and mixer state as export at a given `timeMs`
- Does not prove Headless or device-lab certification by itself

## Browser export

Implemented in `src/features/export/`. Production Browser encode is **`chunked-browser-v1`** (manifest-driven canvas frames, then mux). MediaRecorder is not the current primary path. See [EXPORT_RENDERER_ARCHITECTURE.md](EXPORT_RENDERER_ARCHITECTURE.md).

| Item | Current behavior |
| --- | --- |
| Aspect | 9:16 |
| Frame rate | 30 (not creator-selectable) |
| Resolutions | **720×1280** and **1080×1920** |
| WebM | VP8/VP9 + Opus |
| MP4 | H.264 + AAC when the runtime codec probe succeeds; blocked when it fails |
| Audio | Silent, voice, or voice+music; source-video audio is not muxed |
| Watermark | Always burned in (`FOOTIEBITZ`) |
| Mixer | Same stem math as preview; ducking and peak protection as in [AUDIO_MIXER.md](../product/AUDIO_MIXER.md) |

Browser UI does not offer 4K. 4K is a Headless pixel target.

Sprint 6A inventory notes in [EXPORT_CAPABILITIES.md](../product/EXPORT_CAPABILITIES.md) are historical. Prefer this page and the export domain types when they disagree.

## Headless export

Headless is a separate renderer: Chromium + native ffmpeg, a control plane, and optional hosted workers. It can target 1080p and 4K pixel sizes without changing Browser resolution labels.

- Local isolated worker can use system Chrome and native ffmpeg
- Production routes stay **configuration-blocked** until environment classification says otherwise
- Fly / Neon / R2 / Upstash evidence is recorded under [../evidence/headless/](../evidence/headless/README.md)
- Neon queue migration (Upstash Streams → Neon claim-next + on-demand Fly wake for **verify and render**): [headless/HEADLESS_NEON_QUEUE_MIGRATION.md](headless/HEADLESS_NEON_QUEUE_MIGRATION.md). `HEADLESS_QUEUE_PROVIDER=neon` has no Upstash runtime dependency. Staging flag only — do not cut over production without explicit approval. Prompt 6 is not authorized.
- Do not claim a hosted production certification unless that current evidence file says Pass for the relevant harness

Operations: [HEADLESS_OPERATIONS.md](../operations/HEADLESS_OPERATIONS.md).

## Shared draw path

Preview, Browser, and Headless hydrate draw media through shared helpers (`hydrate-export-draw-media` and framing layer plans). Fit, Fill, and Fit with background must not silently become a different treatment on one path.

## Legibility and overlays

- **Local legibility layers** (title window / fade) replace a permanent whole-frame dark overlay
- Engagement overlays and the ShortForge Studio outro are capability-gated visual-retention features
- Both use the shared ShortForge motion palette and output-space frame plans
- Studio Preview renders CTA and outro as scalable SVG; Browser and Headless draw the same resolved plans on canvas
- The active outro suppresses watermark, captions, and engagement overlays
- Brand Sting command immutability (overlays preserved byte-for-byte) is recorded in [BRAND_STING_EXPORT_BASELINE_FAILURE.md](../evidence/export/current/BRAND_STING_EXPORT_BASELINE_FAILURE.md)

## Release status

[VIDEO_QUALITY_RELEASE_READINESS.md](../evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md) is **conditionally ready**. Remaining documented blocker: manual Studio UX smoke not marked complete.

Quality warnings never block export.
