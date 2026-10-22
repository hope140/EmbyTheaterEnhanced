# Pinned official Windows 3.0.20 Model input

Current selection supersedes the historical stages below. `vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll` now contains the official Windows **3.0.20** member: **426,496 bytes**, SHA-256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`. The component path and provenance key remain stable; `snapshot-v1` is a storage schema, not a claim that community bytes remain selected.

The manifest locks the member, tree and [official release](https://github.com/MediaBrowser/emby-theater-windows/releases/tag/3.0.20) asset: `emby-theater-x64.zip`, 111,318,728 bytes, SHA-256 `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`. This is the same ZIP as the separate 19-file Host component; its whitelist and Host bytes remain unchanged.

## Current preparation and recovery

```powershell
node tools/model-compatibility-input.cjs validate .
./tools/prepare-model-compatibility.ps1 -ArchivePath <official-3.0.20-zip>
```

A clone supplies the official member under existing byte-preserving Git attributes. If absent, `prepare.ps1 -ArchiveRoot <directory>` recovers it from the fixed ZIP. Recovery validates archive size/SHA, requires one case-sensitive root member and validates its size/SHA before creating output. It copies no unrelated member, executes no assembly or installer, and never overwrites a mismatched component. There is no old installer, combined patch, Carnival directory or community Model dependency.

`-ModelSnapshotRoot` remains an optional explicit import parameter for an already recovered **official** member; the former variant fails the new identity lock. Exact file-set, hash, path and redirect rejection remain. Runtime provenance binds the archive, manifest, validator and recovery script to the delivered member and records the predecessor without reading it.

The former 424,960-byte DLL, SHA-256 `f2eeca1c65e56e96340dc84ff91de6e4cc25bb2e510706748606f05c1e39ebaf`, remains recoverable from commit `ad14a95bfe2122d45508bbb21ea88cfc4f71ee77` at the same path. Original user materials and Git history are not removed. The historical runtime manifest stays historical metadata; assembly intentionally replaces its Model path with independently validated official bytes instead of requiring byte equality.

Official distribution identity is established; a corresponding-source rebuild of this exact binary and complete notice obligations are not claimed. Existing notices remain and the DLL is not reattributed to ETE. No Host, Electron, libmpv, playback source, configuration default or product version is upgraded.

## Compatibility evidence and limits

Prior independent 0.3.15 candidates confirmed complete Host startup, local interfaces and test-account visual playback, pause/resume, progress, audio-menu selection and normal exit with the official member. Its run did not reproduce the original variant's CoreLib 7.0/FileNotFound update-path errors. Offline update fixtures covered empty, same/new version, missing asset, invalid tag and sorting, with no real update download or execution.

Those earlier sources do not certify this newly integrated package. Components and official playback runs were separate candidates, not a new strictly one-DLL-only experiment. Actual sound listening, subtitle switching, long-duration playback and installation remain unverified. Application-data permission restoration findings are separate and are not attributed to Model. This integration does not repair ACLs, touch user profiles, run GUI playback, merge main or publish.

Current automated results are recorded separately from prior manual acceptance. Regressions cover official identity and recovery, rejected old/mutated bytes, absent legacy inputs, runtime/provenance tampering, configuration/update boundaries and existing communication/session behavior.

## Historical original-byte snapshot stage

Everything below records prior stages and does not describe the currently selected DLL.

`vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll` preserves the existing 424,960-byte packaged DLL. SHA256 is `f2eeca1c65e56e96340dc84ff91de6e4cc25bb2e510706748606f05c1e39ebaf`. This is the current compatibility variant from the retained Carnival material, not the different official reference DLL, newly recovered official bytes, or ETE-authored source. Exact source revision remains unresolved. Existing source/notice records remain applicable. No DLL is loaded or executed during preparation or static validation.

~~~powershell
node tools/model-compatibility-input.cjs import . <preserved-model-snapshot-root>
node tools/model-compatibility-input.cjs validate .
~~~

The component manifest locks the sole path, size and file/tree identities. Import verifies the selected DLL before creating a destination, excludes unrelated source files, and never overwrites or substitutes an official variant. Prepared and runtime validation reject missing/changed/extra files and redirects. Runtime provenance binds the delivered DLL, manifest and generator identities. Bodies remain ignored/local; approved restorable material storage is still necessary for cloud use. This is not a full source-rebuild claim or permission to publish unknown-source bodies.

## Normal production entry points

The derived historical input selection is now empty. Any future unaccounted retained input fails with an explicit-component requirement; production does not fall back to a legacy directory. `assemble-runtime-base.cjs` and `validate-build-materials.cjs` validate every current component and no longer traverse `vendor/carnival` or `vendor/patch`, even for an empty selection. Historical full-material validation remains an explicit test/audit operation, separate from normal preparation/build/provenance.

`prepare.ps1` no longer reads, extracts, downloads or copies a Carnival installer or combined patch. Model restoration is explicit through `-ModelSnapshotRoot`. First Web restoration uses `-WebSnapshotRoot`, which copies the fixed independent Web snapshot and user increments with exact preflight validation; it does not reconstruct an old package layout. The old historical Web import remains an explicit historical-only command. Other component restoration and fixed official Electron/Host archives remain separately validated.

Original user material is preserved. In the isolated proof, both legacy directories and legacy archives are absent from normal input paths; old material retained in an offline backup is not read by the candidate. A dedicated archive directory supplies only the fixed official Electron archive for preparation.

## Acceptance boundary

The zero-input stage compares the same baseline's 822 base files, 937 transformed intermediate files, 720 final Web files and generated outputs. It does not change Model, UI, dependency versions, configuration or auto-update behavior. No app or installer is run. Before final packaging acceptance, integrate onto verified main containing the 0.3.15 exit fix, retaining its product source, version and tests. Subsequent byte comparisons must use matching 0.3.15 sources on both sides rather than reverting the fix to reproduce a historical intermediate hash.

Local integration note: this candidate now includes main e150981d and its 0.3.15 product fix/version/tests. The preceding pre-integration warning documents the material-stage acceptance boundary; current comparisons use matching 0.3.15 source. No official Model replacement or runtime launch is performed.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.
