# Sprint 11E Phase 2E.2D.3 — Fly-native Chromium sandbox capability probe

**Status:** FAIL  
**Fail class:** `billing_authorization_required`  
**Fly gate detail:** account marked high-risk; unlock required before app/Machine creation (`fly.io/high-risk-unlock`)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-21T21:43:44Z`  
**End (UTC):** `2026-07-21T21:44:05Z`  

## Authorization scope

| Item | Value |
|------|--------|
| Organization | `personal` |
| Region | `iad` |
| Neon region context | `us-east-1` (not contacted) |
| Temporary apps | at most one |
| Temporary Machines | at most one |
| Worker deployment | NOT AUTHORIZED / NOT RUN |
| Provider secrets | NOT USED |
| Ports/services | NONE |
| Migrations / `.env.local` / commit / push | NOT DONE |

## Prior local-Docker diagnosis (preserved)

| Item | Value |
|------|--------|
| Evidence | `docs/HEADLESS_11E_PHASE2E2D2A_CHROMIUM_SANDBOX_CORRECTION.md` |
| SHA-256 | `0ec713c52236c43b2f64f51b1482a0d8bd0eb0d20c7e8dd5f9d3128150a7d2f9` |
| Archive copy | `docs/HEADLESS_11E_PHASE2E2D2A_CHROMIUM_SANDBOX_CORRECTION.pre-2e2d3.md` (same SHA) |
| Accepted facts | `chromium-sandbox` installed + version-coherent; helper root:root mode 4755; Docker Desktop default runtime denied namespace movement; no sandbox-disabling workaround accepted |

Prior evidence was not overwritten.

## Preflight

| Check | Result |
|------|--------|
| `fly auth whoami` | PASS (authenticated; identity not recorded here) |
| Org slug `personal` | PASS |
| Region `iad` available | PASS (Ashburn, Virginia) |
| Branch | `feature/sprint-11-headless-renderer` |
| `git diff --check` | PASS |
| Deployable artifact hashes | MATCH (worker/page/BUILD_INFO unchanged) |

## Temporary resources

| Field | Value |
|------|--------|
| App prefix | `shortforge-hw-sandbox-` |
| App create | **FAILED** before durable app ownership |
| Remote image build | NOT RUN |
| Machine create/run | NOT RUN |
| Image architecture | NOT RECORDED (no image) |
| Machine resources | intended shared CPU / 1 CPU / 2048 MB / `iad` — not provisioned |

Fly refused app creation with a high-risk account unlock requirement. No Machine was created. No retry performed.

## Probe outcomes (not executed on Fly)

| Check | Result |
|------|--------|
| Effective non-root worker UID | NOT RUN |
| Sandbox helper ownership/mode/version | NOT RUN |
| Chromium namespace/zygote | NOT RUN |
| DOM evaluation | NOT RUN |
| Credentials present on Machine | N/A (no Machine) |
| Public service/port | N/A (no Machine/app service) |

## Cleanup

| Check | Result |
|------|--------|
| Temporary Machine removal | PASS (none remained / none created) |
| Temporary app deletion / absence verified | PASS (`fly apps list -o personal` empty of QA apps) |
| Local temporary probe scripts deleted | PASS |
| Local temporary variables cleared | PASS (orchestrator EXIT path) |
| Other Fly apps affected | NONE |

## Eligibility verdict

**Not eligible** to continue FFmpeg/page smoke on Fly, and **not eligible** for Fly staging worker preparation, until the Fly account high-risk unlock / billing authorization gate is cleared by the operator and this probe is re-authorized.

Local Docker Desktop Chromium userns limitation remains separately documented under 2E.2D.2A.

## Privacy

No access tokens, auth files, registry credentials, provider URLs, or full Fly account dumps are included in this document.
