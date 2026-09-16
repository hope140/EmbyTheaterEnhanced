# Helper composition and input feasibility gate

Date: 2026-09-16. Scope: Phase 2A research-only gate on the frozen Electron
18.3.15 runtime. This document records the final run-11 evidence for candidate
B, the isolated native helper. It does not approve production integration or
change the current Pepper/libmpv client.

## Result

**Gate: CONDITIONAL PASS.** The helper-owned D3D11 video surface can coexist
with an HTML overlay window, accept the required controls, follow the parent
through the exercised window states, and survive a helper access violation.
The result is conditional because the two real displays available to the run
both reported 150% scaling / native DPI 144. The hard mixed-DPI case and input
alignment after an actual DPI change therefore remain blocked. Candidate B
remains **RESEARCH DIRECTION**, not a production architecture decision.

Confidence: **MEDIUM-HIGH** for the exercised same-DPI composition, input,
window-lifecycle and helper-crash claims. It is not confidence for mixed-DPI,
HDR, device-loss, sustained performance, full bridge equivalence, or real
Emby playback.

## Evidence and environment

The retained evidence copies are [run.json](../experiments/helper-composition-gate/evidence/run.json),
[runner.json](../experiments/helper-composition-gate/evidence/runner.json),
[native-build.json](../experiments/helper-composition-gate/evidence/native-build.json),
the independent [visual-review.json](../experiments/helper-composition-gate/evidence/visual-review.json),
and the labelled PNG captures in the same directory. The final machine-readable
run was completed naturally with runner exit code `0`, `timedOut=false`, and no
forced timeout classification. The runner recorded the root PID and UTC start
time; its timeout path now fails closed unless that identity still matches.
The final screenshots were reviewed separately;
the evidence file's status field alone is not treated as visual proof.

The run used Windows x64, Electron `18.3.15`, Chromium `100.0.4896.160`,
Node `16.13.2`, and mpv `v0.41.0-920-gdd5d17d32`. The topology was a frameless
main `BrowserWindow`, a helper-owned `WS_CHILD` video window, and a parent-owned
transparent frameless overlay `BrowserWindow`. The helper's native video path
reported the unchanged B settings:

| Property | Observed value |
|---|---|
| `current-vo` | `gpu-next` |
| `gpu-api` | `d3d11` |
| `gpu-context` | `d3d11` |
| `hwdec` | `d3d11va` |
| `hwdec-current` | `d3d11va` |
| `d3d11-output-mode` | `auto` |
| Video | generated H.264/AVC, 640x360, SDR BT.709 |

This is a synthetic generated test frame, not a copyrighted or private media
sample. The run observed `core-playing`/advancing playback and a 30-second
duration; `loadToAdvancingMs` was `441.25` in this run. These values are
telemetry for the isolated prototype and do not establish a production startup
budget.

## Visual PASS

The final desktop BitBlt captures were taken from the parent physical window
rectangle. Main-thread review confirmed that every requested visible state
contained the generated SDR video frame and the expected HTML OSD where the
overlay was enabled. The frame timecode changed across transitions, so a
static stale screenshot was not used as evidence of playback.

The reviewed visual set is:

- `playing-overlay-visible`
- `overlay-visible-again`
- `resized`
- `maximized`
- `restore-after-minimize`
- `fullscreen`
- `fullscreen-exit`
- `monitor-0`
- `monitor-1`
- `secondary-fullscreen`
- `after-crash-reload`

`overlay-hidden` also showed the actual video surface with the HTML OSD absent,
as required for the hide state. The overlay and main bounds were physically
matched in the final topology records, including the secondary display and
post-crash recreation.

The following visual/lifecycle claims are therefore PASS for the tested
same-DPI environment: overlay show/hide/re-show, resize, maximize and restore,
minimize and restore, HTML Escape fullscreen enter/exit, move to monitor 0 and
monitor 1, fullscreen on the current monitor, and video after helper recreate.

## TELEMETRY PASS

The final run reported PASS for initialization, native video path,
`LOAD_AND_CORE_PLAYING`, overlay mouse input, video-area click-through, focus
recovery after video click, button/slider/mouse movement/hover/click-through,
Space/Left/Right/Enter/Escape, Alt-Tab away/back, resize and window lifecycle.
The run collected 635 native events. Representative control observations were
button round trip `46.26ms` and slider round trip `21.79ms`.

The click-through record showed `SendInput ok=true` and classified the target at
the injection point as a native-video descendant inside the main window and
outside the overlay. The post-click foreground/focus state remained in the main
window, while the overlay remained interactive at its own control locations.
Alt-Tab recorded the away window as foreground and then restored focus to the
overlay. These are interaction telemetry claims; they do not by themselves
prove every future Emby UI control or the full production bridge adapter.

Both enumerated displays reported `scaleFactor=1.5` and native DPI `144`.
Per-monitor awareness was recorded separately for the main process, helper
process, helper surface thread, helper command thread, child window, and
overlay. Consequently the following are
separate claims:

| Gate | Result | Meaning |
|---|---|---|
| Single-DPI geometry and input | PASS | 150% / DPI 144 on the exercised displays |
| Same-DPI monitor transition | PASS | Main, child and overlay followed the second display |
| Fullscreen uses current monitor | PASS | Primary and secondary fullscreen captures showed video |
| Real mixed-DPI | BLOCKED | No pair of currently enumerated displays had different scale factors |
| Input alignment after DPI change | BLOCKED | No real DPI change occurred; API/synthetic simulation is not a PASS |

The blocked rows are coverage gaps, not observed failures. No API simulation is
promoted to mixed-DPI acceptance.

The security baseline also passed: `sandbox=true`, `contextIsolation=true`,
`nodeIntegration=false`; the renderer reported no Node globals. The exposed
preload surface was status/control scoped. Raw HWNDs, arbitrary native
commands, filesystem access, child-process access, and the helper pipe were not
exposed to the renderer.

The helper access violation exited with Windows code `0xC0000005` while the
Electron main process and renderer stayed alive. The overlay remained visible,
the helper was recreated, and video was reloaded and advanced in
`after-crash-reload`. This proves process-local crash containment and recovery
for the exercised fault. It does not prove GPU-driver-reset recovery, kernel
failure isolation, security sandboxing of the helper, or parent-death Job
Object semantics.

## CAPTURE LIMITATION

Early prototype captures in this line of work included an obscured child-window
view and PrintWindow captures that were black or lacked the native video under
the default Chromium GPU compositor. Those records are capture limitations and
are not promoted or silently converted into product visual failures.

Run 11 used desktop BitBlt of the physical parent rectangle and obtained all
requested final states listed above. That resolved the evidence-collection
limitation for this gate; it does not erase the separate mixed-DPI coverage
blocker, nor does a desktop capture prove a production compositor contract on
all Electron/display configurations.

## Performance and scope boundary

The run contains only short observations. CPU samples varied between the
overlay-visible and overlay-hidden intervals, and the control round trips are
small local samples. No conclusion about sustained CPU, frame-copy bandwidth,
power, 4K/HDR behavior, latency under load, or architecture speed ranking is
drawn from this evidence.

No `src/**`, PlaybackManager, Resolver, Session, WebSocket, UI, package/version,
formal runtime, installer, user configuration, server state, or production
dependency was changed. No DirectComposition implementation is justified by
this gate: there is no structural compositor blocker in the exercised
parent-owned overlay arrangement. A later implementation would still require
an approved typed bridge/adapter contract, mixed-DPI hardware coverage, full
Emby equivalence, and packaging/provenance work while retaining Pepper rollback.

Model Tier: 2

Model: GPT-5.6 Sol High

Reason: composition, input, DPI and helper lifecycle cross-layer validation

Escalated: no
