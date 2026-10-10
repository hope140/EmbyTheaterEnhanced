# Runtime source and notice materials

This index accompanies the local 0.2.7 test candidate. The project LICENSE,
THIRD_PARTY_NOTICES.md, LICENSING.md and this index are copied from its committed
source and bound by build-input-provenance.json. Product build evidence for
0.2.7 is separate from the historical material audit below. The bounded follow-up
and remaining external records are listed in
[0.2.7 material closeout](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md); no new binary or
unproven corresponding-source relationship is introduced by that review.

The 2026-10-09 local source-material supplement is documented in
[THIRD_PARTY_MATERIALS_AUDIT](THIRD_PARTY_MATERIALS_AUDIT.md), with a bounded
[provider request list](THIRD_PARTY_MATERIALS_REQUEST.md). It is a separate
review branch based on 5af8443, auditing the 0.2.4 / 1a05f88 input. Its reports
and updated four-file notice text are integrated into the 0.2.6 source;
the research archives have not been inserted into the product payload.
The two linked supplemental documents and JSON evidence are repository-only;
the existing four-file notice packaging contract has not been expanded.

The original version of this index accompanies the local 0.2.4 build-hardening
candidate. That payload's index, project LICENSE, THIRD_PARTY_NOTICES.md and
LICENSING.md were copied from its sourceCommit. build-input-provenance.json identifies those
blobs; source-provenance.json identifies the external runtime inputs.

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
