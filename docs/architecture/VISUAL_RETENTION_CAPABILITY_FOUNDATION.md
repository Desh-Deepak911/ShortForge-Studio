# Visual-Retention Capability Foundation

## Status

Implementation foundation on the staging-derived visual-retention branch.
Visual-retention phases remain forbidden on main and production. Phase behavior
is off unless an exact staging phase list is supplied.

## Non-negotiable invariants

1. Narration timing remains the visual-planning backbone.
2. Music is optional and is never a visual-pacing capability or requirement.
3. Browser 720p and 1080p remain supported product paths.
4. Headless 720p, 1080p, and 4K remain supported product paths.
5. Headless preference is advisory and cannot make Browser unselectable.
6. Required capability gaps fail terminally before upload, queueing, or render.
7. Optional capability gaps create actionable warnings and do not block export.
8. Existing projects and ExportManifest v2/8D, v3/9C, and v4/9D remain unchanged.
9. New project or manifest fields are optional and version-dispatched.
10. Preview, Browser, and Headless must share one frozen visual interpretation.

## Staging phase authority

`SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES` is a server-only comma-separated
list. The pure resolver receives deployment facts from a server boundary; it
does not read environment variables itself.

Every phase defaults off. Main/master, Vercel production, unknown deployment
targets, invalid IDs, dependency gaps, and non-allowlisted branches fail closed.
A later phase cannot be enabled while an earlier phase is off. Rolling a phase
back therefore also prevents dependent phases from presenting partial behavior.

## Capability negotiation

Each Preview, Browser, or Headless consumer advertises:

- its renderer kind;
- its supported visual-retention capabilities;
- its supported output resolutions.

Each project snapshot declares required and optional capabilities. Negotiation
runs before materialization or dispatch. Missing required support produces a
non-retryable `UNSUPPORTED_CAPABILITY` terminal result at `pre_dispatch`.
Missing optional support produces `OPTIONAL_CAPABILITY_UNAVAILABLE` warnings.

The output profile matrix is intentionally asymmetric:

| Consumer | 720p | 1080p | 4K |
|----------|------|-------|----|
| Preview | yes | yes | no |
| Browser | yes | yes | no |
| Headless | yes | yes | yes |

## UI completion authority

A creator-facing capability is not phase-complete when only its data model or
renderer lands. The UI coverage gate tracks the editor, scene inspector where
applicable, timeline, Preview, Browser export, Headless export, and warning/error
states. Phase certification must name every implemented surface and prove that
the capability-specific required set is complete.

This prevents deferred UI cleanup and avoids rebuilding the same feature after
its rendering contract has already frozen.

## Reserved optional extensions

Creator-capability IDs under the ordered phase chain through `12E` (independently
negotiated; fail-closed; single `GET /api/visual-retention/capabilities` fetch):

| Capability ID | Creator boolean |
|---|---|
| `keyframed-visual-effects-v1` | `keyframedVisualEffectsEnabled` |
| `engagement-overlays-v1` | `engagementOverlaysEnabled` |
| `shortforge-brand-sting-v1` | `shortForgeBrandStingEnabled` |
| `subject-aware-reframing-v1` | `subjectAwareReframingEnabled` |

Future staging activation value for motion capabilities (do not set until UI and
renderer slices land):

```
SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES=12A,12B,12C,12D,12E
```

Allowlisted development branch for this work: `staging-keyframed-motion-overlays`.

Multi-keyframe / custom transforms must not become preview-only behavior that
exports ignore. Keyframes cannot become render-authoritative until a versioned
ExportManifest and all Preview, Browser, and Headless consumers support the same
frozen motion fields.

### Visual-retention presets (`12F`)

| Capability ID | Creator boolean | Phase |
|---|---|---|
| `visual-retention-presets-v1` | `visualRetentionPresetsEnabled` | `12F` |

**Current live staging** (as of this capability-foundation slice) remains phases
through `12E` only:

```
SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES=12A,12B,12C,12D,12E
```

No live environment change was performed for `12F`. Presets stay fail-closed
until an authorized later activation.

`visual-retention-presets-v1` is creator-authoring orchestration. Future slices
may orchestrate existing authoring settings through their native controls; the
presets capability itself is not an ExportManifest renderer requirement and is
not advertised in Browser or Headless supported-renderer capability registries.
Creator Templates are unrelated generation-time story templates and remain a
separate feature.

Enablement requires explicit staging authority, an allowlisted branch, and an
exactly ordered phase list through `12F`. Missing earlier phases (including
`12E`) fail closed. Creator UI reads `visualRetentionPresetsEnabled` from the
same capabilities API response (one request; API version remains `1`). This
slice does **not** ship a preset catalog, commands, UI, persistence, QA harness,
or live rollout.

Future staging activation value (do not set until later gated slices are ready;
do not mutate live environment variables from this documentation):

```
SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES=12A,12B,12C,12D,12E,12F
```

Allowlisted development branch for presets work: `staging-visual-retention-presets`
(prior allowlisted staging-development branches remain accepted unchanged).

### Engagement overlays

Like, Share, Subscribe, or combined animations may be attached to a scene with
scene-relative start time, duration, position, and preset. They never change the
owning scene duration or require music. Creator UI remains unimplemented until a
later gated slice.

### ShortForge Studio brand sting

The promotional segment is optional. Absence or `enabled=false` adds zero render
duration. When enabled it is a 2, 2.5, or 3 second animation whose primary title
is exactly **ShortForge Studio**. It has no narration or captions and uses fixed
playback timing, independent of voice and project speed changes. Its visual
design remains preset-driven so the later brand-sting phase can deliver the
strongest animation without weakening the frozen behavioral rules. Export-drawer
controls remain unimplemented until a later gated slice.

### Subject-aware reframing

Optional subject/focus metadata may later suggest safe vertical framing with
explicit Apply/Undo. Enablement requires `subject-aware-reframing-v1` and must
not be inferred from `source-quality-intelligence-v1` alone.

These contracts remain isolated from `FootieScript` and ExportManifest until
their gated implementation lands. This prevents current projects or v2-v4
manifests from silently acquiring new render semantics.

## Manifest evolution rule

ExportManifest v2, v3, and v4 are frozen. The current builder continues emitting
v4/9D. The first render-affecting visual-retention field that changes frozen
semantics requires a new version-dispatched manifest contract, a new canonical
fingerprint payload, and explicit consumer capability support. Older consumers
must reject that version terminally rather than progress partway through a job.

## Exit criteria

- staging/main/production gate-off assertions pass;
- ordered activation and rollback assertions pass;
- required/optional negotiation assertions pass;
- Browser remains selectable when Headless is preferred but unsupported;
- the Browser/Headless resolution matrix remains frozen;
- optional engagement and brand-sting contracts validate without legacy defaults;
- v2/8D, v3/9C, and v4/9D identifiers remain unchanged;
- typecheck, lint, focused visual-retention capability verification, and selected
  legacy export/headless regressions pass;
- no provider operation or remote staging mutation is required for local closeout.
