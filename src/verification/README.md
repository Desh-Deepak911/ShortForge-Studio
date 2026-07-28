# Verification scripts

Non-production regression and QA scripts for ShortForge. These files live outside the
production build (`tsconfig.json` excludes `**/*.verify.ts`) and assert contracts between
preview, export, timeline, research, and related subsystems.

Runtime code stays in `src/lib` and `src/features`. Verification code only imports runtime
modules — it is never imported by production routes.

## Suite ownership

| Directory | Primary responsibility |
| --- | --- |
| `asset-intelligence/` | Asset search, ranking, and planning authority |
| `audio/` | Narration, mixer, and audio-first workflow |
| `drafts/` | Draft persistence and reload |
| `editor/`, `ui/` | Editor behavior and route-level UI contracts |
| `export/` | Browser/export manifest, timing, media, artifact, and parity checks |
| `headless-renderer/` | Control plane, worker, storage, hosted probes, and capacity certification |
| `hook-engine/` | Hook planning, validation, streaming, safety, and persistence |
| `retention-story/` | Retention planning and production integration |
| `scene-media-timeline/` | Multi-item media timeline authority |
| `scene-media-transitions/` | Intra-scene transition authority |
| `studio-intelligence/` | Studio planning and production wiring |
| `timeline/` | Shared timeline and playback foundations |
| `canonical/`, `utils/` | Shared verification helpers and canonical fixtures |

## File conventions

- `*.verify.ts` is an executable deterministic verification entry point.
- `*-fixtures.ts` contains reusable, production-shaped fixtures for a nearby suite.
- `run-*` files orchestrate a bounded matrix or gated harness.
- A provider-backed harness must remain gate-off by default and make zero provider
  connections when its gate is absent.
- Historical contract fixtures should state the frozen version explicitly. Current
  production fixtures should use exported version and contract constants.

## Refactor rules

- Keep production behavior out of verification helpers; tests may consume production APIs
  but must not become a second implementation.
- Prefer typed fixture builders over repeated casts or incomplete object literals.
- Preserve intentional invalid fixtures with the narrowest possible `unknown` boundary.
- When a production contract advances, update current fixtures while retaining explicitly
  labelled historical compatibility cases.
- Do not weaken a fail-closed assertion merely to remove a TypeScript diagnostic.
- Keep package scripts stable unless a dedicated script-organization change is reviewed.

## Validation layers

For a focused verification refactor:

1. Run the directly affected suite.
2. Run adjacent contract/authority suites.
3. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Run `npx tsc -p tsconfig.verify.json --pretty false` to measure strict verification debt.
5. Confirm `git diff --check` and audit that no runtime, evidence, credential, or artifact
   files entered the change set.

Provider-backed Fly, Neon, R2, Upstash, Vercel, and OpenAI checks are separate explicit
operations and must never be triggered by a repository-maintenance batch.

## How to run

### Single script (preferred for local iteration)

```bash
npm run test:transition-qa
npm run test:provider-engine-qa
npm run test:legacy-compat
```

### Domain batches

```bash
npm run test:verification
npm run test:verification:export
npm run test:verification:timeline
npm run test:verification:intelligence
```

The batch runner is `scripts/run-verification.mjs`. It discovers `*.verify.ts` files
automatically, so it does not need a manually maintained file list.

### Typecheck verification files only

```bash
npx tsc -p tsconfig.verify.json
```

## Key scripts by area

Before shipping export changes:

```bash
npm run test:export-payload
npm run test:export-preflight
npm run test:export-sync-qa
npm run test:export-subtitle-qa
npm run test:verification:export
```

Before shipping timeline or Preview changes:

```bash
npm run test:timeline-foundation-qa
npm run test:timeline-playback
npm run test:transition-qa
npm run test:timing-subtitle-qa
npm run test:verification:timeline
```

Before shipping intelligence or research changes:

```bash
npm run test:provider-engine-qa
npm run test:prompt-intelligence-qa
npm run test:story-structure-intelligence-qa
npm run test:canonical-pipeline-qa
npm run test:verification:intelligence
```

Some scripts can call live APIs. Provider-backed checks must only be run under their
documented explicit gate with the intended environment configured.

## When to add a verification file

Add a verification script for:

1. Cross-surface parity that must stay aligned across Preview, export, and timeline.
2. A regression lock for a corrected defect.
3. A non-obvious pipeline contract from research through export.
4. A source-structure gate that protects required production wiring.

Do not add a verification file for one-off debugging or duplicate an existing authority.

Checklist:

1. Place it in the owning `src/verification/<domain>/` directory.
2. Import production code through its public module boundary.
3. Add a stable `test:*` entry only when no existing domain runner discovers it.
4. Run the focused suite and the validation layers above.
5. Document explicit provider gates and gate-off zero-contact behavior when applicable.

## Related configuration

| File | Role |
| --- | --- |
| `package.json` | Individual `test:*` scripts and domain batch helpers |
| `tsconfig.json` | Excludes `**/*.verify.ts` from the production build |
| `tsconfig.verify.json` | Strictly typechecks verification sources |
| `scripts/run-verification.mjs` | Discovers and runs domain verification batches |
