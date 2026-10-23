# ETE Windows Host source changes

The fixed upstream is [MediaBrowser/emby-theater-windows at 708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13), under the accompanying GPLv2 text. The four files under `changes/` are ETE-modified upstream files. Other files come from the fixed 55-file source/resource/license selection; native installers are not part of that selection. Individual dependencies retain their own source/licensing obligations.

`host-retirement.patch` is the complete four-file delta. `change-manifest.json` binds original/candidate sizes and SHA256. The source manifest binds the 46 original compiler inputs. Apply only to verified originals, preserving baseline material:

```powershell
powershell.exe -NoProfile -File .\Apply-SourceChanges.ps1 -SourceRoot '<root containing Emby.Theater/>' -DestinationRoot '<new absent directory outside source>'
```

All original and replacement files are checked before creating output. Mismatch, preexisting output and redirects stop preparation. It copies only the declared source/resource/license files and does not compile or execute them. Material-backed checks are available through `python Test-SourceChanges.py --source '<fixed source root>' --report '<new report path>'`.

The candidate removes the CEC installation call/method and Electron CEC argument. It removes pending-update handling, excludes SystemUpdateTask/ApplicationUpdater (46→44 compiler inputs), and removes seven CEC/two updater-helper Content entries. CanSelfUpdate is false; the selected v1 check contract returns a successful Task with IsUpdateAvailable=false; installation returns a faulted NotSupportedException Task. The compatible no-update result avoids introducing a needless synchronous-exception contract. Other tasks, InstallationManager, restart, configuration, HDMI/refresh-rate paths and six locked binary references remain. Old user archives, configuration, CEC settings and cancel markers are not deleted.

Windows isolated checks with the actual official db22 Model have been reported passing for baseline/v1/v2/combined interfaces and six startup/configuration/pending/arguments/exit cases. Earlier CoreLib7 failures came from the historical community Model being mixed into fixtures; they do not justify modifying the current Model. This does not establish complete client GUI/playback acceptance. The separate JSON replacement now has an approved strict-error policy for malformed/truncated input, while its consumer error-boundary checks and source handoff remain pending; no complete equivalence claim is made.

The original review project requires the same verified net462/x86 build adaptation and six exact DLL references. An external project must compile exactly44 inputs and exclude the two retired classes even if it uses a glob. None of its old Content payload copies may be re-enabled. Ten inherited trailing spaces in comments/XML comments are removed for normal maintained-source checks; the original final-newline state is retained. Only the diff-data file has a narrow whitespace attribute; maintained C# checks remain enabled.

## Runtime input gate

`tools/source-built-host-input.cjs` consumes **verified source-built EXE/PDB**, rather than pretending the original official binary was modified. The committed `verified-runtime.json` must bind its two exact outputs, source identity, official Model identity, framework/platform and toolchain/build-receipt hashes. Prepared bytes live under ignored `vendor/source-built-host/snapshot-v1`. Normal build preflights this input before creating output and replaces only the two expected original leaves of its fresh base assembly. Final provenance checks both outputs; no original-Host fallback is permitted.

The verified runtime lock and prepared artifacts must be supplied from the accepted Windows build. Until those materials are present, normal full builds intentionally fail. The schema uses schemaVersion=1, mode=source-built-host, framework=net462, platform=x86, sourceIdentitySha256, modelSha256, toolchainSnapshotSha256, buildReceiptSha256, and ordered files for Emby.Theater.exe/Emby.Theater.pdb, each with path/size/sha256. `node tools/source-built-host-input.cjs identity .` supplies the current source fingerprint. No placeholder lock constitutes acceptance.

This four-file source identity describes the CEC/legacy-update Host candidate only. Do not attach a JSON-combination binary to it unless the matching source changes, manifest and outstanding JSON behavior checks have also been integrated and accepted.

Write the verified JSON lock as UTF-8 without BOM, with lowercase SHA256 values. Preserve the two prepared output files exactly; never copy an unrelated old PDB or use a Model selected only by AssemblyVersion/MVID. The lock and its verification evidence must be reviewed and committed before a normal build; the build importer checks the lock against HEAD and the current source fingerprint.

## Unified JSON/ZIP source selection

The current manifest supersedes the earlier four-file CEC-only scope:6 exact original-file replacements plus2 declared helpers,57 source/resource/license inputs and46 Compile items. The four JSON/ZIP source bodies match the reviewed Work transfer; their exact inherited formatting remains part of the hash-bound input. `json-zip-input.json` records those member identities. The project removes ServiceStack/Sharp references and uses pinned Newtonsoft13.0.4 net45 plus framework ZIP support. Corresponding GPL/MIT notices remain separate.

The source fingerprint now binds all8 modified/added files, upstream/change manifests, the exact patch/preparer and the pinned JSON dependency manifest. Windows must rebuild a fresh matched EXE/PDB from this scope. Earlier CEC-only and JSON/ZIP-only receipts cannot satisfy the final gate. Pending artifact recovery is an explicit build failure, with no old-Host fallback. Full Electron/login/playback/upgrade acceptance remains pending.
