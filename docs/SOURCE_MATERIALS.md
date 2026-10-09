# Runtime source and notice materials

This index accompanies the local 0.2.4 build-hardening candidate. Its bytes,
the project LICENSE, THIRD_PARTY_NOTICES.md and LICENSING.md are copied from
the candidate sourceCommit. build-input-provenance.json identifies those
blobs; source-provenance.json identifies the external runtime inputs.

| Component | Confirmed material | Still required for exact corresponding-source reconstruction |
|---|---|---|
| Maintained application / Native Helper | Git sourceCommit recorded in the payload; project LICENSE | External inputs and toolchain materials below remain separate |
| Electron 44.4.2 | Official release URL and complete tree in source-provenance.json; x64/electron/LICENSE and LICENSES.chromium.html | Rebuilding Electron/Chromium and all dependencies was not performed |
| npm production dependencies | Locked package versions/integrities; fresh npm extraction; package source and notices remain in electronapp/node_modules | Source-package license review remains component specific |
| Carnival inherited Node packages | Exact archive file identities, retained package paths and hashes in dependency provenance | Independently authenticated original npm archives for the inherited versions |
| Carnival Windows Host and supporting DLLs | Frozen archive hashes; public reference at https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13 | Provider's exact source tree, modifications, dependency versions, build recipe and notices matching the binary hashes |
| Offline Web, fonts, images and auxiliary CEC / RefreshRate components | Frozen Carnival input tree and controlled overlays | Exact revisions, original assets, modifications, build recipes and applicable component notices |
| Patched libmpv | Fixed DLL hash; mpv revision dd5d17d3285a095a0f712fa9d116e22a076492de and provider's historical asset declaration | Original mpv-dev-x86_64-20260809-git-dd5d17d328.7z, independent publication record, winbuild revision, dependency sources/patches/configurations/toolchain and complete notices |

The provider declares the original libmpv development archive SHA256 as
`c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`.
This is a declaration awaiting independent verification, not the DLL hash.
The pinned mpv source is at
https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de .
It alone does not identify all linked dependency sources or build options.

Two fixed upstream reference archives were downloaded and inspected locally on
2026-10-09. They are source materials, not replacements for the frozen binaries:

| Reference archive | Bytes | SHA256 |
|---|---:|---|
| [mpv dd5d17d3285a095a0f712fa9d116e22a076492de](https://codeload.github.com/mpv-player/mpv/zip/dd5d17d3285a095a0f712fa9d116e22a076492de) | 8,023,071 | `e82426ff14b1c05705f9e16889bba17f28e578b6c5a0b32ed03b0f9ee050c72f` |
| [Windows Host reference 708fadc068cbf66ced6aece4a32f3e12bb2c4e13](https://codeload.github.com/MediaBrowser/emby-theater-windows/zip/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) | 198,671,303 | `7dc15a294137c0a40553282289f4590b7cf75a8f9169dafbe5d08d2fe3a1a884` |

The candidate workspace preserves these under `.work/source-materials`.
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

Archive identity, source availability, notice delivery and full
corresponding-source completeness are separate claims. Delivering this index
closes the project-notice packaging gap; unknown component materials remain
unknown. It does not certify redistribution terms or alter existing releases.
