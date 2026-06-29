# Verification scripts

Non-production regression and QA scripts for ShortForge. These files live outside the production build (`tsconfig.json` excludes `**/*.verify.ts`) and assert contracts between preview, export, timeline, research, and related subsystems.

Runtime code stays in `src/lib` and `src/features`. Verification code only imports runtime modules — it is never imported by production routes.

## Folder structure

```
src/verification/
├── README.md
├── audio/          Voiceover, background music, audio engine, export audio mix
├── canonical/      Canonical pipeline consolidation
├── drafts/         Draft persistence, hydration, script generation/review
├── editor/         Scene images, motion, Smart Edit / image tool bridge
├── entity/         Entity resolution and ownership
├── export/         Export payload, preflight, subtitles, sync, format
├── football/       Football research providers and API-Football adapters
├── graph/          Knowledge graph, prompt intelligence, provider engine
├── research/       Research grounding, script prompts, story structure
├── timeline/       Timeline authority, playback, transitions, subtitles
├── ui/             Cross-cutting UI / phase QA
└── utils/          Legacy compatibility, narration budget helpers
```

## Domain grouping

| Domain | Focus | Example scripts |
|--------|--------|-----------------|
| `audio/` | Voiceover lifecycle, BGM, browser/server audio mix | `test:audio-engine-qa`, `test:voiceover-service` |
| `canonical/` | Single canonical research → script pipeline | `test:canonical-pipeline-qa` |
| `drafts/` | Draft CRUD, reload, routing, script workflows | `test:drafts`, `test:script-generation` |
| `editor/` | Scene image upload, motion, external tool bridge | `test:scene-image-qa`, `test:smart-edit-image-action-qa` |
| `entity/` | Competition/player entity resolution | `test:entity-resolver-qa` |
| `export/` | Export settings, payload, ffmpeg path, subtitle burn-in | `test:export-sync-qa`, `test:export-subtitle-qa` |
| `football/` | Football-specific research services | `test:football-research-service` |
| `graph/` | Intelligence planner, graph context, provider routing | `test:provider-engine-qa`, `test:graph-context-qa` |
| `research/` | Grounding, prompts, duration control, top-scorers | `test:story-structure-intelligence-qa` |
| `timeline/` | Master timeline, transitions, caption timing | `test:timeline-foundation-qa`, `test:transition-qa` |
| `ui/` | Product-wide UI smoke checks | `test:phase-a-qa` |
| `utils/` | Legacy story compatibility | `test:legacy-compat` |

## Naming convention

| Pattern | Purpose |
|---------|---------|
| `<feature>.verify.ts` | Focused contract/regression tests for one subsystem |
| `<feature>Qa.verify.ts` | Broader QA suite; often reads source files and asserts cross-file invariants |

Script names in `package.json` follow `test:<kebab-case-feature>` and map 1:1 to a file under `src/verification/<domain>/`.

## How to run

### Single script (preferred for local iteration)

```bash
npm run test:transition-qa
npm run test:provider-engine-qa
npm run test:legacy-compat
```

### Domain batches (helper scripts)

```bash
npm run test:verification              # all domains (78 scripts)
npm run test:verification:export       # src/verification/export/
npm run test:verification:timeline     # src/verification/timeline/
npm run test:verification:intelligence   # canonical, entity, football, graph, research
```

The batch runner is `scripts/run-verification.mjs`. It discovers `*.verify.ts` files automatically — no manual file list to maintain.

### Typecheck verification files only

```bash
npx tsc -p tsconfig.verify.json
```

## Key scripts by area

**Before shipping export changes**

```bash
npm run test:export-payload
npm run test:export-preflight
npm run test:export-sync-qa
npm run test:export-subtitle-qa
# or
npm run test:verification:export
```

**Before shipping timeline / preview changes**

```bash
npm run test:timeline-foundation-qa
npm run test:timeline-playback
npm run test:transition-qa
npm run test:timing-subtitle-qa
# or
npm run test:verification:timeline
```

**Before shipping intelligence / research changes**

```bash
npm run test:provider-engine-qa
npm run test:prompt-intelligence-qa
npm run test:story-structure-intelligence-qa
npm run test:canonical-pipeline-qa
# or
npm run test:verification:intelligence
```

Some scripts call live APIs (e.g. API-Football). Ensure `.env.local` is configured when running provider or football research QA.

## When to add a new verification file

Add a verification script when:

1. **Cross-surface parity** — preview, export, and timeline must stay aligned (timing, transitions, subtitles, motion).
2. **Regression lock** — a bug was fixed and should not return without a failing script.
3. **Pipeline contract** — research → script → voiceover → export has a non-obvious invariant worth documenting in executable form.
4. **Source-structure gate** — QA needs to assert that production files still contain required wiring (common in `*Qa.verify.ts` files).

Do **not** add verification files for pure unit logic that belongs in a test framework, or for one-off debugging.

### Checklist for a new file

1. Create `src/verification/<domain>/<name>.verify.ts` (or `<name>Qa.verify.ts`).
2. Import runtime code via `@/lib/*` or `@/features/*` — never import other verify files at runtime (source reads via `readSrc()` are OK for QA gates).
3. Add `"test:<kebab-name>": "tsx src/verification/<domain>/<file>.verify.ts"` to `package.json`.
4. Run `npm run test:<kebab-name>` locally.
5. If the domain is covered by a batch helper, no extra wiring is needed — discovery is automatic.

## Related config

| File | Role |
|------|------|
| `package.json` | Individual `test:*` scripts and domain batch helpers |
| `tsconfig.json` | Excludes `**/*.verify.ts` from production build |
| `tsconfig.verify.json` | Typechecks `src/verification/**/*.verify.ts` only |
| `scripts/run-verification.mjs` | Domain batch runner |
