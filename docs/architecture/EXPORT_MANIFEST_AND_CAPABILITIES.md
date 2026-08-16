# Export manifest and renderer capabilities

This is the current manifest/capability overview. Historical Sprint 6–9 contract text remains in [EXPORT_CONTRACT.md](EXPORT_CONTRACT.md). When they disagree, `src/features/export/domain/export-manifest.types.ts` wins.

## Versions in source

| Version | Renderer contract | Role |
| --- | --- | --- |
| 2 | `"8D"` | Frozen multi-media timeline (hard-cut intra-scene) |
| 3 | `"9C"` | Frozen intra-scene transitions |
| **4** | **`"9D"`** | **Current production pair without keyframe authority** (`EXPORT_MANIFEST_VERSION`) |
| 5 | `"9E"` | Used when v5 capabilities are required (keyframes, overlays, brand sting, blurred fill, generated-voice mastering) |

Unknown versions fail closed. Manifests are rebuilt every export.

Browser resolution labels stay `"720p" | "1080p"`. Headless 4K uses a separate output-profile / pixel-target registry and does not extend those Browser labels.

## v5 required capabilities

From `ExportRendererCapabilityId`:

- `keyframed-visual-effects-v1`
- `engagement-overlays-v1`
- `shortforge-brand-sting-v1`
- `media-background-treatment-blurred-fill-v1`
- `generated-voice-mastering-v1`

A renderer that does not advertise a required capability must reject the job. Silent downgrade is not allowed.

`visual-retention-presets-v1` is creator-authoring orchestration. It is **not** an ExportManifest renderer requirement.

## Compatibility rules

- Legacy stories without `backgroundTreatment` stay legacy Fit
- v4 rejects blurred-fill; v5 requires the capability
- Generated-voice mastering on v5 requires `generated_speech_v1` on the voiceover track
- Integrity validation runs before cost, preload, and render
- Quality warnings never set `supported: false`

## Related

- Renderer architecture: [EXPORT_RENDERER_ARCHITECTURE.md](EXPORT_RENDERER_ARCHITECTURE.md)
- Preview/export paths: [PREVIEW_AND_EXPORT.md](PREVIEW_AND_EXPORT.md)
- Visual-retention gating: [VISUAL_RETENTION_CAPABILITY_FOUNDATION.md](VISUAL_RETENTION_CAPABILITY_FOUNDATION.md)
