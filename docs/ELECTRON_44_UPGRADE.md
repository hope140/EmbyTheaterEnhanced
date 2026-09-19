# Electron 44.4.2 background upgrade candidate

## Baseline and scope

The upgrade branch is based on `origin/main@fdb32282810d05ed6e588d0c2dc6bc0582957405`, the merge commit for PR #15. The target is the official Electron `44.4.2` Stable Windows x64 distribution. Carnival Electron `18.3.15` remains an immutable historical baseline input and is excluded from the Enhanced production runtime.

This upgrade changes the Electron runtime and the minimum main-process compatibility surface only. `Emby.Theater.exe`, PlaybackManager, Item/MediaSource identity, PlaySession/Session/WebSocket/reporting, Resolver order, CD2 semantics, Mount fallback, Native Helper framed IPC, libmpv and user profile formats remain unchanged.

## Foreground regression follow-up

Real foreground acceptance found two independent Electron 44 regressions. The apphost command parser received standard-scheme commands as lowercase authority tokens with a trailing slash, for example `windowstate-maximized/`, while the legacy switch expected `windowstate-Maximized`. Commit `8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c` canonicalizes only the command token, preserves raw URL/query bytes for `openurl`, rejects unknown commands, and adds synthetic coverage. A real Electron 44 probe confirmed `windowstate-maximized/ -> BrowserWindow.setFullScreen(true)` and display-sized bounds.

The video presentation regression remains blocked. In both A and B, mpv `time-pos`, PositionTicks, audio, `core-playing`, `gpu-next`, D3D11VA and zero-drop statistics advanced normally while six desktop video-region captures from T0 through T+10s had one repeated SHA256. The diagnostic-only B arm requested and observed `disable-backgrounding-occluded-windows`, but its visible-frame hashes remained frozen after Seek, one small resize and one opaque-window occlusion/uncover cycle. Therefore:

```text
OCCLUSION HYPOTHESIS = REJECTED
VIDEO FIX = BLOCKED / NEEDS DEEPER COMPOSITION WORK
```

The switch is not a production change and is not committed. No redraw timer, repeated `SetWindowPos`, surface ownership change, WebContentsView migration, renderer security downgrade, Resolver/CD2/Mount/Session change, Native Helper protocol change or libmpv architecture change was made. PR #17 remains open and must not be merged until a separate video composition solution and renewed foreground acceptance exist.

## Pinned runtime input

| Field | Value |
|---|---|
| Version / channel | `44.4.2` / Stable |
| Platform / architecture | `win32` / `x64` |
| Archive | `electron-v44.4.2-win32-x64.zip` |
| Source | `https://github.com/electron/electron/releases/download/v44.4.2/electron-v44.4.2-win32-x64.zip` |
| Archive SHA256 | `6AAE435B6CD5C0EEDF9FD38824BAE4045FFDAECD029F0B8C8328BAC3F5B71F03` |
| Archive size | `158218669` bytes |
| `electron.exe` SHA256 | `0446040F3C63EB75D5B1E1663D5EF27F07730A82DF3E4FA47FF77C1A33CEF07C` |
| Extracted tree | 73 files, `F9F14E4FE641B68296CF6D17357B4037A514C87ED8C83E91395DE11D924C9030` |
| Electron / Chromium | `44.4.2` / `152.0.7977.130` |
| Node / V8 | `24.21.0` / `15.2.124.28-electron.0` |

`vendor/electron-runtime-manifest.json` is the authoritative tracked contract. `tools/prepare-electron-runtime.ps1` validates the exact archive name, size and SHA256 before extraction. `tools/electron-runtime-input.cjs` validates the complete extracted path/hash tree, `version` and `electron.exe`; missing input, wrong hash, missing/extra file or changed bytes fail closed. No `latest`, npm Electron package, beta, alpha or nightly input is accepted.

## Build and provenance

`tools/build.ps1` still starts from the complete Carnival baseline, then deletes the copied `x64/electron` directory and copies the validated official Electron tree in its entirety. It never overlays individual Electron files, so Electron 18 DLL, locale or resource residue cannot survive.

`source-provenance.json` records both identities separately:

- `historicalInputs.carnivalElectron` records Electron 18.3.15 and marks it excluded from production.
- `runtimeIdentities.electron` records the official release URL, archive checksum, prepared input, exact runtime tree, `electron.exe` checksum and expected process versions.

`runtime-provenance.json` independently binds the Electron manifest, validator, executable and runtime tree. `build-manifest.json` and package verify retain the final whole-payload file-set/hash contract. Native Helper and libmpv provenance are unchanged.

## Actual compatibility audit

| Area | Actual use and result | Minimal action |
|---|---|---|
| `BrowserView` | One unused import, no instance or ownership use | Remove the import; no WebContentsView migration |
| `webContents` window opening | Removed `new-window` event was used | Use `setWindowOpenHandler`, call `shell.openExternal`, return `deny` |
| Internal XHR protocols | Six existing renderer-to-main schemes use XHR | Register only those six schemes as `standard + supportFetchAPI + corsEnabled` before ready |
| Deprecated protocol handlers | Existing `registerFileProtocol` / `registerStringProtocol` handlers still execute | Keep handlers; do not perform a broad `protocol.handle` rewrite without a failing route |
| Main BrowserWindow security | Existing `nodeIntegration:false`, `contextIsolation:false`, `sandbox:false` | No new security downgrade; do not mix a preload/contextBridge redesign into this upgrade |
| Native Helper surface | Independent sandboxed BrowserWindow and real HWND | Preserve BrowserWindow/HWND ownership; no view migration |
| Hidden formal capture | Electron 44 cannot capture a hidden display surface | Hidden gates do not take screenshots; visible gates retain capture behavior |

The custom-scheme failure was reproduced before the fix: `electronrefreshrate://` rejected with a renderer `ProgressEvent` before Native Helper creation. An isolated Electron 44 probe showed that no privileges, `supportFetchAPI` alone, and `standard + supportFetchAPI` all failed. `standard + supportFetchAPI + corsEnabled` returned HTTP 200. The production fix applies that exact set only to `electronapphost`, `electronfs`, `electronserverdiscovery`, `electronwakeonlan`, `electronrefreshrate` and `electroncec`. It does not enable `secure`, `bypassCSP` or Service Workers.

## Preflight evidence

- Full Node/PowerShell suite: `225/225 PASS` before the protocol follow-up; compatibility and ownership targeted tests passed after the follow-up. The final branch head must rerun the full suite.
- Pinned Electron input, source provenance, runtime provenance, Native Helper provenance and package verify: PASS on preflight builds.
- Electron runtime process probe: exact Electron/Chromium/Node/V8 match, executable path match.
- Formal STRM/CD2 fake hit: PASS, including generation/cancel and zero active-call leak.
- Formal DirectUrl: PASS, including exact file-local User-Agent and no same-origin leakage.
- Formal ordinary and CD2 miss: all playback/control/Stats/Session/report assertions pass; the only final harness flag is the pre-existing rapid NextTrack `selected=false` limitation. Electron 18 baseline produced the identical result with `priorStopped`, `nextStarted`, `rapidNextSettled` and `rapidNewestLoaded` all true. This is `BASELINE-MATCHED LIMITATION / NO NEW REGRESSION`, not a new Electron failure.
- Native Helper/ownership/z-order/placement focused suite: `46/46 PASS`.
- Electron 44 parent-death contract: PASS, helper exited and residual count was zero.
- Real Emby playback, real server/CD2, manual fullscreen, Alt-Tab, minimize/restore, mixed-DPI and installation: NOT RUN in the background phase.

## Final background artifacts

Artifact source commit: `9168d08f96e121e9852880503fd01af2bf26691d`.

- Runtime: `dist/EmbyTheaterEnhanced-electron44-9168d08-candidate`
- Build manifest: 2135 payload entries; 2136 files including the manifest
- Full test suite: `228/228 PASS`
- Source, Electron, Native Helper and runtime provenance: PASS
- Package verify: PASS
- Hidden startup smoke: PASS with screenshot status `NOT_RUN_HIDDEN`
- Formal STRM/CD2: PASS
- Formal DirectUrl and UA isolation: PASS
- Formal ordinary and CD2 miss: baseline-matched rapid NextTrack limitation only; no new regression
- Installer: `dist/EmbyTheaterEnhanced-electron44-win-x64-candidate-setup.exe`
- Installer size / SHA256: `175563881` bytes / `BE338187DD56BE346B832B18793FDE87AE9957EF8AD9A3B72795EA51C22BF957`
- Installer integrity: PASS
- Extracted `{app}` comparison: 2136 vs 2136 files, missing 0, extra 0, mismatch 0

The final result record is a docs-only follow-up and does not change the artifact source commit or product bytes. The candidate remains uninstalled. Foreground playback, fullscreen, Alt-Tab, minimize/restore, mixed-DPI, real profile/server/CD2 mapping and release publication remain for user acceptance or later authorization.
