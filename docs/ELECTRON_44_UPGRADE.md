# Electron 44.4.2 background upgrade candidate

## Baseline and scope

The upgrade branch is based on `origin/main@fdb32282810d05ed6e588d0c2dc6bc0582957405`, the merge commit for PR #15. The target is the official Electron `44.4.2` Stable Windows x64 distribution. Carnival Electron `18.3.15` remains an immutable historical baseline input and is excluded from the Enhanced production runtime.

This upgrade changes the Electron runtime and the minimum main-process compatibility surface only. `Emby.Theater.exe`, PlaybackManager, Item/MediaSource identity, PlaySession/Session/WebSocket/reporting, Resolver order, CD2 semantics, Mount fallback, Native Helper framed IPC, libmpv and user profile formats remain unchanged.

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

The final candidate runtime and installer must be regenerated from the final documentation commit, package-verified, compared file-for-file after installer extraction, and left uninstalled for user foreground acceptance.
