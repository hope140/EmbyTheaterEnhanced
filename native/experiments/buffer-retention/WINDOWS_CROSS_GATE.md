# Windows custom-core build: first input gate

This is a source/toolchain preparation stage for the independent retention experiment. The production DLL, Helper manifest, kernel selection and original Windows candidate remain unchanged. It neither downloads nor consumes candidate162 or its expired artifact. No Windows image is executed by this gate.

## Available and verified

The fixed [mpv Windows documentation](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/compile-windows.md) supports MinGW cross-compilation. The [toolchain lock](windows-cross-toolchain-lock.json) pins eight official Debian packages by URL, size and SHA256, their complete extracted file/symlink tree and the observed host tools/shared libraries. Package scripts are never installed or run. This is GCC14.2/MinGW12/MSVCRT-posix; it is a separate experiment identity, not ETE's GCC16/UCRT production toolchain or binary parity.

```sh
python3 tools/experiments/prepare-retention-windows-cross.py --run \
  --root /absolute/fresh-owned-private-directory
PYTHONPYCACHEPREFIX=/absolute/private-pycache python3 -m unittest discover \
  -s tests/experiments -p 'test_retention_windows_cross.py' -v
```

An optional `--cache /absolute/verified-archive-directory` copies and rehashes the same files; it does not change versions or fall back on hash failure. Host drift fails before acquisition. The output root must be fresh, have a physical parent, and be outside the checkout. The 600-second process deadline includes a Linux signal timer so a trickling download cannot evade a per-read socket timeout. Failure leaves its owned directory for diagnosis; there is no automatic cleanup of arbitrary paths or system installation.

The actual gate compiled resources with target windres, linked all14 listed Windows import libraries, linked a C++20/mutex probe, and checked an AMD64 DLL's real D3D11 import and its own exported symbol. It did not load the DLL or create a D3D11 device. Full extracted tree:4,375 files/529,390,187 bytes and1,693 internal symlinks. The resulting probe DLL is a small compiler test, **not mpv**.

The generated `windows-cross.ini` fixes the target system, compiler sysroot, resource compiler and target-only pkg-config search plus target-prefix sysroot rebasing; wrap downloads and execution wrappers are not enabled. A separate actual Meson1.9.1/Ninja1.13.0 small-project test independently confirmed an ambient Linux libavcodec was discoverable, then absent in target detection. A target `.pc` with `prefix=/usr` supplied a unique header which compiled only after rebasing into the owned target prefix. A D3D11-linked target library then compiled. This is a small cross-project test, not mpv configure; its [normalized receipt](windows-cross-gate-result-v1.json) keeps those fields separate. The tool versions derive from the existing [Linux input lock](linux-input-lock.json).

For that optional Meson isolation check, after extracting those exact tool wheels into an owned tool directory, use the generated cross file with `meson setup --cross-file=... --wrap-mode=nodownload`. Provide only target `.pc` files in `target-prefix/usr/lib/pkgconfig`, with an install prefix of `/usr` and installation destination `target-prefix`. Require `dependency('libavcodec', required: false).found()` to be false while the external host check succeeds; require the unique target header to compile. Do not disable either assertion just to configure a dependency.

## Source input and remaining stages

The [partial source plan](windows-source-plan.json) records nine already acquired official source commits, including shaderc's three required DEPS revisions. It reuses the exact mpv patch and libplacebo/submodule identities from the Linux experiment. The CMake build-tool candidate is a hash-verified PyPI cmake/scikit-build wheel; its upstream and distribution recipe are separately identified. None of these Windows dependency builds has run. This plan is deliberately marked partial, rather than claiming a complete or license-cleared distribution closure.

The fixed FFmpeg7.1.5 archive is **not obtained**: its requested official download was denied in the current environment. No alternate source acquisition was attempted. Read-only Debian source-descriptor metadata provides a candidate upstream checksum/size, but the actual archive must still match before use; no GPG verification is claimed. Current MSYS2 FFmpeg9 packages are not substituted. A separate denied MSYS2 database request was also not retried through a mirror.

The shortest remaining sequence is:

1. Obtain and verify that fixed FFmpeg source in an explicitly allowed environment; finish the exact target-dependency input lock. No old artifact is required.
2. Build the narrow source dependencies and configure fixed mpv, requiring shaderc, SPIRV-Cross, libplacebo D3D11, mpv D3D11 and D3D11VA. Vulkan/OpenGL/AMF/subrandr can be disabled for this experiment; libass remains a required dependency. Stop on capability or target-path errors.
3. Build a separately identified DLL, verify PE exports and recursive runtime DLL closure, preserve source/license relationships, and hash all new outputs.
4. Prepare a distinct experimental Helper build/runner. Existing production helper/package gates intentionally reject the new DLL; their original hashes must not be edited or bypassed. Actual gpu-next/D3D11 initialization and the two mapped-source/lifecycle tests must run on Windows before any app-entry claim.

This first local gate took minutes. The remaining source dependency build is a separate bounded stage; its compilation time and Windows graphics behavior have not been measured. No installer rebuild, workflow dispatch or release is prepared by this compiler gate.
