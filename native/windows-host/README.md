# ETE Windows Host source changes

The fixed upstream is [MediaBrowser/emby-theater-windows at 708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13), with its accompanying GPLv2 text. The current selection contains55 original source/resource/license files. `change-manifest.json` declares6 replacements and2 added helpers, producing57 selected files and46 Compile items. Native installers are not part of this source selection. Dependencies retain their separate notices and obligations.

`host-retirement.patch` is the complete current delta, including JSON/ZIP integration. Original and replacement sizes/hashes are checked before output is created. A mismatch, preexisting output or redirect stops preparation. Apply only to the exact originals in a new directory:

```powershell
powershell.exe -NoProfile -File ./Apply-SourceChanges.ps1 -SourceRoot '<fixed source root>' -DestinationRoot '<new absent directory>'
```

The standalone preparer does not compile or execute the Host. Its material checks use `Test-SourceChanges.py`; production compilation uses the source-bound kit in `tools/windows-host-build/`.

## Behavior and dependencies

The Host no longer invokes CEC driver installation or passes a CEC argument to Electron. It leaves existing profile settings, cancel markers and system drivers intact. Pending-update archives are no longer consumed. SystemUpdateTask and ApplicationUpdater leave compilation; their helper Content entries are omitted. CanSelfUpdate is false, the selected v1 check returns a successful Task with IsUpdateAvailable=false, and installation returns a faulted NotSupportedException Task. ETE release checking, ordinary tasks, InstallationManager, configuration, HDMI audio/video and refresh-rate paths remain.

The two retired classes reduce the original46 Compile items to44; the two new JSON/ZIP helpers restore the current total to46. `json-zip-input.json` binds the four reviewed JSON/ZIP source bodies. ServiceStack and Sharp references leave compilation/runtime, replaced by pinned Newtonsoft13.0.4 net45 and framework ZIP support. Null array slots retain the verified compatibility behavior; malformed/truncated JSON raises an error rather than fabricating a default object. GPL-derived wrappers and MIT helpers/dependency keep separate notices.

Current source identity is `fef4cbfdb15a52b32a21edb33039833b5fc523ac594fcf3b871b78080dc8be9b`. Use `node tools/source-built-host-input.cjs identity .` to inspect the bound inputs. Older CEC-only, JSON-only or differently fingerprinted artifacts cannot satisfy this scope. Official Model `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153` remains unchanged.

## Build and runtime gate

The reviewed builder uses Windows PowerShell5.1, existing MSBuild17, a pinned net462 compile reference pack, and x86. It verifies toolchain/reference inputs and emits matched EXE/PDB plus source/build evidence. Compile-only facades are not copied into the application. MSB3277 and pure-net462 runtime compatibility remain separate review items; no framework upgrade or IL patch is used.

`tools/source-built-host-input.cjs` accepts either a reviewed HEAD-tracked `native/windows-host/verified-runtime.json` with restored ignored EXE/PDB, or the full per-run generated evidence under `.work/source-built-host/`. Both present is an error. The ordinary importer binds the reviewed lock to HEAD; the runner importer also validates build/probe/toolchain/project receipts, generator hashes and current checkout/run ownership. The latter requires that runner's own compilation and verification, never an imported external acceptance envelope.

Prepared artifacts live in `vendor/source-built-host/snapshot-v1/`; the pinned Newtonsoft DLL lives in `vendor/host-json/snapshot-v1/`. Build preflights all selected bytes before creating output and replaces only the expected original EXE/PDB leaves of a fresh base assembly. Final provenance checks both derived outputs. Missing locks, mismatched source/artifacts or verifier drift block the build; original-Host fallback is forbidden.

The isolated Windows candidate has passed reported Host/JSON/ZIP contracts and subsequent package/user acceptance within the recorded scope. This does not prove all environments or complete third-party licensing. The accepted package source, public handoff source and pending runner verification remain distinct; see [closeout and remaining checks](../../docs/SOURCE_CLEANUP_CLOSEOUT.md).
