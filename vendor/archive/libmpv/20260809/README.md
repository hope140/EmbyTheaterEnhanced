# Original fixed libmpv development archive

Local review prototype. The archive has not been uploaded to the public ETE
repository. Source-delivery and linked-component notice review is incomplete.

`mpv-dev-x86_64-20260809-git-dd5d17d328.7z` is the original, unmodified
31,173,907-byte upstream archive, SHA256
`c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`.
It contains four API headers, `libmpv.dll.a` and `libmpv-2.dll`.
No ETE configuration or user data has been added. The extracted DLL is
119,725,568 bytes, SHA256
`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`.
The existing runtime renames it to `mpv-1.dll` without changing its bytes.

Origin: [shinchiro's development archive](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download).
This URL records attribution; the repository restoration entry does not request it.
mpv upstream identifies shinchiro as a third-party Windows build provider.

The archive's ISC API-header notice does not license the core DLL as ISC.
Existing exact upstream texts are kept in this repository:

- [mpv Copyright](../../../../docs/redistribution-notices/mpv/Copyright),
  [GPL](../../../../docs/redistribution-notices/mpv/LICENSE.GPL),
  [LGPL](../../../../docs/redistribution-notices/mpv/LICENSE.LGPL) and
  [API notice](../../../../docs/redistribution-notices/mpv/API-NOTICE.txt).
- [FFmpeg license, GPL/LGPL texts, credits and IJG notices](../../../../docs/redistribution-notices/mpv/ffmpeg).
  This software is based in part on the work of the Independent JPEG Group.
- [Fixed source references and limits](../../../../docs/redistribution-notices/mpv/SOURCES.md).

Known preferred-source revisions are mpv
`dd5d17d3285a095a0f712fa9d116e22a076492de`, FFmpeg
`2a20737f662fd3f3f5999e873b9e7c90b5efc375`, and builder
`cd1edc11dc6887a50f705717619d879f5a93a488`.
The fixed builder includes recipes and patches, but is not a lock of all actual
cached dependency revisions. The archive itself carries no complete corresponding
source or written source offer. These links and notices do not independently
establish complete source delivery for the finished DLL. Public binary upload
awaits the current distribution-material review decision; no new permission from
upstream is claimed.

The minimum distribution materials are the original package identity and origin,
applicable licence/copyright notices, and clear corresponding-source access
instructions beside the binary. GPLv3 section 6(d) permits equivalent access on a
third-party source server, with continued availability remaining the distributor's
responsibility. A separate all-dependency lock, full SBOM, individual permission
from every author, PDB collection or bit-identical rebuild is not a universal
prerequisite asserted by this review. The specific unconfirmed item is whether the
published source directions cover this exact finished package; missing independent
dependency attribution alone is not treated as a prohibition on copying it.
