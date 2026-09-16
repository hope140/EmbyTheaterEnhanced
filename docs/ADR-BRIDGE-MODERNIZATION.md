# ADR — Bridge modernization, two Windows prototypes

Date: 2026-09-16. Status: **research recommendation, pending architecture approval**.
Base main / `v0.1.1`: `73eac9fa64c43804e9c5c53690ed087b2c5bb077`.

**RECOMMENDED ARCHITECTURE = B (isolated native helper), conditional on a composition gate.**
**CONFIDENCE = MEDIUM.** This recommends the next research direction, not production adoption.
No candidate has established complete equivalence with the existing player/UI contract.

## Context and current legacy architecture

The task's Phase 0 baseline establishes Electron 18.3.15 as known-good, 21.4.4 as
historically functional but EOL, 22.3.27 as failing the legacy postMessage contract,
and 33+ as having removed PPAPI hosting. These historical compatibility results
were supplied by the task; they were not rerun here. Both new probes use the actual
frozen **18.3.15 / Node 16.13.2 / N-API 8**. No Electron upgrade was performed.

Today Web PlaybackManager calls the maintained AMD libmpv player, which posts
objects to a Pepper embed registered by Electron main. The `.node` Pepper plugin
is not a Node-API addon. It invokes the patched libmpv DLL. Some production
settings also use native `wid`/VO behavior; the bridge and video output choice
must not be conflated. The exact shipped Pepper source-to-binary binding remains
unknown. [Bridge contract](BRIDGE_CONTRACT.md) records actual callers and limitations.

PlaybackManager, Item/MediaSource/PlaySession, DeviceId, progress, NextTrack and
WebSocket remain upstream. Resolver changes only the final source, retains the
configured CD2/Mount/Native precedence and Native fallback. None of that code,
the production UI, dependencies, release, version or baseline tag changed here.

## Bridge contract

Retain the private create/ready, command, set/get/observe, stop and destroy API
through a small future adapter. Existing command/set Promises acknowledge
submission only. The player awaits `core-playing`, derived from `core-idle=false`,
before reporting successful play. Twelve properties drive cached state; seconds
are converted to existing ticks/milliseconds. Structured statistics and precise
large values matter; do not preserve legacy int32 truncation as a contract.

The current wrapper only consumes ready/property_change, not native file-loaded,
start-file/end-file/shutdown. Existing get requests lack ids/timeouts; global
events lack native generation identity. Play generation protects JS async work,
not attribution of every late native property or deferred subtitle command.
Those are explicit integration gaps, not claims that the prototypes solved them.

## Candidate A and surface ownership

Electron main loads a Node-API 8 addon. A dedicated native thread owns a
`WS_CHILD` HWND, HDC, WGL context/default framebuffer, mpv render context and
SwapBuffers lifecycle. Electron owns the parent window. The core is controlled
outside the render thread. `mpv_render_context_set_update_callback` only sets an
atomic flag; render/update/report-swap execute with the same GL context current.
Destroy frees the render context before terminating the core. This follows the
[pinned render API threading contract][render].

The exposed render backends are OpenGL and software, not D3D11/gpu-next.
WGL therefore uses `vo=libmpv` and `d3d11va-copy`. Actual H.264 decode reported
`hwdec-current=d3d11va-copy`; this proves hardware decode with CPU copy-back,
not D3D11 GPU-to-GPU interoperability. Windows direct hardware interop requires
additional ANGLE/GL-DX arrangements per [render_gl.h][render-gl].

Node-API improves the JavaScript ABI boundary, not libmpv/CRT/driver ABI or crash
isolation. The experimental direct electron.exe import table was actually loaded
in 18.3.15; future packaging must use standard Electron native-module loading.

## Candidate B and surface ownership

Electron main spawns a native helper with private inherited pipes. Helper owns
the mpv core and an explicit child HWND container under the Electron parent.
`wid` makes libmpv own its nested video HWND, D3D11 device, render target/swapchain
and presentation lifecycle. Electron owns window decorations, outer fullscreen
and the app visual area; no ordinary standalone mpv window is used.

This is the documented [mpv Windows embedding mechanism][client] and retains
`gpu-next / d3d11 / d3d11va`, all read back from the running DLL. Only commands,
state and lifecycle cross the pipe; video remains native. A native EXE launched
with child_process works in Electron18 without assuming modern utilityProcess
or sharedTexture APIs exist there.

## Prototype implementation and scope

[Harness sources/build instructions](../experiments/bridge-phase2/README.md)
contain one small C++ core with two build targets, one Electron main harness,
sandboxed preload and static fake UI. No Emby login, Session, resolver or remote
control is involved. Runtime-generated H.264 640x360, 30fps, 30s, SDR BT.709 is the
only media; no copyrighted/private media is committed. Audio/config/OSC/input
bindings are disabled. Personal configuration is not touched.

Commands are load/pause/unpause/absolute-exact seek/stop; get and observed
time-pos/pause/duration/core-idle plus native lifecycle events provide evidence.
Native events reach JS through a 30ms bounded polling pump, not a thread-safe
push callback. B uses request ids, exit rejection and a fresh helper object on
recreate. This does not implement media-generation attribution or a full adapter.

Environment: Windows 11 x64 build 26200; 144 DPI / 150% display scaling; machine
inventory includes AMD Radeon RX 6750 GRE 10GB (driver 32.0.21045.5002) and virtual
display adapters. No claim identifies which physical adapter every API selected.
Both default-compositor probes were run. A's visually verified comparison and
timings use the software-UI diagnostic, which explicitly disables Chromium GPU
composition while libmpv hardware decode remains enabled.

## Evidence and minimum viable equivalence

Read [A software-UI evidence][ea], [A default-UI evidence][ead], [B evidence][eb]
and [native build hashes][build]. Each record separates action telemetry from
visual review. All ten final A-software/B-default playing, resized, restored,
fullscreen and fullscreen-exit captures were opened and inspected. The embedded
test-pattern timecode changes across the window transitions. Two representative
owned-window captures are committed; all other capture hashes are recorded.

| Gate | A | B |
|---|---|---|
| Build / Electron load / libmpv initialize | PASS | PASS |
| Render context | PASS, OpenGL | N/A, native VO owns rendering |
| Video surface | PASS with software Chromium UI; default GPU UI PARTIAL | PASS with default GPU UI |
| Load / core playing | PASS | PASS |
| Pause / unpause / seek / stop | PASS | PASS |
| time-pos / pause / duration events to JS | PASS | PASS |
| Resize / fullscreen enter and exit | PASS visually in software-UI run; default-UI visual PARTIAL | PASS geometry + actual video captures |
| Minimize / restore | PASS under same A limitation | PASS |
| Destroy / recreate bridge | PASS | PASS, including reload after native failure |
| App exit | PASS after explicit native teardown, root exit 0 | PASS, helpers normally exit 0 |
| Native crash isolation | NOT TESTED; main-process blast radius by design | PASS, deliberate access violation `0xC0000005`, main/renderer survived |
| Forced helper termination / detection / recreation | N/A | PASS, separate forced-kill and native-exception cases |
| Hardware decode | PASS, d3d11va-copy | PASS, d3d11va with D3D11 GPU surfaces |
| Existing HTML overlay compatibility | FAIL in child-HWND visual diagnostic | FAIL, child HWND covers DOM overlay |
| Full product equivalence | NOT ESTABLISHED | NOT ESTABLISHED |

After runs, an independent Win32_Process snapshot found zero matching experiment
helper executable or Electron harness/profile processes. This supplements root
natural-exit results; the runner alone does not prove descendant cleanup. Forced
main termination, full BrowserWindow destroy/recreate while playing and endurance
remain NOT TESTED. B normal helper teardown and bridge recreation were exercised
multiple times, not merely inferred from process disappearance.

### Failed/intermediate evidence retained

- A's first synchronous native create blocked the Electron HWND message pump;
  the root deadline ended it. Moving create/destroy to N-API async work allowed
  initialization and teardown. This was an implementation bug, not proof of
  an addon structural failure. Main synchronous property/command calls remain
  a production risk for untrusted/slow sources.
- Initial desktop cropping did not reliably capture the owned window and is
  excluded from visual evidence. Window enumeration also failed to find it.
  Final captures use its exact HWND via PrintWindow, avoiding desktop content.
- B initially had DPI-virtualized 900x620 captures versus A's 1350x930. Explicit
  helper process DPI awareness plus parent-matched thread context fixed the
  measured 150% case: both surfaces became 1328x754, then 1553x904 and fullscreen
  3840x2040 below the header. This does not prove mixed-monitor DPI correctness.
- A default Chromium GPU UI: native render counters and time advanced, but
  PrintWindow showed HTML without WGL video (one restored capture was largely
  black). It is unresolved whether this is capture omission or real composition
  occlusion. A-software UI clearly shows video. Do not promote either telemetry
  or that alternate mode into default-compositor visual PASS.

## Performance observations

Small local samples only, not an architecture speed ranking. A below is the
visually verified software-UI run; B is default GPU UI. OS caches were not purged.

| Measurement | A | B |
|---|---|---|
| First instance initialization | 149.35ms | 69.84ms |
| Recreate initialization | 30.54ms | 57.82 / 52.87 / 61.06ms |
| Load to observed time-pos > 0.2s | 320.86ms | 460.27ms |
| Get-property round trip, five samples | 0.006–0.012ms | 0.066–0.133ms |
| Seek command + position readback | 0.33ms | 0.51ms |
| Load to first physically visible frame | NOT MEASURED | NOT MEASURED |
| CPU / copy-back throughput / power | NOT MEASURED | NOT MEASURED |

Seek numbers are state acknowledgement, not decoded/presented seek completion.
Polling adds up to roughly one poll period to event observation. The timing
does not cover audio sync, network media, 4K, HDR or sustained GPU/CPU usage.
The B IPC cost is small for this control workload; no frame-copy bandwidth claim
is inferred from five control queries.

## Comparison

| Dimension | Addon A | Helper B |
|---|---|---|
| Video embedding | WGL child shown in diagnostic UI mode; default capture unresolved | Actual nested child HWND + D3D11 video shown |
| mpv render API fit | Direct public OpenGL API, strict render-thread rules | Uses supported wid/VO; no render-context requirement |
| Hardware decode | Proven d3d11va-copy; direct interop deferred | Proven d3d11va, no CPU copy-back claimed |
| HDR path | Requires new HDR-capable presentation/interop design | Credible native D3D11 swapchain route; HDR untested |
| Subtitle/config compatibility | Same core but OpenGL/vo=libmpv differs from gpu-next | Same core and existing gpu-next/D3D11 option family |
| Resize/fullscreen | Diagnostic mode passes; default visual partial | Measured pass on one 150% display |
| DPI | Parent thread context; multi-monitor untested | Initial failure fixed for 150%; cross-process DPI remains a risk |
| Native crash isolation | Native fault can kill main, not protected by Node-API | Tested helper exception, Electron survived and recreated |
| Electron security | Can keep renderer sandbox/isolation; native risk in main | Can keep renderer sandbox/isolation; helper is not a sandbox |
| IPC complexity | N-API + future restricted Electron IPC | Pipe request ids, exit lifecycle, future epochs/backpressure |
| Performance | Faster query calls; copy-back cost unmeasured | Measured sub-ms queries; native GPU video stays out of IPC |
| Build complexity | Node-API headers/import loading plus WGL | Native EXE/Win32 and DLL ABI, independent of Node ABI |
| Packaging | New addon/native closure; currently prohibited by formal builder | New executable/native closure, lifecycle ownership required |
| Reproducibility | Source/toolchain/headers/DLL/import provenance required | Source/toolchain/headers/DLL provenance required |
| Debuggability | Native debugging in Electron main, broader fault domain | Separate process and crash boundary; IPC/parenting diagnostics |
| Future Electron compatibility | Stable N-API helps; loading/composition still need validation | Avoids Node native ABI; HWND/composition compatibility still tested |
| Migration effort | Adapter + native core + presentation/interop changes | Adapter + supervisor + composition/input gate |

## Rendering, composition, config and HDR implications

Both chosen surfaces are native HWNDs. They are not DOM children; CSS z-index
does not order them with Chromium pixels. The deliberately red HTML probe is
covered in the actual video capture. HTML next to video works; HTML OSD over
video has **not** been preserved. Subtitles/mpv OSD can be composited by mpv
inside its own surface, but subtitle settings/rendering were not tested here.
Do not replace existing Emby HTML OSD with native controls without a separate
approved design. Win32 child clipping/input rules explain the observed limitation
([Microsoft window features][windows]).

Both cores still expose mpv config/property APIs. This probe deliberately uses
config=no for isolation; actual mpv.conf, shader includes, subtitle fonts and
per-file UA semantics are NOT TESTED. B's unchanged VO family reduces the
compatibility gap; A cannot accept arbitrary gpu-next/D3D11 settings unchanged.
Keep user config ownership and rendering-option translation explicit in a later
adapter, including current wid/fullscreen requests. No personal config was edited.

B has a credible HDR route because mpv owns a native D3D11 swapchain. Windows
Advanced Color requires suitable format/color space, flip presentation and correct
SDR reference-white/UI handling; display/HDR changes need validation ([Microsoft
Advanced Color][hdr]). A's ordinary WGL framebuffer is not HDR proof: a new
FP16/scRGB or 10-bit/PQ-capable output/interoperability design would be needed.
Neither candidate demonstrated HDR metadata, HDR displays, tone mapping or
HDR subtitles. A software decode/render screenshot would not establish these.

The pinned DLL returns `d3d11-output-mode=auto`; this does not establish all
current documented composition modes. Modern mpv exposes composition/display-
swapchain mechanisms ([mpv manual][manual]), but a raw COM pointer is not a
cross-process shared texture. Exported handles, adapter identity, synchronization,
lifetime and color metadata need a new experiment ([DXGI shared handle][shared]).
Modern Electron sharedTexture is experimental and not an Electron18 API; do not
backport it by assumption or upgrade Electron inside this spike ([Electron
sharedTexture][texture], [Electron18 module list][e18]).

## Window behavior and remaining risks

| Behavior | Evidence and implication |
|---|---|
| Resize | HWND follows parent client dimensions, actual video shown; 8ms native layout polling is spike code |
| Minimize/restore | Real window APIs + restored video timecodes; minimized GPU power not measured |
| Fullscreen | BrowserWindow enter/exit, child resize and actual video; not exclusive-mode HDR acceptance |
| Borderless fullscreen | Electron fullscreen observed without decorations; custom borderless product chrome remains untested |
| DPI / multi-monitor | 144 DPI passed after fix; mixed awareness and monitor transitions NOT TESTED; SetParent/CreateWindow cross-process behavior needs care [dpi] |
| Focus / mouse / keyboard | Child receives native input; mpv keyboard defaults disabled, existing DOM handlers do not automatically receive it [windows]; interactive forwarding NOT TESTED |
| Always-on-top / decorations | Parent owns chrome/z-order; no free-floating video window; always-on-top interaction NOT TESTED |
| Screen changes / sleep-resume | Device loss, WGL/D3D context/swapchain recreation NOT TESTED |
| Main death | B helper EOF is a useful path, but parent-crash/kill-on-close Job Object semantics NOT TESTED |

## Security and crash isolation

Both harnesses actually run `nodeIntegration:false`, `contextIsolation:true`,
`sandbox:true`; native access is in main/helper, with a status-only preload API.
Neither architecture requires disabling protections globally. The legacy product
has weaker settings, but this work does not change it. Production IPC must validate
sender, operation, payload, property allowlist, source policy and instance epoch;
never expose arbitrary loader/command access ([Electron security][security]).

A native fault in main shares the Electron main fault domain. No deliberate A
crash was run; this is a structural consequence, not an observed crash count.
B intentionally raised an unhandled access violation, exited 3221225477 and was
recreated; renderer title remained readable and new
video time advanced. Separate forced termination was also detected. This tests
process-local failure, not GPU driver reset, kernel failure or exploit sandboxing.
The exit handler rejects pending requests by implementation; rejection timing
and reason were not separately asserted in the crash test.
The helper still runs with the user's rights. Node-API ABI stability does not
change these security boundaries ([Node-API][napi], [Electron processes][process]).

## Packaging and reproducibility implications

All changes are docs and experiments. Neither binary is in the formal runtime,
package.json, native dependency closure, installer or release. Existing Git blob
source binding, Web preflight, canonical generator identity, source/runtime
provenance and package verification remain intact. The native experiment's
physical-source/header/binary SHA256 report is **not** a Phase 1 runtime attestation.

Before production inclusion, bind compiled native source to reviewed commit blobs,
pin compiler/SDK/headers/flags/external DLL closure, record canonical generator and
input/output identities, audit license/source obligations and update both provenance
layers and package verification explicitly. Account for PE timestamp/non-reproducible
toolchain output; no byte-identical native rebuild is claimed. B avoids Electron
Node import-library coupling; A needs the supported native-module loader/delay-load
contract ([Electron native modules][native]). Native build outputs remain local.

## Decision, confidence and rejected/deferred alternatives

**Choose B for the next bounded feasibility step.** It proved hardware-backed
gpu-next/D3D11 playback on the frozen runtime and contained a real native exception.
Its small measured control IPC cost provides no reason to sacrifice crash isolation.
Confidence is MEDIUM because HWND/HTML composition and input remain unsolved,
HDR and mixed DPI are untested, and no full player adapter or Emby regression ran.
This is not approval to replace Pepper now.

- Defer A WGL as the primary route: different VO/config family, copy-back decode,
  main-process fault domain and unresolved default-GPU capture/composition.
- Defer hybrid helper + shared texture: plausible composition direction, but no
  Electron18-compatible import/render/color contract has been demonstrated.
- Reject continued Pepper plus Electron upgrade as a long-term strategy, per the
  supplied compatibility audit. Reject standalone mpv windows as embedded proof.
- Reject software frame copies/CPU canvas as the assumed production solution;
  performance/HDR would require evidence. Reject Chromium patches/security
  relaxation as prerequisites absent a separately approved decision.
- Defer full settings, subtitles UI, HDR implementation, installer and updater.

The stop condition is met: both minimal prototypes were built and exercised;
their surface/control/lifecycle facts and composition blocker are clear enough
to choose the next experiment. Expanding either into production would hide the
remaining composition decision rather than answer it.

## Migration phases and open questions

1. **Phase 2A — helper composition/input feasibility gate on Electron18.** Preserve
   existing HTML OSD behavior; compare a narrowly defined owned-window composition
   mechanism or validated texture path. Require actual overlay/click/focus, resize,
   fullscreen and 100/150/200% mixed-DPI evidence. If this fails, reopen the decision.
2. **Phase 2B — isolated production-quality bridge module and adapter**, only after
   approval: full typed contract, bounded async commands, request/instance epochs,
   native crash/parent-death cleanup, Unicode paths and reproducible native closure.
3. **Phase 2C — Electron18 shadow integration and real equivalence**, retaining
   Pepper rollback. Exercise A-to-B replacement, Stop/NextTrack, pending replies,
   all settings/structured properties, subtitle timing, config/shaders and source-only
   resolver invariants. Real Emby Session/progress/WebSocket acceptance is a gate here.
4. **Phase 2D — remove Pepper dependency** only after sustained equivalence and
   verified rollback/package provenance. Preserve v0.1.1 known-good baseline.
5. **Phase 3 — supported Electron migration**, with the bridge already proven;
   revalidate native/window/GPU/security behavior against a pinned supported version.
6. **Phase 4/5 — main/preload/security/window hardening and full Emby regression**,
   including remote control, identity, fallback, HDR/device loss and mixed displays.
7. **Phase 6 — UI modernization**, separately approved after playback is stable.

Open questions: overlay mechanism; input forwarding; default-GPU A visual status;
multi-monitor and resume; HDR presentation; config/shader/subtitle compatibility;
audio sync; forced-parent-death cleanup; stale native event attribution; Unicode
and untrusted source handling; native packaging/signing/license closure. No REAL
Emby regression was required or claimed in this research-only task.

## Sources

Official sources checked during this task. Pinned headers match the measured
libmpv revision; latest documentation is research guidance, not proof that an API
exists in Electron18 or in the shipped DLL.

[render]: https://github.com/mpv-player/mpv/blob/dd5d17d328/include/mpv/render.h
[render-gl]: https://github.com/mpv-player/mpv/blob/dd5d17d328/include/mpv/render_gl.h
[client]: https://github.com/mpv-player/mpv/blob/dd5d17d328/include/mpv/client.h
[manual]: https://mpv.io/manual/master/
[windows]: https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
[dpi]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent
[hdr]: https://learn.microsoft.com/en-us/windows/win32/direct3darticles/high-dynamic-range
[shared]: https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgiresource1-createsharedhandle
[texture]: https://www.electronjs.org/docs/latest/api/shared-texture
[e18]: https://github.com/electron/electron/blob/v18.3.15/lib/browser/api/module-list.ts
[napi]: https://nodejs.org/api/n-api.html#implications-of-abi-stability
[native]: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
[security]: https://www.electronjs.org/docs/latest/tutorial/security
[process]: https://www.electronjs.org/docs/latest/tutorial/process-model
[ea]: ../experiments/bridge-phase2/evidence/A.json
[ead]: ../experiments/bridge-phase2/evidence/A-default.json
[eb]: ../experiments/bridge-phase2/evidence/B.json
[build]: ../experiments/bridge-phase2/evidence/build.json
