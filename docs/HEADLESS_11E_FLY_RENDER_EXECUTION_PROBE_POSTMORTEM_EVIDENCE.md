# Sprint 11E Phase 2E.2D.8I - Fly render execution-probe postmortem

**Archived evidence SHA-256:** `a863e3cf06cb63085f5490f53ff0c69a97614ca540628b32e88ab56d3a621b33`
**Window start ms:** 1784900452972
**Window end ms:** 1784900831803

## Safe classification

- bootstrap_result_class=not_applicable
- frame_request_result_class=succeeded
- png_response_class=frames_emitted
- page_failure_reason_class=not_applicable
- chromium_exit_class=not_observed
- abort_timeout_class=harness_poll_timeout
- render_execution_duration_class=exceeded_harness_poll_timeout
- cleanup_substage=chromium_session_cleanup
- cleanup_failure_reason_class=harness_cleanup_failed
- primary_execution_failure_class=harness_observation_timeout_despite_worker_progress

## Safe event presence

- hosted_render_boundary_present=true
- hosted_loop_delivery_present=true
- frame_request_started_present=true
- frame_request_terminal_present=true
- chromium_session_cleanup_present=true
- fatal_process_event_present=false

## Sanitized log excerpt (bounded)

- 2026-07-24T13:51:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:51:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:52:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:52:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:52:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:52:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:53:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:53:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:53:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:53:54Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:54:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:54:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:54:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:54:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:55:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:55:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:55:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:55:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:56:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:56:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:56:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:56:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:57:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:57:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:57:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:57:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:58:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:58:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:58:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:58:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:59:09Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:59:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:59:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T13:59:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:00:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:00:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:00:38Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:00:53Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:01:08Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
- 2026-07-24T14:01:23Z app[[redacted-machine]] iad [info]{"name":"hosted.loop.delivery","atMs":[redacted-ms],"mode":"render","reasonId":"dispatch_outbox_sweep","action":"dispatch_sweep","facts":{"scanned":0,"dispatched":0,"rescheduled":0,"unconfirmed":0}}
