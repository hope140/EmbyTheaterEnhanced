# Pinned libmpv archive recovery

Local review prototype: the original archive is committed only in the local review branch; public upload is pending corresponding-source and linked-component notice review. `node tools/prepare-libmpv.cjs .` restores the current DLL from `vendor/archive/libmpv/20260809` without Carnival, the combined patch, a preserved DLL snapshot, or a SourceForge request. It verifies the original archive against its size/SHA256 and the HEAD Git blob, then statically extracts one member. No executable or DLL is run. `tools/prepare.ps1` invokes this entry when absent; explicit `-LibmpvSnapshotFile` remains an optional exact-hash offline import.

## Fixed identities

The version, full source commit, asset URL, archive identity, member name and final DLL identity are locked in `vendor/libmpv-input-manifest.json`:

- Version `20260809-git-dd5d17d328`; mpv `v0.41.0-920-gdd5d17d32`, client API 2.5.
- Source commit `dd5d17d3285a095a0f712fa9d116e22a076492de`.
- [Official asset](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download), 31,173,907 bytes; SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`.
- Member `libmpv-2.dll`, renamed to `mpv-1.dll`: 119,725,568 bytes; SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`.
- Runtime path `electronapp/libmpv/x64/mpv-1.dll`.

The DLL is byte-identical to the former patch input. Future upgrades require deliberate lock updates, native-helper header/API review and playback regression; there is no `latest` lookup.

## Cache and failure rules

Requirements: Node, Git and trusted libarchive bsdtar. Windows uses existing `C:\Windows\System32\tar.exe`; Linux requires `bsdtar` (GNU tar alone cannot extract this 7z). No downloader or extractor is installed by this entry.

The complete original archive uses ordinary Git with `-text`; the 119 MB prepared DLL remains ignored. Missing, corrupt, uncommitted, changed or redirected repository archive paths fail before cache use. A valid prepared DLL cannot hide a bad archive. There is no automatic network fallback or old archive-cache fallback for this manifest. Only the named DLL member is extracted to memory, verified, and written to the ignored component directory.

The older HTTP diagnostic transport is retained for controlled regression fixtures. The production restoration CLI does not invoke it. No denied URL is retried and no alternative source/version is selected.

Historical Work cold download succeeded with the exact identities above. A later GitHub-hosted runner received HTTP 403; the old log did not identify the refusing hop. This local archive route removes the download requirement. It is not yet a successful GitHub-hosted full package result.

## Source and notice limits

The [archive notice](../vendor/archive/libmpv/20260809/README.md), THIRD_PARTY_NOTICES and SOURCE_MATERIALS records remain. The fixed builder revision and known mpv/FFmpeg source references are recorded, but actual linked cached dependency revisions, complete notice inventory and a complete corresponding-source delivery arrangement remain unresolved. The component is third-party. Acquisition scripts and identities are bound into build/source provenance; historical patch/predecessor paths are metadata only, without physical old-directory requirements.
