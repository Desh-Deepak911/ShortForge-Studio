# Sprint 11E Phase 1 / 1A — Product Dispatch Foundation

## Existing Export ownership map

| Surface | Owner |
|---|---|
| Export CTA | `EditorStudioHeader` / mobile toolbar / story-sync “Export updated” → `StoryWorkspace.openExportDrawer` |
| Drawer shell | `ExportDrawer` |
| Browser export UI + session | `ExportPanel` + `features/export/session` |
| Freeze path | `prepareExportRequest` → `buildExportManifest` (v2/`8D` or v3/`9C`) — **not yet wired into headless product path** |
| Browser render | `exportFootieShort` → `exportFootieShortFromManifest` |
| Draft identity | Route `editor/[draftId]`; runtime `story-document.store` |
| Manifest `projectId` | Title slug from story (not draft UUID) — product binds `draftId` separately for persistence |
| Local drafts | `draft-storage.service` (`footiebitz:drafts:v1`) |
| Status UI pattern | `StudioStatus` + `aria-live` |
| Headless HTTP | `/api/headless-render/jobs*` → **503 `CONFIGURATION_UNAVAILABLE`** |
| Production composition | `composeProductionHeadlessControlPlane()` — no adapters |

## Phase distinction (exact)

| Layer | Authority |
|---|---|
| **Phase 1A fake end-to-end product QA** | `/dev/headless-render-qa` injects `FakeHeadlessRenderClient` + `FakeOwnedUploadAdapter`. Traverses shared `dispatchOwnedHeadlessJob` → upload → createJob → poll → download/cancel/retry. Explicit `test-auth:` markers + non-zero bytes only. Remount via `key={mode-epoch}`. |
| **Production configuration-blocked** | `ExportPanel` → `HeadlessExportSection` defaults to HTTP client + `UnavailableOwnedUploadAdapter`. Availability is `configuration_unavailable`. Job routes remain 503. Browser Export remains default. Headless failure never starts Browser Export. |
| **Future real prepare/materialize/provider wiring** | Real `prepareExportRequest`, frozen ExportManifest bytes, owned asset materialization, authenticated owner identity, durable storage/job-store/queue/hosted worker. Not started. |

## Product flow (authority)

```text
Creator clicks Export (Headless selected)
  → [future] freeze ExportManifest once (prepareExportRequest)
  → freeze canonical HeadlessRendererProfile + operationId + idempotencyKey
  → dispatchOwnedHeadlessJob:
       owned upload (port) → createJob (only if upload ok)
  → jobId returned (synchronous create)
  → poll getJob (asynchronous execution)
  → cancel / retry / download capability
```

## Availability contract

States: `available` | `configuration_unavailable` | `temporarily_unavailable` | `unsupported_profile` | `authentication_required`

- Client never infers availability from environment variables.
- Server route: `GET /api/headless-render/availability`
- Production currently: `configuration_unavailable`
- No fake Pass in production

## Client port + orchestration

`HeadlessRenderClient`: `getAvailability` · `createJob` · `getJob` · `cancelJob` · `retryJob` · `createDownloadCapability`

Shared orchestration: `dispatchOwnedHeadlessJob` (upload-before-create; frozen results; AbortSignal; thrown errors fail closed).

Implementations:

1. `HttpHeadlessRenderClient` — production HTTP (+ placeholder production guard)
2. `FakeHeadlessRenderClient` — testing/dev only (`product/testing`)
3. `UnavailableOwnedUploadAdapter` — production default
4. `FakeOwnedUploadAdapter` — testing/dev only (`product/testing`)

## Placeholder / foundation-only markers (Phase 1A.1)

Production UI may still construct foundation placeholders when `allowTestAuthority` is false:

- fingerprints: `pending-prepare`, `pending-bundle`
- owner: `pending-auth`
- build id: `product-dispatch-phase1`
- zero-byte payload placeholders

These are **not** real snapshot authority. Production HTTP rejects them with **zero fetch calls**.

`HttpHeadlessRenderClient` also rejects all `test-auth:` fingerprints/owners. Only future real SHA-256 fingerprints, real owner identity, and non-foundation renderer build ids may pass the production client guard.

Testing adapters (`FakeOwnedUploadAdapter` / `FakeHeadlessRenderClient`) accept explicit `test-auth:` only. QA sets `allowTestAuthority` explicitly — never inferred from mere `ownedUploadPort` injection (so future real provider injection cannot mint test-auth placeholders).

## Renderer selection (Phase 1A.1)

Policy **(a)**: disable Browser/Headless switching for the complete busy Headless lifecycle (availability/upload/create/active job). `onRendererChange` fires only when the internal transition is accepted. Accepted server jobs are never silently abandoned. Late `CREATE_OK` after cancel/terminal or non-headless renderer is ignored.

## Snapshot / idempotency

Phase 1A freezes profile + operationId + idempotencyKey and proves owned-upload/create-job orchestration with testing adapters. Polling never rebuilds the click snapshot. Edits after Export must not affect the active job. “Export updated video” mints a new snapshot/key once real prepare is wired.

## Asset-upload boundary

Port-only. Phase 1A fake path remains upload-then-`createJob` for the fake client.

**Future production dispatch order (2.1A / 2.1B):** Export acceptance reserves a stable `jobId` on a **provisional** store record (no `HeadlessRenderJobV1`) before trusted full-object verify completes; Stage B atomically promotes to a canonical record under the same `jobId`, then render enqueue is allowed. The Phase 1A fake lifecycle does not yet model Stage A/B and must not be treated as production acceptance ordering.

## Output compatibility (UI)

| Profile | Content max | Render max |
|---|---|---|
| 720p / 1080p / 4K | 60,000ms | 60,400ms |

Phase 3.2 streaming makes duration profile-bounded (not PNG-disk-bounded). Production routes remain configuration-blocked.

## Safe persistence (refresh recovery)

Persist only: version, draftId, jobId, createdAtMs, output summary, operationId. Never persist manifest, credentials, locators, signed URLs.

## Missing production providers

Auth/principal · durable storage · job store · queue · hosted worker · download capability issuer · real prepare/materialize path.

**11E Phase 2A / 2A.1 (implemented):** Clerk principal + fail-closed auth gates. Env classification `unconfigured|configured|invalid`; proxy containment; `AUTHENTICATION_FAILED` → availability `temporarily_unavailable` (never “sign in” on outage).

**11E Phase 2B.2B (Neon migration + live-QA authority):** Neon job-store / ownership adapters are implemented and configuration-gated. Explicit migrate runner and gated live harness exist; **remote migrate NOT EXECUTED; live Neon NOT RUN** in this phase. Authenticated users still get create/status blocked (`configuration_unavailable` / 503). Production Headless routes remain **CONFIGURATION-BLOCKED**. Browser Export remains production default. Sign-in UI deferred.

## Terminal status

```text
SPRINT 11E PHASE 2B PHASE 1 PROVIDER-NEUTRAL STORE + OWNERSHIP FOUNDATION: ACCEPTED FOUNDATION
SPRINT 11E PHASE 2A.1 CLERK AUTHORITY HARDENING: ACCEPTED FOUNDATION
CLERK IDENTITY: IMPLEMENTED / FAIL-CLOSED
PROJECT OWNERSHIP: CONTRACT + SCHEMA IMPLEMENTED / PRODUCTION UNAVAILABLE UNTIL NEON 2B.2
R2 FOUNDATION (2C.1): IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
SPRINT 11E PHASE 2D.1A UPSTASH LIVE-EVIDENCE TRUTH: READY FOR REVIEW
UPSTASH LIVE HARNESS: REAL RUNNERS / CONFIGURATION-GATED / LIVE NOT RUN
UPSTASH DUAL-LEASE PROTOCOL: IMPLEMENTED / CONFIGURATION-GATED / NOT LIVE-TESTED
AUTHORIZED LIVE PASS: REFUSED BEFORE PROVIDER CONTACT (STUB ERA) — EVIDENCE REMAINS NOT_TESTED
FLY WORKER: NOT STARTED
PRODUCTION HEADLESS ROUTES: CONFIGURATION-BLOCKED
BROWSER EXPORT: CURRENT PRODUCTION DEFAULT
NO COMMIT / NO PUSH
```
