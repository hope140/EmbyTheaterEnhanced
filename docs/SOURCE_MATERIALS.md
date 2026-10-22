# Runtime source and notice materials

Maintained small outputs: [typed configuration defaults and thirteen Chinese text revisions](MAINTAINED_SMALL_RUNTIME.md) are now maintained separately from the unchanged archival input. The same five default fields/values and twenty-four unchanged translation strings remain inherited; this does not claim old ETE authorship or complete localization/source-license resolution.

Current Model selection: the separate [Model component](MODEL_COMPATIBILITY_INPUT.md) now locks the official Windows 3.0.20 release member, SHA-256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`, and the complete official ZIP identity. Its former community variant remains in Git history; no community snapshot is a normal build dependency. Historical unchanged-Model statements below describe earlier stages. Exact binary source-rebuild and third-party notice boundaries remain separate from official release-byte identity.

Compatibility resources: 48 unchanged local snapshot files retain per-file source/unknown distinctions in vendor/compatibility-resources-manifest.json. Anime4K MIT headers and the existing named Source Han Serif OFL record remain; exact revisions/unknown manual/theme authorship are not invented. No public body upload or official recovery is claimed. See [component provenance](COMPATIBILITY_RESOURCES_INPUT.md).

Current libmpv acquisition: a pinned official SourceForge project archive now restores the identical current DLL on Work Windows, checked by full archive and DLL SHA256. This is acquisition, not a full source rebuild or completed cloud validation. See [download contract](LIBMPV_INPUT.md).

Official resource extension: five additional same-byte members of the already pinned Windows 3.0.20 ZIP now have independent acquisition: three companion XML documentation files, windowsync and English player strings. Existing dependency notices/source limitations remain applicable to XML companions; the two Emby resource references retain upstream repository GPL v2 declarations. This is fixed release acquisition, not proof of rebuilding every component from source. See [component record](WINDOWS_HOST_INPUT.md).

Small template supplement: package matches official Electron e897adda except the retained old version suffix; Host config matches official Windows source and exact 3.0.20 release bytes. Preload remains an explicitly unresolved-origin seven-line compatibility template, locally preserved without a public distribution decision. Source hashes, differences and notices are in [the template contract](RUNTIME_TEMPLATES.md) and vendor/runtime-templates-manifest.json.

Inherited npm acquisition update: all 29 selected files can be recovered from official Electron commit e897adda583b2339f077cb67113e71326a806de0 with the locked LF-to-CRLF conversion. The registry differences described below remain historical comparisons; no community code patch is needed against this official commit. Seven package declarations and unchanged notice files are individually pinned. See [component source and scope](INHERITED_NPM_INPUT.md).

Current input/provenance boundary: [legacy input selection](LEGACY_INPUT_SELECTION.md) distinguishes 90 consumed Carnival files and one current libmpv patch from historical manifest-only records. Removing physical predecessor gates does not establish new source or redistribution claims.

The v0.3.0 release source is `sourceCommit=20e42511b54989550165511a7604aa1b73519ff2`. The root `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/LICENSING.md` and this index are source-controlled materials; build provenance binds their committed bytes. Maintainer risk acceptance for the release does not establish legal compliance or resolve unknown source, permission or notice obligations.

Use [`V030_PR31_GPL_RELEASE_REVIEW.md`](V030_PR31_GPL_RELEASE_REVIEW.md) for the GPL combination and source-delivery assessment, [`V030_DISTRIBUTION_MATERIALS_FINAL.md`](V030_DISTRIBUTION_MATERIALS_FINAL.md) for the component matrix and exact identities, [`THIRD_PARTY_MATERIALS_AUDIT.md`](THIRD_PARTY_MATERIALS_AUDIT.md) for fixed historical source/hash observations, and [`BUILD_INPUT_AUDIT.md`](BUILD_INPUT_AUDIT.md) for build-input boundaries. Full notice and copyright texts are in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and [`redistribution-notices/`](redistribution-notices/).

`EXACT` describes a byte identity for the named files; `REFERENCE` describes a fixed source location without proving that it generated a binary. `MISSING` and `UNKNOWN` retain the scope defined by each historical audit and are not compliance ratings. A source archive, matching notice or public reference does not by itself prove complete corresponding source or redistribution rights.

| Component | Confirmed material | Still required for exact corresponding-source reconstruction |
|---|---|---|
| Maintained application / Native Helper | Git sourceCommit recorded in the payload; project LICENSE | External inputs and toolchain materials below remain separate |
| Electron 44.4.2 | Official release URL and complete tree in source-provenance.json; x64/electron/LICENSE and LICENSES.chromium.html | Rebuilding Electron/Chromium and all dependencies was not performed |
| npm production dependencies | Locked package versions/integrities; fresh npm extraction; package source and notices remain in electronapp/node_modules | Source-package license review remains component specific |
| Carnival inherited Node packages | Seven official registry tarballs now collected and SRI-verified; seven delivered notices match after newline normalization | Carnival metadata, a missing README and a power-off code change prevent a claim of complete original-package byte identity; exact import/modification history remains open |
| Carnival Windows Host and supporting DLLs | Frozen archive hashes; public reference at https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13 | Provider's exact source tree, modifications, dependency versions, build recipe and notices matching the binary hashes |
| Offline Web, fonts, images and auxiliary CEC / RefreshRate components | Frozen Carnival input tree and controlled overlays | Exact revisions, original assets, modifications, build recipes and applicable component notices |
| Patched libmpv | Original dev archive downloaded from SourceForge; published/local hash verified; archive libmpv-2.dll exactly matches packaged mpv-1.dll; pinned mpv source and FFmpeg source reference | Exact winbuild revision, dependency sources/patches/configurations/toolchain and complete notices; no full source rebuild established |

The original libmpv development archive SHA256 is now independently verified as
`c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`.
It matches the provider declaration and the
[SourceForge publication record](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download).
It is not the DLL hash. The 31,173,907-byte archive contains a DLL whose SHA256
is `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`,
exactly matching the distributed input. Full dependency/build/notice materials
are still incomplete; see the dated supplement above.
The pinned mpv source is at
https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de .
It alone does not identify all linked dependency sources or build options.

Two fixed upstream reference archives were downloaded and inspected locally on
2026-10-09. They are source materials, not replacements for the frozen binaries:

| Reference archive | Bytes | SHA256 |
|---|---:|---|
| [mpv dd5d17d3285a095a0f712fa9d116e22a076492de](https://codeload.github.com/mpv-player/mpv/zip/dd5d17d3285a095a0f712fa9d116e22a076492de) | 8,023,071 | `e82426ff14b1c05705f9e16889bba17f28e578b6c5a0b32ed03b0f9ee050c72f` |
| [Windows Host reference 708fadc068cbf66ced6aece4a32f3e12bb2c4e13](https://codeload.github.com/MediaBrowser/emby-theater-windows/zip/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) | 198,671,303 | `7dc15a294137c0a40553282289f4590b7cf75a8f9169dafbe5d08d2fe3a1a884` |

The original build-hardening material workspace preserves these under `.work/source-materials`.
The mpv archive includes Copyright, LICENSE.GPL, LICENSE.LGPL and the build
description. Its [pinned Copyright text](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright)
describes build-dependent licensing choices; collecting that source alone
does not establish the actual patched DLL's complete composition.

The downloaded mpv source contains `include/mpv/client.h` whose SHA256 exactly
matches the pinned Native Helper header. It does not contain the full linked
dependency sources or the provider's build recipe.

Eight Carnival binary inputs are byte-identical to entries in the fixed Host
reference archive: RefreshRate.exe, SharpCompress.dll, SocketHttpListener.dll,
both CEC client executables, both CEC DLLs and the USB-CEC driver installer.
Their presence establishes a precise public binary source location. That
archive includes RefreshRate C# source, but it does not contain source for the
CEC, SharpCompress or SocketHttpListener binaries, and they were not rebuilt.

The archive includes Host C# source and project files but omits the distributed
Emby.Theater.exe, the other five managed DLL binaries and restored NuGet packages.
It contains no offline Web tree. Its reference x64 mpv DLL differs from both
the Carnival baseline DLL and this project's patched DLL. These remaining
relationships stay unknown; public binary identity does not establish complete
corresponding source or notice delivery.

The later supplement additionally identifies three exact official NuGet DLL
entries (MediaBrowser.Common, ServiceStack.Text and SimpleInjector), records
the nonmatching Model/SharpCompress/SocketHttpListener candidates, and collects
versioned CEC, ServiceStack.Text, SharpCompress and tool-source references.
Seventeen original MSYS2 packages/signatures cover the complete pinned UCRT64
prefix; 12 exact PKGBUILD hashes and 54 recipe/patch files are collected. These
new relationships do not retroactively change the earlier ZIP observations or
prove reconstruction of every third-party binary.

Archive identity, source availability, notice delivery and full
corresponding-source completeness are separate claims. Delivering this index
closes the project-notice packaging gap; unknown component materials remain
unknown. It does not certify redistribution terms or alter existing releases.
# 独立历史Web材料

Web生产输入现为`vendor/web-snapshot-manifest.json`固定的720份历史基底（22,009,668字节）与两份既有用户Web补丁。材料字节及已有通知原样保存，单次导入后构建不再读取旧包www；准确上游版本及部分文件来源仍未知，不能将整棵树归为项目原创。正文只在本地材料目录保存且Git忽略，公开再分发目标/材料尚待核对。清单不等于材料正文或完整上游源码，准备与验证见[固定Web输入](WEB_SNAPSHOT_INPUT.md)。
## 官方固定Host组件

官方Windows 3.0.20发布ZIP（111,318,728字节，SHA256 `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`）中的14份白名单Host/辅助二进制与此前固定输入逐字节相同，现由独立组件准备。完整路径、大小和哈希见`vendor/windows-host-manifest.json`；准备及来源边界见[固定Host输入](WINDOWS_HOST_INPUT.md)。这补充了已知公开分发位置，不改变上文对精确源码重建或组件通知完整性的限制。Model未改用官方不同字节版本，仍保留当前文件。


The [small runtime snapshot](SMALL_RUNTIME_INPUT.md) preserves four historical packaged files and existing notices without claiming ETE authorship. Bodies stay ignored/local; source/version and public redistribution boundaries remain explicitly unresolved. No settings are changed. Approved body restoration is still needed for cloud use.


The [Model compatibility snapshot](MODEL_COMPATIBILITY_INPUT.md) is the unchanged existing Carnival DLL, not official-byte or ETE-original content. The old full directories/archives are no longer normal build inputs. Exact origin remains marked unresolved, notices retained, and bodies local/ignored pending approved restorable storage.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.


CustomCssJS optional integration is retired from new runtime output. The preserved 4,548-byte Web input matches Shurelol/Emby.CustomCssJS commit `6933b58c62f98b0919977e953f068b1a581a7a1c` after CRLF-to-LF conversion only; the upstream 4,416-byte Git blob has SHA256 `3eaec19e8a27ef2894d262d2b8569bb6b1275baca249b1457f6679474c856009`. Its [upstream GPLv3 LICENSE](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/LICENSE) and exact source relationship are recorded in the repository retirement audit. This resolves that textual match, not the entire historical package's provenance or licensing obligations. The raw snapshot remains in the source tree; the new runtime contains neither the module nor its registration.
