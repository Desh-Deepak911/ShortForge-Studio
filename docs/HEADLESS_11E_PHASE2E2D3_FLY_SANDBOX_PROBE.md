# Sprint 11E Phase 2E.2D.3 — Fly-native Chromium sandbox capability probe

**Status:** PASS  
**Fail class:** _(none)_  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T00:12:01Z`  
**End (UTC):** `2026-07-22T00:14:38Z`  

## Authorization scope

| Item | Value |
|------|--------|
| Organization | `personal` |
| Region | `iad` |
| Neon region context | `us-east-1` (not contacted) |
| Temporary QA apps | one uniquely named app (destroyed) |
| Temporary Machines | one (destroyed) |
| Remote image build | one (deployable worker Dockerfile; chromium-sandbox asserts intact) |
| Worker staging deployment | NOT AUTHORIZED / NOT RUN |
| Provider secrets (Neon/R2/Upstash/Clerk/app) | NOT USED |
| Ports / public HTTP service | NONE |
| Migrations / `.env.local` / commit / push | NOT DONE |
| `--no-sandbox` / security weakening | NOT USED |

## Prior local-Docker diagnosis (preserved)

| Item | Value |
|------|--------|
| Evidence | `docs/HEADLESS_11E_PHASE2E2D2A_CHROMIUM_SANDBOX_CORRECTION.md` |
| SHA-256 | `0ec713c52236c43b2f64f51b1482a0d8bd0eb0d20c7e8dd5f9d3128150a7d2f9` |
| Archive copy | `docs/HEADLESS_11E_PHASE2E2D2A_CHROMIUM_SANDBOX_CORRECTION.pre-2e2d3.md` (same SHA) |
| Accepted facts | `chromium-sandbox` installed + version-coherent; helper root:root mode 4755; Docker Desktop default runtime denied namespace movement; no sandbox-disabling workaround accepted |

## Prior account-gate attempt (preserved)

| Item | Value |
|------|--------|
| Archive | `docs/HEADLESS_11E_PHASE2E2D3_FLY_SANDBOX_PROBE.pre-account-unlock-FAIL.md` |
| SHA-256 | `a69fb7089dc9fdae87deb698acb4af71f90be5433a0a1927d1c89c4dcb773129` |
| Result | `billing_authorization_required` (high-risk unlock) — cleared by operator before this resume |

## Preflight

| Check | Result |
|------|--------|
| Branch | `feature/sprint-11-headless-renderer` (dirty tree preserved) |
| `git diff --check` | PASS (before provider contact and after suites) |
| `hosted-worker.js` SHA-256 | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` (MATCH) |
| `page-render.iife.js` SHA-256 | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` (MATCH) |
| `BUILD_INFO.json` SHA-256 | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` (MATCH) |
| Dockerfile SHA-256 | `13c36f2c18c43cf70b144b2bf42f0088f54b68c4a8a1e67e32b1eade36c59b3a` (MATCH; chromium-sandbox + setuid asserts intact) |
| `fly auth whoami` | PASS (authenticated; identity not recorded) |
| Org slug `personal` | PASS |
| Region `iad` available | PASS |
| Account/app-creation eligibility | PASS (post unlock) |

## Temporary resources

| Field | Value |
|------|--------|
| App prefix | `shortforge-hw-sandbox-` |
| App create | PASS |
| Remote image build | PASS (linux/amd64 worker image; chromium + chromium-sandbox + ffmpeg) |
| Machine region | `iad` |
| Machine architecture | `x86_64` |
| Machine resources | shared CPU / 1 CPU / 2048 MB |
| Autostart | disabled (`--autostart=false`); one-shot probe via `--shell --user worker` |
| Restart policy | no |
| Secrets / env credentials | none |
| Public service / HTTP listener | none |

## Probe outcomes

| Check | Result |
|------|--------|
| Effective UID/GID | `10001` / `10001` (non-root worker) — PASS |
| Sandbox helper path | `/usr/lib/chromium/chrome-sandbox` |
| Sandbox owner / mode | `0:0` / `4755` (setuid) — PASS |
| Chromium / sandbox package versions | `150.0.7871.124-1~deb12u1` (coherent) — PASS |
| `unshare --user --pid` | rc=`0` |
| Chromium startup (no `--no-sandbox`) | exit `0` — PASS |
| DOM evaluation | PASS (marker present) |
| FFmpeg VP9+Opus / H.264+AAC + ffprobe | PASS (synthetic 320×240 only; not 4K) |
| Page-render artifact presence / src-tree absence / runtime path token | PASS |
| Hosted worker consumers | NOT RUN |
| Staging worker deploy | NOT RUN |

Benign Chromium stderr noted (dbus session bus absent); not classified as sandbox failure.

## Cleanup

| Check | Result |
|------|--------|
| Temporary Machine removal | PASS |
| Temporary QA app deletion / absence | PASS (no `shortforge-hw-sandbox-*` apps remain) |
| Local temporary probe scripts / fly.toml deleted | PASS |
| Fly-managed remote builder app | May remain in org (`fly-builder-*`); not a QA probe app; not destroyed by this probe |
| Other application Fly apps affected | NONE |
| `.env.local` | unchanged |
| Commit / push | NOT DONE |

## Local authority suites (post-probe)

| Suite | Result |
|------|--------|
| `test:headless-hosted-worker-container-authority` | PASS (7) |
| `test:headless-deployable-worker-packaging-2e2c2` | PASS (11) |
| `git diff --check` | PASS |

## Eligibility verdict

**Eligible** for Fly staging worker **preparation** (next authorized phase): secure Chromium sandbox, DOM evaluation, and bounded FFmpeg/page-render artifact smoke all PASS on a no-secret Fly Machine in `iad` using the accepted deployable-worker image.

Still **not** proven / not authorized by this probe:

- Staging worker deployment or consumer loop operation
- Hosted 4K render capacity / process-tree endurance
- Production route activation
- Neon / R2 / Upstash / Clerk wiring on Fly

Local Docker Desktop Chromium userns limitation remains separately documented under 2E.2D.2A and is superseded for Fly-native capability by this PASS.

## Privacy

No access tokens, auth files, registry credentials, provider URLs, Machine/app IDs, Request IDs, emails, or full Fly account dumps are included in this document.
