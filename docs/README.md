# ShortForge documentation map

This directory contains two different kinds of records:

1. **Living documentation** — product, architecture, and operations guidance that may evolve.
2. **Immutable QA evidence** — filenames, contents, and SHA-256 values that verification authority may bind.

Evidence authority is more important than a visually flat tree. Files beginning with `HEADLESS_` and historical `pre-*` / `pre-run-*` snapshots **remain at their existing paths** because verification code can bind to an exact path or hash. Do not rename, move, rewrite, or deduplicate those files without a full path-and-SHA migration audit.

## Product

| Topic | Entry points |
| --- | --- |
| Features and editing | [product/FEATURES.md](product/FEATURES.md), [product/GENERATION.md](product/GENERATION.md), [product/EDITING.md](product/EDITING.md) |
| Rendering and media | [product/RENDERING.md](product/RENDERING.md), [product/MEDIA_FRAMING.md](product/MEDIA_FRAMING.md), [product/SHARED_MEDIA_MOTION.md](product/SHARED_MEDIA_MOTION.md) |
| Audio and transitions | [product/AUDIO_MIXER.md](product/AUDIO_MIXER.md), [product/INTRA_SCENE_TRANSITIONS.md](product/INTRA_SCENE_TRANSITIONS.md), [product/TRANSITIONS-SCOPE.md](product/TRANSITIONS-SCOPE.md) |
| Studio Intelligence | [product/STUDIO_INTELLIGENCE.md](product/STUDIO_INTELLIGENCE.md) |
| Export product surface | [product/EXPORT_CAPABILITIES.md](product/EXPORT_CAPABILITIES.md), [product/EXPORT_TIMING_MODEL.md](product/EXPORT_TIMING_MODEL.md), [product/EXPORT_AUDIO_AND_FORMATS.md](product/EXPORT_AUDIO_AND_FORMATS.md) |
| Studio UX | [product/editor/](product/editor/) |
| Planning | [product/FUTURE.md](product/FUTURE.md) |

## Architecture

| Topic | Entry points |
| --- | --- |
| System design | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md), [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md) |
| Export contract | [architecture/EXPORT_CONTRACT.md](architecture/EXPORT_CONTRACT.md) |
| Export renderer | [architecture/EXPORT_RENDERER_ARCHITECTURE.md](architecture/EXPORT_RENDERER_ARCHITECTURE.md) |
| Export audit | [architecture/EXPORT_ARCHITECTURE_AUDIT.md](architecture/EXPORT_ARCHITECTURE_AUDIT.md) |

Root companions: [../MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md), [../ARCHITECTURE.md](../ARCHITECTURE.md), [../ROADMAP.md](../ROADMAP.md).

## Operations

| Topic | Entry points |
| --- | --- |
| Environment and gates | [operations/ENV_AND_FEATURE_FLAGS.md](operations/ENV_AND_FEATURE_FLAGS.md) |
| Export forensics | [operations/EXPORT_FAILURE_FORENSICS.md](operations/EXPORT_FAILURE_FORENSICS.md) |
| Fly staging scripts | [../scripts/fly-staging/](../scripts/fly-staging/) |

## QA

Local QA notes and sprint freeze ledgers: [qa/](qa/).

## Headless renderer evidence

Files beginning with `HEADLESS_` form the renderer implementation and certification ledger at **stable root paths** under `docs/`.

Current evidence entry points (paths unchanged):

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
- Phase documents (`HEADLESS_11E_PHASE*`) are implementation authorities and should be read chronologically.

## Historical / refactor archive

- [archive/refactor/REPOSITORY_REFACTOR_FINAL_AUDIT.md](archive/refactor/REPOSITORY_REFACTOR_FINAL_AUDIT.md)

## Maintenance rules

- Add new living documentation to the matching topic folder when it shares the same owner.
- Add a new root-level file only when it represents a separately versioned contract, evidence record, or audit.
- Never commit credentials, environment files, provider logs, downloaded media, or temporary harness output.
- Never rewrite historical evidence to make a newer run look cleaner.
- Before relocating any evidence file, search the repository for both its filename and SHA.
- Prefer links from this index over duplicating the same explanation in several documents.
