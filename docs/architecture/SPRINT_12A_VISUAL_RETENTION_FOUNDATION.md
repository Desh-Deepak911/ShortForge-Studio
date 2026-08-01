# Sprint 12A — Visual Retention Compatibility and Safety Foundation

## Status

Implementation foundation on the staging-derived Sprint 12 branch. Sprint 12
remains forbidden on main and production. Phase behavior is off unless an exact
staging phase list is supplied.

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
targets, invalid IDs, and dependency gaps fail closed. A later phase cannot be
enabled while an earlier phase is off. Rolling a phase back therefore also
prevents dependent phases from presenting partial behavior.

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

Sprint 12A reserves, but does not yet attach or render, two Phase 12E contracts:

### Engagement overlays

Like, Share, Subscribe, or combined animations may be attached to a scene with
scene-relative start time, duration, position, and preset. They never change the
owning scene duration or require music.

### ShortForge Studio brand sting

The promotional segment is optional. Absence or `enabled=false` adds zero render
duration. When enabled it is a 2, 2.5, or 3 second animation whose primary title
is exactly **ShortForge Studio**. It has no narration or captions and uses fixed
playback timing, independent of voice and project speed changes. Its visual
design remains preset-driven so Sprint 12E can deliver the strongest animation
without weakening the frozen behavioral rules.

These contracts remain isolated from `FootieScript` and ExportManifest until
their gated implementation lands. This prevents current projects or v2-v4
manifests from silently acquiring new render semantics.

## Manifest evolution rule

ExportManifest v2, v3, and v4 are frozen. The current builder continues emitting
v4/9D during Sprint 12A. The first render-affecting Sprint 12 field requires a
new version-dispatched manifest contract, a new canonical fingerprint payload,
and explicit consumer capability support. Older consumers must reject that
version terminally rather than progress partway through a job.

## Sprint 12A exit criteria

- staging/main/production gate-off assertions pass;
- ordered activation and rollback assertions pass;
- required/optional negotiation assertions pass;
- Browser remains selectable when Headless is preferred but unsupported;
- the Browser/Headless resolution matrix remains frozen;
- optional engagement and brand-sting contracts validate without legacy defaults;
- v2/8D, v3/9C, and v4/9D identifiers remain unchanged;
- typecheck, lint, the focused Sprint 12A verification, and selected legacy
  export/headless regressions pass;
- no provider operation or remote staging mutation is required for local closeout.
