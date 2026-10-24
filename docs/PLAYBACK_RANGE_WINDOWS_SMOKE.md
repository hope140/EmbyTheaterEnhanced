# Fixed Windows/native range-cache smoke

This method targets the source-built `162dc69f9c3438d99508c90321a889b693b6b10a` candidate. The ordinary Windows unit suite and this real-helper method are separate evidence. Preparing these tools does not mean the native method has run or passed. The scripts do not modify application source, the existing trial configuration contract, an installation, a server or account settings.

## What a hidden run can prove

The production helper requires a valid parent HWND, creates a child window and fixes `gpu-next` / D3D11 during initialization. A literal no-HWND/headless run cannot exercise that path. This method creates only hidden, nonfocusable Electron parent/carrier windows. It refuses window show/focus calls, never calls the visibility bridge, captures no screen and keeps the production helper/DLL/render options. A Windows session with working D3D11 may still be necessary; unavailable graphics cause failure, never substitution with `vo=null` or another decoder.

Two separate Electron processes use the same new, owned profile:

1. **Populate:** play a generated AVI through the bundled service/controller and private Range route; require a generation-attributed file-loaded/core-playing event, advancing time and decoded 320×180 video parameters. Stop, verify retained block hashes and partial size, destroy the service, await the owned helper's actual exit and close the store, then exit Electron.
2. **Reopen:** the coordinator waits for the first process exit before starting the second. Rebind the fixture's same loopback port, verify the persisted blocks, play A with a new session URL, require a fresh 0–0 validation probe and no refetch of retained block zero. Preparing B must retain A; actual B playback must change the last key and delete unleased A blocks. Hold a missing A block, Stop, require physical origin-response close, play B and release the old response. It must send zero late bytes, leave B authoritative and not resurrect A. Finish with helper exit, no live origin responses, no cache lock/pending files, retained B and the media quota intact.

The actual native loadfile argument is observed by a subclass which delegates unchanged to the bundled controller. No fake helper, transport, property response or playback-start event is used in an executed Windows phase. Anonymous loopback fixture identities are test inputs; they do **not** prove Emby authentication, queue/renderer behavior, a proxy/302 route, user-visible picture, audio, hardware decoding, installation or NAS compatibility. Raw AVI exercises byte transport and software decode into the fixed output path, not H.264/HEVC acceleration. The cancellation case covers Stop during a real held media read, not every seek/next-candidate permutation; deterministic delayed-property/candidate races remain covered by the existing service/session regressions.

## Source and payload gate

`tools/playback-range-windows-smoke.cjs prepare` reads the exact recorded candidate ZIP (size/SHA256 are pinned in that tool), reads its archived installer provenance without executing/extracting files, and binds the unpacked runtime's manifest to that receipt. It verifies the complete payload inventory/digest, fixed Electron/libmpv hashes, source-built non-testing helper identity and maintained Range/service/controller bytes against the candidate Git blobs. A missing Git object, changed payload, unsupported ZIP layout, link or extra file fails closed. This is a test input gate, not a replacement for CI's build/compiler/source provenance validators. File hashes and the native handshake do not measure the loaded DLL image hash.

Use an already verified unpacked runtime root, containing `build-manifest.json`, `electronapp/` and `x64/`. The existing pinned `innounp -t` / `-x -b` procedure in `tools/ci-windows-test-package.ps1` extracts an installer without running it. These smoke tools install or download nothing. Keep the candidate ZIP and unpacked tree available throughout the run; the gate repeats immediately before each execution. Do not substitute an installed application's files or an old package.

## Copyable commands

Run in a checkout containing this tooling and the candidate Git object. Replace the three input/output paths; the output must not exist. Preparation starts no Electron, helper, GUI or HTTP server:

```powershell
$zip = 'C:\ETE-evidence\range-162dc69.zip'
$runtime = 'C:\ETE-evidence\range-162dc69-unpacked\{app}'
$out = 'C:\ETE-evidence\range-hidden-new-run'
node tools/playback-range-windows-smoke.cjs prepare "--zip=$zip" "--runtime=$runtime" "--out=$out"
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed; do not execute.' }
```

Only when the coordinating operator authorizes the hidden native run, execute this separate command on Windows x64. It starts hidden HWNDs; it is not a literal windowless command:

```powershell
node tools/playback-range-windows-smoke.cjs run "--plan=$out\plan.json" --execute-hidden-native
if ($LASTEXITCODE -ne 0) { throw 'Inspect the preserved receipts; no acceptance result.' }
Get-Content -LiteralPath "$out\coordinator.json"
```

The script never starts the installer, Host or product `main.js`; it imports the verified candidate's actual launch-isolation, service, controller, session and Range modules. A profile owner marker plus physical path checks are required. `appData`, `userData`, `sessionData`, APPDATA, LOCALAPPDATA, MPV_HOME, TEMP/TMP and logs use the new test root before helper startup. Child processes inherit that isolated environment; inherited proxy variables and Node injection switches are removed only from the test children's environment. HTTP binds exclusively to `127.0.0.1`, uses generated files only and rejects Authorization/Cookie/Emby-token headers. No real credentials are supplied or persisted.

Each AVI is exactly 33,182,440 bytes (8 seconds, 24 fps, silent raw 320×180), generated without an encoder dependency. The test uses a **16 MiB committed-media cap**, a **64 MiB free-space floor** and **1 MiB/s background limit**. These are fixture values, not product defaults. The selected 70%/300 MB schema stays unchanged; this short native method does not attempt a 300 MB next preload or certify its rate limit. The cap applies to indexed media bytes (plus bounded index/atomic-write overhead); fixtures, runtime binaries and Electron profile/logs are outside that cap. Existing mpv memory-cache settings are not changed or interpreted as disk persistence.

Receipts are `populate.json`, `reopen.json`, per-phase `.running.json` / `.stdout`, and `coordinator.json`. A pass requires both successful phase receipts and observed separate process exits. Running receipts retain owned PIDs and the isolated environment on failure. Never rerun over evidence; prepare a new output. The outer 120-second deadline terminates only its own Electron child, stops subsequent phases and records helper exit as **UNCERTAIN**; inspect that run's owned-helper PID rather than declaring cleanup. Ordinary failure cleanup awaits each owned helper's exit. A port collision or unavailable D3D11 session is a failure to execute this method, not permission to use an ordinary profile or relax a validator.

## Resource choices still requiring product agreement

Only progress choices/default (50/60/70/80/90%, default 70%), next-prefix target (100/300/500 MB, default 300 MB), last-play lifetime and disposable unplayed-next lifetime are approved. The tool does not set formal capacity or network policy.

A compact proposal is a **1 / 2 / 5 GB shared disk limit**, with **2 GB recommended**: 300 MB is already the selected next-prefix target, so 2 GB leaves more room for the last video than 1 GB without a large local media store. Current/last, next and retiring leases share the limit; at exhaustion new storage/preloading stops while foreground reads continue. A 300 MB target is not a reservation or guarantee when the shared quota is occupied. No TTL eviction or full-video download is proposed.

For background access, propose **non-metered networks only, current playback first, at most 2 MB/s**; offer **manual-only/off** and **all networks with an explicit limit** as alternatives. A 300 MB prefix needs at least about 150 seconds at 2 MB/s, longer with foreground preemption. Reliable Windows metered-network detection and an unknown-network refusal rule would need product integration before claiming that policy; they do not exist in this smoke tool. The user should choose the shared capacity and background access policy. Block sizes, request deadlines and atomic/index details remain engineering controls, not additional user settings.
