# Export Failure Forensics (4.2C-8D)

## Debug flag

```bash
SHORTFORGE_EXPORT_DEBUG=1
# or
SHORTFORGE_EXPORT_FRAME_DEBUG=1
```

Emits `[ExportStage]`, `[ExportNormalize]`, `[ExportViability]`, and `[ExportPipelineFailure]` console events.

## Stage model

See `ExportStage` in `src/features/export/utils/export-pipeline-forensics.utils.ts`.

Failures throw `ExportPipelineError` with `stage`, `code`, `detail`, and `context`.  
`ExportPanel` maps these to stage-specific UI messages without exposing stderr/stacks.

## Why the UI showed a generic message

```ts
error instanceof Error ? error.message : "We couldn't finish the export. Try again."
```

Non-`Error` rejections (common for FFmpeg.wasm / worker aborts / OOM) became the generic string. Forensics now wraps unknown throws via `toExportPipelineError`.

## Image-sequence viability (1080×1920 × ~952)

Estimated JPEG sequence alone is hundreds of MB in FFmpeg MEMFS, plus raw WebM + encode buffers. Classification:

**Not viable for production 1080p browser export** (or at best **chunked only**).

## Recommended next architecture

**Option B (chunked browser image sequence)** for near-term correctness, or **Option E hybrid** (720p browser / 1080p server) for production scale. Do not keep full-sequence MEMFS for 1080p ~30s mixed exports.

## Related Sprint 6A docs

- `docs/EXPORT_ARCHITECTURE_AUDIT.md`
- `docs/EXPORT_CAPABILITIES.md`
- `docs/EXPORT_TIMING_MODEL.md`
- `docs/EXPORT_RELIABILITY_SPRINT.md`
- `docs/qa/export-preview-parity-matrix.md`
