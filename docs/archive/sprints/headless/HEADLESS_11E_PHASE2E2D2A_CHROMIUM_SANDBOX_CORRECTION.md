# Sprint 11E Phase 2E.2D.2A — Chromium setuid-sandbox correction

**Status:** FAIL (package correction applied; Chromium still fails under default Docker security — stopped, no second remediation)  
**Branch:** `feature/sprint-11-headless-renderer`  
**End (UTC):** `2026-07-21T21:26:23Z`  
**Scope:** local diagnosis + minimal Dockerfile package correction + one clean rebuild + one smoke rerun  
**Out of scope:** Fly, provider credentials, migrations, routes, `.env.local`, commit/push, security weakening

## Archived prior FAIL

| Field | Value |
|------|--------|
| Path | `docs/architecture/headless/HEADLESS_11E_PHASE2E2D2_DOCKER_IMAGE_AUTHORITY.md` |
| Archive copy | `docs/architecture/headless/HEADLESS_11E_PHASE2E2D2_DOCKER_IMAGE_AUTHORITY.md` |
| SHA-256 | `26288d6b9eef1ebb850a4e83d8f8b88a6fc0c50303db64128cd936b181840968` |
| Prior failure class | `sandbox_unavailable` / `No usable sandbox!` |
| Prior image | `footiebitz/headless-worker:2e2d2-local` (`sha256:147c844d1913…`) |

Prior FAIL evidence was not overwritten or reinterpreted.

## Diagnosis of `2e2d2-local` (before correction)

| Fact | Result |
|------|--------|
| Package `chromium-sandbox` installed | **NO** |
| `/usr/lib/chromium/chrome-sandbox` exists | **NO** |
| Debian `chromium` Recommends | `chromium-sandbox` |
| Root filesystem `nosuid` | NO (overlay `/` is `rw,relatime`) |
| `NoNewPrivs` | `0` |
| Docker `Privileged` / CapAdd / SecurityOpt overrides | none (defaults) |
| Sandbox-disabling Chromium flags in Dockerfile/entrypoint | absent |
| Classification | **`debian_chromium_sandbox_package_missing`** |

Cause matches authorization expectation: `apt-get --no-install-recommends` omitted the recommended `chromium-sandbox` package.

## Dockerfile correction

Explicitly install `chromium-sandbox` and fail closed at image build unless:

- `/usr/lib/chromium/chrome-sandbox` exists
- owner/group `0:0`
- executable bit set
- setuid bit set
- `chromium` and `chromium-sandbox` package versions are equal
- `/usr/bin/chromium` is executable

No `--no-sandbox`, no `--disable-setuid-sandbox`, no empty `CHROME_DEVEL_SANDBOX`, no privileged/SYS_ADMIN/seccomp=unconfined, no root Chromium, no foreign sandbox binary.

Container-authority suite updated to assert package + setuid helper build checks.

## Rebuild authority

| Field | Result |
|------|--------|
| Deterministic worker build | PASS |
| Application artifact hashes | **unchanged** |
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` |
| Corrected image tag | `footiebitz/headless-worker:2e2d2a-local` |
| Build | `--no-cache --platform linux/arm64` exit `0` |
| Image ID | `sha256:6f962bdc78deb67ffd43d4bb6bb5fe47e557cf6c521d464d913dd5d3e68bfc06` |
| Architecture / OS | `arm64` / `linux` |
| Size | ~1.62 GB |
| Registry push | NOT DONE |

### Sandbox helper after correction

| Fact | Result |
|------|--------|
| Path | `/usr/lib/chromium/chrome-sandbox` |
| Mode | `4755` (`-rwsr-xr-x`) |
| Owner/group | `0:0` (root:root) |
| setuid bit | PASS |
| `chromium` version | `150.0.7871.124-1~deb12u1` |
| `chromium-sandbox` version | `150.0.7871.124-1~deb12u1` |
| Same Debian Chromium version family | PASS |

## Chromium secure sandbox smoke — FAIL (stop)

Ran as `worker` with `--network none`, default Docker security profile, no CapAdd, not privileged, local `data:` URL only, no provider credentials, no sandbox-disabling flags.

| Check | Result |
|------|--------|
| Setuid helper present/root/setuid at runtime | PASS |
| `No usable sandbox` | **ABSENT** (prior failure cleared) |
| Chromium exit | `134` (SIGABRT) |
| DOM marker | FAIL |
| Bounded stderr | `Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted` + zygote `Check failed` |
| Failure class | **`zygote_userns_operation_not_permitted`** (post-package residual) |
| `unshare --user --pid` as worker | fails (`rc=1`) under default Docker Desktop security |
| Security weakened to obtain PASS | **NO** |

**Stop rule applied:** no second remediation; no `--no-sandbox`; no privileged/SYS_ADMIN/seccomp=unconfined.

## Not run (Chromium did not PASS)

| Step | Status |
|------|--------|
| FFmpeg/ffprobe synthetic codec matrix | NOT RUN |
| Shipped page-artifact Chromium load | NOT RUN |
| Fail-closed CLI re-matrix under 2e2d2a | NOT RUN (blocked by Chromium stop; prior 2e2d2 CLI still stands) |
| Resource peak measurements | NOT RUN |

## Verification / cleanup

| Item | Result |
|------|--------|
| `test:headless-hosted-worker-container-authority` | PASS (7) |
| `test:headless-deployable-worker-packaging-2e2c2` | PASS (11) |
| `test:headless-hosted-worker-environment` | PASS (13) |
| `test:headless-hosted-worker-composition` | PASS (6) |
| `test:headless-hosted-worker-import-boundary` | PASS (4) |
| typecheck | PASS |
| lint | PASS (pre-existing unrelated warning) |
| `git diff --check` | PASS |
| Smoke containers removed | PASS |
| Local images retained | `2e2d2-local` + `2e2d2a-local` (acceptable) |
| `.env.local` edited | NO (mtime unchanged; not present in git status) |
| Neon/R2/Upstash/Fly contact | NONE |
| Commit / push | NONE |

## Eligibility

**Not eligible** for Fly staging preparation: Chromium still cannot complete a secure headless launch under Docker Desktop’s default security profile after the setuid helper is correctly installed. Further work requires a separately authorized investigation of userns/PID-namespace requirements on the target runtime (Fly VM vs local Docker Desktop), without sandbox-disabling flags.
