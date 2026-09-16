# Helper composition / input / DPI gate

Isolated Windows feasibility harness for the Phase 2 B architecture. It does
not load Emby, PlaybackManager, Session, Resolver, production UI or user media.
The parent Electron window and transparent Chromium overlay remain in the
Electron process; the existing Phase 2 native helper owns the libmpv core and
native video child HWND. Video frames never cross IPC.

## Window and input topology

```text
parent frameless BrowserWindow
├─ helper-owned WS_CHILD container
│  └─ libmpv gpu-next / D3D11 video HWND
└─ parent-owned transparent frameless BrowserWindow
   └─ HTML top/bottom OSD, pause glyph, button and seek area
```

The overlay is `skipTaskbar`, follows the parent's bounds and is hidden while
the parent is minimized. Interactive tests use a fixed whole-window HTML input
mode. The transparent video area switches to Electron's
`setIgnoreMouseEvents(true, {forward:true})`; the harness verifies that the OS
hit target below it is a descendant of the native video container, then
recovers keyboard focus to the overlay. The renderer receives no HWND, path,
native command, filesystem, child process or helper-pipe capability.

The helper's test-only operations add physical-window/DPI/focus topology,
desktop composition capture, fixed mouse/key injection, process CPU sampling
and window activation. They do not change mpv options or the B ownership model.

## Build and run

Use the frozen Electron 18.3.15 and libmpv inputs whose hashes are enforced by
`../bridge-phase2/build.ps1` and `../bridge-phase2/evidence/build.json`. Reuse
the existing pinned local headers described by the Phase 2 README. All output
directories must be fresh and ignored under `.work`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File experiments/bridge-phase2/build.ps1 `
  -InputRoot .work/native-inputs -OutputRoot .work/helper-composition-native `
  -Libmpv $libmpv -Electron $electron

ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=30 `
  -t 30 -c:v libx264 -pix_fmt yuv420p -color_primaries bt709 `
  -color_trc bt709 -colorspace bt709 .work/generated-h264.mp4

node experiments/helper-composition-gate/run.cjs $electron `
  .work/helper-composition-native $libmpv .work/generated-h264.mp4 `
  .work/helper-composition-run
```

The runner has a 150-second deadline and only terminates its own saved root PID
tree. A normal run ends naturally after the deliberate helper access violation,
helper recreation, video reload and final clean destroy.

## Evidence

The accepted run is recorded in [`evidence/run.json`](evidence/run.json), with
runner outcome in [`evidence/runner.json`](evidence/runner.json) and native
input/output hashes in [`evidence/native-build.json`](evidence/native-build.json).
The independent image inspection result is in
[`evidence/visual-review.json`](evidence/visual-review.json).
Every PNG is a cropped physical desktop-composition capture containing only the
generated harness. `time-pos` is sampled before and after each capture so a
static DOM state is not mistaken for changing video.

- `playing-overlay-visible.png`, `overlay-hidden.png`, and
  `overlay-visible-again.png` prove the requested show/hide sequence.
- `resized.png`, `maximized.png`, `restore-after-minimize.png`,
  `fullscreen.png`, and `fullscreen-exit.png` cover the parent lifecycle.
- `monitor-0.png`, `monitor-1.png`, and `secondary-fullscreen.png` cover the
  real two-monitor transition and current-monitor fullscreen at the available
  150%/144-DPI scale.
- `after-crash-reload.png` proves visual recovery with a new helper generation.

The first desktop-capture attempts were occluded by another foreground app, and
`PrintWindow(parent)` returned black for the hidden-overlay state. Those are
capture limitations, not composition failures. The accepted run keeps the
transparent overlay window composed while hiding the HTML OSD pixels, then uses
desktop BitBlt for both visible and hidden states. All accepted captures were
opened and inspected separately from telemetry.

Both real displays available during the run reported scale factor 1.5 and 144
DPI. Same-DPI monitor movement, physical geometry, click alignment and secondary
fullscreen passed. Real mixed-DPI behavior remains blocked and is not simulated.
See [`../../docs/HELPER-COMPOSITION-GATE.md`](../../docs/HELPER-COMPOSITION-GATE.md)
for the complete acceptance matrix and gate decision.
