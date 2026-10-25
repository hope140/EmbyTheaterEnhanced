# Finite-buffer export mapping experiment

This directory contains source inputs and normalized synthetic test evidence, **not a replacement production kernel**. Nothing here changes `vendor/libmpv-input-manifest.json`, the original DLL/archive, Native Helper source/build manifest, kernel selection, normal settings or next-episode preload. The ordinary retention context remains unable to replay a cache.

- Base: [mpv dd5d17d3285a095a0f712fa9d116e22a076492de](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de).
- `mpv-dd5d17d-export-map.patch`: five-file experiment patch; modified upstream files retain their LGPL-2.1-or-later headers. This is not an upstream API or a demux-queue restore implementation.
- `linux-input-lock.json`: exact source/submodule commits, official archive URLs/bytes/SHA256 and observed host tool/shared-library hashes. Development packages are extracted into an owned directory; no system package installation or configuration change. Debian HTTPS-index hashes were checked; this is not a GPG or fully hermetic/rebuilt-dependency claim.
- `linux-result-v1.json`: normalized technical receipt; full packet test vectors are in `tests/fixtures/retention-core-map-v1.json`. No raw logs, URLs, profile paths, PIDs or user media are published.
- `io-fault-shim.c`: process-local Linux test interposition, compiled only for explicit `--faults`. It is never linked into the candidate or a product. Reader subprocesses do not load it.

## Reproduce on the locked Linux host

The host must match the recorded Debian x86_64 libraries/compiler. Drift fails before downloads/build; do not force a different host through the gate. Each output root must be fresh. The optional archive cache is read only and every reused archive is rehashed. Neither command consumes the old162 Windows artifact.

```sh
python3 tools/experiments/build-retention-core.py --run --root /absolute/fresh-build
python3 tools/experiments/retention-core-probe.py --run \
  --library /absolute/fresh-build/build-mpv/libmpv.so.2.5.0 \
  --out /absolute/fresh-probe --faults
node --test tests/playback-retention-map.test.cjs tests/playback-retention-export-binding.test.cjs
```

The builder uses Meson1.9.1/Ninja1.13.0, the fixed mpv source, libplacebo7.360.1 and four pinned upstream submodules. libplacebo is statically linked and its symbols hidden; Debian FFmpeg retains its own existing libplacebo dependency. Explicit C++ runtime linking and library-only `cplayer=false` avoid an unintended second player executable. The final observed build recipe, patch and binary identities are in the result receipt. They do not identify the original Windows DLL or promise identical bytes at a different build directory/tool environment.

The probe verifies the build receipt, current input-lock/recipe/patch relationship and library bytes before loading it. It generates only two owned eight-second inputs, isolates APPDATA/LOCALAPPDATA/MPV_HOME/TEMP/TMP/TMPDIR/XDG and uses loopback HTTP. Source files stay below34MiB; probe RAM settings64MiB forward/4MiB backward are test values only. Each tool subprocess is bounded, the outer native probe limit is120seconds, and the test-only packet hold self-releases within2seconds. A successful final receipt is written after native contexts, reader processes and the local origin close. It is not installed-app or NAS evidence.

## Contract

`dump-cache-report start end filename export_id` is finite only. A new attempt retires the old report; IDs increase for the lifetime of the demuxer. `cache-export-report` is a bounded read-only NODE map. It includes actual first/last input PTS/DTS, submitted mux ticks/time bases, source/mux stream indexes, packet counts, codec-configuration fingerprints, source geometry/packing when known, final I/O errors and an incremental sequence digest per stream. It never includes paths, URLs, credentials or packet contents. A continuous range and segment are required. Legacy `dump-cache` does not calculate these extra digests and keeps its cancellation behavior; cancellation of the new report command explicitly fails and invalidates its result.

A successful mux submission is not proof of serialized output. `serialized-clip-map-verified` stays false in the core. The experiment verifier reopens only the exported file, checks codec configuration/basic geometry, uniquely matches endpoint fingerprints, then compares **every** serialized packet in stream order against the native sequence digest. Its canonical input is ASCII `bytes:ptsValid:ptsTicks:dtsValid:dtsTicks:key:` followed by32 binary payload-hash bytes for each accepted packet. Missing DTS, packet loss/reordering, nonconstant timestamp transformation, changed payload/configuration or I/O failures remain unavailable. No original whole-source hash lookup or missing-range download is used to derive the map.

The exact source-to-submitted relation is `sourcePTS = submittedMuxPTS + base_ts - rebase_ts + ts_offset`; reopening additionally determines the container shift and explicit time-base rounding bound. Requesting2.3seconds is not an observed anchor. H264 may lack a reported pixel-format enum; only a nonempty identical codec configuration plus matching known geometry is admitted in that case. Unknown raw packing is rejected. This is not a general proof of HDR/container metadata, subtitle, priming/preroll or device sound continuity.

The narrow JS binding wraps the existing controller only inside experiment tooling. It requires the actual current helper instance/generation, loaded source, paused RAM cache and an already-held finite range; final size must fit the observed original buffer bytes. One unreleased or cleanup-pending export occupies the slot. BigInt file identities, a bounded-memory file hash, validation leases and checks after awaits protect readers and replacement playback. Retirement disallows use immediately; an ordered non-media-scoped read is used only as a physical-completion barrier. Timeout does not permit deletion before owned child close, and cleanup never issues Stop. This is a post-export size check, not a general filesystem quota or a latency guarantee for multi-GiB exports.

## Actual result and next boundary

The normalized receipt records raw BGR24/PCM NUT→NUT and H264 B-frame/two-AAC MP4→MP4 with the second audio selected. Source stream2 becomes mux stream1. All383 submitted packets match serialized sequences; the selected video frame and12,000 PCM samples at source3.25seconds match the local owned oracle exactly. The oracle checks this fixture; product mapping never uses it. Both exports add zero observed origin requests/application write bytes with source writers already quiescent; historical canceled-write uncertainty is retained separately. Stop/context exit preserves each output hash, then a separate process reads/seeks using the report map. Packet/trailer/close fault cases return-5, true async cancellation returns-12 and clears the report, replacement clears old reports, and owned FD count returns4→4.

Unusable AVI endpoint timestamp changes and NUT B-frame missing-first-DTS are retained as negative test vectors. An earlier AVI raw source also exposed unknown packing/incorrect output pixel format; it is not an admitted positive format. These are limits of packet remuxing, not reasons to claim arbitrary input support.

Packet/trailer/close failures are deliberate process-local injections, not a real disk-full or device-failure test. Ordinary playback-time eviction and the complete held-buffer lifecycle are not integrated by this finite paused-window experiment. Local regression:25 targeted passed; full offline2087 tests,2077 passed,0 failed,10 explicit platform skips.

Windows is not built or accepted here. The fixed upstream [Windows CI script](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/ci/build-win32.ps1) disables libmpv and uses rolling source/wrap/tool inputs, so copying it is unsuitable. ETE's existing UCRT GCC16.1.0 lock can be a compiler candidate, but FFmpeg/libplacebo/shaderc/SPIRV-Cross and their build/link closure still need an independent lock. A subsequent shared-DLL build must retain D3D11, shaderc, SPIRV-Cross and d3d-hwaccel detection, then run the existing actual gpu-next/D3D11/D3D11VA Helper. No equivalent capability is inferred from Linux `vo=null`, and rerunning the unchanged162 package cannot test these additions. Its expiry gate remains unchanged.
