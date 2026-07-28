# ShortForge documentation map

This directory contains two different kinds of records:

1. Product and engineering guidance that should be read as living documentation.
2. Immutable QA evidence whose filename, contents, and SHA may be referenced by verification authority.

Keeping those categories distinct is more important than making the directory visually
small. Evidence files must not be renamed, moved, rewritten, or consolidated unless all
code references and recorded SHA authorities have first been audited.

## Start here

| Area | Canonical entry points |
| --- | --- |
| System design | [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md) |
| Product features | [FEATURES.md](FEATURES.md), [GENERATION.md](GENERATION.md), [EDITING.md](EDITING.md) |
| Environment and gates | [ENV_AND_FEATURE_FLAGS.md](ENV_AND_FEATURE_FLAGS.md) |
| Export contract | [EXPORT_CONTRACT.md](EXPORT_CONTRACT.md), [EXPORT_CAPABILITIES.md](EXPORT_CAPABILITIES.md), [EXPORT_TIMING_MODEL.md](EXPORT_TIMING_MODEL.md) |
| Export architecture | [EXPORT_RENDERER_ARCHITECTURE.md](EXPORT_RENDERER_ARCHITECTURE.md), [EXPORT_ARCHITECTURE_AUDIT.md](EXPORT_ARCHITECTURE_AUDIT.md) |
| Export operations | [EXPORT_FAILURE_FORENSICS.md](EXPORT_FAILURE_FORENSICS.md), [EXPORT_AUDIO_AND_FORMATS.md](EXPORT_AUDIO_AND_FORMATS.md) |
| Studio UX | [studio-ux/](studio-ux/) |
| Local QA notes | [qa/](qa/) |

## Headless-renderer records

Files beginning with `HEADLESS_` form the renderer's implementation and certification
ledger. They intentionally remain at their existing paths because verification code can
bind to an exact path or SHA.

Use these current evidence documents first:

- [HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md](HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md)
- [HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md](HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md)
- [HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md](HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md)
- [HEADLESS_11E_FLY_RENDER_4K_OPERATIONAL_CAPACITY_EVIDENCE.md](HEADLESS_11E_FLY_RENDER_4K_OPERATIONAL_CAPACITY_EVIDENCE.md)
- [HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md](HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md)
- [HEADLESS_11E_NEON_LIVE_EVIDENCE.md](HEADLESS_11E_NEON_LIVE_EVIDENCE.md)

Naming conventions:

- `*.pre-*` and `*.pre-run-*` are byte-preserved historical snapshots.
- `*EVIDENCE.md` without a historical suffix is the current official record for that harness.
- `*POSTMORTEM*` and `*CORRECTION*` explain a failure boundary or the correction that followed.
- Phase documents are implementation authorities and should be read chronologically.

## Maintenance rules

- Add new living documentation to an existing topic file when it has the same owner.
- Add a new file when it represents a separately versioned contract, evidence record, or audit.
- Never commit credentials, environment files, provider logs, downloaded media, or temporary
  harness output.
- Never rewrite historical evidence to make a newer run look cleaner.
- Before relocating any evidence file, search the repository for both its filename and SHA.
- Prefer links from this index over duplicating the same explanation in several documents.

