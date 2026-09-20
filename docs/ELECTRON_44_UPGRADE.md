# Electron 44.4.2 background upgrade candidate

## Baseline and scope

The upgrade branch is based on `origin/main@fdb32282810d05ed6e588d0c2dc6bc0582957405`, the merge commit for PR #15. The target is the official Electron `44.4.2` Stable Windows x64 distribution. Carnival Electron `18.3.15` remains an immutable historical baseline input and is excluded from the Enhanced production runtime.

This upgrade changes the Electron runtime and the minimum main-process compatibility surface only. `Emby.Theater.exe`, PlaybackManager, Item/MediaSource identity, PlaySession/Session/WebSocket/reporting, Resolver order, CD2 semantics, Mount fallback, Native Helper framed IPC, libmpv and user profile formats remain unchanged.

## Post-freeze-fix closure boundary

`8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c` is the production fix for the Electron 44 startup command failure and the resulting native video presentation freeze. Electron 44 standard custom-scheme canonicalization changed renderer command URLs such as `electronapphost://loaded/` and `electronapphost://windowstate-Maximized/`; the old parser was case- and trailing-slash-sensitive. `loaded/` therefore failed to execute the existing loaded chain:

```text
setWindowState(windowStateOnLoad)
mainWindow.focus()
hasAppLoaded = true
onLoaded()
```

The canonical parser restores the existing apphost command contract. This record does not claim that any individual statement in the loaded chain is independently sufficient for the freeze. The release boundary is:

```text
VIDEO FREEZE ROOT BOUNDARY =
APPHOST STARTUP COMMAND CANONICALIZATION

MICRO-MECHANISM =
NOT FURTHER ISOLATED / NOT REQUIRED FOR RELEASE
```

The source/entrypoint matrix proves that the freeze tracks source revision, not the Host entrypoint:

| Source revision | Host entrypoint | Direct entrypoint |
|---|---|---|
| `9168d08` | FREEZE 5/5 | FREEZE 5/5 |
| `725d4c2` | PASS 5/5 | PASS 5/5 |

Electron, Host, Native Helper and mpv identities were the same across the matrix. No separate video workaround is part of this fix. DirectComposition/DWM/activation hypotheses remain closed; no redraw timer, Chromium flag, focus workaround, `SetWindowPos` workaround, surface ownership redesign, Native Helper redesign, libmpv change or Resolver/CD2/Mount change was introduced.

## Foreground regression follow-up

The original foreground probe established that Electron 44 delivered the standard-scheme command token with a trailing slash and normalized case. The confirmed fix canonicalizes only that command token, preserves raw URL/query bytes for `openurl`, rejects unknown commands, and adds synthetic coverage. A real Electron 44 probe confirmed the normalized window-state command reached the existing BrowserWindow dispatch.

The previous occlusion A/B remains historical diagnostic evidence only. It does not define the production root boundary and does not authorize a composition workaround. PR #17 remains open and must not be merged until the current required installed freeze gate and foreground acceptance are independently completed.

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

The final result record is a docs-only follow-up and does not change the historical artifact source commit or product bytes. That historical 9168 candidate remained uninstalled at this checkpoint; the later 725d post-freeze-fix candidate installation and its incomplete foreground gate are recorded below.

## Post-freeze-fix candidate verification

The final candidate was rebuilt from exact source commit `725d4c2284596b8ced749a3c8590180a1e6ed1a9` as `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate`. The matching installer is `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate-setup.exe`, 175580523 bytes, SHA256 `AAB19E605E26CE83C73610D1F5844C95EE872268BDBCD7752556E7610D3928A5`.

The candidate runtime and installer checks passed: Electron `44.4.2`, Chromium `152.0.7977.130`, source/Electron/Native Helper/runtime provenance, package verify, runtime exclusion, Native Helper `ete-mpv-helper.exe`, `mpv-1.dll`, no `mpv-win32-x64.node`, no Pepper/PPAPI payload, and installer integrity. The extracted `{app}` and runtime each contained 2137 files with `missing=0`, `extra=0`, `mismatch=0`.

Automated gates on this head were `npm test = 233/233 PASS`; Collector, Issue Snapshot, CD2 observer and redaction self-tests passed; focused apphost/Electron/Native Helper/window ownership tests were `55/55 PASS`; Native Helper handshake/service/race/UA isolation and parent-death passed with residual `0`. The transport stress smoke returned `transport:stdout-end` on both the old Electron 44 comparison runtime and the Electron 18 historical runtime as well as this candidate, so it is retained as a harness/environment evidence gap rather than a 725d source regression.

Formal ordinary and CD2 miss preserved the known baseline rapid NextTrack `selected=false` limitation while `priorStopped`, `nextStarted`, `rapidNextSettled`, `rapidNewestLoaded` and all playback/control/report assertions passed. Formal STRM/CD2 and DirectUrl passed; DirectUrl file-local User-Agent isolation reported `allDirectUserAgentsMatched=true` and `noDirectUserAgentLeak=true`.

The candidate was installed through the formal `C:\Program Files\Emby Theater Enhanced\Emby.Theater.exe` installation. Installed payload verification passed with `missing=0` and `mismatch=0`; the existing profile and persistent device identity remained present. The user completed the installed human-assisted foreground acceptance and confirmed continuously advancing video, audible audio, OSD, Settings, Pause/Resume, Seek, Fullscreen enter/leave/OSD/controls, Alt-Tab, Minimize/Restore, Resize, Stop and normal exit. Video freeze was not observed; seek black frame and stop/exit black frame were not observed. Machine playback log evidence remained `UNAVAILABLE` and is explicitly non-blocking under the human-assisted acceptance contract. Machine crash and residual checks were clean.

```text
VIDEO FREEZE = NOT REPRODUCED AFTER FIX
PR #17 = OPEN / READY TO MERGE
ELECTRON 44 FINAL ACCEPTANCE = PASS — HUMAN-ASSISTED FOREGROUND ACCEPTANCE
```
