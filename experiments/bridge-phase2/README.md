# Windows bridge architecture probes

Isolated research harness, not a production module or Emby integration. See
[ADR](../../docs/ADR-BRIDGE-MODERNIZATION.md) and
[logical contract](../../docs/BRIDGE_CONTRACT.md).

## Inputs and build

Use Windows x64 and the existing frozen Electron **18.3.15** executable and
patched libmpv recorded in `evidence/build.json`. No global installation is
required. This run used existing MSYS2 UCRT64 GCC/G++ 16.1.0, its Win32 headers,
`dlltool`, OpenGL/GDI/User32 import libraries and static C++ runtime. Visual
Studio 2022 was present but the standard Windows SDK include directory was
absent; it was not installed. CMake/node-gyp/npm production dependencies were
not added.

Download only these official headers into ignored `.work/native-inputs`:

- `mpv/{client.h,render.h,render_gl.h}` from
  `https://raw.githubusercontent.com/mpv-player/mpv/dd5d17d328/include/mpv/`.
- `node/{node_api.h,node_api_types.h,js_native_api.h,js_native_api_types.h}` from
  `https://raw.githubusercontent.com/nodejs/node/v16.13.2/src/`.

Compare every header SHA256 against `evidence/build.json` before compiling.
Headers retain upstream notices locally; no third-party header or binary is
redistributed here. The libmpv DLL hash must be
`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`,
Electron executable hash
`32e76a1fc510fcffe913dd3ce6af66b1061d53ef1c136cd13fb3cba3f6449fd2`.

From this worktree root, supply actual local input locations:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File experiments/bridge-phase2/build.ps1 `
  -InputRoot .work/native-inputs -OutputRoot .work/native-build-new `
  -Libmpv $libmpv -Electron $electron

ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=30 `
  -t 30 -c:v libx264 -pix_fmt yuv420p -color_primaries bt709 `
  -color_trc bt709 -colorspace bt709 .work/generated-h264.mp4

node experiments/bridge-phase2/run.cjs B $electron .work/native-build-new `
  $libmpv .work/generated-h264.mp4 .work/B-new
node experiments/bridge-phase2/run.cjs A $electron .work/native-build-new `
  $libmpv .work/generated-h264.mp4 .work/A-new
```

Run serially. Output directories must be new. `run.cjs` has a 60-second root
deadline and only targets its own still-running child PID tree. To reproduce
the A visual diagnostic with Chromium software UI composition, set
`$env:SPIKE_UI_SOFTWARE='1'` for that invocation, then remove that process-local
environment variable. This does **not** disable libmpv hardware decode.
Default GPU UI composition remains the production-relevant comparison.

Build outputs, media, profiles, logs and raw captures belong under `.work` and
must never be staged. `build.json` contains compiler, flags, source/header and
binary hashes for the measured native build. It is experimental evidence,
not a replacement for source-provenance/runtime-provenance/package verification.
The formal builder continues rejecting native addons in its dependency closure.

## What the harness does

- `native.cpp` compiles as an in-process Node-API addon (A) and a native EXE (B).
  Shared control code reduces accidental differences; rendering paths differ.
- A owns a WGL child surface and uses mpv render API on a dedicated thread.
  Update callbacks only mark work; context is freed before core destruction.
  Asynchronous create/destroy keep Electron's HWND message pump available.
- B owns a child container under Electron's HWND; libmpv `wid` creates its video
  child and owns its D3D11 VO. No independent top-level mpv window counts as success.
- Private inherited stdin/stdout pipes carry tab-delimited commands and newline
  JSON replies with request ids. There is no listening socket. Events are polled
  every 30 ms, retain number/boolean values and are delivered to JS; this is not
  a push-callback latency benchmark. Video frames do not cross IPC.
- The fixed local harness uses a sandboxed renderer, isolated preload and
  `nodeIntegration:false`. It exposes only a status subscription to renderer.
  Native operations and paths stay in main; this is not yet the production IPC API.
- The native helper includes an explicit test-only access-violation operation.
  It is reached only from the owned harness pipe, never exposed to renderer.
- Owned-window `PrintWindow` captures are inspected separately from telemetry.
  A passing action assertion never automatically marks visual rendering PASS.

## Limits deliberately retained

Only trusted generated local media and ASCII paths are supported by this spike.
DLL path byte widening is not a general Unicode path implementation. Protocol
framing is not intended for arbitrary tabs/newlines, URLs, credentials or
untrusted callers. Native synchronous command/property calls, polling, singleton
addon state, error handling, cleanup on forced main death and N-API argument
validation require production design. Do not connect this harness to a server.

The addon uses a tiny exact-`electron.exe` import table, N-API 8 and exported
registration entrypoint. It successfully loads the frozen runtime, but is not
the portable production loader. Production would use the normal Electron import
library/delay-load hook, validated external DLL closure and signing/provenance.

The sample disables config, audio and mpv input bindings, so it never reads or
modifies personal mpv configuration. No audio/subtitle/shader/HDR acceptance is
claimed. The 80-DIP HTML header and overlay probe are test UI, not product UI.
Native child HWND obscures the HTML overlay under the software-composited test;
this is an explicit migration blocker, not an invitation to redesign the UI here.

## Recorded evidence

`A.json`: WGL visual/control run with Chromium software UI; `A-default.json`:
default Chromium GPU UI run with successful control telemetry but unresolved
PrintWindow video omission; `B.json`: default Chromium GPU UI, D3D11 hardware
decode, control/window/lifecycle and helper crash recovery. PNGs contain only
the harness and generated test pattern. Other captures are hashed in JSON and
retained locally. Media and native artifacts are not committed.

Failed intermediate attempts are preserved in the ADR: synchronous A lifecycle
timeout; unsuitable desktop capture; helper DPI virtualization. Do not combine
their timings or screenshot classes into a single apparent successful run.
