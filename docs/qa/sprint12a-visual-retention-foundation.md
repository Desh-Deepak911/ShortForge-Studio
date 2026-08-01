# Sprint 12A Visual Retention Foundation — Local QA

## Scope

Local-only verification against staging baseline
`b5455ff4e5996207b2847c8fe8b0eb1121e94347`. No provider operation, remote
database mutation, deployment, or staging flag activation was performed.

## Results

| Check | Result |
|-------|--------|
| Sprint 12A focused foundation | PASS |
| TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint for Sprint 12A sources | PASS |
| Browser export capability preflight | PASS — 19 tests |
| ExportManifest regression | PASS — 9 tests |
| Scene Media export regression | PASS — 54 tests |
| Headless render contract regression | PASS — 32 tests |
| Headless product UI regression | PASS — 7 tests |

## Focused authority proven

- Sprint 12 phases default off.
- Main/master and Vercel production hard-disable every Sprint 12 phase.
- Unknown phase IDs reject the full gate snapshot.
- Later phases cannot activate across a dependency gap.
- Narration timing is present in the base capability set; music is absent from
  the capability model and cannot become a pacing requirement.
- Required capability gaps return non-retryable `UNSUPPORTED_CAPABILITY` at
  `pre_dispatch`.
- Optional capability gaps warn without blocking.
- Headless preference leaves Browser selectable when Browser is supported.
- Browser remains 720p/1080p and Headless remains 720p/1080p/4K.
- Engagement-overlay and ShortForge Studio brand-sting extensions are optional.
- An absent or disabled brand sting adds zero duration.
- The brand sting contract rejects narration, captions, non-fixed playback
  speed, non-ShortForge title text, and unsupported 2–3 second durations.
- ExportManifest v2/8D, v3/9C, and v4/9D identifiers remain unchanged.

## Pre-existing staging baseline failure

`npm run test:legacy-compat` fails on the untouched staging archive and on the
Sprint 12A snapshot at the same pre-existing assertion:

- expected legacy `voiceSettings`: `{ speed: 1 }`
- current staging materialization: `{ speed: 1, stylePreset: "neutral", expressiveDelivery: false }`

Sprint 12A does not modify voice settings, story synchronization, or that test.
The failure is therefore recorded but not repaired in this scope. The narrower
and directly relevant legacy ExportManifest/headless/mixed-media contract suites
all pass.

## Local rollback

Sprint 12A is additive. Rollback consists of removing
`src/features/visual-retention/`, its focused verification and documentation,
and the package script. With the staging flag unset, every phase is already off
and existing runtime behavior is unchanged.

## Remote status

Not tested. Sprint 12A requires a separately controlled staging gate-on/gate-off
validation before remote activation. Main and production remain forbidden.
