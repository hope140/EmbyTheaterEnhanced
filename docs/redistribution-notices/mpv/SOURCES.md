# Fixed upstream mpv / FFmpeg material sources

Collected 2026-10-12. Exact bytes and extraction relationships are recorded in
[`v030-mpv-unblock.json`](../../evidence/v030-mpv-unblock.json).

mpv upstream revision: `dd5d17d3285a095a0f712fa9d116e22a076492de`.

- [Preferred source tree](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de)
- [Full fixed source ZIP](https://codeload.github.com/mpv-player/mpv/zip/dd5d17d3285a095a0f712fa9d116e22a076492de)
- `Copyright`, `LICENSE.GPL`, `LICENSE.LGPL` are copied without alteration from
  that archive. `API-NOTICE.txt` preserves the complete first two notice blocks
  of `include/mpv/client.h`. The API notice does not license the core DLL as ISC.

FFmpeg upstream revision: `2a20737f662fd3f3f5999e873b9e7c90b5efc375`.

- [Preferred source tree](https://github.com/FFmpeg/FFmpeg/tree/2a20737f662fd3f3f5999e873b9e7c90b5efc375)
- [Full fixed source ZIP](https://codeload.github.com/FFmpeg/FFmpeg/zip/2a20737f662fd3f3f5999e873b9e7c90b5efc375)
- `ffmpeg/LICENSE.md`, four `COPYING.*` files and `CREDITS` are exact archive
  copies. Three `*.notice.txt` files preserve the complete opening comment from
  `libavcodec/jfdctfst.c`, `jfdctint_template.c`, and `jrevdct.c` respectively.
- As required for executable distribution when the relevant IJG-derived code is
  included: this software is based in part on the work of the Independent JPEG
  Group. The observed official FFmpeg build job reports no patch step. This is
  a build-log observation; it does not assert the complete cached dependency
  tree has no changes.

Publisher builder revision: `cd1edc11dc6887a50f705717619d879f5a93a488`.

- [Build scripts, source declarations and patches](https://github.com/shinchiro/mpv-winbuild-cmake/tree/cd1edc11dc6887a50f705717619d879f5a93a488)
- [Actual official workflow run](https://github.com/shinchiro/mpv-winbuild-cmake/actions/runs/31285220366)
- [Exact development archive publication record](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download)

These collected texts identify upstream terms and preserve notices. They are
not a complete notice inventory for every linked dependency, a resolved source
lock for cached inputs, or a declaration that the whole ETE distribution is
compatible with one license. The recipe enables GPL and version 3 in FFmpeg;
the existing ETE Helper declares GPL-2.0-only. That combination requires review.
No root license change or replacement production binary is made by this
collection. Source delivery must be arranged under the actual applicable terms;
the public links and local research files alone are not a claim that this has
already been done for an existing release.
