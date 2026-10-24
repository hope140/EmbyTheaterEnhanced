# Explicit derived-loader range trial

This branch-only test keeps the original `162dc69f9c3438d99508c90321a889b693b6b10a` package and its build manifest unchanged. It is not a rebuilt package, installation or release. Select `range_smoke=loader-trial` explicitly in the existing manual runner route; ordinary `entry`/`native` still use immutable `c9cd9bac` tools. The new route uses the dispatch's exact controller source commit and records it separately from the base candidate and baseline verifier.

## Evidence before changing the runtime

The fixed helper's top-level exception handler returns 23 for several initialization errors. Its `LoadLibraryExW` failure occurs before `mpv_create` and uses `LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS`. The reviewed Native reference has that same loader call but richer error reporting; this does not prove any particular original failure was a missing Vulkan dependency.

The route first runs a helper-start-only probe on the fully verified original runtime. No media request, cache or next-item work is started. It publishes only recognized fatal labels, explicitly emitted numeric system codes, process exit code and stderr byte counts. Raw stderr, media URLs, paths and credentials are never published. Exit 23 is a process code, **not** a Win32 error code. The original helper does not emit `GetLastError`; its system-code field remains unavailable unless a code was actually emitted. Diagnostics wait for actual process exit and stdio close.

A matching baseline requires exactly one `dll-load-failed` label, process exit 23, no handshake, no unknown fatal label and confirmed owned exit/stdio close. A ready baseline produces `not-established: baseline-startup-failure-not-reproduced`; another failure produces `baseline-failure-not-DLL-load`. Either stops without creating a derived image. There is no blind retry or automatic dependency injection based on 23 alone.

## The single locked addition

[The lock](../tools/playback-range-loader-lock.json) follows [Native source reference `6aebd6595bdb9a9a4765309f3160f9a65206b7f2`](https://github.com/hope140/EmbyTheaterEnhanced/blob/6aebd6595bdb9a9a4765309f3160f9a65206b7f2/native/windows-media/loader-input.json):

- Original source: `x64/electron/vulkan-1.dll`, already inside the verified candidate.
- Derived destination: `electronapp/libmpv/x64/vulkan-1.dll`.
- SHA256: `7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1`.
- Official Electron 44.4.2 archive SHA256: `6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03`, matching the original candidate's source manifest.
- Relation: byte-identical standard payload copy. No new network input is acquired.

The source member's size is read from its verified physical bytes; no size from an older, differently hashed loader is reused. A new runtime directory receives a complete copy of the baseline plus exactly that one addition. Existing target, missing source, wrong source SHA or modified baseline is refused. The original build-manifest bytes remain unchanged in both locations.

An external `loader-derivation.json` binds the base identity and full physical proof, the controller commit, reference lock, source/target paths/hash/actual size/copy relation and complete derived proof. Every derived Electron process revalidates the original baseline with the unchanged c9 verifier, compares **all** copied baseline files and permits exactly the locked extra member. Missing/extra/changed files or sidecar fields fail. The sidecar is outside the runtime, and the resulting identity explicitly says `derived-loader-trial-NOT-original-package`; a derived image is never passed off as the original package or accepted by editing its original manifest.

## A/B gate and cache checks

The derived helper then runs the same startup probe. It must produce a real handshake and exit normally (code 0, no signal, actual exit and stdio close). Both Electron exits/closes must also be observed. Only after the complete baseline/derived comparison passes is `accepted=true` written. Failure retains a non-acceptance result.

The same derived image/profile then runs the existing `populate` and separate-process `reopen` checks without repeating an unrelated no-helper entry run. Each cache process rechecks the A/B receipts and full runtime integrity before loading a helper. Range reuse, actual-start retention/replacement, partial-byte quota, cancellation and native decode/output assertions are unchanged. A final full verification follows both cache phases. Phase deadlines remain 120 seconds; renderer, hwdec, GPU options, bandwidth/space test values and source authentication boundaries are unchanged.

The bounded runner artifact includes separately named baseline/derived startup receipts, the external derivation, comparison and cache phase receipts. It contains no runtime binaries or raw helper stderr. A passing derived test is evidence for this one-file experiment and synthetic cache path, not acceptance of the original package, visible picture, NAS/proxy behavior or a production dependency fix. Any production packaging/source dependency correction and rebuilt candidate require a separate minimal change and verification.

The coordinating parent dispatches this mode; source changes never dispatch it automatically. See [the runner method](PLAYBACK_RANGE_WINDOWS_RUNNER.md) for fixed artifact acquisition, credential isolation, expiry handling and cancellation/uncertain-exit boundaries.
