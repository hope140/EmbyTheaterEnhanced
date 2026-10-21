# Pinned libmpv archive recovery

`node tools/prepare-libmpv.cjs .` restores the current DLL without Carnival, the combined patch, or a preserved DLL snapshot. It downloads one fixed SourceForge project archive, validates it, and statically extracts one member. No downloaded executable or DLL is run. `tools/prepare.ps1` invokes this entry when absent; explicit `-LibmpvSnapshotFile` remains an optional exact-hash offline import, never an automatic fallback.

## Fixed identities

The version, full source commit, asset URL, archive identity, member name and final DLL identity are locked in `vendor/libmpv-input-manifest.json`:

- Version `20260809-git-dd5d17d328`; mpv `v0.41.0-920-gdd5d17d32`, client API 2.5.
- Source commit `dd5d17d3285a095a0f712fa9d116e22a076492de`.
- [Official asset](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download), 31,173,907 bytes; SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`.
- Member `libmpv-2.dll`, renamed to `mpv-1.dll`: 119,725,568 bytes; SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`.
- Runtime path `electronapp/libmpv/x64/mpv-1.dll`.

The DLL is byte-identical to the former patch input. Future upgrades require deliberate lock updates, native-helper header/API review and playback regression; there is no `latest` lookup.

## Cache and failure rules

Requirements: Node, PowerShell 7 (`pwsh`) and trusted libarchive bsdtar. Windows uses existing `C:\Windows\System32\tar.exe`; Linux requires `bsdtar` (GNU tar alone cannot extract this 7z). No new downloader or extractor is installed by this tool.

Archive cache `.work/libmpv-download/<asset>` and prepared DLL `vendor/libmpv/20260809/mpv-1.dll` remain ignored; no Git/LFS DLL history. Existing components and archives are checked. A missing archive downloads once to an exclusive temporary file, verifies 7z magic/size/SHA256, then promotes without replacing an occupied cache. Corrupt caches fail rather than silently refresh. Inspect and quarantine the identified corrupt cache before an explicit retry.

The HTTP transport allows HTTPS only, at most five redirects, and only the fixed SourceForge project path and official mirrors. It does not emulate a browser, bypass challenges, retry denials, or fall back to another source/version. Non-200, HTML/download pages, wrong lengths/hashes, unsafe redirects, links and bad extracted bytes stop preparation. Only the named DLL member is extracted to memory and verified before writing.

Work cold recovery from an empty isolated directory succeeded: project URL -> downloads.sourceforge.net -> twds.dl.sourceforge.net, HTTP 200/application/x-7z-compressed, exact identities above. Earlier failed saved responses were normal HTML download instruction pages; their exact historical cause is unknown. Target cloud/Linux network and bsdtar execution remain unverified and require separate evidence.

## Source and notice limits

The [mpv source reference](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de), THIRD_PARTY_NOTICES and SOURCE_MATERIALS records remain. Successful acquisition is not a full source rebuild: exact winbuild revision, linked dependencies/patches/options and complete corresponding-source/notice closure remain separate review items. The component is third-party. Acquisition scripts and identities are bound into build/source provenance; historical patch/predecessor paths are metadata only, without physical old-directory requirements.
